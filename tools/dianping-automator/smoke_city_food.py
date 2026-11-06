#!/usr/bin/env python3
"""大众点评：搜索切城 → 美食截图；杭州/成都/北京各一张，最后回上海首页。"""

from __future__ import annotations

import time
from pathlib import Path

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

try:
    from config import UDID
except ImportError:
    UDID = "CLB0218723006111"

APPIUM_URL = "http://127.0.0.1:4723"
PACKAGE = "com.dianping.v1"
ACTIVITY = "com.dianping.v1.NovaMainActivity"

# 人工先停在首页；跑完后也会回到该城市首页
START_CITY = "上海"
# 依次切城 → 美食 → 截图（共 3 张）
CITIES_TO_SHOT = ["杭州", "成都", "北京"]

FOOD_SEL = 'new UiSelector().resourceId("com.dianping.v1:id/tv_category_name").text("美食")'
CITY_SEARCH_HINT_XPATH = '//*[contains(@text,"搜索城市")]'
# 进城市页即见的占位：TextView「搜索城市/区县」（clickable=false，盖在输入区上）
CITY_HINT_TV_XPATH = (
    '//android.widget.TextView[contains(@text,"搜索城市")]'
)
# 城市入口：下拉箭头（唯一、可点；避免误点「关注」）
TAB_ARROW_ID = "com.dianping.v1:id/tab_arrow"
CITY_TAB_XPATH = (
    '//*[@resource-id="com.dianping.v1:id/tab_item"]'
    '[.//*[@resource-id="com.dianping.v1:id/tab_arrow"]]'
)
CITY_TAB_TEXT_XPATH = f'{CITY_TAB_XPATH}//*[@resource-id="com.dianping.v1:id/tab_text"]'
SEARCH_EDIT_ID = "com.dianping.v1:id/search_edit"
START_SEARCH_ID = "com.dianping.v1:id/start_search"
AREA_ID = "com.dianping.v1:id/area"
# EditText 可能无 id；hint 在旁边 TextView 时，自身 text 可能为空
CITY_EDIT_XPATH = (
    '//android.widget.EditText'
    '[contains(@text,"搜索城市") or contains(@hint,"搜索城市")]'
)
CITY_EDIT_UIA = (
    'new UiSelector().className("android.widget.EditText")'
    '.textContains("搜索城市")'
)
# 顶栏输入区大约高度（机型固定分辨率）
CITY_EDIT_Y_MAX = 280
# 搜索结果第一条整行（ViewGroup，常无 id / clickable=false）
FIRST_CITY_RESULT_BOUNDS = (0, 207, 1080, 345)

FOOD_BACK_BOUNDS = (33, 116, 99, 182)
# 只查这些短特征，避免全页扫描
FOOD_PAGE_SIGNAL_SELS = (
    'new UiSelector().textContains("筛选")',
    'new UiSelector().textContains("附近")',
    'new UiSelector().textContains("智能排序")',
)

SHOT_DIR = Path(__file__).resolve().parent / "screenshots"
KEYCODE_BACK = 4


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
            "appium:newCommandTimeout": 600,
        }
    )
    return webdriver.Remote(APPIUM_URL, options=opts)


def wait(driver, timeout=25) -> WebDriverWait:
    return WebDriverWait(driver, timeout, poll_frequency=0.5)


def wait_click(driver, by, value, timeout=25):
    el = wait(driver, timeout).until(EC.element_to_be_clickable((by, value)))
    el.click()
    return el


def read_home_city(driver) -> str | None:
    """只读带下拉箭头的城市 tab，不要拿「关注」等其它 tab_text。"""
    try:
        for el in driver.find_elements(AppiumBy.XPATH, CITY_TAB_TEXT_XPATH):
            text = (el.text or "").strip()
            if text:
                return text
    except StaleElementReferenceException:
        return None
    return None


