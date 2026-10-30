#!/usr/bin/env python3
"""
美团：按 addresses.json 循环新增收货地址。

前置：手机停在「收货地址」列表；Appium 已开；关掉 Inspector Session。
失败：打印日志并暂停，人工介入后回车重试当前城市。
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from config import (
    ACTIVITY,
    ADDRESSES_FILE,
    APPIUM_URL,
    CONTACT_CHIP,
    PACKAGE,
    PAUSE_LONG,
    PAUSE_MED,
    PAUSE_SHORT,
    RESUME_CITY,
    STEP_PAUSE_AFTER_CITY,
    UDID,
)

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
            "appium:dontStopAppOnReset": True,
            "appium:autoLaunch": False,
            "appium:newCommandTimeout": 600,
        }
    )
    return webdriver.Remote(APPIUM_URL, options=opts)


def wait(driver, timeout: float = 20) -> WebDriverWait:
    return WebDriverWait(driver, timeout, poll_frequency=0.4)


def pause(sec: float) -> None:
    time.sleep(sec)


def _el_rect(el) -> tuple[int, int, int, int] | None:
    """返回 (left, top, right, bottom)；优先用 bounds 属性（WebView 更稳）。"""
    raw = el.get_attribute("bounds") or ""
    m = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", raw)
    if m:
        return tuple(int(x) for x in m.groups())  # type: ignore[return-value]
    try:
        loc, size = el.location, el.size
        l, t = int(loc["x"]), int(loc["y"])
        return l, t, l + int(size["width"]), t + int(size["height"])
    except Exception:
        return None


def tap_xy(driver, x: int, y: int) -> None:
    driver.execute_script("mobile: clickGesture", {"x": int(x), "y": int(y)})


def tap_el(driver, el) -> None:
    rect = _el_rect(el)
    if rect is None:
        raise RuntimeError("无法获取元素 bounds/location")
    l, t, r, b = rect
    tap_xy(driver, (l + r) // 2, (t + b) // 2)


def _find_city_result_target(
    driver, city: str
) -> tuple[object, tuple[int, int, int, int], str] | None:
    labels = [f"{city}市", city]
    candidates = []
    for label in labels:
        for el in driver.find_elements(
            AppiumBy.XPATH, f'//android.widget.TextView[@text="{label}"]'
        ):
            rect = _el_rect(el)
            if not rect:
                continue
            l, t, r, b = rect
            w, h = r - l, b - t
            # 搜索结果行：偏宽、有一定高度；排除过小的 chip
            if w < 400 or h < 40:
                continue
            if t < 150:  # 太靠上多半是标题/搜索框区域
                continue
            candidates.append((w * h, w, el, rect, label))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (-x[0], -x[1]))
    _, _, el, rect, label = candidates[0]
    return el, rect, label


def _still_on_city_search(driver) -> bool:
    try:
        find_by_text(driver, "输入城市名进行搜索", partial=True, timeout=1.5)
        return True
    except TimeoutException:
        return False


def tap_city_search_result(driver, city: str, timeout: float = 15) -> None:
    """
    点选城市搜索结果「xx市」/「xx」。
    结果行常是 clickable=false 的 TextView；先直接坐标点（键盘上方通常可点），
    若仍停在城市搜索页，再收起键盘后重点。
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        hit = _find_city_result_target(driver, city)
        if hit is None:
            pause(0.4)
            continue
        _, rect, label = hit
        l, t, r, b = rect
        x, y = (l + r) // 2, (t + b) // 2
        print(f"   点城市结果「{label}」bounds={rect} -> ({x},{y})")
        tap_xy(driver, x, y)
        pause(PAUSE_MED)
        if not _still_on_city_search(driver):
            return
        print("   似乎未点上（仍在城市搜索页），收起键盘后重试…")
        hide_ime(driver)
        pause(PAUSE_SHORT)
        hit = _find_city_result_target(driver, city)
        if hit is None:
            pause(0.4)
            continue
        _, rect, label = hit
        l, t, r, b = rect
        x, y = (l + r) // 2, (t + b) // 2
        print(f"   再点「{label}」bounds={rect} -> ({x},{y})")
        tap_xy(driver, x, y)
        pause(PAUSE_MED)
        if not _still_on_city_search(driver):
            return
        # 继续循环等到超时
    raise TimeoutException(f"未能点选城市搜索结果: {city}")


