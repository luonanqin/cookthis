#!/usr/bin/env python3
"""
美团「菜场」搜索结果页：按地址顺序切城 → 进店 → 采左侧分类右侧食材。

前置：手机已停在关键字「菜场」的搜索结果页；Appium 已开；关掉 Inspector。
说明见 SCENARIO_菜场采集.md。
"""

from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from config import (
    ACTIVITY,
    APPIUM_URL,
    MARKET_CITIES,
    MARKET_PROGRESS_FILE,
    MARKET_REFRESH_WAIT_S,
    MARKET_RESUME_CITY,
    MARKET_SHOPS_PER_ADDRESS,
    PACKAGE,
    PAUSE_LONG,
    PAUSE_MED,
    PAUSE_SHORT,
    UDID,
)

SHOT_DIR = Path(__file__).resolve().parent / "screenshots"

TAG_KEYWORDS = ("海鲜", "菜", "蛋", "肉", "豆", "菌", "猪", "牛", "羊", "鱼", "火锅")
TAG_EXCLUDE = ("现切", "半成品", "净菜", "泡", "酱")  # 先排除，再匹配关键字
SIDEBAR_RIGHT = 250
SECTION_LEFT_MAX = 450
_SPEC_RE = re.compile(r"\d+\s*(g|G|kg|KG|克|斤|两|份|个)$")
# 价格/销量行等；角标（坏必赔等）靠结构排除，不靠文案黑名单
_NOISE_PRODUCT = re.compile(r"[¥￥元]|加购|选规格|月售|好评|起送|配送")
_BOUNDS_RE = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")
_RV_CLASS_SUFFIX = "recyclerview.widget.RecyclerView"


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
            "appium:newCommandTimeout": 3600,
        }
    )
    return webdriver.Remote(APPIUM_URL, options=opts)


def wait(driver, timeout: float = 20) -> WebDriverWait:
    return WebDriverWait(driver, timeout, poll_frequency=0.4)


def pause(sec: float) -> None:
    time.sleep(sec)


