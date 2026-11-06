#!/usr/bin/env python3
"""
按规则把店铺迁到平级目录：
  - 地锅 / 鸡煲 / 火锅鸡 → 火锅（只汇总荤素）
  - 烧烤 / 烤串 / 小龙虾 / 烤全羊 / 烤肉等 → 烧烤（汇总荤素汤主）

优先级：地锅/鸡煲 > 已有火锅判定 > 烧烤。
可重复执行。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from split_hotpot import (
    HOTPOT_DIR,
    OUTPUT_DIR,
    SUMMARY_JSON_NAMES,
    aggregate_meat_veg,
    is_hotpot_shop,
    is_shop_json_file,
    reaggregate_full,
)

BBQ_DIR = "烧烤"

# 明确进火锅（地锅/鸡煲）
_POT_EXTRA = re.compile(r"地锅|鸡煲|土鸡煲|鲜鸡煲|清远鸡煲|火锅鸡|鸡窝火锅")

# 进烧烤（店名）
_BBQ_NAME = re.compile(
    r"烧烤|烤串|小龙虾|烤全羊|烤肉|烤羊排|烤羊腿|烤羊\d|专注烤羊|蒙古烤羊"
)


def _compact(s: str) -> str:
    return "".join((s or "").split())


def target_cuisine(data: dict, filename_stem: str = "") -> str | None:
    name = (data.get("shop_name") or filename_stem or "").strip()
    cuisine_blob = _compact(
        (data.get("shop_cuisine_raw") or "") + (data.get("shop_cuisine") or "")
    )

    if _POT_EXTRA.search(name) or _POT_EXTRA.search(cuisine_blob):
        return HOTPOT_DIR

    if is_hotpot_shop(data, filename_stem):
        return HOTPOT_DIR

    if _BBQ_NAME.search(name):
        return BBQ_DIR

    # 菜系 OCR 写烧烤/小龙虾，且店名不像正餐火锅
    if re.search(r"烧烤|烤串|小龙虾", cuisine_blob) and re.search(
        r"烧烤|烤串|小龙虾|大排档|夜宵", name
    ):
        return BBQ_DIR

    return None


def aggregate_full(cuisine_dir: Path) -> dict[str, int]:
    tags = ("荤菜", "素菜", "汤羹", "主食")
    buckets: dict[str, list[str]] = {t: [] for t in tags}
    shops = 0
    for path in sorted(cuisine_dir.glob("*.json")):
        if path.name in SUMMARY_JSON_NAMES or path.name.endswith("_清洗.json"):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not is_shop_json_file(path, data):
            continue
        shops += 1
        dishes = data.get("dishes") or {}
        for tag in tags:
            for name in dishes.get(tag) or []:
                if isinstance(name, str) and name.strip():
                    buckets[tag].append(name.strip())
    for tag in tags:
        (cuisine_dir / f"{tag}.json").write_text(
            json.dumps(buckets[tag], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return {t: len(buckets[t]) for t in tags} | {"shops": shops}


def move_shop(src: Path, dest_dir: Path, data: dict, label: str) -> bool:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    if dest.resolve() == src.resolve():
        return False
    if dest.exists():
        print(f"  跳过（已存在）{dest.relative_to(OUTPUT_DIR)}")
        return False
    data = dict(data)
    data["shop_cuisine"] = label
    if not data.get("moved_from_cuisine"):
        data["moved_from_cuisine"] = src.parent.name
    dest.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    src.unlink()
    print(f"  [{src.parent.name} → {label}] {src.stem}")
    return True


def main() -> None:
    if not OUTPUT_DIR.is_dir():
        print(f"无目录：{OUTPUT_DIR}")
        return

    planned: list[tuple[Path, str, dict]] = []
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        for cuisine_dir in sorted(p for p in city_dir.iterdir() if p.is_dir()):
            for path in sorted(cuisine_dir.glob("*.json")):
                if path.name in SUMMARY_JSON_NAMES or path.name.endswith("_清洗.json"):
                    continue
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if not is_shop_json_file(path, data):
                    continue
                tgt = target_cuisine(data, path.stem)
                if not tgt or cuisine_dir.name == tgt:
                    continue
                planned.append((path, tgt, data))

    print(f"计划迁移 {len(planned)} 家\n")
    by_tgt: dict[str, list] = {HOTPOT_DIR: [], BBQ_DIR: []}
    for path, tgt, data in planned:
        by_tgt.setdefault(tgt, []).append(
            (path.parent.parent.name, path.parent.name, data.get("shop_name") or path.stem)
        )
    for tgt in (HOTPOT_DIR, BBQ_DIR):
        items = by_tgt.get(tgt) or []
        print(f"== → {tgt}（{len(items)}）==")
        for city, src, name in items:
            print(f"  {city}/{src}: {name}")
        print()

    touched: set[Path] = set()
    moved_hp = moved_bbq = 0
    for path, tgt, data in planned:
        city_dir = path.parent.parent
        ok = move_shop(path, city_dir / tgt, data, tgt)
        if not ok:
            continue
        touched.add(path.parent)
        if tgt == HOTPOT_DIR:
            moved_hp += 1
        else:
            moved_bbq += 1

    print(f"\n已移动：火锅 +{moved_hp} | 烧烤 +{moved_bbq}")

    print("\n=== 汇总火锅（荤/素）===")
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        hp = city_dir / HOTPOT_DIR
        if hp.is_dir():
            s = aggregate_meat_veg(hp)
            print(f"  {city_dir.name}/火锅: 店={s['shops']} 荤={s['荤菜']} 素={s['素菜']}")

    print("\n=== 汇总烧烤（荤/素/汤/主）===")
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        bb = city_dir / BBQ_DIR
        if bb.is_dir():
            s = aggregate_full(bb)
            print(
                f"  {city_dir.name}/烧烤: 店={s['shops']} "
                f"荤={s['荤菜']} 素={s['素菜']} 汤={s['汤羹']} 主={s['主食']}"
            )
            touched.add(bb)

    print("\n=== 重汇总原目录 ===")
    for d in sorted(touched):
        if d.name in (HOTPOT_DIR, BBQ_DIR):
            continue
        if d.is_dir():
            reaggregate_full(d)
            print(f"  {d.relative_to(OUTPUT_DIR)}")

    print("\n完成")


if __name__ == "__main__":
    main()
