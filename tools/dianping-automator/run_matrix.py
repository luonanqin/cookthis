#!/usr/bin/env python3
"""
正式全流程：P0 城市 × 菜系 × 每菜系成功店数。

配置见 config.py。
流程：首页 → 切城 → 搜菜系 → 翻店采集 → 回首页 → 下一菜系 / 下一城。
已有 JSON / 无菜单跳过；列表滑到底凑不满则进入下一菜系。
卡死/验证过久时可自动杀点评进程并重开，从当前城/菜系续跑。
"""

from __future__ import annotations

import json
import time

from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import (
    InvalidSessionIdException,
    WebDriverException,
)

from config import (
    AUTO_RECOVER,
    CAPTCHA_CHECK,
    CITIES,
    CUISINES,
    MAX_RECOVERIES,
    RESUME_CITY,
    RESUME_CUISINE,
    SHOPS_PER_CUISINE,
    THROTTLE_BETWEEN_CITY,
    THROTTLE_BETWEEN_CUISINE,
)
from recover import AppStuckError, recover_driver
from smoke_city_food import (
    KEYCODE_BACK,
    on_home,
    read_home_city,
    switch_city_by_search,
)
from smoke_p2_menu import SHOP_ITEM_ID, search_cuisine_keyword
from smoke_p4_shops import (
    OUTPUT_DIR,
    SHOT_DIR,
    build_driver,
    collect_until_target,
    is_shop_json_file,
    load_city_shop_bases,
)
from throttle import pause, wait_captcha_cleared
from timing import timed


def _slice_from_resume() -> tuple[list[str], list[str]]:
    """
    从 RESUME_CITY / RESUME_CUISINE 切开矩阵。
    - 只设城市：从该城起，菜系仍全量
    - 城市+菜系：该城从该菜系起；后续城市仍跑全量菜系
    """
    cities = list(CITIES)
    cuisines_first = list(CUISINES)

    if RESUME_CITY:
        if RESUME_CITY not in cities:
            raise ValueError(f"RESUME_CITY={RESUME_CITY!r} 不在 CITIES 中")
        cities = cities[cities.index(RESUME_CITY) :]
        if RESUME_CUISINE:
            if RESUME_CUISINE not in CUISINES:
                raise ValueError(
                    f"RESUME_CUISINE={RESUME_CUISINE!r} 不在 CUISINES 中"
                )
            cuisines_first = CUISINES[CUISINES.index(RESUME_CUISINE) :]
    elif RESUME_CUISINE:
        raise ValueError("设置了 RESUME_CUISINE 时必须同时设置 RESUME_CITY")

    return cities, cuisines_first


def ensure_home(driver, max_backs: int = 6) -> None:
    """从搜索列表/店详等回到首页。"""
    if on_home(driver):
        return
    print("返回首页…")
    for i in range(max_backs):
        if on_home(driver):
            print("   已回首页")
            return
        driver.press_keycode(KEYCODE_BACK)
        time.sleep(0.65)
    if not on_home(driver):
        raise RuntimeError("多次返回仍未到首页（请确认停在点评 App）")
    print("   已回首页")


def _go_city(driver, current: str, city: str) -> str:
    home_city = read_home_city(driver) or current
    if city in (home_city or "") or (home_city or "") in city:
        print(f"已在目标城市：{home_city}（配置 {city}）")
        return home_city
    with timed(f"切城 {home_city} → {city}"):
        return switch_city_by_search(driver, home_city, city)


def _count_done_for_search(city_label: str, cuisine: str) -> int:
    """该城已写入且 search_cuisine 匹配的店数（忽略荤/素/汤/主汇总文件）。"""
    city_root = OUTPUT_DIR / city_label
    if not city_root.is_dir():
        return 0
    done = 0
    for p in city_root.rglob("*.json"):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not is_shop_json_file(p, d):
            continue
        if (d.get("search_cuisine") or "") == cuisine:
            done += 1
    return done


def _run_cuisine(
    driver,
    *,
    city_label: str,
    cuisine: str,
    known_bases: set[str],
    target: int,
) -> int:
    ensure_home(driver)
    with timed(f"搜索 {cuisine}"):
        search_cuisine_keyword(driver, cuisine)
    if CAPTCHA_CHECK:
        wait_captcha_cleared(driver)
    with timed(f"采集 {city_label}/{cuisine}"):
        return collect_until_target(
            driver,
            city_label,
            search_cuisine=cuisine,
            target=target,
            known_bases=known_bases,
        )


