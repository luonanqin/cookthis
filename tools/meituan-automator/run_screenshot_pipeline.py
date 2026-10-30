#!/usr/bin/env python3
"""
半自动菜场商品采集（按城市 × 类别）：

  启动后选择城市、类别；终端空回车或手机截屏后自动：
  ① 抓屏/拉图到 screenshots_inbox/{城市}/{类别}/
  ② 裁剪到 …/{类别}/crops/
  ③ OCR 追加到 screenshots_inbox/{城市}/products.jsonl（全市各类别汇总，不覆盖）

监听中可随时输入：
  （空回车）抓当前屏（adb screencap）
  t / 类别   切换荤/素/汤/主/火锅/豆制品/海鲜
  c / 城市   切换城市
  s / 状态   看当前城市类别
  q / 退出

用法：
  .venv/bin/python run_screenshot_pipeline.py
  .venv/bin/python run_screenshot_pipeline.py --city 上海 --category 素菜
"""

from __future__ import annotations

import argparse
import queue
import sys
import threading
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from config import MARKET_CITIES, OCR_CATEGORIES, OCR_REGION
from ocr_products import OCR_ENGINES, resolve_ocr_engine
from watch_screenshots import (
    DEFAULT_OUT,
    IMAGE_EXT,
    capture_screen,
    ensure_device,
    find_screenshot_dirs,
    handle_new_local,
    list_remote_files,
    pull_one,
    snapshot_index,
)

_POLL_S = 1.0
_cmd_queue: queue.Queue[str] = queue.Queue()


def _stdin_reader() -> None:
    """后台阻塞读 stdin，避免 select 在终端里读不到命令。"""
    while True:
        try:
            line = sys.stdin.readline()
        except Exception:
            break
        if not line:
            break
        _cmd_queue.put(line.strip())


def _start_stdin_reader() -> None:
    t = threading.Thread(target=_stdin_reader, daemon=True)
    t.start()


def _read_cmd_nonblocking() -> str | None:
    try:
        return _cmd_queue.get_nowait()
    except queue.Empty:
        return None


def _read_cmd_blocking() -> str:
    return _cmd_queue.get()


def _pick_from_list(
    title: str,
    options: list[str],
    *,
    current: str | None = None,
    read_line: Callable[[], str] | None = None,
) -> str:
    print(f"\n{title}")
    for i, opt in enumerate(options, 1):
        mark = " ←当前" if current and opt == current else ""
        print(f"  {i}. {opt}{mark}")
    prompt = f"请输入序号或名称 [1-{len(options)}]："
    while True:
        if read_line is None:
            raw = input(prompt).strip()
        else:
            print(prompt, end="", flush=True)
            raw = read_line().strip()
        if not raw and current:
            return current
        if raw.isdigit():
            idx = int(raw)
            if 1 <= idx <= len(options):
                return options[idx - 1]
        if raw in options:
            return raw
        hits = [o for o in options if o.startswith(raw) or raw in o]
        if len(hits) == 1:
            return hits[0]
        print("无效输入，请重试。")


def _session_dirs(root: Path, city: str, category: str) -> tuple[Path, Path, Path]:
    """返回 (类别全屏目录, 类别crops目录, 城市汇总 jsonl)。"""
    cat_dir = root / city / category
    crops_dir = cat_dir / "crops"
    cat_dir.mkdir(parents=True, exist_ok=True)
    crops_dir.mkdir(parents=True, exist_ok=True)
    jsonl = root / city / "products.jsonl"
    return cat_dir, crops_dir, jsonl


def _print_help() -> None:
    print(
        "\n命令：回车=截图  t=切换类别  c=切换城市  s=当前状态  ?=帮助  q=退出"
        "（也可手机截屏；命令后回车）"
    )


def _capture_and_process(
    cat_dir: Path,
    crops_dir: Path,
    *,
    do_ocr: bool,
    jsonl_path: Path,
    city: str,
    category: str,
    ocr_engine: str | None = None,
) -> None:
    """终端回车：adb 抓屏 → 裁剪 OCR。"""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = cat_dir / f"enter_{stamp}.png"
    path = capture_screen(out)
    if not path:
        return
    print(f"已抓屏：{path.name}")
    handle_new_local(
        path,
        crops_dir,
        do_ocr=do_ocr,
        already_local=True,
        jsonl_path=jsonl_path,
        city=city,
        category=category,
        ocr_engine=ocr_engine,
    )

