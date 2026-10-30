#!/usr/bin/env python3
"""
截图流水线底层：adb 拉图、裁剪 OCR 区、调用 ocr_products。
也支持把 Appium 菜场 JSON（原 output/market/{城}.json）解析进同一 inbox。

推荐入口请用：
  .venv/bin/python run_screenshot_pipeline.py

本机：
  screenshots_inbox/{城市}/
    products.jsonl              截图 OCR 或 Appium 解析后的商品名
    ingredients-cleaned.json    清洗结果（clean_city_products.py）
    market.json                 （可选）Appium 原始抓取
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path

from config import OCR_REGION, UDID

# 常见截图目录（不同品牌路径不一，会逐个探测）
CANDIDATE_DIRS = (
    "/sdcard/DCIM/Screenshots",
    "/sdcard/Pictures/Screenshots",
    "/sdcard/DCIM/ScreenRecorder",  # 少数机型混放
    "/storage/emulated/0/DCIM/Screenshots",
    "/storage/emulated/0/Pictures/Screenshots",
)

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")
DEFAULT_OUT = Path(__file__).resolve().parent / "screenshots_inbox"


def normalize_market_category(tag: str) -> str:
    """Appium 店铺标签 → 与截图流水线相近的大类。"""
    t = re.sub(r"[\s☀☀️]+", "", tag or "")
    if "火锅" in t or "麻辣烫" in t:
        return "火锅食材"
    if "海鲜" in t or "水产" in t:
        return "海鲜水产"
    if "豆制" in t or "面点" in t or "豆品" in t:
        return "豆制品"
    if any(k in t for k in ("蔬菜", "春菜", "安心蔬菜")):
        return "素菜"
    if any(
        k in t
        for k in ("猪", "牛", "羊", "禽", "蛋", "肉", "卤", "烧腊", "鸽", "鸡", "鸭")
    ):
        return "荤菜"
    return t or "未分类"


def market_json_to_records(data: dict) -> list[dict]:
    """
    Appium output/market/{城}.json → products.jsonl 记录列表。
    before/after 均放原始店内商品名（后续由 clean_city_products 再清洗）。
    """
    city = (data.get("city") or "").strip() or "未知"
    by_cat: dict[str, list[str]] = defaultdict(list)
    for shop in data.get("shops") or []:
        for tag, names in (shop.get("tags") or {}).items():
            cat = normalize_market_category(tag)
            for name in names or []:
                n = (name or "").strip()
                if n:
                    by_cat[cat].append(n)

    records: list[dict] = []
    for cat in sorted(by_cat.keys()):
        seen: set[str] = set()
        uniq: list[str] = []
        for n in by_cat[cat]:
            if n not in seen:
                seen.add(n)
                uniq.append(n)
        records.append(
            {
                "file": "market-appium",
                "before": uniq,
                "after": uniq,
                "city": city,
                "category": cat,
            }
        )
    return records


def ingest_market_json(
    market_path: Path,
    inbox_dir: Path = DEFAULT_OUT,
    *,
    keep_raw: bool = True,
) -> Path:
    """
    把 Appium 菜场 JSON 解析进 screenshots_inbox/{城市}/products.jsonl。
    返回城市目录路径。
    """
    data = json.loads(market_path.read_text(encoding="utf-8"))
    city = (data.get("city") or market_path.stem).strip()
    city_dir = inbox_dir / city
    city_dir.mkdir(parents=True, exist_ok=True)

    if keep_raw:
        raw_path = city_dir / "market.json"
        if market_path.resolve() != raw_path.resolve():
            shutil.copy2(market_path, raw_path)

    records = market_json_to_records(data)
    jsonl_path = city_dir / "products.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    n_names = sum(len(r["after"]) for r in records)
    print(
        f"已解析 Appium → {city}/products.jsonl  "
        f"({len(records)} 类, {n_names} 条商品名)"
    )
    return city_dir


def ingest_all_market_dir(
    market_dir: Path,
    inbox_dir: Path = DEFAULT_OUT,
) -> list[Path]:
    """批量：output/market/*.json → screenshots_inbox/{城}/。"""
    done: list[Path] = []
    for path in sorted(market_dir.glob("*.json")):
        if path.name in ("progress.json",) or path.name.endswith(
            "-ingredients-cleaned.json"
        ):
            continue
        done.append(ingest_market_json(path, inbox_dir))
    return done


def adb(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = ["adb", "-s", UDID, *args]
    return subprocess.run(
        cmd,
        check=check,
        text=True,
        capture_output=True,
    )


def ensure_device() -> None:
    r = subprocess.run(["adb", "devices"], text=True, capture_output=True, check=True)
    lines = [ln for ln in r.stdout.splitlines() if ln.strip() and not ln.startswith("List")]
    ok = any(UDID in ln and "\tdevice" in ln for ln in lines)
    if not ok:
        print(f"设备未就绪：期望 UDID={UDID}")
        print(r.stdout)
        raise SystemExit(1)
    print(f"已连接：{UDID}")


def list_remote_files(remote_dir: str) -> list[str]:
    """列出远端目录下的图片文件名（不含路径）。"""
    r = adb("shell", f'ls -1 "{remote_dir}" 2>/dev/null', check=False)
    if r.returncode != 0 or not (r.stdout or "").strip():
        r = adb("shell", f"ls -1 {remote_dir} 2>/dev/null", check=False)
    names = []
    for line in (r.stdout or "").splitlines():
        name = line.strip()
        if not name or name.endswith(":"):
            continue
        if "No such" in name or "Permission denied" in name:
            continue
        low = name.lower()
        if any(low.endswith(ext) for ext in IMAGE_EXT):
            names.append(name)
    return names


def _realpath(remote_dir: str) -> str:
    r = adb(
        "shell",
        f'readlink -f "{remote_dir}" 2>/dev/null || realpath "{remote_dir}" 2>/dev/null',
        check=False,
    )
    p = (r.stdout or "").strip().splitlines()
    return p[0].strip() if p and p[0].strip() else remote_dir.rstrip("/")


def find_screenshot_dirs() -> list[str]:
    """探测截图目录；/sdcard 与 /storage/emulated/0 常是同一路径，按 realpath 去重。"""
    found: list[str] = []
    seen_real: set[str] = set()
    for d in CANDIDATE_DIRS:
        r = adb("shell", f'[ -d "{d}" ] && echo OK', check=False)
        ok = "OK" in (r.stdout or "")
        if not ok:
            r = adb("shell", f"ls {d} >/dev/null 2>&1 && echo OK", check=False)
            ok = "OK" in (r.stdout or "")
        if not ok:
            continue
        real = _realpath(d)
        if real in seen_real:
            continue
        seen_real.add(real)
        found.append(d)
    return found


def image_size(path: Path) -> tuple[int, int] | None:
    r = subprocess.run(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        check=False,
        text=True,
        capture_output=True,
    )
    if r.returncode != 0:
        return None
    w = h = None
    for line in r.stdout.splitlines():
        if "pixelWidth:" in line:
            raw = line.split(":")[-1].strip()
            if raw.isdigit():
                w = int(raw)
        elif "pixelHeight:" in line:
            raw = line.split(":")[-1].strip()
            if raw.isdigit():
                h = int(raw)
    if w and h:
        return w, h
    # sips 读不出时（损坏/非图）用 Pillow 兜底
    try:
        from PIL import Image

        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def crop_ocr_region(
    src: Path,
    crops_dir: Path,
    region: tuple[int, int, int, int] = OCR_REGION,
) -> Path | None:
    """
    按 Appium 坐标裁剪商品名区域。
    region = (x1, y1, x2, y2)，与 1080 宽全屏截图对齐时可直接用。
    """
    x1, y1, x2, y2 = region
    if x2 <= x1 or y2 <= y1:
        print(f"  裁剪区域非法：{region}")
        return None
    size = image_size(src)
    if size is None:
        print(f"  无法读取尺寸：{src.name}")
        return None
    iw, ih = size
    if x2 > iw or y2 > ih:
        print(
            f"  区域 {region} 超出截图 {iw}x{ih}，跳过裁剪"
            f"（若 Appium 用逻辑像素，需按分辨率缩放）"
        )
        return None

    crops_dir.mkdir(parents=True, exist_ok=True)
    out = crops_dir / f"{src.stem}_ocr{src.suffix}"
    shutil.copy2(src, out)
    w, h = x2 - x1, y2 - y1
    # macOS sips: --cropOffset offsetY offsetX ; --cropToHeightWidth H W
    r = subprocess.run(
        [
            "sips",
            "--cropOffset",
            str(y1),
            str(x1),
            "--cropToHeightWidth",
            str(h),
            str(w),
            str(out),
        ],
        check=False,
        text=True,
        capture_output=True,
    )
    if r.returncode != 0 or not out.is_file():
        print(f"  裁剪失败：{src.name}")
        if r.stderr:
            print(f"  {r.stderr.strip()}")
        if out.exists():
            out.unlink()
        return None
    return out


def capture_screen(out_path: Path) -> Path | None:
    """
    用 adb screencap 抓当前屏幕，二进制写入 out_path。
    失败返回 None（不抛），并尽量清掉空/半截文件。
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["adb", "-s", UDID, "exec-out", "screencap", "-p"]
    r = subprocess.run(cmd, check=False, capture_output=True)
    if r.returncode != 0 or not r.stdout:
        print(f"抓屏失败：{out_path.name}")
        err = r.stderr
        if isinstance(err, bytes):
            err = err.decode("utf-8", errors="replace")
        if err and str(err).strip():
            print(f"  {str(err).strip()}")
        if out_path.exists():
            out_path.unlink()
        return None
    out_path.write_bytes(r.stdout)
    if not out_path.is_file() or out_path.stat().st_size == 0:
        print(f"抓屏失败：写出为空 {out_path.name}")
        if out_path.exists():
            out_path.unlink()
        return None
    return out_path


def pull_one(remote_dir: str, name: str, out_dir: Path) -> Path | None:
    remote = f"{remote_dir.rstrip('/')}/{name}"
    local = out_dir / name
    if local.exists():
        return None
    r = adb("pull", remote, str(local), check=False)
    if r.returncode != 0 or not local.is_file():
        print(f"pull 失败：{remote}")
        if r.stderr:
            print(f"  {r.stderr.strip()}")
        return None
    return local


def handle_new_local(
    path: Path,
    crops_dir: Path,
    *,
    do_ocr: bool = True,
    already_local: bool = False,
    jsonl_path: Path | None = None,
    city: str | None = None,
    category: str | None = None,
    ocr_engine: str | None = None,
) -> None:
    """全屏图 → 裁剪 → OCR 追加入库（不覆盖）。只打印识别清洗结果。"""
    _ = already_local  # 保留参数兼容调用方
    crop = crop_ocr_region(path, crops_dir)
    if not crop:
        return

    if not do_ocr:
        return
    try:
        from ocr_products import (
            OUT_JSONL,
            append_jsonl,
            ocr_crop_file,
            resolve_ocr_engine,
        )
    except ImportError as e:
        print(f"OCR 跳过（缺依赖）：{e}；请用 .venv/bin/python 运行")
        return
    out_jsonl = jsonl_path or OUT_JSONL
    try:
        eng = resolve_ocr_engine(ocr_engine)
        rec = ocr_crop_file(crop, city=city, category=category, engine=eng)
    except Exception as e:
        print(f"OCR 失败：{e}")
        return
    tag = f"[{city}/{category}] " if city and category else ""
    if not rec.get("before"):
        print(f"{tag}未识别到商品名（{path.name}）")
        return
    print(f"{tag}清洗结果: {rec['after']}")
    append_jsonl(out_jsonl, rec)


def snapshot_index(dirs: list[str]) -> dict[str, set[str]]:
    return {d: set(list_remote_files(d)) for d in dirs}


def main() -> None:
    """兼容旧命令：转调统一入口。"""
    from run_screenshot_pipeline import main as pipeline_main

    pipeline_main()


if __name__ == "__main__":
    main()