def run_matrix(driver) -> tuple[object, list[dict]]:
    summary: list[dict] = []
    cities, cuisines_first = _slice_from_resume()
    current = read_home_city(driver) or cities[0]
    recoveries = 0
    print(f"起始首页城市：{current}")
    if RESUME_CITY:
        print(
            f"断点续跑：从 {RESUME_CITY}"
            + (f" / {RESUME_CUISINE}" if RESUME_CUISINE else "")
            + " 开始（之前的城/菜系跳过）"
        )
    if AUTO_RECOVER:
        print(
            f"自动恢复已开：单店超时/验证过久将杀进程重开"
            f"（最多 {MAX_RECOVERIES} 次）"
        )
    print(
        f"本次：{len(cities)} 城（首城菜系 {len(cuisines_first)} 个，"
        f"其后每城 {len(CUISINES)} 个）× 每系 {SHOPS_PER_CUISINE} 店"
    )

    for i, city in enumerate(cities):
        cuisine_list = cuisines_first if i == 0 else CUISINES

        if i > 0:
            pause(*THROTTLE_BETWEEN_CITY, why="切城前")

        while True:
            try:
                current = _go_city(driver, current, city)
                if CAPTCHA_CHECK:
                    wait_captcha_cleared(driver)
                break
            except (
                AppStuckError,
                InvalidSessionIdException,
                WebDriverException,
            ) as e:
                if not AUTO_RECOVER or recoveries >= MAX_RECOVERIES:
                    raise
                recoveries += 1
                print(f"切城失败，自动恢复 ({recoveries}/{MAX_RECOVERIES})：{e}")
                driver = recover_driver(driver)
                current = city

        city_label = city
        known_bases = load_city_shop_bases(city_label)
        print(
            f"已加载 {city_label} 去括号店名 {len(known_bases)} 个"
            "（同分店只采一次）"
        )

        for j, cuisine in enumerate(cuisine_list):
            if j > 0:
                pause(*THROTTLE_BETWEEN_CUISINE, why="换菜系前")
            print(f"\n======== {city_label} / {cuisine} ========")

            # 目标：本菜系成功数；恢复后按已写入数计算还差几家
            while True:
                done = _count_done_for_search(city_label, cuisine)
                remain = max(0, SHOPS_PER_CUISINE - done)
                if remain == 0:
                    print(
                        f"本菜系已有 {done} 家（≥{SHOPS_PER_CUISINE}），跳过采集"
                    )
                    n = done
                    break

                try:
                    n_new = _run_cuisine(
                        driver,
                        city_label=city_label,
                        cuisine=cuisine,
                        known_bases=known_bases,
                        target=remain,
                    )
                    n = done + n_new
                    break
                except (
                    AppStuckError,
                    InvalidSessionIdException,
                    WebDriverException,
                ) as e:
                    if not AUTO_RECOVER or recoveries >= MAX_RECOVERIES:
                        raise
                    recoveries += 1
                    print(
                        f"采集中断，自动恢复 ({recoveries}/{MAX_RECOVERIES})：{e}"
                    )
                    driver = recover_driver(driver)
                    try:
                        current = _go_city(driver, city, city)
                    except Exception as e2:
                        print(f"   恢复后切城再试：{e2}")
                        driver = recover_driver(driver)
                        current = _go_city(driver, city, city)
                    known_bases = load_city_shop_bases(city_label)
                    continue

            row = {
                "city": city_label,
                "search_cuisine": cuisine,
                "success": n,
                "target": SHOPS_PER_CUISINE,
            }
            summary.append(row)
            print(f"完成 {city_label}/{cuisine}：{n}/{SHOPS_PER_CUISINE}")
            try:
                ensure_home(driver)
                current = read_home_city(driver) or city_label
            except Exception as e:
                if AUTO_RECOVER and recoveries < MAX_RECOVERIES:
                    recoveries += 1
                    print(f"回首页失败，自动恢复 ({recoveries}/{MAX_RECOVERIES})：{e}")
                    driver = recover_driver(driver)
                    current = city_label
                else:
                    raise

    print(f"本轮自动恢复次数：{recoveries}")
    return driver, summary


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    cities, cuisines_first = _slice_from_resume()
    rest_cities = max(0, len(cities) - 1)
    approx = (
        len(cuisines_first) + rest_cities * len(CUISINES)
    ) * SHOPS_PER_CUISINE
    print("连接 Appium…")
    print(
        f"正式采集（本次约上限 {approx} 店）。"
        "请停在首页，断开 Inspector。\n"
        "已有店名 JSON 会跳过；城/菜系断点见 config.RESUME_*。"
    )

    with timed("建立 Appium 会话"):
        driver = build_driver()
    t0 = time.perf_counter()
    try:
        if not on_home(driver) and not driver.find_elements(
            AppiumBy.ID, SHOP_ITEM_ID
        ):
            print("提示：未检测到首页或搜索列表，仍继续尝试回首页…")
        ensure_home(driver)
        driver, summary = run_matrix(driver)
        print("\n======== 汇总 ========")
        ok = 0
        short = 0
        for row in summary:
            flag = "✓" if row["success"] >= row["target"] else "…"
            if row["success"] < row["target"]:
                short += 1
            print(
                f"  {flag} {row['city']}/{row['search_cuisine']}: "
                f"{row['success']}/{row['target']}"
            )
            ok += row["success"]
        print(f"成功写入约 {ok} 店 | 未凑满的菜系 {short} 个 | 目录 {OUTPUT_DIR}")
        print(f"矩阵结束 | 全流程 {time.perf_counter() - t0:.1f}s")
    finally:
        with timed("断开 Appium"):
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    main()