def _el_rect(el) -> tuple[int, int, int, int] | None:
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
        raise RuntimeError("无法获取元素 bounds")
    l, t, r, b = rect
    tap_xy(driver, (l + r) // 2, (t + b) // 2)


def tap_rect(driver, rect: tuple[int, int, int, int], *, y_ratio: float = 0.5) -> None:
    l, t, r, b = rect
    tap_xy(driver, (l + r) // 2, int(t + (b - t) * y_ratio))


def find_by_text(driver, text: str, timeout: float = 10, partial: bool = False):
    xp = (
        f'//*[contains(@text,"{text}")]'
        if partial
        else f'//*[@text="{text}"]'
    )
    return wait(driver, timeout).until(EC.presence_of_element_located((AppiumBy.XPATH, xp)))


def swipe_in_region(
    driver,
    left: int,
    top: int,
    right: int,
    bottom: int,
    *,
    direction: str = "up",
) -> None:
    cx = (left + right) // 2
    h = bottom - top
    if direction == "up":
        y1, y2 = int(top + h * 0.75), int(top + h * 0.30)
    else:
        y1, y2 = int(top + h * 0.30), int(top + h * 0.75)
    driver.swipe(cx, y1, cx, y2, 400)


def press_back(driver) -> None:
    driver.press_keycode(4)
    pause(PAUSE_MED)


def shot(driver, tag: str) -> Path:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SHOT_DIR / f"{int(time.time())}_{tag}.png"
    driver.get_screenshot_as_file(str(path))
    return path


def pause_for_human(driver, city: str, step: str, err: Exception) -> None:
    path = shot(driver, f"market_fail_{city}_{step}")
    print(f"\n!! 失败 city={city} step={step}")
    print(f"   {type(err).__name__}: {err}")
    print(f"   截图: {path}")
    input("   人工处理好后回车重试当前城市… ")


# —— P1 / P2 / P3 / P4 ——


def open_address_panel(driver) -> None:
    el = wait(driver, 15).until(
        EC.presence_of_element_located(
            (AppiumBy.ID, f"{PACKAGE}:id/filter_container")
        )
    )
    tap_el(driver, el)
    pause(PAUSE_MED)


def expand_more_addresses(driver) -> None:
    try:
        el = find_by_text(driver, "展开更多地址", timeout=3)
        tap_el(driver, el)
        pause(PAUSE_MED)
    except TimeoutException:
        pass


def _address_row_label(row) -> str:
    try:
        tvs = row.find_elements(AppiumBy.CLASS_NAME, "android.widget.TextView")
    except Exception:
        return ""
    for tv in tvs:
        t = (tv.get_attribute("text") or "").strip()
        if not t or t == "展开更多地址":
            continue
        return t
    return ""


def collect_address_rows(driver) -> list[tuple[object, tuple[int, int, int, int], str]]:
    size = driver.get_window_size()
    min_w = int(size["width"] * 0.7)
    rows = []
    for el in driver.find_elements(AppiumBy.CLASS_NAME, "android.view.ViewGroup"):
        if (el.get_attribute("clickable") or "").lower() != "true":
            continue
        rect = _el_rect(el)
        if not rect:
            continue
        l, t, r, b = rect
        w, h = r - l, b - t
        if w < min_w or h < 80 or h > 400:
            continue
        if t < 350:  # 避开顶部筛选
            continue
        # 优先：含 selected_icon
        try:
            icons = el.find_elements(
                AppiumBy.ID, f"{PACKAGE}:id/selected_icon"
            )
        except Exception:
            icons = []
        label = _address_row_label(el)
        if not icons and (not label or label == "展开更多地址"):
            continue
        rows.append((el, rect, label or f"row@{t}"))
    rows.sort(key=lambda x: x[1][1])  # by top
    # 去重视觉重叠
    out = []
    last_t = -999
    for item in rows:
        if item[1][1] - last_t < 40:
            continue
        out.append(item)
        last_t = item[1][1]
    return out


def select_address_by_index(driver, index: int) -> str:
    """从上到下第 index 条地址；返回点到的标签文案。"""
    open_address_panel(driver)
    expand_more_addresses(driver)
    # 滚回顶部
    size = driver.get_window_size()
    for _ in range(3):
        swipe_in_region(
            driver, 80, 500, size["width"] - 80, size["height"] - 200, direction="down"
        )
        pause(0.3)

    seen: set[str] = set()
    cur = 0
    stagnant = 0
    while cur <= index and stagnant < 6:
        rows = collect_address_rows(driver)
        progressed = False
        for el, rect, label in rows:
            fp = label or f"{rect[1]}-{rect[3]}"
            if fp in seen:
                continue
            seen.add(fp)
            progressed = True
            if cur == index:
                print(f"   点地址[{index}]「{label}」bounds={rect}")
                tap_rect(driver, rect)
                pause(PAUSE_MED)
                return label
            cur += 1
        if not progressed:
            stagnant += 1
        else:
            stagnant = 0
        swipe_in_region(
            driver, 80, 500, size["width"] - 80, size["height"] - 250, direction="up"
        )
        pause(PAUSE_SHORT)
    raise TimeoutException(f"未找到第 {index} 条地址（已见 {cur} 条）")


def confirm_address(driver) -> None:
    el = find_by_text(driver, "完成", timeout=10)
    tap_el(driver, el)
    print(f"   已点完成，等待 {MARKET_REFRESH_WAIT_S}s…")
    pause(MARKET_REFRESH_WAIT_S)


# —— P6 店铺 ——


def collect_shop_cards(driver) -> list[tuple[object, tuple[int, int, int, int]]]:
    size = driver.get_window_size()
    cards = []
    # 优先 id/wzn
    for el in driver.find_elements(AppiumBy.ID, f"{PACKAGE}:id/wzn"):
        rect = _el_rect(el)
        if not rect:
            continue
        l, t, r, b = rect
        if (r - l) > size["width"] * 0.8 and (b - t) > 300:
            cards.append((el, rect))
    # 补充大 FrameLayout / ViewGroup
    if len(cards) < MARKET_SHOPS_PER_ADDRESS:
        for cls in ("android.widget.FrameLayout", "android.view.ViewGroup"):
            for el in driver.find_elements(AppiumBy.CLASS_NAME, cls):
                rect = _el_rect(el)
                if not rect:
                    continue
                l, t, r, b = rect
                w, h = r - l, b - t
                if w < size["width"] * 0.9 or h < 400 or h > 1200:
                    continue
                if t < 350 or t > size["height"] * 0.85:
                    continue
                cards.append((el, rect))
    # 去重 + 排序
    cards.sort(key=lambda x: x[1][1])
    uniq = []
    last_t = -9999
    for item in cards:
        if abs(item[1][1] - last_t) < 80:
            continue
        uniq.append(item)
        last_t = item[1][1]
    return uniq


def open_shop(driver, shop_index: int) -> None:
    cards = collect_shop_cards(driver)
    if shop_index >= len(cards):
        raise TimeoutException(f"只要到第 {shop_index + 1} 家店，当前可见 {len(cards)}")
    el, rect = cards[shop_index]
    print(f"   进店[{shop_index}] bounds={rect}")
    tap_rect(driver, rect, y_ratio=0.35)
    pause(PAUSE_LONG)
    # 等到左侧栏出现
    deadline = time.time() + 20
    while time.time() < deadline:
        if list_sidebar_labels(driver):
            return
        pause(0.5)
    raise TimeoutException("进店后未识别到左侧分类栏")


# —— P7–P11 店内采集 ——


def tag_matches(text: str) -> bool:
    t = (text or "").strip()
    if not t or len(t) > 12:
        return False
    if any(x in t for x in TAG_EXCLUDE):
        return False
    return any(k in t for k in TAG_KEYWORDS)


def _parse_bounds(raw: str) -> tuple[int, int, int, int] | None:
    m = _BOUNDS_RE.match(raw or "")
    if not m:
        return None
    return tuple(int(x) for x in m.groups())  # type: ignore[return-value]


def _rect_area(rect: tuple[int, int, int, int]) -> int:
    l, t, r, b = rect
    return max(0, r - l) * max(0, b - t)


def _rect_contains(
    outer: tuple[int, int, int, int],
    inner: tuple[int, int, int, int],
    *,
    pad: int = 4,
) -> bool:
    ol, ot, or_, ob = outer
    il, it, ir, ib = inner
    return (
        il >= ol - pad
        and it >= ot - pad
        and ir <= or_ + pad
        and ib <= ob + pad
    )


def _node_class(el) -> str:
    return el.attrib.get("class") or ""


def _has_image_child(parent) -> bool:
    return any("ImageView" in _node_class(c) for c in parent)


def _collect_textviews(
    node, depth: int = 0, parent=None
) -> list[tuple[str, tuple[int, int, int, int], int, object]]:
    """返回 (text, bounds, depth, parent_el)。"""
    out: list[tuple[str, tuple[int, int, int, int], int, object]] = []
    t = (node.attrib.get("text") or "").strip()
    bounds = _parse_bounds(node.attrib.get("bounds") or "")
    if t and bounds and _node_class(node).endswith("TextView"):
        out.append((t, bounds, depth, parent))
    for ch in node:
        out.extend(_collect_textviews(ch, depth + 1, node))
    return out


def _is_title_slot(parent) -> bool:
    """
    商品名槽位：ViewGroup > FrameLayout > TextView（浅层）。
    「坏必赔」在另一条更深的兄弟 ViewGroup 分支里，且常与 ImageView 同级。
    """
    if parent is None:
        return False
    if not _node_class(parent).endswith("FrameLayout"):
        return False
    if _has_image_child(parent):
        return False
    return True


def _extract_right_rv_structural(rv_el) -> tuple[list[str], list[str]]:
    """
    按 RecyclerView 每一项的结构取：
    - 分区标题：左贴边短文案
    - 商品名：每项只取最浅层的标题槽 TextView（排除角标/标签分支）
    """
    names: list[str] = []
    titles: list[str] = []
    for item in list(rv_el):
        tvs = _collect_textviews(item, depth=0, parent=None)
        for t, rect, _, _ in tvs:
            if is_right_section_title(t, rect):
                titles.append(t)

        cands: list[tuple[str, tuple[int, int, int, int], int]] = []
        for t, rect, depth, parent in tvs:
            if not _is_title_slot(parent):
                continue
            if not is_product_name(t, rect):
                continue
            cands.append((t, rect, depth))
        if not cands:
            continue
        # 每张卡片只要最浅、最上的那一个标题
        min_depth = min(d for _, _, d in cands)
        top = [c for c in cands if c[2] == min_depth]
        top.sort(key=lambda x: x[1][1])
        names.append(top[0][0])

    def _uniq(items: list[str]) -> list[str]:
        out, seen = [], set()
        for x in items:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    return _uniq(names), _uniq(titles)


def snapshot_shop_ui(driver) -> dict:
    """
    一次 page_source：侧栏文案 + 右侧按 RecyclerView 项结构取商品名/分区标题。
    """
    empty = {
        "texts": [],
        "left_rv": None,
        "right_rv": None,
        "products": [],
        "section_titles": [],
    }
    src = driver.page_source
    try:
        root = ET.fromstring(src)
    except ET.ParseError:
        return empty

    texts: list[tuple[str, tuple[int, int, int, int]]] = []
    left_rv = None
    right_rv = None
    left_best = 0
    right_best = 0
    right_rv_el = None

    for el in root.iter():
        cls = _node_class(el)
        bounds = _parse_bounds(el.attrib.get("bounds") or "")
        if bounds and cls.endswith(_RV_CLASS_SUFFIX):
            l, _, r, _ = bounds
            area = _rect_area(bounds)
            cx = (l + r) // 2
            if r <= SIDEBAR_RIGHT + 40 or cx < SIDEBAR_RIGHT:
                if area > left_best:
                    left_best = area
                    left_rv = bounds
            elif l >= SIDEBAR_RIGHT - 20:
                if area > right_best:
                    right_best = area
                    right_rv = bounds
                    right_rv_el = el
        t = (el.attrib.get("text") or "").strip()
        if t and bounds:
            texts.append((t, bounds))

    products: list[str] = []
    section_titles: list[str] = []
    if right_rv_el is not None:
        products, section_titles = _extract_right_rv_structural(right_rv_el)

    return {
        "texts": texts,
        "left_rv": left_rv,
        "right_rv": right_rv,
        "products": products,
        "section_titles": section_titles,
    }


def list_sidebar_labels(
    driver, snap: dict | None = None
) -> list[tuple[str, tuple[int, int, int, int]]]:
    snap = snap or snapshot_shop_ui(driver)
    left_rv = snap.get("left_rv")
    found = []
    for t, rect in snap["texts"]:
        l, _, r, _ = rect
        if left_rv is not None:
            if not _rect_contains(left_rv, rect):
                continue
        else:
            if r > SIDEBAR_RIGHT + 20:
                continue
            if (l + r) // 2 > SIDEBAR_RIGHT:
                continue
        found.append((t, rect))
    found.sort(key=lambda x: x[1][1])
    out, seen = [], set()
    for t, rect in found:
        if t in seen:
            continue
        seen.add(t)
        out.append((t, rect))
    return out


def discover_target_tags(driver) -> tuple[list[str], set[str]]:
    """
    侧栏上滑，收集：
    - targets: 命中关键字、需要采集的左侧标签
    - all_left: 侧栏出现过的全部标签名（用于区分右侧「子分类」vs「新左侧标签」）
    """
    size = driver.get_window_size()
    targets: list[str] = []
    all_left: set[str] = set()
    seen_targets: set[str] = set()
    stagnant = 0
    for _ in range(12):
        labels = list_sidebar_labels(driver)
        before = len(all_left)
        for t, _ in labels:
            all_left.add(t)
            if tag_matches(t) and t not in seen_targets:
                seen_targets.add(t)
                targets.append(t)
        if len(all_left) == before:
            stagnant += 1
        else:
            stagnant = 0
        if stagnant >= 3:
            break
        swipe_in_region(driver, 20, 700, SIDEBAR_RIGHT - 10, size["height"] - 200)
        pause(PAUSE_SHORT)
    for _ in range(4):
        swipe_in_region(
            driver, 20, 700, SIDEBAR_RIGHT - 10, size["height"] - 200, direction="down"
        )
        pause(0.25)
    print(f"   目标左侧标签: {targets}")
    print(f"   侧栏全部标签数: {len(all_left)}")
    return targets, all_left


def tap_sidebar_tag(driver, tag: str) -> None:
    size = driver.get_window_size()
    for _ in range(10):
        for t, rect in list_sidebar_labels(driver):
            if t == tag:
                # 点整块：向左扩成栏宽
                l, top, r, b = rect
                block = (0, top - 20, SIDEBAR_RIGHT, b + 20)
                print(f"   点左侧标签「{tag}」")
                tap_rect(driver, block)
                pause(PAUSE_MED)
                return
        swipe_in_region(driver, 20, 700, SIDEBAR_RIGHT - 10, size["height"] - 200)
        pause(PAUSE_SHORT)
    raise TimeoutException(f"未找到左侧标签「{tag}」")


def is_right_section_title(text: str, rect: tuple[int, int, int, int]) -> bool:
    """右侧列表里的分区标题（子分类或左侧标签同步标题），如「茄果豆类」「平价专区」。"""
    t = (text or "").strip()
    if not t or len(t) > 12:
        return False
    l, _, r, _ = rect
    # 紧贴左侧栏右侧，如 left≈252
    if l < SIDEBAR_RIGHT or l > SECTION_LEFT_MAX:
        return False
    if r > 520:
        return False
    if _SPEC_RE.search(t) or _NOISE_PRODUCT.search(t):
        return False
    if re.fullmatch(r"[\d.|]+", t):
        return False
    if t in ("全部", "购", "|"):
        return False
    return True


def is_product_name(text: str, rect: tuple[int, int, int, int]) -> bool:
    t = (text or "").strip()
    if not (2 <= len(t) <= 30):
        return False
    l, _, r, _ = rect
    if l < SIDEBAR_RIGHT:
        return False
    if is_right_section_title(t, rect):
        return False
    if _NOISE_PRODUCT.search(t):
        return False
    if re.fullmatch(r"[\d.]+", t):
        return False
    return True


def read_right_panel(
    driver, snap: dict | None = None
) -> tuple[list[str], list[str]]:
    """右侧列表：优先用 RecyclerView 项结构结果；无结构时回退 bounds 扫描。"""
    snap = snap or snapshot_shop_ui(driver)
    if snap.get("products") is not None and snap.get("section_titles") is not None:
        # 空列表也是有效结构结果（本屏无商品）
        if snap.get("right_rv") is not None or snap["products"] or snap["section_titles"]:
            return list(snap["products"]), list(snap["section_titles"])

    right_rv = snap.get("right_rv")
    names: list[str] = []
    titles: list[str] = []
    for t, rect in snap["texts"]:
        if right_rv is not None and not _rect_contains(right_rv, rect):
            continue
        if right_rv is None and rect[0] < SIDEBAR_RIGHT:
            continue
        if is_right_section_title(t, rect):
            titles.append(t)
        elif is_product_name(t, rect):
            names.append(t)

    def _uniq(items: list[str]) -> list[str]:
        out, seen = [], set()
        for x in items:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    return _uniq(names), _uniq(titles)


def scrape_tag_products(driver, tag: str, all_left_tags: set[str]) -> list[str]:
    """
    点左侧标签后上滑右侧采商品。

    右侧标题（left≈252）：
    - 文案不在左侧栏列表里 → 当前标签的「子分类」（如茄果豆类），继续采
    - 文案在左侧栏列表里且 ≠ 当前标签 → 已滚到新的左侧标签（如平价专区），停止
    """
    tap_sidebar_tag(driver, tag)
    pause(PAUSE_MED)
    left_names = set(all_left_tags)
    snap = snapshot_shop_ui(driver)
    for t, _ in list_sidebar_labels(driver, snap):
        left_names.add(t)

    collected: list[str] = []
    seen: set[str] = set()
    size = driver.get_window_size()
    no_new = 0
    max_rounds = 25
    stop_reason = f"已达上滑上限 {max_rounds} 轮"

    for _ in range(max_rounds):
        before = len(seen)
        snap = snapshot_shop_ui(driver)
        for t, _ in list_sidebar_labels(driver, snap):
            left_names.add(t)

        products, titles = read_right_panel(driver, snap)
        for name in products:
            if name not in seen:
                seen.add(name)
                collected.append(name)

        # 右侧标题里出现「左侧栏有的、且不是当前标签」→ 新左侧标签
        new_left = [t for t in titles if t in left_names and t != tag]
        if new_left:
            stop_reason = (
                f"右侧出现左侧标签「{new_left[0]}」，视为新分类（子分类忽略）"
            )
            break

        if len(seen) == before:
            no_new += 1
        else:
            no_new = 0
        if no_new >= 3:
            stop_reason = f"连续 {no_new} 屏无新商品"
            break

        swipe_in_region(
            driver,
            SIDEBAR_RIGHT + 40,
            700,
            size["width"] - 40,
            size["height"] - 180,
        )
        pause(PAUSE_SHORT)

    preview = collected[:10]
    print(f"   标签「{tag}」停止：{stop_reason}；采集 {len(collected)} 条")
    print(f"   标签「{tag}」前十条: {preview}")
    return collected


def scrape_shop(driver) -> dict:
    tags, all_left = discover_target_tags(driver)
    by_tag: dict[str, list[str]] = {}
    for tag in tags:
        try:
            by_tag[tag] = scrape_tag_products(driver, tag, all_left)
        except Exception as e:
            print(f"   标签「{tag}」失败: {e}")
            by_tag[tag] = by_tag.get(tag, [])
    return {"tags": by_tag}


def back_to_search(driver) -> None:
    for _ in range(4):
        press_back(driver)
        try:
            wait(driver, 4).until(
                EC.presence_of_element_located(
                    (AppiumBy.ID, f"{PACKAGE}:id/filter_container")
                )
            )
            print("   已回到搜索结果页")
            return
        except TimeoutException:
            continue
    raise TimeoutException("返回搜索结果页失败")


# —— 进度 / 主流程 ——


def load_progress() -> set[str]:
    if not MARKET_PROGRESS_FILE.is_file():
        return set()
    try:
        data = json.loads(MARKET_PROGRESS_FILE.read_text(encoding="utf-8"))
        return set(data.get("done_cities") or [])
    except Exception:
        return set()


def save_progress(done: set[str]) -> None:
    MARKET_PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    MARKET_PROGRESS_FILE.write_text(
        json.dumps(
            {"done_cities": sorted(done, key=lambda c: MARKET_CITIES.index(c) if c in MARKET_CITIES else 999)},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def save_city_result(city: str, payload: dict) -> None:
    """写入 screenshots_inbox/{城市}/market.json，并解析为 products.jsonl。"""
    from watch_screenshots import DEFAULT_OUT, ingest_market_json

    city_dir = DEFAULT_OUT / city
    city_dir.mkdir(parents=True, exist_ok=True)
    path = city_dir / "market.json"
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"   已写入 {path}")
    ingest_market_json(path, DEFAULT_OUT, keep_raw=True)


def process_city(driver, city: str, index: int) -> None:
    print(f"\n→ 城市[{index}] {city}")
    label = select_address_by_index(driver, index)
    confirm_address(driver)
    shops_data = []
    for si in range(MARKET_SHOPS_PER_ADDRESS):
        open_shop(driver, si)
        shop_payload = scrape_shop(driver)
        shops_data.append({"shop_index": si, **shop_payload})
        back_to_search(driver)
    save_city_result(
        city,
        {
            "city": city,
            "address_index": index,
            "address_label": label,
            "shops": shops_data,
        },
    )


def main() -> None:
    cities = list(MARKET_CITIES)
    done = load_progress()
    start = 0
    if MARKET_RESUME_CITY:
        if MARKET_RESUME_CITY not in cities:
            raise SystemExit(f"RESUME 城市不在列表: {MARKET_RESUME_CITY}")
        start = cities.index(MARKET_RESUME_CITY)
        print(f"从配置 RESUME_CITY={MARKET_RESUME_CITY} (index={start}) 开始")
    elif done:
        # 从第一个未完成的开始
        for i, c in enumerate(cities):
            if c not in done:
                start = i
                break
        else:
            print("进度显示全部完成")
            return
        print(f"从进度续跑: {cities[start]} (index={start})，已完成 {len(done)} 城")

    print("请确认手机已在美团「菜场」搜索结果页（不要停在店内/地址半屏）")
    input("准备好后回车开始… ")

    driver = build_driver()
    try:
        for i in range(start, len(cities)):
            city = cities[i]
            if city in done and not MARKET_RESUME_CITY:
                print(f"跳过已完成: {city}")
                continue
            while True:
                try:
                    process_city(driver, city, i)
                    done.add(city)
                    save_progress(done)
                    break
                except Exception as e:
                    pause_for_human(driver, city, "process_city", e)
    finally:
        try:
            driver.quit()
        except Exception:
            pass
    print("\n全部完成")


if __name__ == "__main__":
    main()
