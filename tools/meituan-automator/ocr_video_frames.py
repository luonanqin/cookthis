#!/usr/bin/env python3
"""对抽帧目录批 OCR，写 ocr_raw.jsonl + 去重后 dishes.txt。

默认只识别 VIDEO_OCR_REGION（Appium 窗口坐标，按帧相对 VIDEO_OCR_REF_SIZE 分轴缩放后裁剪）。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from PIL import Image

from config import VIDEO_OCR_REF_SIZE, VIDEO_OCR_REGION
from ocr_products import (
    OCR_ENGINES,
    append_jsonl,
    build_record,
    extract_product_names,
    ocr_image,
    resolve_ocr_engine,
)

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def dedupe_preserve_order(names: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        t = (n or "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def scale_region(
    region: tuple[int, int, int, int],
    *,
    image_size: tuple[int, int],
    ref_size: tuple[int, int] = VIDEO_OCR_REF_SIZE,
) -> tuple[int, int, int, int]:
    """把 Appium 窗口坐标按实际帧宽高分轴缩放。"""
    iw, ih = image_size
    rw, rh = ref_size
    if rw <= 0 or rh <= 0 or iw <= 0 or ih <= 0:
        raise ValueError("sizes must be positive")
    sx = iw / rw
    sy = ih / rh
    x1, y1, x2, y2 = region
    return (
        int(round(x1 * sx)),
        int(round(y1 * sy)),
        int(round(x2 * sx)),
        int(round(y2 * sy)),
    )


def crop_frame_for_ocr(
    src: Path,
    crops_dir: Path,
    region: tuple[int, int, int, int] = VIDEO_OCR_REGION,
    *,
    ref_size: tuple[int, int] = VIDEO_OCR_REF_SIZE,
) -> Path:
    """裁剪商品文字区，写出 crops/{stem}_ocr.jpg，返回裁剪路径。"""
    crops_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        iw, ih = im.size
        x1, y1, x2, y2 = scale_region(
            region, image_size=(iw, ih), ref_size=ref_size
        )
        x1 = max(0, min(x1, iw - 1))
        y1 = max(0, min(y1, ih - 1))
        x2 = max(x1 + 1, min(x2, iw))
        y2 = max(y1 + 1, min(y2, ih))
        crop = im.crop((x1, y1, x2, y2))
        out = crops_dir / f"{src.stem}_ocr.jpg"
        crop.convert("RGB").save(out, quality=92)
    return out


def list_frame_paths(frames_dir: Path) -> list[Path]:
    return sorted(
        p
        for p in frames_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXT and p.name.startswith("frame_")
    )


def ocr_frames_dir(
    frames_dir: Path,
    *,
    engine: str | None = None,
    scale: int = 2,
    full_frame: bool = False,
    region: tuple[int, int, int, int] | None = None,
    write_sidecar: bool = True,
) -> tuple[list[dict[str, Any]], list[str]]:
    """批 OCR 帧目录。

    返回 (成功记录列表, 失败信息列表)。
    成功时可选写 ocr_raw.jsonl / dishes.txt。
    """
    eng = resolve_ocr_engine(engine)
    reg = region if region is not None else VIDEO_OCR_REGION
    paths = list_frame_paths(frames_dir)
    if not paths:
        raise FileNotFoundError(f"没有 frame_* 图片：{frames_dir}")

    raw_jsonl = frames_dir / "ocr_raw.jsonl"
    dishes_txt = frames_dir / "dishes.txt"
    crops_dir = frames_dir / "crops"
    records: list[dict[str, Any]] = []
    failures: list[str] = []
    all_after: list[str] = []
    jsonl_started = False

    print(f"OCR 引擎：{eng}；共 {len(paths)} 帧")
    if full_frame:
        print("区域：整帧")
    else:
        rw, rh = VIDEO_OCR_REF_SIZE
        print(f"区域（Appium {rw}x{rh} 基准）：{reg}")

    for path in paths:
        print(f"=== {path.name} ===")
        try:
            ocr_path = path
            if not full_frame:
                ocr_path = crop_frame_for_ocr(path, crops_dir, reg)
                print(f"  crop → {ocr_path.name}")
            raw = ocr_image(ocr_path, scale=scale, engine=eng)
            before = extract_product_names(raw)
            rec = build_record(path, before)
        except Exception as e:
            failures.append(f"{path.name}: {e}")
            print(f"失败：{e}")
            continue
        if write_sidecar:
            if not jsonl_started:
                if raw_jsonl.exists():
                    raw_jsonl.unlink()
                jsonl_started = True
            append_jsonl(raw_jsonl, rec)
        records.append(rec)
        all_after.extend(rec["after"])
        print(f"  after: {rec['after']}")

    print(f"成功 {len(records)} 帧，失败 {len(failures)} 帧")
    if not records:
        raise RuntimeError("全部帧 OCR 失败")
    if write_sidecar:
        dishes = dedupe_preserve_order(all_after)
        dishes_txt.write_text(
            "\n".join(dishes) + ("\n" if dishes else ""), encoding="utf-8"
        )
        print(f"去重后 {len(dishes)} 个菜名 → {dishes_txt}")
    return records, failures


def main() -> None:
    ap = argparse.ArgumentParser(description="抽帧目录批 OCR → dishes.txt")
    ap.add_argument("frames_dir", type=Path)
    ap.add_argument("--ocr", choices=OCR_ENGINES, default=None)
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument(
        "--full-frame",
        action="store_true",
        help="不裁剪，整帧 OCR（默认只识别 VIDEO_OCR_REGION）",
    )
    ap.add_argument(
        "--region",
        type=int,
        nargs=4,
        metavar=("X1", "Y1", "X2", "Y2"),
        default=None,
        help="覆盖默认裁剪区（Appium 窗口坐标）",
    )
    args = ap.parse_args()
    frames_dir = args.frames_dir.expanduser().resolve()
    region = tuple(args.region) if args.region else None
    try:
        ocr_frames_dir(
            frames_dir,
            engine=args.ocr,
            scale=args.scale,
            full_frame=args.full_frame,
            region=region,
        )
    except (FileNotFoundError, RuntimeError) as e:
        print(f"错误：{e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
