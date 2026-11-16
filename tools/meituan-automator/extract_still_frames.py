#!/usr/bin/env python3
"""从录屏抽出停稳帧（默认连续静止 >0.2s；帧内容不去重）。"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import NamedTuple

import cv2

from still_frames import (
    downsample_gray,
    frame_mean_abs_diff,
    iter_still_capture_indices,
)


class StillExtract(NamedTuple):
    paths: list[Path]
    fps: float
    fps_source: str
    capture_count: int


def extract_still_frames(
    video: Path,
    out_dir: Path,
    *,
    min_still_s: float = 0.2,
    diff_threshold: float = 2.5,
    sample_width: int = 160,
) -> StillExtract:
    """两遍读取：第一遍只算帧差与 fps，第二遍按捕获下标写 JPG。

    写出前删除 out_dir 中已有的 frame_*.jpg（含零捕获，避免留下旧帧）。
    不删除同目录下的其它文件。第二遍写出张数与捕获下标数不一致时抛 RuntimeError。
    """
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频：{video}")
    try:
        measured = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        if measured <= 1e-6:
            fps = 30.0
            fps_source = "fallback"
        else:
            fps = measured
            fps_source = "measured"
        prev_small = None
        diffs: list[float] = []
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            small = downsample_gray(frame, sample_width)
            if prev_small is not None:
                diffs.append(frame_mean_abs_diff(prev_small, small))
            prev_small = small
    finally:
        cap.release()
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=fps, min_still_s=min_still_s, diff_threshold=diff_threshold
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("frame_*.jpg"):
        if old.is_file():
            old.unlink()
    written: list[Path] = []
    if not idxs:
        return StillExtract(written, fps, fps_source, 0)
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频：{video}")
    try:
        want = set(idxs)
        i = 0
        n = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if i in want:
                n += 1
                path = out_dir / f"frame_{n:04d}.jpg"
                if not cv2.imwrite(
                    str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92]
                ):
                    raise RuntimeError(f"无法写出帧：{path}")
                written.append(path)
            i += 1
    finally:
        cap.release()
    if len(written) != len(idxs):
        raise RuntimeError(
            f"写出帧数与捕获下标不一致：期望 {len(idxs)}，实际 {len(written)}"
        )
    return StillExtract(written, fps, fps_source, len(idxs))


def main() -> None:
    ap = argparse.ArgumentParser(
        description="录屏停稳抽帧（>0.2s，帧不去重）。日常请用 ingest_video_city.py"
    )
    ap.add_argument("video", type=Path)
    ap.add_argument(
        "--out",
        type=Path,
        required=True,
        help="帧输出目录（城级入口会写到 screenshots_inbox/{城}/_video/{stem}/）",
    )
    ap.add_argument("--min-still", type=float, default=0.2)
    ap.add_argument("--diff-threshold", type=float, default=2.5)
    args = ap.parse_args()
    video = args.video.expanduser().resolve()
    out = args.out.expanduser().resolve()
    result = extract_still_frames(
        video, out, min_still_s=args.min_still, diff_threshold=args.diff_threshold
    )
    print(
        f"fps {result.fps:g}（{result.fps_source}），捕获下标 {result.capture_count}"
        f" → 写出 {len(result.paths)} 帧到 {out}"
    )


if __name__ == "__main__":
    main()