def on_home(driver) -> bool:
    return bool(driver.find_elements(AppiumBy.ANDROID_UIAUTOMATOR, FOOD_SEL))


def open_city_picker(driver, from_city: str | None = None) -> None:
    # 直接点可点击的 tab_arrow（比点整块 tab_item 更稳）
    wait_click(driver, AppiumBy.ID, TAB_ARROW_ID, timeout=20)

    def _picker_ready(drv):
        # 现版：进页即见 TextView「搜索城市/区县」，即可输入（不必再点占位）
        if drv.find_elements(AppiumBy.XPATH, CITY_HINT_TV_XPATH):
            return "hint_tv"
        if _find_city_search_edit(drv) is not None:
            return "city_edit"
        if drv.find_elements(AppiumBy.ID, START_SEARCH_ID):
            return "start_search"
        if drv.find_elements(AppiumBy.XPATH, CITY_SEARCH_HINT_XPATH):
            return "hint"
        return False

    hit = wait(driver, 20).until(_picker_ready)
    time.sleep(0.25)
    shown = from_city or "?"
    print(f"   城市选择页已打开（来自：{shown}，信号：{hit}）")


def _tap_element_center(driver, el) -> None:
    try:
        el.click()
        return
    except Exception:
        pass
    try:
        r = el.rect
        driver.execute_script(
            "mobile: clickGesture",
            {
                "x": int(r["x"] + r["width"] / 2),
                "y": int(r["y"] + r["height"] / 2),
            },
        )
    except Exception:
        pass


def _find_hint_textview(driver):
    els = driver.find_elements(AppiumBy.XPATH, CITY_HINT_TV_XPATH)
    return els[0] if els else None


def _find_city_search_edit(driver):
    """
    真正接收键盘的是 EditText：
    1) text/hint 含「搜索城市」
    2) 旧 id/search_edit
    3) 已 focused 的 EditText
    4) 顶栏 EditText（占位是旁边 TextView、自身 text 为空时）
    """
    for by, value in (
        (AppiumBy.XPATH, CITY_EDIT_XPATH),
        (AppiumBy.ANDROID_UIAUTOMATOR, CITY_EDIT_UIA),
        (AppiumBy.ID, SEARCH_EDIT_ID),
    ):
        els = driver.find_elements(by, value)
        if els:
            return els[0]

    focused = driver.find_elements(
        AppiumBy.ANDROID_UIAUTOMATOR,
        'new UiSelector().className("android.widget.EditText").focused(true)',
    )
    if focused:
        return focused[0]

    # 占位 TextView 已出现时：取屏幕上方的 EditText（与 hint 同带）
    if _find_hint_textview(driver) is not None:
        try:
            for el in driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText"):
                try:
                    if el.rect.get("y", 9999) <= CITY_EDIT_Y_MAX:
                        return el
                except StaleElementReferenceException:
                    continue
        except StaleElementReferenceException:
            pass
    return None


def ensure_search_edit(driver, timeout: float = 20.0):
    """
    进城市选择页后即可输入：
    - 就绪信号：TextView「搜索城市/区县」（不可点，仅占位文案）
    - 输入目标：同区域 EditText（常无 resource-id，text 可能为空）
    """
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        edit = _find_city_search_edit(driver)
        if edit is not None:
            return edit

        hint = _find_hint_textview(driver)
        if hint is not None:
            # 点 hint 中心，焦点落到下层/同带 EditText（hint 本身 clickable=false）
            print("   点「搜索城市/区县」占位以聚焦输入框")
            _tap_element_center(driver, hint)
            time.sleep(0.35)
            edit = _find_city_search_edit(driver)
            if edit is not None:
                return edit

        for label, els in (
            ("start_search", driver.find_elements(AppiumBy.ID, START_SEARCH_ID)),
            (
                "search_layout",
                driver.find_elements(
                    AppiumBy.ID, "com.dianping.v1:id/search_layout"
                ),
            ),
        ):
            if not els:
                continue
            print(f"   点击城市搜索占位：{label}")
            _tap_element_center(driver, els[0])
            time.sleep(0.45)
            break
        else:
            time.sleep(0.25)

    has_hint_tv = bool(driver.find_elements(AppiumBy.XPATH, CITY_HINT_TV_XPATH))
    has_edit_xpath = bool(driver.find_elements(AppiumBy.XPATH, CITY_EDIT_XPATH))
    has_any_edit = bool(
        driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
    )
    has_id = bool(driver.find_elements(AppiumBy.ID, SEARCH_EDIT_ID))
    raise TimeoutException(
        f"城市选择页未找到搜索 EditText（hint_tv={has_hint_tv}, "
        f"edit_xpath={has_edit_xpath}, any_edit={has_any_edit}, "
        f"search_edit_id={has_id}）。"
        "不是 Appium 自己断开，是切城搜索框超时。"
    )


