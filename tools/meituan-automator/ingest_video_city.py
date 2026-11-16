#!/usr/bin/env python3
"""
手录视频 → 停稳抽帧 → OCR → 追加 screenshots_inbox/{城}/products.jsonl。

输入：video/{城市}/*.（任意文件名，只认所在城市目录）
中间：screenshots_inbox/{城市}/_video/frame_*.jpg（按城汇总，不按视频名分子目录）
合并：与截图 OCR 共用 products.jsonl；混录默认 category=未分类。

用法：
  .venv/bin/python ingest_video_city.py --city 上海
  .venv/bin/python ingest_video_city.py              # video/ 下所有城市
  .venv/bin/python ingest_video_city.py --city 上海 --skip-extract
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from config import (
    SCREENSHOTS_INBOX,
    VIDEO_DEFAULT_CATEGORY,
    VIDEO_DIR,
)
from extract_still_frames import extract_still_frames
from ocr_products import OCR_ENGINES, resolve_ocr_engine
from ocr_video_frames import ocr_frames_dir

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
PRODUCTS_NAME = "products.jsonl"
VIDEO_FILE_PREFIX = "_video/"


def city_inbox(city: str) -> Path:
    return SCREENSHOTS_INBOX / city


def video_frames_dir(city: str) -> Path:
    return city_inbox(city) / "_video"


def list_city_videos(city: str) -> list[Path]:
    d = VIDEO_DIR / city
    if not d.is_dir():
        return []
    return sorted(
        p
        for p in d.iterdir()
        if p.is_file() and p.suffix.lower() in VIDEO_EXTS
    )


def list_video_cities() -> list[str]:
    if not VIDEO_DIR.is_dir():
        return []
    return sorted(
        p.name
        for p in VIDEO_DIR.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )


def products_path(city: str) -> Path:
    return city_inbox(city) / PRODUCTS_NAME


def remove_video_products(jsonl: Path) -> int:
    """删掉 file 以 _video/ 开头的行（该城视频结果整体替换）。"""
    if not jsonl.is_file():
        return 0
    kept: list[str] = []
    removed = 0
    for line in jsonl.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw:
            continue
        try:
            rec = json.loads(raw)
        except json.JSONDecodeError:
            kept.append(line)
            continue
        file_name = str(rec.get("file") or "")
        if file_name.startswith(VIDEO_FILE_PREFIX):
            removed += 1
            continue
        kept.append(json.dumps(rec, ensure_ascii=False))
    jsonl.write_text(
        ("\n".join(kept) + ("\n" if kept else "")), encoding="utf-8"
    )
    return removed


def clear_city_video_frames(frames_dir: Path) -> None:
    """清空该城 _video 下的帧与 OCR 副产物（保留目录）。"""
    if not frames_dir.exists():
        frames_dir.mkdir(parents=True, exist_ok=True)
        return
    for p in frames_dir.glob("frame_*.jpg"):
        p.unlink()
    for name in ("ocr_raw.jsonl", "dishes.txt"):
        side = frames_dir / name
        if side.is_file():
            side.unlink()
    crops = frames_dir / "crops"
    if crops.is_dir():
        shutil.rmtree(crops)
    tmp = frames_dir / "_tmp_extract"
    if tmp.exists():
        shutil.rmtree(tmp)


def extract_city_videos(
    city: str,
    videos: list[Path],
    *,
    min_still_s: float,
    diff_threshold: float,
) -> int:
    """各视频抽到临时目录后，按序重编号写入 screenshots_inbox/{城}/_video/。"""
    frames_dir = video_frames_dir(city)
    clear_city_video_frames(frames_dir)
    tmp = frames_dir / "_tmp_extract"
    n = 0
    for video in videos:
        if tmp.exists():
            shutil.rmtree(tmp)
        result = extract_still_frames(
            video,
            tmp,
            min_still_s=min_still_s,
            diff_threshold=diff_threshold,
        )
        print(
            f"  抽帧 {video.name}: fps {result.fps:g}（{result.fps_source}），"
            f"{len(result.paths)} 帧"
        )
        for src in result.paths:
            n += 1
            dest = frames_dir / f"frame_{n:04d}.jpg"
            shutil.move(str(src), str(dest))
    if tmp.exists():
        shutil.rmtree(tmp)
    return n


def append_video_records(
    city: str,
    records: list[dict],
    *,
    category: str = VIDEO_DEFAULT_CATEGORY,
) -> int:
    """写入 products.jsonl；file 为 _video/frame_xxxx.jpg。"""
    out = products_path(city)
    out.parent.mkdir(parents=True, exist_ok=True)
    removed = remove_video_products(out)
    if removed:
        print(f"  替换旧视频行 {removed} 条")
    n = 0
    with out.open("a", encoding="utf-8") as fp:
        for rec in records:
            name = rec.get("file") or "frame.jpg"
            row = {
                "file": f"{VIDEO_FILE_PREFIX}{name}",
                "before": list(rec.get("before") or []),
                "after": list(rec.get("after") or []),
                "city": city,
                "category": category,
            }
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def ingest_city(
    city: str,
    videos: list[Path] | None = None,
    *,
    category: str = VIDEO_DEFAULT_CATEGORY,
    skip_extract: bool = False,
    min_still_s: float = 0.2,
    diff_threshold: float = 2.5,
    ocr_engine: str | None = None,
) -> int:
    vids = list(videos) if videos is not None else list_city_videos(city)
    if not vids and not skip_extract:
        raise FileNotFoundError(f"没有视频：{VIDEO_DIR / city}")

    frames_dir = video_frames_dir(city)
    print(f"\n### 城市 {city}（忽略视频文件名，只认目录）")
    if skip_extract:
        if not any(frames_dir.glob("frame_*.jpg")):
            raise FileNotFoundError(f"--skip-extract 但无帧：{frames_dir}")
        print(f"  跳过抽帧，使用 {frames_dir}")
    else:
        n_frames = extract_city_videos(
            city,
            vids,
            min_still_s=min_still_s,
            diff_threshold=diff_threshold,
        )
        print(f"  合计 {n_frames} 帧 → {frames_dir}")
        if n_frames == 0:
            print("  无停稳帧，跳过 OCR")
            remove_video_products(products_path(city))
            return 0

    records, failures = ocr_frames_dir(
        frames_dir, engine=ocr_engine, write_sidecar=True
    )
    if failures:
        print(f"  OCR 部分失败 {len(failures)} 帧（已跳过）")
    n = append_video_records(city, records, category=category)
    print(f"  追加 {n} 行 → {products_path(city)}（category={category}）")
    return n


def main() -> None:
    ap = argparse.ArgumentParser(
        description="video/{城}/* → screenshots_inbox/{城}/products.jsonl（只认城市目录）"
    )
    ap.add_argument("--city", type=str, default=None, help="只处理该城；默认 video/ 全部")
    ap.add_argument(
        "--category",
        type=str,
        default=VIDEO_DEFAULT_CATEGORY,
        help=f"写入 products.jsonl 的类别（混录默认 {VIDEO_DEFAULT_CATEGORY}）",
    )
    ap.add_argument(
        "--skip-extract",
        action="store_true",
        help="不抽帧，直接对已有 screenshots_inbox/{城}/_video/ 跑 OCR 并写入 jsonl",
    )
    ap.add_argument("--min-still", type=float, default=0.2)
    ap.add_argument("--diff-threshold", type=float, default=2.5)
    ap.add_argument("--ocr", choices=OCR_ENGINES, default=None)
    args = ap.parse_args()

    resolve_ocr_engine(args.ocr)

    cities = [args.city] if args.city else list_video_cities()
    if not cities:
        print(f"错误：没有城市目录 {VIDEO_DIR}")
        sys.exit(1)
    if args.city and not list_city_videos(args.city) and not args.skip_extract:
        print(f"错误：没有视频 {VIDEO_DIR / args.city}")
        sys.exit(1)

    total = 0
    for city in cities:
        try:
            total += ingest_city(
                city,
                category=args.category,
                skip_extract=args.skip_extract,
                min_still_s=args.min_still,
                diff_threshold=args.diff_threshold,
                ocr_engine=args.ocr,
            )
        except Exception as e:
            print(f"失败：{city}: {e}")
            sys.exit(1)
    print(f"\n完成：共追加 {total} 行 products.jsonl")


if __name__ == "__main__":
    main()
