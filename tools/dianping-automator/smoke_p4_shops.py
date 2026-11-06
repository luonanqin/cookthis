#!/usr/bin/env python3
"""
P4 冒烟：单城单菜系，按店名去重翻列表，凑满 TARGET_SUCCESS 家成功店。

复用 P2 进店/菜单、P3 收菜；写 output/{城市}/{店铺菜系}/{店名}.json。
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from ocr_region import ocr_element
from smoke_city_food import on_home, read_home_city
from smoke_p2_menu import (
    SHOP_ITEM_ID,
    SHOP_THIRD_LINE_ID,
    SHOP_TITLE_ID,
    element_text_deep,
    ensure_search_result_list,
    normalize_list_cuisine,
    read_shop_cuisine_on_detail,
    scroll_to_menu_and_tap,
    swipe_up,
)
from cuisine_util import resolve_dir_cuisine
from smoke_p3_dishes import collect_all_by_scroll
from throttle import pause, wait_captcha_cleared
from timing import timed

try:
    from config import (
        AUTO_RECOVER,
        CAPTCHA_CHECK,
        SHOP_HANG_TIMEOUT_S,
        THROTTLE_AFTER_SHOP,
        THROTTLE_AFTER_SKIP,
        THROTTLE_LIST_SWIPE,
        UDID,
    )
except ImportError:
    AUTO_RECOVER = True
    CAPTCHA_CHECK = True
    SHOP_HANG_TIMEOUT_S = 240
    THROTTLE_AFTER_SHOP = (2.5, 5.0)
    THROTTLE_AFTER_SKIP = (0.8, 1.8)
    THROTTLE_LIST_SWIPE = (0.6, 1.4)
    UDID = "CLB0218723006111"

APPIUM_URL = "http://127.0.0.1:4723"
PACKAGE = "com.dianping.v1"
ACTIVITY = "com.dianping.v1.NovaMainActivity"

SEARCH_CUISINE = "川菜"
DEFAULT_CITY = "上海"
TARGET_SUCCESS = 2  # 冒烟默认；正式跑用 run_matrix + config.SHOPS_PER_CUISINE
MAX_LIST_SWIPES = 40  # 每系 10 家时列表可能要多滑几屏
STABLE_EMPTY_ROUNDS = 3
KEYCODE_BACK = 4

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
SHOT_DIR = ROOT / "screenshots"
_BAD_NAME = re.compile(r'[\\/:*?"<>|\n\r\t]+')
# 去掉末尾「(分店名)」/「（分店名）」，同分店只采一次
_SHOP_PAREN_TAIL = re.compile(r"[\(（][^）\)]*[\)）]\s*$")
# 菜系目录下的汇总/派生文件，不是店铺
SUMMARY_JSON_NAMES = frozenset(
    {
        "荤菜.json",
        "素菜.json",
        "汤羹.json",
        "主食.json",
        "素菜_食材.json",
        "荤菜_食材.json",
    }
)


def is_shop_json_file(path: Path, data: object) -> bool:
    """是否为店铺 JSON（排除荤/素/汤/主汇总数组文件）。"""
    if path.name in SUMMARY_JSON_NAMES:
        return False
    return isinstance(data, dict) and isinstance(data.get("dishes"), dict)


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
            "appium:newCommandTimeout": 3600,
        }
    )
    return webdriver.Remote(APPIUM_URL, options=opts)


def wait(driver, timeout=25) -> WebDriverWait:
    return WebDriverWait(driver, timeout, poll_frequency=0.5)


def safe_filename(name: str) -> str:
    cleaned = _BAD_NAME.sub("_", (name or "").strip())
    return cleaned or "未知店铺"


def shop_name_base(name: str) -> str:
    """
    店名去末尾括号分店后缀。
    例：'眉州东坡·川菜(中庚漫游城店)' → '眉州东坡·川菜'
    """
    s = (name or "").strip()
    while True:
        n = _SHOP_PAREN_TAIL.sub("", s).strip()
        if n == s:
            break
        s = n
    return s or (name or "").strip()


def load_city_shop_bases(city: str) -> set[str]:
    """扫描 output/{城市}/**/*.json，收集已采店名的「去括号」基数。"""
    root = OUTPUT_DIR / safe_filename(city)
    bases: set[str] = set()
    if not root.is_dir():
        return bases
    for path in root.rglob("*.json"):
        if path.name in SUMMARY_JSON_NAMES:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not is_shop_json_file(path, data):
            continue
        name = (data.get("shop_name") or "").strip() or path.stem
        base = shop_name_base(name)
        if base:
            bases.add(base)
    return bases


def output_path(
    city: str, shop_cuisine: str, shop_name: str, *, fallback_cuisine: str = ""
) -> Path:
    """目录只用标准菜系名（或「其他」），不用 OCR 脏串。"""
    cuisine = resolve_dir_cuisine(
        shop_cuisine=shop_cuisine or "",
        search_cuisine=fallback_cuisine or SEARCH_CUISINE,
    )
    return (
        OUTPUT_DIR
        / safe_filename(city)
        / cuisine
        / f"{safe_filename(shop_name)}.json"
    )


def resolve_city(driver) -> str:
    if on_home(driver):
        city = read_home_city(driver)
        if city:
            print(f"首页城市：{city}")
            return city
    print(f"未读到首页城市，使用默认：{DEFAULT_CITY}")
    return DEFAULT_CITY


def visible_shops(driver) -> list[tuple[str, object]]:
    """当前屏可见店铺：(店名, 卡片元素)。"""
    rows: list[tuple[str, object]] = []
    try:
        items = driver.find_elements(AppiumBy.ID, SHOP_ITEM_ID)
    except StaleElementReferenceException:
        return rows
    for item in items:
        try:
            titles = item.find_elements(AppiumBy.ID, SHOP_TITLE_ID)
            if not titles:
                continue
            name = (titles[0].text or "").strip()
            if name:
                rows.append((name, item))
        except StaleElementReferenceException:
            continue
    return rows


def read_card_cuisine(driver, card) -> tuple[str, str]:
    """返回 (cuisine_raw, cuisine)。"""
    third = None
    try:
        inner = card.find_elements(AppiumBy.ID, SHOP_THIRD_LINE_ID)
        if inner:
            third = inner[0]
    except StaleElementReferenceException:
        third = None

    if third is None:
        try:
            titles = card.find_elements(AppiumBy.ID, SHOP_TITLE_ID)
            if titles:
                xp = (
                    f'.//*[@resource-id="{SHOP_TITLE_ID}"]'
                    f'/following::*[@resource-id="{SHOP_THIRD_LINE_ID}"][1]'
                )
                found = card.find_elements(AppiumBy.XPATH, xp)
                if found:
                    third = found[0]
        except StaleElementReferenceException:
            pass

    raw = element_text_deep(third) if third else ""
    if third and not raw:
        debug_crop = SHOT_DIR / "debug_p4_third_line_ocr.png"
        try:
            raw = ocr_element(driver, third, debug_path=debug_crop)
        except Exception as e:
            print(f"   OCR 失败：{e}")
    return raw, normalize_list_cuisine(raw)


def open_shop_named(driver, shop_name: str, timeout: float = 8.0) -> None:
    """按店名点进店；信号同 open_first_shop（底部打卡）。"""
    from ui_source import parse_page_nodes

    target = None
    for name, card in visible_shops(driver):
        if name == shop_name:
            target = card
            break
    if target is None:
        raise RuntimeError(f"当前屏找不到店：{shop_name}")

    print(f"点击店铺：{shop_name}")
    t0 = time.perf_counter()
    target.click()
    deadline = time.perf_counter() + timeout
    attempt = 0
    while time.perf_counter() < deadline:
        attempt += 1
        nodes, fetch_s = parse_page_nodes(driver)
        hits = [n for n in nodes if n.text == "打卡"]
        if hits:
            hits.sort(key=lambda n: n.y, reverse=True)
            hit = hits[0]
            print(
                f"   已进店（打卡 y={hit.y}，"
                f"第 {attempt} 次 page_source {fetch_s * 1000:.0f}ms，"
                f"合计 {time.perf_counter() - t0:.2f}s）"
            )
            return
        time.sleep(0.12)
    raise TimeoutException(f"进店后 {timeout:.0f}s 内未找到「打卡」")


def back_to_search_list(driver) -> None:
    """从菜单/店详回到搜索列表（最多两次返回）。"""
    for i in range(3):
        if driver.find_elements(AppiumBy.ID, SHOP_ITEM_ID):
            print("   已在搜索列表")
            return
        print(f"   系统返回（{i + 1}）…")
        driver.press_keycode(KEYCODE_BACK)
        time.sleep(0.7)
    wait(driver, 20).until(EC.presence_of_element_located((AppiumBy.ID, SHOP_ITEM_ID)))
    print("   已回到搜索列表")


def write_shop_json(
    *,
    city: str,
    search_cuisine: str,
    shop_name: str,
    shop_cuisine_raw: str,
    shop_cuisine: str,
    dishes: dict[str, list[str]],
) -> Path:
    path = output_path(
        city, shop_cuisine, shop_name, fallback_cuisine=search_cuisine
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "city": city,
        "search_cuisine": search_cuisine,
        "shop_name": shop_name,
        "shop_cuisine_raw": shop_cuisine_raw,
        "shop_cuisine": shop_cuisine,
        "dishes": dishes,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def try_collect_one(
    driver,
    *,
    city: str,
    search_cuisine: str,
    shop_name: str,
    card,
    known_bases: set[str],
) -> bool:
    """
    采集一家店。成功写文件返回 True；跳过/失败返回 False。
    成功后把去括号店名写入 known_bases。
    调用方保证回到搜索列表。
    """
    base = shop_name_base(shop_name)
    if base in known_bases:
        print(f"   同品牌已采过（{base}），跳过：{shop_name}")
        return False

    cuisine_raw, shop_cuisine = read_card_cuisine(driver, card)
    print(f"   列表菜系：{shop_cuisine or '(空)'} | 原文：{cuisine_raw or '(空)'}")

    # 标准目录下已有同名文件则跳过（不进店）
    path = output_path(
        city, shop_cuisine or "", shop_name, fallback_cuisine=search_cuisine
    )
    if path.exists():
        print(f"   已存在，跳过：{path}")
        known_bases.add(base)
        return False

    try:
        open_shop_named(driver, shop_name)
    except Exception as e:
        print(f"   进店失败，跳过：{e}")
        back_to_search_list(driver)
        return False

    if not shop_cuisine:
        shop_cuisine = read_shop_cuisine_on_detail(driver) or search_cuisine
        print(f"   店内菜系：{shop_cuisine}")
        path = output_path(
            city, shop_cuisine, shop_name, fallback_cuisine=search_cuisine
        )
        if path.exists():
            print(f"   已存在，跳过：{path}")
            known_bases.add(base)
            back_to_search_list(driver)
            return False

    try:
        label = scroll_to_menu_and_tap(driver)
        print(f"   菜单入口：{label}")
    except Exception as e:
        print(f"   无推荐菜/菜单，跳过该店：{e}")
        back_to_search_list(driver)
        return False

    try:
        dishes = collect_all_by_scroll(driver)
    except Exception as e:
        print(f"   收菜失败，跳过：{e}")
        back_to_search_list(driver)
        return False

    path = write_shop_json(
        city=city,
        search_cuisine=search_cuisine,
        shop_name=shop_name,
        shop_cuisine_raw=cuisine_raw,
        shop_cuisine=shop_cuisine,
        dishes=dishes,
    )
    known_bases.add(base)
    counts = ", ".join(f"{k}={len(v)}" for k, v in dishes.items())
    print(f"   已写入 {path} | {counts}")
    back_to_search_list(driver)
    return True


def collect_until_target(
    driver,
    city: str,
    *,
    search_cuisine: str | None = None,
    target: int | None = None,
    known_bases: set[str] | None = None,
) -> int:
    search_cuisine = search_cuisine or SEARCH_CUISINE
    target = TARGET_SUCCESS if target is None else target
    if known_bases is None:
        known_bases = load_city_shop_bases(city)
        print(f"已加载 {city} 去括号店名 {len(known_bases)} 个")
    seen: set[str] = set()
    success = 0
    empty_rounds = 0
    swipes = 0

    print(
        f"开始翻店 | 城市={city} 搜索={search_cuisine} 目标成功={target} "
        f"| 已知品牌 {len(known_bases)}"
    )

    while success < target:
        if CAPTCHA_CHECK:
            wait_captcha_cleared(driver)

        shops = visible_shops(driver)
        names = [n for n, _ in shops]
        print(f"列表屏：可见 {len(shops)} 家 — {names}")

        candidate = None
        for n, c in shops:
            if n in seen:
                continue
            seen.add(n)
            base = shop_name_base(n)
            if base in known_bases:
                print(f"   同品牌已采过（{base}），跳过：{n}")
                pause(*THROTTLE_AFTER_SKIP)
                continue
            candidate = (n, c)
            break

        if candidate is not None:
            shop_name, card = candidate
            empty_rounds = 0
            print(f"→ [{success + 1}/{target}] 尝试：{shop_name}")
            with timed(f"采集 {shop_name}"):
                if AUTO_RECOVER:
                    from recover import call_with_timeout

                    ok = call_with_timeout(
                        lambda: try_collect_one(
                            driver,
                            city=city,
                            search_cuisine=search_cuisine,
                            shop_name=shop_name,
                            card=card,
                            known_bases=known_bases,
                        ),
                        SHOP_HANG_TIMEOUT_S,
                        label=f"采集 {shop_name}",
                    )
                else:
                    ok = try_collect_one(
                        driver,
                        city=city,
                        search_cuisine=search_cuisine,
                        shop_name=shop_name,
                        card=card,
                        known_bases=known_bases,
                    )
            if CAPTCHA_CHECK:
                wait_captcha_cleared(driver)
            if ok:
                success += 1
                print(f"   成功累计 {success}/{target}")
                pause(*THROTTLE_AFTER_SHOP, why="店间")
            else:
                pause(*THROTTLE_AFTER_SKIP)
            # 回列表后元素会失效，下一轮重新扫可见店
            continue

        if swipes >= MAX_LIST_SWIPES:
            print("已达最大上滑次数，结束")
            break

        print(f"上滑列表露出新店（{swipes + 1}/{MAX_LIST_SWIPES}）…")
        swipe_up(driver)
        pause(*THROTTLE_LIST_SWIPE)
        swipes += 1
        after = {n for n, _ in visible_shops(driver)}
        fresh = after - seen
        if not fresh:
            empty_rounds += 1
            print(f"   未出现新店名（连续 {empty_rounds}/{STABLE_EMPTY_ROUNDS}）")
            if empty_rounds >= STABLE_EMPTY_ROUNDS:
                print("连续无新店，视为列表到底，结束")
                break
        else:
            empty_rounds = 0
            print(f"   新露出：{sorted(fresh)}")

    return success


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    print("连接 Appium…")
    print(
        f"P4 冒烟：凑满 {TARGET_SUCCESS} 家成功店 | 搜索「{SEARCH_CUISINE}」。"
        "首页或搜索列表均可。断开 Inspector。"
    )

    with timed("建立 Appium 会话"):
        driver = build_driver()
    try:
        with timed("解析城市"):
            city = resolve_city(driver)
        known = load_city_shop_bases(city)
        print(f"已加载 {city} 去括号店名 {len(known)} 个")
        with timed("进入搜索列表"):
            ensure_search_result_list(driver, SEARCH_CUISINE)
        with timed("翻店采集"):
            n = collect_until_target(
                driver,
                city,
                search_cuisine=SEARCH_CUISINE,
                target=TARGET_SUCCESS,
                known_bases=known,
            )
        print(f"P4 冒烟完成 | 成功 {n}/{TARGET_SUCCESS} | 输出目录 {OUTPUT_DIR / city}")
    finally:
        with timed("断开 Appium"):
            driver.quit()


if __name__ == "__main__":
    main()