def find_by_text(driver, text: str, timeout: float = 15, partial: bool = False):
    if partial:
        xp = f'//*[contains(@text,"{text}")]'
    else:
        xp = f'//*[@text="{text}"]'
    return wait(driver, timeout).until(EC.presence_of_element_located((AppiumBy.XPATH, xp)))


def find_id(driver, rid: str, timeout: float = 15):
    # 美团部分页是 WebView / 无包名前缀的 id
    for by, value in (
        (AppiumBy.ID, rid),
        (AppiumBy.ID, f"{PACKAGE}:id/{rid}"),
        (AppiumBy.ACCESSIBILITY_ID, rid),
        (AppiumBy.XPATH, f'//*[@resource-id="{rid}"]'),
        (AppiumBy.XPATH, f'//*[contains(@resource-id,"{rid}")]'),
    ):
        try:
            return wait(driver, min(timeout, 6)).until(
                EC.presence_of_element_located((by, value))
            )
        except TimeoutException:
            continue
    raise TimeoutException(f"找不到 resource-id≈{rid}")


def type_into(driver, el, text: str) -> None:
    tap_el(driver, el)
    pause(PAUSE_SHORT)
    try:
        el.clear()
    except Exception:
        pass
    el.send_keys(text)
    pause(PAUSE_MED)


def hide_ime(driver) -> None:
    try:
        driver.hide_keyboard()
    except Exception:
        try:
            driver.press_keycode(4)  # BACK
            pause(PAUSE_SHORT)
        except Exception:
            pass


def swipe_up_light(driver) -> None:
    size = driver.get_window_size()
    driver.swipe(
        size["width"] * 0.5,
        size["height"] * 0.7,
        size["width"] * 0.5,
        size["height"] * 0.4,
        350,
    )


def shot(driver, tag: str) -> Path:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SHOT_DIR / f"{int(time.time())}_{tag}.png"
    driver.get_screenshot_as_file(str(path))
    return path