def _tap_first_city_result(driver, city: str) -> None:
    """
    搜城市后点结果第一条（一定是目标城市），不依赖文案精确匹配。
    优先 id/area 第一条；否则点第一条结果行中心（机型固定 bounds）。
    """
    def _first_area(drv):
        # 列表内第一条 area
        xp = (
            f'(//*[@resource-id="android:id/list"]'
            f'//*[@resource-id="{AREA_ID}"])[1]'
        )
        els = drv.find_elements(AppiumBy.XPATH, xp)
        if els:
            return els[0]
        els = drv.find_elements(AppiumBy.ID, AREA_ID)
        return els[0] if els else False

    try:
        el = wait(driver, 12).until(_first_area)
        name = ""
        try:
            name = (el.text or "").strip()
        except StaleElementReferenceException:
            pass
        _tap_element_center(driver, el)
        print(f"   已点选第一条结果：{name or city}")
        return
    except TimeoutException:
        pass

    # area 节点缺失时：点用户提供的第一条 ViewGroup 行中心
    left, top, right, bottom = FIRST_CITY_RESULT_BOUNDS
    cx, cy = (left + right) // 2, (top + bottom) // 2
    print(f"   area 未出现，点第一条结果行中心 ({cx},{cy}) → {city}")
    driver.execute_script("mobile: clickGesture", {"x": cx, "y": cy})


def search_and_select_city(driver, city: str) -> None:
    edit = ensure_search_edit(driver)
    _tap_element_center(driver, edit)
    try:
        edit.clear()
    except Exception:
        pass
    edit = _find_city_search_edit(driver) or edit
    edit.send_keys(city)
    print(f"   已输入：{city}")
    time.sleep(0.45)  # 等结果列表冒出
    _tap_first_city_result(driver, city)


def wait_home_city(driver, previous_city: str, target_city: str, timeout=45) -> str:
    def _done(drv):
        if drv.find_elements(AppiumBy.XPATH, CITY_SEARCH_HINT_XPATH):
            return False
        if not on_home(drv):
            return False
        city = read_home_city(drv)
        if not city:
            return False
        if city == previous_city:
            return False
        # 标题多为目标城市名；偶发带区县时 contains 也算
        if target_city in city or city in target_city:
            return city
        # 已离开原城市也先接受（避免文案差异卡死）
        return city

    new_city = wait(driver, timeout).until(_done)
    print(f"   已回到首页，当前城市：{new_city}")
    return new_city


