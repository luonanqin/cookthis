#!/usr/bin/env python3
"""P2 冒烟：搜菜系 → 列表读店名/菜系原文 → 进店 → 滚动找菜单 → 截图 → 返回列表。"""

from __future__ import annotations

import time
from pathlib import Path

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from ocr_region import ocr_element

try:
    from config import UDID
except ImportError:
    UDID = "CLB0218723006111"

APPIUM_URL = "http://127.0.0.1:4723"
PACKAGE = "com.dianping.v1"
ACTIVITY = "com.dianping.v1.NovaMainActivity"

SEARCH_CUISINE = "川菜"
HOME_SEARCH_BOUNDS = (135, 207, 779, 300)
KEYWORD_EDIT_ID = "com.dianping.v1:id/search_keyword_edit"
SEARCH_BTN_ID = "com.dianping.v1:id/search_button"
SHOP_ITEM_ID = "com.dianping.v1:id/shop_item_shop_view"
SHOP_TITLE_ID = "com.dianping.v1:id/search_shop_title_text"
SHOP_THIRD_LINE_ID = "com.dianping.v1:id/search_shop_third_line"
KEYCODE_BACK = 4
# 点「推荐菜」跳转后，菜单一般已在下方；最多再轻滑几次找入口
MAX_MENU_SWIPES_AFTER_RECOMMEND = 3

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
    driver.execute_script(
        "mobile: clickGesture",
        {"x": (left + right) // 2, "y": (top + bottom) // 2},
    )


def swipe_up(driver) -> None:
    size = driver.get_window_size()
    driver.swipe(
        size["width"] * 0.5,
        size["height"] * 0.75,
        size["width"] * 0.5,
        size["height"] * 0.35,
        400,
    )


def swipe_down(driver) -> None:
    """内容向下滑，露出上方区域。"""
    size = driver.get_window_size()
    driver.swipe(
        size["width"] * 0.5,
        size["height"] * 0.35,
        size["width"] * 0.5,
        size["height"] * 0.75,
        400,
    )


def _clean_attr(value) -> str:
    """Appium 常把空 content-desc 弄成字面量 'null'。"""
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in ("null", "none", "undefined"):
        return ""
    return text


def normalize_list_cuisine(raw: str) -> str:
    """
    列表第三行 OCR 示例：'川 菜 / 酸 菜 鱼 / 水 煮 鱼 万 源 城 / 东 兰 路 3.5km'
    取「/」前第一段，去掉内部空格 → '川菜'。
    OCR 常把「/」吃掉（如「湘 菜 文 三 路…」），再与已知菜系表最长前缀匹配。
    """
    if not raw:
        return ""
    from config import CUISINES

    first = raw.split("/", 1)[0]
    compact = "".join(first.split())
    if not compact:
        return ""
    # 长的在前，避免「东北」误伤等（当前表无此前缀冲突，仍按长度稳妥）
    for name in sorted(CUISINES, key=len, reverse=True):
        if compact.startswith(name):
            return name
    return compact


def element_text_deep(el) -> str:
    """自身 text / content-desc 为空时拼接后代可读文案。"""
    try:
        own = _clean_attr(el.text)
        if own:
            return own
        desc = _clean_attr(el.get_attribute("contentDescription"))
        if desc:
            return desc
    except StaleElementReferenceException:
        return ""
    parts = []
    try:
        # 不限定 TextView：有的行是自定义 View / ImageView 带 desc
        for child in el.find_elements(AppiumBy.XPATH, ".//*"):
            try:
                t = _clean_attr(child.text) or _clean_attr(
                    child.get_attribute("contentDescription")
                )
                if t:
                    parts.append(t)
            except StaleElementReferenceException:
                continue
    except StaleElementReferenceException:
        pass
    seen = set()
    uniq = []
    for p in parts:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return " ".join(uniq)


def debug_third_line_children(el) -> None:
    try:
        kids = el.find_elements(AppiumBy.XPATH, ".//*")
        summary = []
        for child in kids[:12]:
            cls = (child.get_attribute("className") or "?").split(".")[-1]
            t = _clean_attr(child.text)
            d = _clean_attr(child.get_attribute("contentDescription"))
            summary.append(f"{cls}(text={t!r},desc={d!r})")
        print(f"   [debug] third_line 子节点数={len(kids)}: {summary}")
    except Exception as e:
        print(f"   [debug] 子节点扫描失败：{e}")


def search_cuisine_keyword(driver, keyword: str) -> None:
    """从当前页（首页或搜索页）输入菜系并进入结果列表。"""
    print(f"搜索菜系：{keyword}")
    if not driver.find_elements(AppiumBy.ID, KEYWORD_EDIT_ID):
        tap_bounds_center(driver, HOME_SEARCH_BOUNDS)
        wait(driver, 15).until(
            EC.presence_of_element_located((AppiumBy.ID, KEYWORD_EDIT_ID))
        )

    edit = wait(driver, 15).until(
        EC.element_to_be_clickable((AppiumBy.ID, KEYWORD_EDIT_ID))
    )
    edit.click()
    try:
        edit.clear()
    except Exception:
        pass
    edit.send_keys(keyword)
    wait(driver, 10).until(
        EC.element_to_be_clickable((AppiumBy.ID, SEARCH_BTN_ID))
    ).click()
    wait(driver, 25).until(EC.presence_of_element_located((AppiumBy.ID, SHOP_ITEM_ID)))
    print("   已到搜索结果列表")


def ensure_search_result_list(driver, keyword: str) -> None:
    """已在结果列表则跳过搜索；否则从首页搜到列表。不必事先停在列表页。"""
    if driver.find_elements(AppiumBy.ID, SHOP_ITEM_ID):
        print("已在搜索结果列表，跳过搜索")
        return
    search_cuisine_keyword(driver, keyword)


def _find_third_line_for_first_shop(driver, card):
    """third_line 不一定在 shop_item 子树内，多策略查找。"""
    # 1) 卡片内部
    inner = card.find_elements(AppiumBy.ID, SHOP_THIRD_LINE_ID)
    if inner:
        return inner[0]
    # 2) 标题所在卡片祖先下
    xpath_under_item = (
        f'(//*[@resource-id="{SHOP_TITLE_ID}"])[1]'
        f'/ancestor::*[@resource-id="{SHOP_ITEM_ID}"][1]'
        f'//*[@resource-id="{SHOP_THIRD_LINE_ID}"]'
    )
    found = driver.find_elements(AppiumBy.XPATH, xpath_under_item)
    if found:
        return found[0]
    # 3) 第一个店名后面的第一个 third_line（兄弟/后续节点）
    xpath_following = (
        f'(//*[@resource-id="{SHOP_TITLE_ID}"])[1]'
        f'/following::*[@resource-id="{SHOP_THIRD_LINE_ID}"][1]'
    )
    found = driver.find_elements(AppiumBy.XPATH, xpath_following)
    if found:
        return found[0]
    # 4) 页面上全部 third_line 的第一个
    all_thirds = driver.find_elements(AppiumBy.ID, SHOP_THIRD_LINE_ID)
    return all_thirds[0] if all_thirds else None


def read_first_shop_meta(driver) -> tuple[str, str, str]:
    items = driver.find_elements(AppiumBy.ID, SHOP_ITEM_ID)
    if not items:
        raise RuntimeError("没有店铺卡片")
    card = items[0]
    titles = card.find_elements(AppiumBy.ID, SHOP_TITLE_ID)
    if not titles:
        titles = driver.find_elements(AppiumBy.ID, SHOP_TITLE_ID)
    name = (titles[0].text or "").strip() if titles else "(未知店名)"

    third = _find_third_line_for_first_shop(driver, card)
    cuisine_raw = element_text_deep(third) if third else ""
    if third and not cuisine_raw:
        print("   列表第三行无障碍文案，对该区域 OCR…")
        debug_crop = SHOT_DIR / "debug_third_line_ocr.png"
        try:
            cuisine_raw = ocr_element(driver, third, debug_path=debug_crop)
            print(f"   OCR 裁剪已保存：{debug_crop}")
        except Exception as e:
            print(f"   OCR 失败：{e}")
            debug_third_line_children(third)
    elif not third:
        print(
            f"   [debug] 未找到 {SHOP_THIRD_LINE_ID}，"
            f"页面同类数量={len(driver.find_elements(AppiumBy.ID, SHOP_THIRD_LINE_ID))}"
        )

    cuisine = normalize_list_cuisine(cuisine_raw)
    print(f"   店名：{name}")
    print(f"   菜系原文：{cuisine_raw or '(空)'}")
    print(f"   菜系清洗：{cuisine or '(空)'}")
    return name, cuisine_raw, cuisine


def open_first_shop(driver, timeout: float = 8.0) -> None:
    """
    进店信号：底部「打卡」。
    不用 UiAutomator 全树 text 查找（店详页很重，一次可达数秒）；
    改为轮询 page_source，优先取 y 最大（靠屏幕下方）的「打卡」。
    """
    from ui_source import parse_page_nodes

    print("点击第一家店铺")
    t0 = time.perf_counter()
    driver.find_elements(AppiumBy.ID, SHOP_ITEM_ID)[0].click()
    deadline = time.perf_counter() + timeout
    attempt = 0
    while time.perf_counter() < deadline:
        attempt += 1
        nodes, fetch_s = parse_page_nodes(driver)
        hits = [n for n in nodes if n.text == "打卡"]
        if hits:
            # 底部栏打卡 y 更大；从上往下扫反而慢且易误判
            hits.sort(key=lambda n: n.y, reverse=True)
            hit = hits[0]
            print(
                f"   已进店（打卡 y={hit.y}，"
                f"第 {attempt} 次 page_source {fetch_s * 1000:.0f}ms，"
                f"合计 {time.perf_counter() - t0:.2f}s）"
            )
            return
        time.sleep(0.12)
    raise TimeoutException(f"进店后 {timeout:.0f}s 内未在 page_source 中找到「打卡」")


def read_shop_cuisine_on_detail(driver) -> str:
    """
    店内评分行结构（同级 TextView）：
      口味x.x | 环境x.x | 服务x.x | 菜系 | 商圈/路名
    用「口味」锚定，取其后第 3 个兄弟 = 菜系。
    """
    # 评分/菜系多在店页上半部：先读，没有再轻微下滑露顶后重试
    cuisine = _read_cuisine_by_taste_anchor(driver)
    if cuisine:
        return cuisine
    swipe_down(driver)
    time.sleep(0.4)
    return _read_cuisine_by_taste_anchor(driver)


def _read_cuisine_by_taste_anchor(driver) -> str:
    # following-sibling[3]：口味 → 环境 → 服务 → 菜系
    xpaths = (
        '//android.widget.TextView[starts-with(@text,"口味")]'
        "/following-sibling::android.widget.TextView[3]",
        '//android.widget.TextView[contains(@text,"口味")]'
        "/following-sibling::android.widget.TextView[3]",
    )
    for xp in xpaths:
        try:
            els = driver.find_elements(AppiumBy.XPATH, xp)
            for el in els:
                text = _clean_attr(el.text)
                if text and text not in ("打卡", "收藏", "分享"):
                    return text
        except StaleElementReferenceException:
            continue
    # 兜底：口味节点的父节点下第 4 个 TextView
    try:
        tastes = driver.find_elements(
            AppiumBy.XPATH, '//android.widget.TextView[starts-with(@text,"口味")]'
        )
        for taste in tastes:
            parent = taste.find_element(AppiumBy.XPATH, "..")
            tvs = parent.find_elements(AppiumBy.XPATH, "./android.widget.TextView")
            if len(tvs) >= 4:
                text = _clean_attr(tvs[3].text)
                if text:
                    return text
    except Exception:
        pass
    return ""


def find_menu_entry_from_source(driver):
    """
    用 page_source 找店内「菜单 (N)」或「文字菜单」，避免昂贵 XPath。
    返回 (label, NodeInfo) 或 (None, None)。
    """
    from ui_source import parse_page_nodes

    nodes, _ = parse_page_nodes(driver)
    # 优先「菜单 (数字)」；其次整词「文字菜单」；避免误点顶栏短「菜单」
    candidates = []
    for n in nodes:
        t = n.text
        if t == "文字菜单" or (t.startswith("菜单") and "(" in t):
            candidates.append(n)
        elif t.startswith("菜单") and any(ch.isdigit() for ch in t):
            candidates.append(n)
    if not candidates:
        return None, None
    # 取靠下的入口（店详模块），避免点到顶栏
    candidates.sort(key=lambda n: n.y, reverse=True)
    hit = candidates[0]
    return hit.text, hit


def find_menu_entry(driver):
    """兼容旧调用：返回可 click 的元素；优先 page_source + 坐标点击。"""
    label, node = find_menu_entry_from_source(driver)
    if not node:
        return None
    # 返回一个简易代理，scroll_to_menu 里改用坐标点
    node._menu_label = label  # type: ignore[attr-defined]
    return node


def find_recommend_dish_entry(driver):
    """
    店详首屏「推荐菜」入口（text 精确匹配）。
    clickable 可能为 false，仍用坐标点。返回 NodeInfo 或 None。
    """
    from ui_source import parse_page_nodes

    nodes, _ = parse_page_nodes(driver)
    hits = [n for n in nodes if n.text == "推荐菜"]
    if not hits:
        return None
    # 首屏底部模块优先（避免误点其它区域同名）
    hits.sort(key=lambda n: n.y, reverse=True)
    return hits[0]


def scroll_to_menu_and_tap(driver) -> str:
    """
    新流程：首屏点「推荐菜」跳到推荐菜模块 → 再找「菜单/文字菜单」。
    首屏无「推荐菜」则跳过该店（不再整页下滑找菜单）。
    """
    from ui_source import tap_node_center

    print("查找首屏「推荐菜」…")
    recommend = find_recommend_dish_entry(driver)
    if not recommend:
        raise RuntimeError("首屏无「推荐菜」，跳过该店")

    print(f"   点击推荐菜（y={recommend.y}）")
    tap_node_center(driver, recommend)
    time.sleep(0.6)

    print("推荐菜跳转后查找菜单入口…")
    for i in range(MAX_MENU_SWIPES_AFTER_RECOMMEND + 1):
        label, node = find_menu_entry_from_source(driver)
        if node:
            print(f"   第 {i + 1} 次查找命中：{label}")
            tap_node_center(driver, node)
            time.sleep(0.4)
            return label or "菜单"
        if i < MAX_MENU_SWIPES_AFTER_RECOMMEND:
            swipe_up(driver)
            time.sleep(0.3)
    raise RuntimeError(
        f"点推荐菜后滑了 {MAX_MENU_SWIPES_AFTER_RECOMMEND} 次仍未找到菜单/文字菜单"
    )

def back_to_list(driver) -> None:
    print("系统返回列表…")
    driver.press_keycode(KEYCODE_BACK)
    wait(driver, 20).until(EC.presence_of_element_located((AppiumBy.ID, SHOP_ITEM_ID)))
    print("   已回到搜索列表")


def main() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    shot = SHOT_DIR / f"p2_menu_{SEARCH_CUISINE}.png"

    print("连接 Appium…")
    print("起始页：首页 或 已在搜索结果列表均可（不必特意停在列表）。")
    print("请断开 Inspector Session。")
    driver = build_driver()
    try:
        ensure_search_result_list(driver, SEARCH_CUISINE)
        name, cuisine_raw, shop_cuisine = read_first_shop_meta(driver)
        if not shop_cuisine:
            print("列表菜系 OCR/清洗失败，改读店内菜系标签…")
            open_first_shop(driver)
            shop_cuisine = read_shop_cuisine_on_detail(driver)
            print(f"   店内菜系：{shop_cuisine or '(空)'}")
            menu_label = scroll_to_menu_and_tap(driver)
        else:
            open_first_shop(driver)
            menu_label = scroll_to_menu_and_tap(driver)
        driver.save_screenshot(str(shot))
        print(f"截图 → {shot}")
        print(
            f"命中入口：{menu_label} | 店：{name} | "
            f"列表原文：{cuisine_raw or '(空)'} | 采用菜系：{shop_cuisine or '(空)'}"
        )
        # 若已点进菜单页，可能要返回两次才到列表；先回一次到店，再回列表
        driver.press_keycode(KEYCODE_BACK)
        time.sleep(0.8)
        if not driver.find_elements(AppiumBy.ID, SHOP_ITEM_ID):
            back_to_list(driver)
        else:
            print("   已在搜索列表")
        print("P2 冒烟完成")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
