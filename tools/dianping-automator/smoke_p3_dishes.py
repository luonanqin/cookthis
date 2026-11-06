#!/usr/bin/env python3
"""
P3 冒烟：进入菜单后从顶部一路下滑解析。
分区顺序：荤菜 → 素菜 → 甜品 → 小吃 → 汤羹 → 主食 → 饮品
只收集荤/素/汤/主；标题滑出屏幕后仍保持当前分区，直到看到下一分区标题。
用 page_source 解析以降低耗时。
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait

from smoke_p2_menu import (
    SEARCH_CUISINE,
    ensure_search_result_list,
    open_first_shop,
    scroll_to_menu_and_tap,
    swipe_down,
    swipe_up,
)
from throttle import pause
from timing import timed
from ui_source import parse_page_nodes

try:
    from config import THROTTLE_MENU_SWIPE, UDID
except ImportError:
    THROTTLE_MENU_SWIPE = (0.4, 0.9)
    UDID = "CLB0218723006111"

APPIUM_URL = "http://127.0.0.1:4723"
PACKAGE = "com.dianping.v1"
ACTIVITY = "com.dianping.v1.NovaMainActivity"

# 要落入结果的分类
TAGS = ("荤菜", "素菜", "汤羹", "主食")
# 右侧列表真实分区顺序（含不采集的中间类）
MENU_ORDER = ("荤菜", "素菜", "甜品", "小吃", "汤羹", "主食", "饮品")
MENU_ORDER_SET = set(MENU_ORDER)
SIDEBAR_X_MAX = 200
# 菜名列大约从这里开始（侧栏荤菜在左侧；列表在右侧）
LIST_CONTENT_X_MIN = 220
MAX_SWIPES = 40
STABLE_ROUNDS = 3
KEYCODE_BACK = 4
SHOT_DIR = Path(__file__).resolve().parent / "screenshots"
# 纯数字 / 折扣 / 评价条数等 UI 噪声（整串匹配，避免误伤「粉条」「牛肋条」）
_DIGIT_RE = re.compile(r"^\d+(\.\d+)?$")
_DISCOUNT_RE = re.compile(r"^\d+(\.\d+)?折$")
_COUNT_TIAO_RE = re.compile(r"^\d+条$")
# 顶部说明/入口等，不是菜名
HEADER_NOISE = {
    "上传菜单图片赢积分",
    "官方菜单",
    "文字菜单",
    "推荐菜",
    "菜单",
    "搜索",
    "打卡",
    "收藏",
    "分享",
}


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


def on_menu_page(driver) -> bool:
    nodes, _ = parse_page_nodes(driver)
    return any(n.text == "荤菜" and n.x < SIDEBAR_X_MAX for n in nodes)


def ensure_menu_page(driver) -> None:
    with timed("检查是否已在菜单页"):
        already = on_menu_page(driver)
    if already:
        print("已在菜单页，跳过进店")
        return

    print("未在菜单页，走搜索→进店→菜单…")
    with timed("搜索结果列表就绪"):
        ensure_search_result_list(driver, SEARCH_CUISINE)
    with timed("打开第一家店铺(等到打卡)"):
        open_first_shop(driver)
    with timed("滚动查找并点击菜单/文字菜单"):
        label = scroll_to_menu_and_tap(driver)
    print(f"   已进入菜单页（入口：{label}）")
    with timed("进菜单后短缓冲 0.5s"):
        time.sleep(0.5)


def scroll_to_list_top(driver, times: int = 2) -> None:
    """进菜单后通常已在顶部附近，少滑几次即可。"""
    for _ in range(times):
        swipe_down(driver)
        time.sleep(0.2)


def is_dish_name(text: str) -> bool:
    """是否像真实菜名（荤/素/汤/主共用）。"""
    t = (text or "").strip()
    if len(t) < 2:
        return False
    if t in MENU_ORDER_SET or t in HEADER_NOISE:
        return False
    if t.startswith(("¥", "￥", "赞")):
        return False
    # 9.9 / 299.94 ；7.7折 / 8折 ；111条 / 13条
    if _DIGIT_RE.match(t) or _DISCOUNT_RE.match(t) or _COUNT_TIAO_RE.match(t):
        return False
    if "上传菜单" in t or "赢积分" in t:
        return False
    return True


def _is_dish_name(text: str) -> bool:
    return is_dish_name(text)


def _list_nodes_right(driver) -> tuple[list[tuple[int, int, str]], float, int]:
    """右侧文本节点 (y,x,text)，按位置排序；附带 page_source 耗时与节点数。"""
    nodes, fetch_s = parse_page_nodes(driver)
    rows = []
    for n in nodes:
        if n.x < SIDEBAR_X_MAX:
            continue
        if n.class_name and "TextView" not in n.class_name:
            continue
        rows.append((n.y, n.x, n.text))
    rows.sort(key=lambda r: (r[0], r[1]))
    return rows, fetch_s, len(nodes)


def _dishes_paired_with_price(
    rows: list[tuple[int, int, str]], y_tol: int = 48
) -> list[tuple[int, str]]:
    """
    只收「同一行有价格 ¥/￥」的菜名，排除顶部「官方菜单」等无价格文案。
    返回 [(y, dish_name), ...] 按 y 排序。
    """
    prices = [
        (y, x, t)
        for y, x, t in rows
        if t.startswith("¥") or t.startswith("￥")
    ]
    dishes: list[tuple[int, str]] = []
    used_prices: set[int] = set()
    for y, x, t in rows:
        if not _is_dish_name(t):
            continue
        if x < LIST_CONTENT_X_MIN:
            continue
        # 找同一行右侧的价格
        for i, (py, px, _pt) in enumerate(prices):
            if i in used_prices:
                continue
            if abs(py - y) <= y_tol and px > x:
                dishes.append((y, t))
                used_prices.add(i)
                break
    dishes.sort(key=lambda d: d[0])
    return dishes


def parse_screen(
    driver, current_section: str | None
) -> tuple[str | None, list[tuple[str, str]], bool, dict]:
    """
    解析当前屏。
    - 分区只认 MENU_ORDER（荤→素→甜→小吃→汤→主→饮）
    - 标题滑出后仍保持 current_section
    - 菜名必须与同行 ¥ 配对，避免顶部「上传菜单/官方菜单」
    - 本屏先收菜，再判断是否已越过主食（汤/主常与饮品同屏）
    """
    rows, fetch_s, total_nodes = _list_nodes_right(driver)
    pairs: list[tuple[str, str]] = []
    order_index = {name: i for i, name in enumerate(MENU_ORDER)}

    # 先扫一遍标题，按 y 得到「y 区间 → 分区」
    headers = [(y, t) for y, x, t in rows if t in MENU_ORDER_SET]
    headers.sort(key=lambda h: h[0])

    def section_at_y(y: int, fallback: str | None) -> str | None:
        sec = fallback
        for hy, ht in headers:
            if hy <= y + 20:
                sec = ht
            else:
                break
        return sec

    # 先收本屏菜名（汤羹/主食常与「饮品」同屏；不能因见饮品就整屏跳过）
    for y, name in _dishes_paired_with_price(rows):
        sec = section_at_y(y, current_section)
        if sec is None:
            sec = current_section
        if sec in TAGS:
            pairs.append((sec, name))

    # 再更新滚动状态；出现主食之后的分区标题才标记结束
    section = current_section
    finished_staple = False
    for _hy, ht in headers:
        idx = order_index.get(ht, -1)
        if idx > order_index["主食"]:
            finished_staple = True
            break
        section = ht

    stats = {
        "fetch_ms": fetch_s * 1000,
        "nodes": total_nodes,
        "right": len(rows),
        "headers": [h[1] for h in headers],
    }
    return section, pairs, finished_staple, stats


def collect_all_by_scroll(driver) -> dict[str, list[str]]:
    scroll_to_list_top(driver)

    result: dict[str, list[str]] = {t: [] for t in TAGS}
    seen: dict[str, set[str]] = {t: set() for t in TAGS}
    # 列表以荤菜开头；未见标题前也按荤菜收（空白间隔不影响）
    section: str | None = "荤菜"
    stable = 0

    for i in range(MAX_SWIPES + 1):
        section, pairs, finished, _stats = parse_screen(driver, section)

        new_count = 0
        for sec, name in pairs:
            if name not in seen[sec]:
                seen[sec].add(name)
                result[sec].append(name)
                new_count += 1

        if finished:
            break

        if new_count == 0:
            stable += 1
            if stable >= STABLE_ROUNDS:
                break
        else:
            stable = 0

        if i < MAX_SWIPES:
            swipe_up(driver)
            pause(*THROTTLE_MENU_SWIPE)

    return result


def main() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    t_all = time.perf_counter()
    print("连接 Appium…")
    print("可停在菜单页，或首页/搜索列表。断开 Inspector。")

    with timed("建立 Appium 会话"):
        driver = build_driver()
    try:
        with timed("进入菜单页(总)"):
            ensure_menu_page(driver)
        with timed("采集菜品(总)"):
            result = collect_all_by_scroll(driver)
        with timed("写 JSON"):
            out = SHOT_DIR / "p3_dishes_sample.json"
            out.write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        print(f"已写入 {out}")
        for tag, dishes in result.items():
            preview = dishes[:5]
            print(
                f"  {tag}: {len(dishes)} 道 — {preview}{'…' if len(dishes) > 5 else ''}"
            )
        with timed("系统返回店铺首页"):
            driver.press_keycode(KEYCODE_BACK)
            time.sleep(0.5)
        print(f"P3 冒烟完成 | 全流程 {time.perf_counter() - t_all:.2f}s")
    finally:
        with timed("断开 Appium"):
            driver.quit()


if __name__ == "__main__":
    main()
