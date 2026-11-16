from still_frames import (
    downsample_gray,
    frame_mean_abs_diff,
    iter_still_capture_indices,
)

import pytest


def test_capture_after_min_still_exceeded():
    # fps=10 → 0.2s = 2 frame intervals; need run/fps > 0.2, so run >= 3.
    # diffs length 10 connects frames 0..10.
    # diffs[i] is the difference between frame i and frame i+1.
    # Motion, then three low diffs, motion, then three low diffs, then motion.
    high, low = 10.0, 0.5
    diffs = [high, low, low, low, high, low, low, low, high, high]
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=10.0, min_still_s=0.2, diff_threshold=2.5
    )
    # First still: diffs[1..3]. run hits 3 at i=3 → capture right-hand frame 4.
    # Second still: diffs[5..7]. run hits 3 at i=7 → capture right-hand frame 8.
    assert idxs == [4, 8]


def test_exact_point_two_seconds_not_enough_need_greater():
    # Exactly 0.2s (2 intervals at 10 fps) is not enough; duration must be > 0.2s.
    high, low = 10.0, 0.5
    diffs = [high, low, low, high]  # max run = 2 → 2/10 = 0.2, not greater
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=10.0, min_still_s=0.2, diff_threshold=2.5
    )
    assert idxs == []


def test_long_still_only_one_capture():
    low = 0.5
    diffs = [low] * 20
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=10.0, min_still_s=0.2, diff_threshold=2.5
    )
    # First time run/fps > 0.2 is run=3 at i=2 → right-hand frame index 3.
    # The rest of the still is not captured again.
    assert idxs == [3]


def test_diff_equal_to_threshold_ends_still():
    # Still requires diff < threshold. Equality ends the run.
    diffs = [0.5, 2.5, 0.5, 0.5, 0.5]
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=10.0, min_still_s=0.2, diff_threshold=2.5
    )
    # Lone low diff, then a break, then three lows: capture at i=4 → frame 5.
    assert idxs == [5]


def test_non_positive_fps_raises():
    with pytest.raises(ValueError):
        iter_still_capture_indices(diffs=[0.1], fps=0)


def test_frame_mean_abs_diff_is_mean_absolute_difference():
    import numpy as np

    prev = np.array([[0, 10], [20, 30]], dtype=np.uint8)
    curr = np.array([[0, 0], [10, 10]], dtype=np.uint8)
    # Absolute differences 0, 10, 10, 20 → mean 10.
    assert frame_mean_abs_diff(prev, curr) == 10.0


def test_frame_mean_abs_diff_rejects_different_shapes():
    import numpy as np

    # (1, 3) and (3,) differ but would broadcast; still reject.
    prev = np.zeros((1, 3), dtype=np.uint8)
    curr = np.zeros((3,), dtype=np.uint8)
    with pytest.raises(ValueError, match="shape"):
        frame_mean_abs_diff(prev, curr)


def test_downsample_gray_scales_width_and_drops_color():
    import numpy as np

    bgr = np.zeros((20, 40, 3), dtype=np.uint8)
    bgr[:, :, 1] = 200
    gray = downsample_gray(bgr, width=10)
    assert gray.ndim == 2
    assert gray.shape == (5, 10)


def test_downsample_gray_passthrough_already_gray():
    import numpy as np

    gray_in = np.full((20, 40), 128, dtype=np.uint8)
    out = downsample_gray(gray_in, width=10)
    assert out.shape == (5, 10)
    assert int(out.mean()) == 128


def test_downsample_gray_rejects_empty_frame():
    import numpy as np

    with pytest.raises(ValueError):
        downsample_gray(np.zeros((0, 10), dtype=np.uint8), width=10)
