"""采集节流与滑动验证人工处理（不自动过验证码）。"""

from __future__ import annotations

import random
import time

from appium.webdriver.common.appiumby import AppiumBy

# 常见风控文案（命中任一则暂停等人手）
_CAPTCHA_HINTS = (
    "滑动验证",
    "滑动确认",
    "请完成验证",
    "拖动滑块",
    "按住滑块",
    "安全验证",
    "行为验证",
)


def pause(lo: float, hi: float | None = None, *, why: str = "") -> None:
    """随机等待 [lo, hi] 秒；hi 缺省则等于 lo。"""
    if hi is None:
        hi = lo
    lo, hi = min(lo, hi), max(lo, hi)
    sec = random.uniform(lo, hi)
    if why:
        print(f"   [节流] {why} {sec:.1f}s")
    time.sleep(sec)


def page_has_captcha(driver) -> str | None:
    """若页面像验证弹层，返回命中文案；否则 None。"""
    try:
        # 无线 ADB 下 dump 整棵无障碍树可能很慢，先打一行避免「假死」错觉
        print("   [检查] 拉取 page_source 检测验证码…", flush=True)
        src = driver.page_source or ""
        print(f"   [检查] page_source 完成（{len(src)} 字符）", flush=True)
    except Exception as e:
        print(f"   [检查] page_source 失败：{e}", flush=True)
        return None
    for tip in _CAPTCHA_HINTS:
        if tip in src:
            return tip
    # 轻量兜底：可见 TextView
    try:
        for tip in _CAPTCHA_HINTS:
            sel = f'new UiSelector().textContains("{tip}")'
            if driver.find_elements(AppiumBy.ANDROID_UIAUTOMATOR, sel):
                return tip
    except Exception:
        pass
    return None


def wait_captcha_cleared(
    driver, *, poll_s: float = 2.0, max_wait_s: float | None = None
) -> None:
    """
    检测到滑动验证时暂停：请在手机上手动完成，脚本轮询直到消失。
    不自动滑动过验证。超过 max_wait_s 则抛 AppStuckError 触发杀进程重开。
    """
    from recover import AppStuckError

    try:
        from config import CAPTCHA_WAIT_MAX_S
    except ImportError:
        CAPTCHA_WAIT_MAX_S = 300

    if max_wait_s is None:
        max_wait_s = CAPTCHA_WAIT_MAX_S

    hit = page_has_captcha(driver)
    if not hit:
        return
    print(
        f"\n*** 检测到风控验证：「{hit}」***\n"
        "请在手机上完成滑动确认；完成后脚本会自动继续。\n"
        f"若超过 {max_wait_s:.0f}s 仍在，将自动杀进程重开。\n"
    )
    deadline = time.perf_counter() + max_wait_s
    while True:
        time.sleep(poll_s)
        again = page_has_captcha(driver)
        if not again:
            print("*** 验证已消失，继续采集 ***\n")
            pause(1.5, 3.0, why="验证后缓冲")
            return
        left = deadline - time.perf_counter()
        if left <= 0:
            raise AppStuckError(f"滑动验证等待超过 {max_wait_s:.0f}s")
        print(f"   …仍在等待验证（剩余约 {left:.0f}s，当前「{again}」）")
