#!/usr/bin/env python3
"""
把每个城市、各菜系目录下店铺 JSON 的菜名汇总成四个文件：
  荤菜.json / 素菜.json / 汤羹.json / 主食.json
放在对应菜系目录下。暂不做清洗；可重复执行（覆盖四个汇总文件）。
"""

from __future__ import annotations

import json
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
TAGS = ("荤菜", "素菜", "汤羹", "主食")
SUMMARY_NAMES = {
    "荤菜.json",
    "素菜.json",
    "汤羹.json",
    "主食.json",
    "素菜_食材.json",
    "荤菜_食材.json",
    "荤菜_清洗.json",
    "素菜_清洗.json",
    "汤羹_清洗.json",
    "主食_清洗.json",
}


def is_shop_json_file(path: Path, data: object) -> bool:
    if path.name in SUMMARY_NAMES:
        return False
    return isinstance(data, dict) and isinstance(data.get("dishes"), dict)


def aggregate_cuisine_dir(cuisine_dir: Path) -> dict[str, int]:
    # 火锅目录只汇总荤/素
    tags = ("荤菜", "素菜") if cuisine_dir.name == "火锅" else TAGS
    buckets: dict[str, list[str]] = {t: [] for t in tags}
    shop_count = 0

    for path in sorted(cuisine_dir.glob("*.json")):
        if path.name in SUMMARY_NAMES:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not is_shop_json_file(path, data):
            continue
        shop_count += 1
        dishes = data.get("dishes") or {}
        for tag in tags:
            items = dishes.get(tag) or []
            if not isinstance(items, list):
                continue
            for name in items:
                if isinstance(name, str) and name.strip():
                    buckets[tag].append(name.strip())

    for tag in tags:
        out = cuisine_dir / f"{tag}.json"
        out.write_text(
            json.dumps(buckets[tag], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    if cuisine_dir.name == "火锅":
        for extra in ("汤羹.json", "主食.json"):
            p = cuisine_dir / extra
            if p.is_file():
                p.unlink()

    return {t: len(buckets.get(t, [])) for t in TAGS} | {"shops": shop_count}


def main() -> None:
    if not OUTPUT_DIR.is_dir():
        print(f"无目录：{OUTPUT_DIR}")
        return

    print(f"汇总 {OUTPUT_DIR}（覆盖各菜系下 荤菜/素菜/汤羹/主食.json）")
    cities = sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir())
    total_files = 0
    for city_dir in cities:
        cuisine_dirs = sorted(p for p in city_dir.iterdir() if p.is_dir())
        if not cuisine_dirs:
            continue
        print(f"\n== {city_dir.name} ==")
        for cuisine_dir in cuisine_dirs:
            stats = aggregate_cuisine_dir(cuisine_dir)
            total_files += 4
            print(
                f"  {cuisine_dir.name}: 店={stats['shops']} | "
                f"荤={stats['荤菜']} 素={stats['素菜']} "
                f"汤={stats['汤羹']} 主={stats['主食']}"
            )

    print(f"\n完成：写入/覆盖汇总文件约 {total_files} 个")


if __name__ == "__main__":
    main()
