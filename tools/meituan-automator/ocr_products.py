#!/usr/bin/env python3
"""
对 screenshots_inbox/crops/*_ocr.* 做 OCR，抽出商品名。

默认引擎 RapidOCR（中文截图更准）；可切回 Tesseract 对比：
  .venv/bin/python ocr_products.py --ocr tesseract path/to/crop.png
  MEITUAN_OCR_ENGINE=tesseract .venv/bin/python run_screenshot_pipeline.py

依赖：Pillow；rapidocr + openvino（或 onnxruntime）；备用需本机 tesseract chi_sim + pytesseract
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

CROPS_DIR = Path(__file__).resolve().parent / "screenshots_inbox" / "crops"
OUT_JSONL = Path(__file__).resolve().parent / "screenshots_inbox" / "ocr_products.jsonl"

OCR_ENGINES = ("rapid", "tesseract")
_DEFAULT_ENGINE = "rapid"
_rapid_ocr: Any = None
_rapid_backend: str | None = None

# 非商品名行
_NOISE_LINE = re.compile(
    r"^(月售|袋装|盒装|散装|瓶装|坏必赔|选规格|加购|"
    r"[¥￥].*|"
    r"[+|＋]|Y\s*坏|坏\s*必)"
)
# 纯数字行才当噪声；「200g」要留给标题续行
_PURE_NUM = re.compile(r"^[\d.]+$")
_PRICE = re.compile(r"[¥￥]\s*[\d.]+")
_CJK = re.compile(r"[\u4e00-\u9fff]")

# 清洗：括号（含内容）、约及之后、修饰词
_BRACKETS = re.compile(
    r"【[^】]*】|"
    r"\[[^\]]*\]|"
    r"［[^］]*］|"
    r"（[^）]*）|"
    r"\([^)]*\)|"
    r"《[^》]*》|"
    r"「[^」]*」|"
    r"『[^』]*』|"
    r"<[^>]*>|"
    r"＜[^＞]*＞"
)
_TRAIL_OPEN_BRACKET = re.compile(r"[（(【\[［].*$")
_ABOUT_AND_AFTER = re.compile(r"约.*$")
_MODIFIERS = (
    "本地",
    "新鲜",
    "农家",
    "精选",
    "心选",
    "优选",
    "特选",
    "新到",
    "时令",
    "当日",
    "现摘",
)


def _collapse_cjk_spaces(text: str) -> str:
    """Tesseract chi_sim 常在汉字间插空格，去掉。"""
    out: list[str] = []
    prev_cjk = False
    for ch in text:
        if ch == " ":
            if prev_cjk:
                continue
            out.append(ch)
            prev_cjk = False
            continue
        is_cjk = bool(_CJK.match(ch))
        # 汉字与数字/括号之间也不留空
        if out and out[-1] == " " and is_cjk:
            out.pop()
        if prev_cjk and ch in "0123456789gG克斤两【】（）()[]~-—./|":
            pass
        out.append(ch)
        prev_cjk = is_cjk
    # 再压一遍：CJK 与紧邻非空格字符之间的空格
    s = "".join(out)
    s = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff0-9gG克斤两【】（）()\]])", "", s)
    s = re.sub(r"(?<=[\u4e00-\u9fff0-9])\s+(?=[\u4e00-\u9fff])", "", s)
    return s


def resolve_ocr_engine(cli: str | None = None) -> str:
    """CLI 优先，否则环境变量 MEITUAN_OCR_ENGINE，默认 rapid。"""
    raw = (cli or os.environ.get("MEITUAN_OCR_ENGINE") or _DEFAULT_ENGINE).strip().lower()
    if raw not in OCR_ENGINES:
        raise ValueError(f"未知 OCR 引擎：{raw}（可选：{', '.join(OCR_ENGINES)}）")
    return raw


def preprocess(img: Image.Image, scale: int = 2) -> Image.Image:
    w, h = img.size
    out = img.convert("RGB").resize((w * scale, h * scale), Image.Resampling.LANCZOS)
    out = ImageOps.grayscale(out)
    out = ImageOps.autocontrast(out)
    return out


def _pick_rapid_engine_type():
    """优先 onnxruntime；Python 3.14 等无轮子时用 openvino。"""
    from rapidocr import EngineType

    try:
        import onnxruntime  # noqa: F401

        return EngineType.ONNXRUNTIME, "onnxruntime"
    except ImportError:
        try:
            import openvino  # noqa: F401
        except ImportError as e:
            raise RuntimeError(
                "RapidOCR 需要 onnxruntime 或 openvino。"
                "请 .venv/bin/pip install openvino（或在支持的 Python 上装 onnxruntime）；"
                "也可 --ocr tesseract 切回旧引擎。"
            ) from e
        return EngineType.OPENVINO, "openvino"


def _quiet_rapid_logging() -> None:
    """关掉 RapidOCR 刷屏的 INFO、模型路径日志。"""
    import logging

    for name in ("RapidOCR", "rapidocr"):
        logging.getLogger(name).setLevel(logging.ERROR)


def _get_rapid_ocr():
    global _rapid_ocr, _rapid_backend
    if _rapid_ocr is not None:
        return _rapid_ocr
    try:
        from rapidocr import RapidOCR
    except ImportError as e:
        raise RuntimeError(
            "未安装 rapidocr。请 .venv/bin/pip install -r requirements.txt；"
            "或 --ocr tesseract 切回。"
        ) from e
    _quiet_rapid_logging()
    engine_type, backend = _pick_rapid_engine_type()
    params = {
        "Det.engine_type": engine_type,
        "Cls.engine_type": engine_type,
        "Rec.engine_type": engine_type,
        "Global.log_level": "error",
    }
    _rapid_ocr = RapidOCR(params=params)
    _rapid_backend = backend
    return _rapid_ocr


def rapid_result_to_text(result: Any) -> str:
    """按检测框从上到下拼行（与 Tesseract 多行字符串对齐）。"""
    txts = getattr(result, "txts", None) or ()
    boxes = getattr(result, "boxes", None)
    if not txts:
        return ""
    if boxes is None or len(boxes) != len(txts):
        return "\n".join(str(t) for t in txts if t)
    paired = []
    for box, text in zip(boxes, txts):
        try:
            ys = [float(p[1]) for p in box]
            top = min(ys)
        except Exception:
            top = 0.0
        paired.append((top, str(text)))
    paired.sort(key=lambda x: x[0])
    return "\n".join(t for _, t in paired if t)


def _ocr_rapid(path: Path) -> str:
    ocr = _get_rapid_ocr()
    result = ocr(str(path))
    return rapid_result_to_text(result)


def _ocr_tesseract(path: Path, *, scale: int = 2) -> str:
    if not shutil.which("tesseract"):
        raise RuntimeError("未找到 tesseract，请 brew install tesseract tesseract-lang")
    import pytesseract

    img = Image.open(path)
    prep = preprocess(img, scale=scale)
    return pytesseract.image_to_string(prep, lang="chi_sim+eng", config="--psm 6")


def ocr_image(
    path: Path,
    *,
    scale: int = 2,
    engine: str | None = None,
) -> str:
    eng = resolve_ocr_engine(engine)
    if eng == "rapid":
        return _ocr_rapid(path)
    return _ocr_tesseract(path, scale=scale)


def extract_product_names(raw: str) -> list[str]:
    """从 OCR 原文抽出疑似商品名（去空格、滤噪声、合并断行）。"""
    lines: list[str] = []
    for ln in raw.splitlines():
        t = _collapse_cjk_spaces(ln).strip()
        t = re.sub(r"\s+", " ", t).strip()
        if not t:
            continue
        lines.append(t)

    names: list[str] = []
    buf = ""

    def flush() -> None:
        nonlocal buf
        if buf:
            names.append(buf)
            buf = ""

    for t in lines:
        # 价格行：商品边界
        if _PRICE.search(t) or re.match(r"^[¥￥Y]", t):
            flush()
            continue
        # 去掉行内残留价格后再判噪声
        bare = _PRICE.sub("", t).strip()
        bare = re.sub(r"[+|＋一]\s*$", "", bare).strip()
        # 标题与「月售/日售/坏必赔」粘在同一框时，截断到标签前
        bare = re.sub(r"[日月]售.*$", "", bare).strip()
        bare = re.sub(r"坏必.*$", "", bare).strip()
        # UI 标签行：月售21|袋装|… → 整行噪声；菜名里的「豇豆/长豆角」保留
        if "|" in bare:
            flush()
            continue
        if not bare:
            flush()
            continue
        # 温层/引导文案整行丢弃
        if any(k in bare for k in ("常温", "想要", "想买")):
            flush()
            continue
        if _NOISE_LINE.search(bare) or bare in (
            "坏必赔",
            "选规格",
            "袋装",
            "盒装",
            "散装",
            "瓶装",
        ):
            flush()
            continue
        if "坏必" in bare or "月售" in bare or "日售" in bare:
            # 规格行里夹了月售：若 buf 已有标题则结束；整行当噪声
            flush()
            continue
        if len(bare) <= 1 or _PURE_NUM.match(bare):
            continue

        # 续行：括号/「约」未完，或明显是标题折行 / 规格续行
        cont = bool(buf) and (
            buf.endswith(("约", "左右", "(", "（", "/", "【", "叶"))
            or bare.startswith(("约", "g", "G", "克", "茶", "酒", ")"))
            or re.match(r"^\d+\s*(g|G|kg|KG|克|斤)", bare)
        )
        if cont:
            buf = buf + bare
            continue

        # 新标题常以【或较长中文开头
        flush()
        buf = bare

    flush()

    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        n = n.strip()
        # 去掉尾部误识别
        n = re.sub(r"[4Y]?坏必[赔赐赏赌贿].*$", "", n).strip()
        n = re.sub(r"选规格.*$", "", n).strip()
        if len(n) < 2 or len(n) > 48:
            continue
        if "坏必" in n or "月售" in n or "日售" in n or "|" in n:
            continue
        if any(k in n for k in ("常温", "想要", "想买")):
            continue
        if n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


# 第一个阿拉伯数字起及之后全部去掉（包菜1个… → 包菜）
_DIGIT_AND_AFTER = re.compile(r"\d.*$")


def clean_product_name(name: str) -> str:
    """
    清洗商品名：
    1. 去掉各种括号及括号内内容（含未闭合括号到行末）
    2. 去掉「约」及约字后面所有内容
    3. 去掉本地、新鲜等修饰词
    4. 去掉第一个数字及之后所有内容（包菜1个… → 包菜）
    """
    t = (name or "").strip()
    if not t:
        return ""
    t = _BRACKETS.sub("", t)
    t = _TRAIL_OPEN_BRACKET.sub("", t)
    t = _ABOUT_AND_AFTER.sub("", t)
    for m in _MODIFIERS:
        t = t.replace(m, "")
    t = _DIGIT_AND_AFTER.sub("", t)
    t = re.sub(r"\s+", "", t).strip(" \t-—_/|.,，。、")
    return t


def build_record(
    path: Path,
    before: list[str],
    *,
    city: str | None = None,
    category: str | None = None,
) -> dict:
    """一张图一行：file + 清洗前/后；可选 city/category。"""
    after: list[str] = []
    seen: set[str] = set()
    for raw_name in before:
        c = clean_product_name(raw_name)
        if not c or c in seen:
            continue
        seen.add(c)
        after.append(c)
    rec: dict = {"file": path.name, "before": before, "after": after}
    if city:
        rec["city"] = city
    if category:
        rec["category"] = category
    return rec


def ocr_crop_file(
    path: Path,
    *,
    scale: int = 2,
    city: str | None = None,
    category: str | None = None,
    engine: str | None = None,
) -> dict:
    raw = ocr_image(path, scale=scale, engine=engine)
    before = extract_product_names(raw)
    return build_record(path, before, city=city, category=category)


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(record, ensure_ascii=False) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="OCR 裁剪图 → 商品名（清洗前后）")
    ap.add_argument("paths", nargs="*", type=Path, help="裁剪图路径；默认 crops 目录全部")
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--jsonl", type=Path, default=OUT_JSONL)
    ap.add_argument("--show-raw", action="store_true")
    ap.add_argument(
        "--ocr",
        choices=OCR_ENGINES,
        default=None,
        help="OCR 引擎（默认 rapid；可用 MEITUAN_OCR_ENGINE）",
    )
    args = ap.parse_args()
    engine = resolve_ocr_engine(args.ocr)
    print(f"OCR 引擎：{engine}")

    paths = list(args.paths)
    if not paths:
        if not CROPS_DIR.is_dir():
            print(f"无目录：{CROPS_DIR}")
            raise SystemExit(1)
        paths = sorted(
            p
            for p in CROPS_DIR.iterdir()
            if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")
        )

    if not paths:
        print("没有可识别的图片")
        raise SystemExit(1)

    for path in paths:
        if not path.is_file():
            print(f"跳过：{path}")
            continue
        print(f"\n=== {path.name} ===")
        try:
            raw = ocr_image(path, scale=args.scale, engine=engine)
            before = extract_product_names(raw)
            rec = build_record(path, before)
        except Exception as e:
            print(f"失败：{e}")
            continue
        for b, a in zip(rec["before"], [
            clean_product_name(x) for x in rec["before"]
        ]):
            # 打印对应关系（after 已去重，这里按 before 展示）
            print(f"  {b}  →  {a or '(空)'}")
        if args.show_raw:
            print("--- raw ---")
            print(_collapse_cjk_spaces(raw))
        append_jsonl(args.jsonl, rec)
        print(f"  after: {rec['after']}")
        print(f"  → 已追加 {args.jsonl.name}")


if __name__ == "__main__":
    main()
