#!/usr/bin/env python3
"""P1 冒烟：首页搜菜系 → 进第一家店 → 等到「打卡」→ 截图。"""

from __future__ import annotations

import time
from pathlib import Path

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

try:
    from config import UDID
except ImportError:
    UDID = "CLB0218723006111"

APPIUM_URL = "http://127.0.0.1:4723"
PACKAGE = "com.dianping.v1"
ACTIVITY = "com.dianping.v1.NovaMainActivity"

# 本次测试搜索词（可改）
SEARCH_CUISINE = "川菜"

# 首页搜索条（无 id，本机固定分辨率）
HOME_SEARCH_BOUNDS = (135, 207, 779, 300)  # left, top, right, bottom
KEYWORD_EDIT_ID = "com.dianping.v1:id/search_keyword_edit"
SEARCH_BTN_ID = "com.dianping.v1:id/search_button"
SHOP_ITEM_ID = "com.dianping.v1:id/shop_item_shop_view"
SHOP_TITLE_ID = "com.dianping.v1:id/search_shop_title_text"

SHOT_DIR = Path(__file__).resolve().parent / "screenshots"


def build_driver() -> webdriver.Remote:
    opts = UiAutomator2Options()
    opts.load_capabilities(
        {
            "platformName": "Android",
            "appium:automationName": "UiAutomator2",
            "appium:udid": UDID,
            "appium:appPackage": PACKAGE,
            "appium:appActivity": ACTIVITY,
            "appium:noReset": True,
            "appium:newCommandTimeout": 300,
        }
    )
    return webdriver.Remote(APPIUM_URL, options=opts)


def wait(driver, timeout=25) -> WebDriverWait:
    return WebDriverWait(driver, timeout, poll_frequency=0.5)


def tap_bounds_center(driver, bounds) -> None:
    left, top, right, bottom = bounds
    x, y = (left + right) // 2, (top + bottom) // 2
    driver.execute_script("mobile: clickGesture", {"x": x, "y": y})


def open_home_search(driver) -> None:
    print("1) 点首页搜索区")
    # 若已在搜索页（已有输入框），跳过
    if driver.find_elements(AppiumBy.ID, KEYWORD_EDIT_ID):
        print("   已在搜索输入页")
        return
    tap_bounds_center(driver, HOME_SEARCH_BOUNDS)
    wait(driver, 15).until(EC.presence_of_element_located((AppiumBy.ID, KEYWORD_EDIT_ID)))
    print("   搜索输入页已打开")


def type_and_search(driver, keyword: str) -> None:
    print(f"2) 输入「{keyword}」并搜索")
    edit = wait(driver, 15).until(EC.element_to_be_clickable((AppiumBy.ID, KEYWORD_EDIT_ID)))
    edit.click()
    try:
        edit.clear()
    except Exception:
        pass
    edit.send_keys(keyword)
    btn = wait(driver, 10).until(EC.element_to_be_clickable((AppiumBy.ID, SEARCH_BTN_ID)))
    btn.click()


def wait_result_list(driver, timeout=25) -> str:
    print("3) 等待店铺列表")
    wait(driver, timeout).until(EC.presence_of_element_located((AppiumBy.ID, SHOP_ITEM_ID)))
    titles = driver.find_elements(AppiumBy.ID, SHOP_TITLE_ID)
    name = (titles[0].text or "").strip() if titles else "(未知店名)"
    print(f"   第一家：{name}")
    return name


def open_first_shop(driver) -> None:
    print("4) 点击第一家店铺")
    items = driver.find_elements(AppiumBy.ID, SHOP_ITEM_ID)
    if not items:
        raise RuntimeError("没有 shop_item_shop_view")
    items[0].click()


def wait_shop_page(driver, timeout=25) -> None:
    print("5) 等待店铺页（打卡）")
    wait(driver, timeout).until(
        EC.presence_of_element_located(
            (AppiumBy.ANDROID_UIAUTOMATOR, 'new UiSelector().text("打卡")')
        )
    )
    time.sleep(0.5)
    print("   已进入店铺页")


def main() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    shot = SHOT_DIR / f"p1_shop_{SEARCH_CUISINE}.png"

    print("连接 Appium…")
    print("请确认：停在首页，Inspector 已断开会话，appium 在跑。")
    driver = build_driver()
    try:
        open_home_search(driver)
        type_and_search(driver, SEARCH_CUISINE)
        shop_name = wait_result_list(driver)
        open_first_shop(driver)
        wait_shop_page(driver)
        driver.save_screenshot(str(shot))
        print(f"完成：{shop_name}")
        print(f"截图 → {shot}")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