def switch_city_by_search(driver, from_city: str, to_city: str) -> str:
    print(f"切城市：{from_city} → {to_city}")
    last_err: Exception | None = None
    for attempt in range(1, 3):
        try:
            # 若不在首页（例如卡在半屏城市页），先退回再开
            if not on_home(driver) and not driver.find_elements(
                AppiumBy.XPATH, CITY_SEARCH_HINT_XPATH
            ):
                driver.press_keycode(KEYCODE_BACK)
                time.sleep(0.5)
            if not driver.find_elements(AppiumBy.XPATH, CITY_SEARCH_HINT_XPATH):
                open_city_picker(driver, from_city)
            else:
                print("   已在城市选择页，跳过再点箭头")
            search_and_select_city(driver, to_city)
            return wait_home_city(driver, from_city, to_city)
        except Exception as e:
            last_err = e
            print(f"   切城第 {attempt} 次失败：{e}")
            # 退出残留城市页，下轮重来
            for _ in range(2):
                if on_home(driver):
                    break
                driver.press_keycode(KEYCODE_BACK)
                time.sleep(0.55)
    assert last_err is not None
    raise last_err


def tap_food(driver) -> None:
    wait_click(driver, AppiumBy.ANDROID_UIAUTOMATOR, FOOD_SEL, timeout=25)


def _food_list_ready_signal(driver) -> str | None:
    """轻量探测：只查少量特征文案，不扫全页 TextView/ImageView。"""
    for sel in FOOD_PAGE_SIGNAL_SELS:
        if driver.find_elements(AppiumBy.ANDROID_UIAUTOMATOR, sel):
            return sel
    return None


def wait_food_page_ready(driver, timeout=25) -> None:
    """
    等美食列表特征出现即可截图。

    旧逻辑会反复枚举全页 TextView 并等数量稳定；列表懒加载时数量一直变，
    页面看着已经出来了仍会卡十几秒。现改为只等「筛选/附近/…」之一。
    """

    def _ready(drv):
        if on_home(drv):
            return False
        return _food_list_ready_signal(drv)

    hit = wait(driver, timeout).until(_ready)
    # 极短缓冲，避开转场最后一帧（不做全页扫描）
    time.sleep(0.6)
    print(f"   美食页已就绪（命中：{hit}）")


def back_to_home(driver, timeout=25) -> None:
    if on_home(driver):
        return
    print("   返回首页…")
    driver.press_keycode(KEYCODE_BACK)
    try:
        wait(driver, timeout).until(lambda d: on_home(d))
        print("   已回首页")
        return
    except TimeoutException:
        pass
    # 兜底：点左上角返回图标中心
    left, top, right, bottom = FOOD_BACK_BOUNDS
    cx, cy = (left + right) // 2, (top + bottom) // 2
    print(f"   系统返回未到首页，点返回图标 ({cx}, {cy})")
    driver.execute_script("mobile: clickGesture", {"x": cx, "y": cy})
    wait(driver, timeout).until(lambda d: on_home(d))
    print("   已回首页")


def shot_food_for_city(driver, city: str) -> Path:
    print(f"进入美食并截图：{city}")
    tap_food(driver)
    wait_food_page_ready(driver)
    path = SHOT_DIR / f"food_{city}.png"
    driver.save_screenshot(str(path))
    print(f"   截图 → {path}")
    return path


def main() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    print("连接 Appium…")
    print(f"请确认：已在首页，当前城市为「{START_CITY}」，Inspector 已断开会话。")
    print(f"将依次：{' → '.join(CITIES_TO_SHOT)} 各截美食图 1 张，最后回「{START_CITY}」首页。")

    driver = build_driver()
    current = START_CITY
    shots: list[Path] = []
    try:
        home = read_home_city(driver)
        if home:
            current = home
            print(f"检测到首页城市：{current}")

        for city in CITIES_TO_SHOT:
            current = switch_city_by_search(driver, current, city)
            shots.append(shot_food_for_city(driver, city))
            back_to_home(driver)
            current = read_home_city(driver) or city

        if current != START_CITY:
            current = switch_city_by_search(driver, current, START_CITY)
        else:
            print(f"已在「{START_CITY}」，无需再切回")

        print("全部完成。截图：")
        for p in shots:
            print(f"  - {p}")
        print(f"结束于首页城市：{read_home_city(driver) or current}")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