def filter_jsonl_records(
    jsonl: Path,
    *,
    city: str,
    category: str,
) -> int:
    """删掉 jsonl 里 city+category 都匹配的行（重跑 OCR 前清旧结果）。返回删除条数。"""
    if not jsonl.is_file():
        return 0
    import json

    kept: list[str] = []
    removed = 0
    for ln in jsonl.read_text(encoding="utf-8").splitlines():
        if not ln.strip():
            continue
        try:
            rec = json.loads(ln)
        except json.JSONDecodeError:
            kept.append(ln)
            continue
        if rec.get("city") == city and rec.get("category") == category:
            removed += 1
            continue
        kept.append(ln)
    jsonl.write_text(
        ("\n".join(kept) + ("\n" if kept else "")),
        encoding="utf-8",
    )
    return removed


def iter_local_shots(
    root: Path,
    *,
    city: str | None = None,
    category: str | None = None,
):
    """产出 (city, category, image_path, crops_dir, jsonl)。"""
    for city_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        city_name = city_dir.name
        if city and city_name != city:
            continue
        jsonl = city_dir / "products.jsonl"
        for cat_dir in sorted(p for p in city_dir.iterdir() if p.is_dir()):
            cat_name = cat_dir.name
            if cat_name == "crops":
                continue
            if category and cat_name != category:
                continue
            crops_dir = cat_dir / "crops"
            for path in sorted(cat_dir.iterdir()):
                if not path.is_file() or path.suffix.lower() not in IMAGE_EXT:
                    continue
                if path.stem.endswith("_ocr") or path.name.startswith("crop_"):
                    continue
                yield city_name, cat_name, path, crops_dir, jsonl


def process_local_tree(
    root: Path,
    *,
    do_ocr: bool = True,
    ocr_engine: str | None = None,
    city: str | None = None,
    category: str | None = None,
) -> int:
    """
    遍历 inbox 已有截图补跑裁剪+OCR。
    可按 city / category 筛选；跑之前会清掉该范围内 products.jsonl 旧行，避免重复。
    """
    shots = list(iter_local_shots(root, city=city, category=category))
    if not shots:
        scope = "/".join(x for x in (city, category) if x) or "全部"
        print(f"没有可处理的截图（范围：{scope}）")
        return 0

    # 按将要写入的 (city, category) 清旧行
    cleared: set[tuple[str, str, Path]] = set()
    for city_name, cat_name, _path, _crops, jsonl in shots:
        key = (city_name, cat_name, jsonl)
        if key in cleared:
            continue
        n_rm = filter_jsonl_records(jsonl, city=city_name, category=cat_name)
        if n_rm:
            print(f"已清除旧 OCR：{city_name}/{cat_name} × {n_rm} 条")
        cleared.add(key)

    n = 0
    for city_name, cat_name, path, crops_dir, jsonl in shots:
        handle_new_local(
            path,
            crops_dir,
            do_ocr=do_ocr,
            already_local=True,
            jsonl_path=jsonl,
            city=city_name,
            category=cat_name,
            ocr_engine=ocr_engine,
        )
        n += 1
    return n