def load_addresses() -> list[dict]:
    data = json.loads(ADDRESSES_FILE.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{ADDRESSES_FILE} 应为 JSON 数组")
    out = []
    for i, row in enumerate(data):
        city = (row.get("city") or "").strip()
        address = (row.get("address") or "").strip()
        if not city or not address:
            raise ValueError(f"第 {i} 条缺 city/address: {row}")
        out.append({"city": city, "address": address})
    return out


def pause_for_human(driver, city: str, step: str, err: Exception) -> None:
    path = shot(driver, f"fail_{city}_{step}")
    print(f"\n!! 失败 city={city} step={step}")
    print(f"   {type(err).__name__}: {err}")
    print(f"   截图: {path}")
    print("   请人工把界面恢复到可继续状态（列表页或当前步骤可重试）")
    input("   回车后重试当前城市… ")


def click_add_address(driver) -> None:
    el = find_by_text(driver, "新增收货地址", partial=True)
    tap_el(driver, el)
    pause(PAUSE_MED)


def click_choose_address(driver) -> None:
    try:
        el = find_id(driver, "address", timeout=10)
    except TimeoutException:
        el = find_by_text(driver, "选择收货地址", partial=True)
    tap_el(driver, el)
    pause(PAUSE_MED)


def _is_edittext(el) -> bool:
    tag = (getattr(el, "tag_name", None) or "") or ""
    cls = el.get_attribute("class") or ""
    blob = f"{tag} {cls}".lower()
    return "edittext" in blob


def find_city_search_edit(driver, timeout: float = 25):
    """城市页搜索框：优先 EditText；页面可能很慢才出来。"""
    deadline = time.time() + timeout
    last_err: Exception | None = None
    while time.time() < deadline:
        # 先点占位文案把焦点拉到搜索框
        try:
            hint = find_by_text(driver, "输入城市名进行搜索", partial=True, timeout=3)
            tap_el(driver, hint)
            pause(PAUSE_SHORT)
        except TimeoutException as e:
            last_err = e

        edits = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
        for e in edits:
            if _is_edittext(e):
                return e
        # 部分机型 class 拿不到，但节点就是 EditText
        if edits:
            return edits[0]

        # 再扫一遍带「城市」hint/text 的可编辑节点
        for xp in (
            '//android.widget.EditText',
            '//*[contains(@hint,"城市") or contains(@text,"输入城市")]',
        ):
            try:
                el = driver.find_element(AppiumBy.XPATH, xp)
                if _is_edittext(el) or "输入城市" in (
                    (el.get_attribute("text") or "")
                    + (el.get_attribute("hint") or "")
                ):
                    # 占位 TextView：点一下后再找 EditText
                    if not _is_edittext(el):
                        tap_el(driver, el)
                        pause(PAUSE_SHORT)
                        edits = driver.find_elements(
                            AppiumBy.CLASS_NAME, "android.widget.EditText"
                        )
                        if edits:
                            return edits[0]
                        continue
                    return el
            except Exception as e:
                last_err = e
        pause(0.6)
    raise TimeoutException(
        f"城市搜索框等待超时（{timeout}s）: {last_err}"
    )


def select_city(driver, city: str) -> None:
    el = find_id(driver, "city_select", timeout=20)
    tap_el(driver, el)
    # 城市选择页偶发很慢
    pause(PAUSE_LONG)
    find_by_text(driver, "输入城市名进行搜索", partial=True, timeout=30)

    edit = find_city_search_edit(driver, timeout=25)
    type_into(driver, edit, city)
    pause(PAUSE_MED)
    # 结果行 clickable=false，按宽行 bounds 坐标点；键盘上方一般可直接点
    tap_city_search_result(driver, city, timeout=15)
    pause(PAUSE_MED)


def search_and_pick_address(driver, address: str) -> None:
    edit = wait(driver, 15).until(
        EC.presence_of_element_located((AppiumBy.CLASS_NAME, "android.widget.EditText"))
    )
    # 优先带 hint 的那个
    edits = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
    for e in edits:
        hint = (e.get_attribute("hint") or "") + (e.get_attribute("text") or "")
        if "收货地址" in hint or "搜索" in hint:
            edit = e
            break
    type_into(driver, edit, address)
    pause(PAUSE_LONG)

    # 第一个搜索结果：在输入框下方的第一条可点行
    # 优先点含地址关键字的 TextView，否则点输入框下方第一个较大 View
    picked = False
    key = address[-2:] if len(address) >= 2 else address
    try:
        xp = (
            f'//android.widget.TextView[contains(@text,"{key}") '
            f'and not(contains(@text,"搜索"))]'
        )
        rows = driver.find_elements(AppiumBy.XPATH, xp)
        if rows:
            tap_el(driver, rows[0])
            picked = True
    except Exception:
        pass
    if not picked:
        # 与 Inspector 一致：输入框下方第一条大行
        size = driver.get_window_size()
        y = int(size["height"] * 0.28)
        x = size["width"] // 2
        driver.execute_script("mobile: clickGesture", {"x": x, "y": y})
    pause(PAUSE_MED)


def fill_house_number(driver, house: str) -> None:
    try:
        hint = find_by_text(driver, "输入详细地址", partial=True, timeout=10)
        tap_el(driver, hint)
        pause(PAUSE_SHORT)
    except TimeoutException:
        pass
    edits = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
    target = edits[-1] if edits else None
    if target is None:
        # 再点 hint 后找
        hint = find_by_text(driver, "门牌号", partial=True, timeout=5)
        tap_el(driver, hint)
        target = wait(driver, 8).until(
            EC.presence_of_element_located((AppiumBy.CLASS_NAME, "android.widget.EditText"))
        )
    type_into(driver, target, house)
    hide_ime(driver)
    pause(PAUSE_SHORT)


def _parse_contact_chip(chip: str) -> tuple[str, str]:
    parts = (chip or "").split()
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return chip.strip(), ""


def _contact_chip_match(text: str, name: str, phone: str) -> bool:
    """UI 常把手机号打码成 136****3359，不能整串精确匹配。"""
    t = (text or "").strip()
    if not t or "输入" in t or "地址簿" in t:
        return False
    if t == CONTACT_CHIP:
        return True
    if name and t.startswith(name) and ("*" in t or (phone and phone[:3] in t)):
        return True
    if name and phone and name in t and phone[:3] in t and phone[-4:] in t:
        return True
    return False


def pick_contact(driver) -> None:
    """
    填完门牌号后键盘常挡住推荐联系人。
    先收起键盘，点「罗 136****3359」类芯片；找不到再手填。
    """
    hide_ime(driver)
    pause(PAUSE_SHORT)
    name, phone = _parse_contact_chip(CONTACT_CHIP)

    def try_tap_chip() -> bool:
        nodes = driver.find_elements(AppiumBy.XPATH, "//android.widget.TextView")
        for el in nodes:
            txt = (el.get_attribute("text") or "").strip()
            if not _contact_chip_match(txt, name, phone):
                continue
            print(f"   点推荐联系人「{txt}」")
            tap_el(driver, el)
            pause(PAUSE_SHORT)
            return True
        return False

    if try_tap_chip():
        return

    # 芯片可能在键盘下/需焦点后才出现
    for tip in ("输入收货人姓名", "联系人", "最近使用过的地址簿"):
        try:
            el = find_by_text(driver, tip, partial=True, timeout=3)
            tap_el(driver, el)
            pause(PAUSE_SHORT)
        except TimeoutException:
            continue
    hide_ime(driver)
    pause(PAUSE_SHORT)
    if try_tap_chip():
        return

    swipe_up_light(driver)
    pause(PAUSE_SHORT)
    if try_tap_chip():
        return

    print(f"   未找到芯片，改为手填 姓名={name} 手机={phone}")
    try:
        name_el = find_by_text(driver, "输入收货人姓名", partial=True, timeout=5)
        tap_el(driver, name_el)
        pause(PAUSE_SHORT)
    except TimeoutException:
        pass
    edits = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
    for e in edits:
        t = (e.get_attribute("text") or "").strip()
        h = (e.get_attribute("hint") or "").strip()
        if "收货人姓名" in h or "收货人姓名" in t or (
            (not t or t.startswith("输入")) and "手机" not in h and "门牌" not in h
        ):
            # 跳过已填门牌号
            if t and t == name:
                continue
            if "门牌" in h:
                continue
            type_into(driver, e, name)
            break
    hide_ime(driver)
    if phone:
        try:
            phone_tip = find_by_text(driver, "输入收货人手机号", partial=True, timeout=5)
            tap_el(driver, phone_tip)
            pause(PAUSE_SHORT)
        except TimeoutException:
            pass
        edits = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
        for e in reversed(edits):
            t = (e.get_attribute("text") or "").strip()
            h = (e.get_attribute("hint") or "").strip()
            if "手机" in h or "手机" in t or (
                (not t or t.startswith("输入")) and t != name
            ):
                type_into(driver, e, phone)
                break
    hide_ime(driver)
    pause(PAUSE_SHORT)


def save_address(driver) -> None:
    hide_ime(driver)
    pause(PAUSE_SHORT)
    try:
        btn = find_by_text(driver, "保存地址", timeout=8)
    except TimeoutException:
        swipe_up_light(driver)
        pause(PAUSE_SHORT)
        btn = find_by_text(driver, "保存地址", timeout=10)
    tap_el(driver, btn)
    pause(PAUSE_LONG)


def wait_back_on_list(driver) -> None:
    find_by_text(driver, "新增收货地址", partial=True, timeout=20)
    pause(PAUSE_SHORT)


def add_one(driver, city: str, address: str) -> None:
    print(f"→ 新增：{city} | {address}")
    click_add_address(driver)
    click_choose_address(driver)
    select_city(driver, city)
    if STEP_PAUSE_AFTER_CITY:
        print(f"   [分段] 已点选城市「{city}」，请确认界面已回到地址搜索页")
        input("   回车后继续输入详细地址… ")
    search_and_pick_address(driver, address)
    fill_house_number(driver, city)
    pick_contact(driver)
    save_address(driver)
    wait_back_on_list(driver)
    print(f"✓ 完成：{city}")


def main() -> None:
    rows = load_addresses()
    if RESUME_CITY:
        idx = next((i for i, r in enumerate(rows) if r["city"] == RESUME_CITY), None)
        if idx is None:
            raise SystemExit(f"RESUME_CITY={RESUME_CITY!r} 不在 {ADDRESSES_FILE.name}")
        rows = rows[idx:]
        print(f"从 {RESUME_CITY} 续跑，剩余 {len(rows)} 条")
    else:
        print(f"共 {len(rows)} 条，配置 {ADDRESSES_FILE}")

    print("请确认已停在美团「收货地址」列表…")
    input("回车开始 ")

    driver = build_driver()
    try:
        for row in rows:
            city, address = row["city"], row["address"]
            while True:
                try:
                    add_one(driver, city, address)
                    break
                except Exception as e:
                    pause_for_human(driver, city, "add_one", e)
    finally:
        try:
            driver.quit()
        except Exception:
            pass
    print("全部完成")


if __name__ == "__main__":
    main()
