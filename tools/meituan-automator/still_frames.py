"""录屏帧静止检测：差分 + 停稳捕获下标。"""
from __future__ import annotations

import numpy as np


def downsample_gray(bgr_or_gray, width: int = 160):
    """灰度并缩放到给定宽度，高度按比例。"""
    import cv2

    if bgr_or_gray.ndim == 3:
        gray = cv2.cvtColor(bgr_or_gray, cv2.COLOR_BGR2GRAY)
    else:
        gray = bgr_or_gray
    h, w = gray.shape[:2]
    if w <= 0 or h <= 0:
        raise ValueError("empty frame")
    nh = max(1, int(round(h * (width / w))))
    return cv2.resize(gray, (width, nh), interpolation=cv2.INTER_AREA)


def frame_mean_abs_diff(prev_gray_small, curr_gray_small) -> float:
    """两帧缩小灰度图的平均绝对差。形状必须一致，不广播。"""
    if prev_gray_small.shape != curr_gray_small.shape:
        raise ValueError(
            f"frame shapes differ: {prev_gray_small.shape} vs {curr_gray_small.shape}"
        )
    a = prev_gray_small.astype(np.float32)
    b = curr_gray_small.astype(np.float32)
    return float(np.mean(np.abs(a - b)))


def iter_still_capture_indices(
    *,
    diffs: list[float],
    fps: float,
    min_still_s: float = 0.2,
    diff_threshold: float = 2.5,
) -> list[int]:
    """返回应保存的帧下标（0-based）。

    `diffs[i]` 是帧 `i` 与帧 `i+1` 的差。连续低差
    `diffs[s] … diffs[s + run - 1]` 的时长为 `run / fps`。
    低差判定为 `diff < diff_threshold`；`diff >= diff_threshold` 结束该段。
    首次 `run / fps > min_still_s` 时捕获右端帧下标 `s + run`
    （即当前 diff 下标 `i` 的 `i + 1`）。同一静止段只捕获一次。
    """
    if fps <= 0:
        raise ValueError("fps must be positive")
    out: list[int] = []
    run = 0
    captured_this_run = False
    for i, d in enumerate(diffs):
        if d < diff_threshold:
            run += 1
            duration = run / fps
            if duration > min_still_s and not captured_this_run:
                out.append(i + 1)
                captured_this_run = True
        else:
            run = 0
            captured_this_run = False
    return out