def main() -> None:
    ap = argparse.ArgumentParser(
        description="按城市×类别：截图 → 裁剪 → OCR 汇总追加"
    )
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="本机 inbox 根目录")
    ap.add_argument("--poll", type=float, default=_POLL_S)
    ap.add_argument(
        "--city",
        type=str,
        default=None,
        help="城市（监听启动 / 与 --local 筛选）",
    )
    ap.add_argument(
        "--category",
        type=str,
        default=None,
        help="类别（监听启动 / 与 --local 筛选）",
    )
    ap.add_argument(
        "--baseline-pull",
        action="store_true",
        help="启动时把手机已有截图也拉一遍到当前城市/类别",
    )
    ap.add_argument(
        "--local",
        action="store_true",
        help="不连手机：重跑 inbox 截图 OCR；可加 --city/--category 限定范围",
    )
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument(
        "--ocr",
        choices=OCR_ENGINES,
        default=None,
        help="OCR 引擎：rapid（默认）或 tesseract；也可用 MEITUAN_OCR_ENGINE",
    )
    args = ap.parse_args()
    do_ocr = not args.no_ocr
    ocr_engine = resolve_ocr_engine(args.ocr)

    root: Path = args.out
    root.mkdir(parents=True, exist_ok=True)

    x1, y1, x2, y2 = OCR_REGION
    print("流水线：①拉截图 → ②裁剪 → ③OCR 追加到该城 products.jsonl")
    print(f"OCR 区域：({x1},{y1})→({x2},{y2})")
    print(f"OCR 引擎：{ocr_engine}")
    print(f"根目录：{root}")

    if args.local:
        scope = "/".join(x for x in (args.city, args.category) if x) or "全部"
        print(f"本地重跑范围：{scope}")
        n = process_local_tree(
            root,
            do_ocr=do_ocr,
            ocr_engine=ocr_engine,
            city=args.city,
            category=args.category,
        )
        print(f"\n完成本地处理 {n} 张")
        return

    cities = list(MARKET_CITIES)
    categories = list(OCR_CATEGORIES)

    city = args.city if args.city in cities else None
    category = args.category if args.category in categories else None
    if city is None:
        city = _pick_from_list("选择城市", cities)
    if category is None:
        category = _pick_from_list("选择类别（荤/素/汤/主/火锅/豆制品/海鲜）", categories)

    cat_dir, crops_dir, jsonl_path = _session_dirs(root, city, category)
    print(f"\n当前：{city} / {category}")
    print(f"截图目录：{cat_dir}")
    print(f"汇总文本：{jsonl_path}（追加，不覆盖）")
    _print_help()

    ensure_device()
    dirs = find_screenshot_dirs()
    if not dirs:
        print("未找到截图目录。请先在手机上截一张图。")
        raise SystemExit(1)
    print("手机截图目录：")
    for d in dirs:
        print(f"  {d}")

    seen = snapshot_index(dirs)
    # 已处理过的远端文件名（全局，换城换类也不重复拉同一张手机图）
    pulled_names: set[str] = set()
    for names in seen.values():
        pulled_names |= names

    if args.baseline_pull:
        print("\n拉取手机已有截图到当前城市/类别…")
        # baseline：把当前 seen 里的都当「新」拉一遍到当前目录
        for d, names in seen.items():
            for name in sorted(names):
                path = pull_one(d, name, cat_dir)
                if path:
                    handle_new_local(
                        path,
                        crops_dir,
                        do_ocr=do_ocr,
                        jsonl_path=jsonl_path,
                        city=city,
                        category=category,
                        ocr_engine=ocr_engine,
                    )

    print(f"\n已忽略手机现有 {len(pulled_names)} 张。")
    print("命令：回车=截图  t=切换类别  c=切换城市  s=当前状态  ?=帮助  q=退出")
    print("监听中…（手机滑到位后按回车；也可手机截屏）")
    _start_stdin_reader()

    try:
        while True:
            cmd = _read_cmd_nonblocking()
            if cmd is not None:
                low = cmd.lower()
                if cmd == "":
                    _capture_and_process(
                        cat_dir,
                        crops_dir,
                        do_ocr=do_ocr,
                        jsonl_path=jsonl_path,
                        city=city,
                        category=category,
                        ocr_engine=ocr_engine,
                    )
                elif low in ("q", "quit", "exit", "退出"):
                    print("结束")
                    break
                elif low in ("?", "h", "help", "帮助"):
                    _print_help()
                elif low in ("s", "status", "状态"):
                    print(f"当前：{city} / {category}")
                    print(f"截图：{cat_dir}")
                    print(f"汇总：{jsonl_path}")
                elif low in ("c", "city", "城市"):
                    city = _pick_from_list(
                        "切换城市",
                        cities,
                        current=city,
                        read_line=_read_cmd_blocking,
                    )
                    cat_dir, crops_dir, jsonl_path = _session_dirs(
                        root, city, category
                    )
                    print(f"已切换 → {city} / {category}")
                    print(f"截图目录：{cat_dir}")
                    print(f"汇总文本：{jsonl_path}")
                    _print_help()
                elif low in ("t", "tag", "cat", "category", "类别"):
                    category = _pick_from_list(
                        "切换类别",
                        categories,
                        current=category,
                        read_line=_read_cmd_blocking,
                    )
                    cat_dir, crops_dir, jsonl_path = _session_dirs(
                        root, city, category
                    )
                    print(f"已切换 → {city} / {category}")
                    print(f"截图目录：{cat_dir}")
                    _print_help()
                else:
                    print(f"未知命令：{cmd}")
                    _print_help()

            time.sleep(args.poll)
            for d in dirs:
                now = set(list_remote_files(d))
                new = now - seen.get(d, set())
                for name in sorted(new):
                    if name in pulled_names:
                        continue
                    path = pull_one(d, name, cat_dir)
                    if path:
                        pulled_names.add(name)
                        handle_new_local(
                            path,
                            crops_dir,
                            do_ocr=do_ocr,
                            jsonl_path=jsonl_path,
                            city=city,
                            category=category,
                            ocr_engine=ocr_engine,
                        )
                    elif (cat_dir / name).exists():
                        pulled_names.add(name)
                seen[d] = now
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
