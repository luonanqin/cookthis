"""卡死 / 长时间无响应时：杀点评进程、重建 Appium 会话并重开 App。"""

from __future__ import annotations

import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from smoke_p4_shops import ACTIVITY, PACKAGE, UDID, build_driver


class AppStuckError(Exception):
    """页面/会话长时间无响应，需要杀进程重开。"""


def adb(*args: str, timeout: float = 30) -> subprocess.CompletedProcess:
    cmd = ["adb", "-s", UDID, *args]
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def force_stop_app() -> None:
    print(f"   [恢复] adb force-stop {PACKAGE}")
    adb("shell", "am", "force-stop", PACKAGE)
    time.sleep(1.2)


def call_with_timeout(fn, timeout_s: float, *, label: str = "操作"):
    """在超时内执行 fn；超时抛 AppStuckError（后台线程可能仍阻塞到会话被掐断）。"""
    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(fn)
        try:
            return fut.result(timeout=timeout_s)
        except FuturesTimeout as e:
            raise AppStuckError(f"{label}超过 {timeout_s:.0f}s 无响应") from e


def safe_quit(driver) -> None:
    if driver is None:
        return
    try:
        driver.quit()
    except Exception as e:
        print(f"   [恢复] driver.quit 忽略：{e}")


def recover_driver(old_driver=None):
    """
    强制结束点评 → 断开旧会话 → 新建会话并启动 App。
    返回新的 driver（调用方需自行回到首页/切城/搜菜系）。
    """
    print("\n*** 自动恢复：杀掉点评并重新打开 ***\n")
    force_stop_app()
    safe_quit(old_driver)
    time.sleep(1.5)
    print("   [恢复] 建立新 Appium 会话…")
    driver = build_driver()
    time.sleep(2.5)
    try:
        driver.activate_app(PACKAGE)
    except Exception:
        try:
            driver.execute_script(
                "mobile: startActivity",
                {"component": f"{PACKAGE}/{ACTIVITY}"},
            )
        except Exception as e:
            print(f"   [恢复] startActivity 警告：{e}")
    time.sleep(3.0)
    print("   [恢复] App 已重开，继续流程前请回到首页/目标城\n")
    return driver
