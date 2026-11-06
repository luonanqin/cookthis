"""简单步骤耗时日志。"""

from __future__ import annotations

import time
from contextlib import contextmanager


@contextmanager
def timed(label: str):
    t0 = time.perf_counter()
    print(f"[计时] ▶ {label}")
    try:
        yield
    finally:
        dt = time.perf_counter() - t0
        print(f"[计时] ■ {label}  {dt:.2f}s")


def elapsed_ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000
