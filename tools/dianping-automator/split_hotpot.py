#!/usr/bin/env python3
"""
从各城市既有菜系目录中识别火锅店 → 移到同城平级「火锅」目录，
并汇总该目录的 荤菜.json / 素菜.json（不写汤羹/主食）。

判定：
- 店名含火锅/涮/地锅/鸡煲/冒菜/串串 等 → 是
- 或列表菜系为 xx火锅 且店名有辅证 → 是
- 烧烤/小龙虾/烤全羊主业 → 否（改走「烧烤」目录，见 reclassify_hotpot_bbq.py）

可重复执行（已在火锅目录的跳过移动）。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
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

HOTPOT_DIR = "火锅"
MEAT_VEG = ("荤菜", "素菜")


def is_shop_json_file(path: Path, data: object) -> bool:
    if path.name in SUMMARY_JSON_NAMES:
        return False
    return isinstance(data, dict) and isinstance(data.get("dishes"), dict)

# 店名明确火锅/涮/地锅/鸡煲
_NAME_HOTPOT = re.compile(
    r"火锅|涮羊肉|涮肉|铜锅涮|传统涮|蒙氏涮|冒菜|串串香|串串|地摊火锅|"
    r"地锅|鸡煲|土鸡煲|鲜鸡煲|清远鸡煲|火锅鸡|鸡窝火锅|(?<![地锅])涮"
)

# 店名像火锅但实际主业不是（无真正涮/火锅主业信号时用）
_NAME_FALSE_HOTPOT = re.compile(
    r"湖北菜|铁锅烀|耙牛肉|小龙虾|蚝红|烤全羊|烤串"
)

# 菜系 OCR 含火锅时，店名需再有的辅证
_NAME_SUPPORT = re.compile(
    r"涮|铜锅|羊蝎子|冰煮羊|菌菇|酸汤|火锅|冒菜|串串|地锅|鸡煲"
)

# 菜系有火锅但店名主业偏烤 → 仍排除
_NAME_NON_HOTPOT_CORE = re.compile(
    r"烤全羊|烤串|烧烤|小龙虾|耙牛肉|铁锅烀|批发部"
)


def _compact(s: str) -> str:
    return "".join((s or "").split())


def is_hotpot_shop(data: dict, filename_stem: str = "") -> bool:
    name = (data.get("shop_name") or filename_stem or "").strip()
    cuisine_blob = _compact(
        (data.get("shop_cuisine_raw") or "") + (data.get("shop_cuisine") or "")
    )

    # 「…烧烤·湖北菜·火锅」等挂名火锅、主业不是火锅
    if re.search(r"烧烤.*湖北菜|湖北菜.*烧烤|九头鸟", name):
        return False

    if _NAME_HOTPOT.search(name):
        return True

    if _NAME_FALSE_HOTPOT.search(name):
        return False

    # 冰煮羊 + 菜系火锅
    if "冰煮羊" in name and "火锅" in cuisine_blob:
        return True

    # 菜系写火锅，店名有涮/铜锅等辅证，且不是烧烤主业
    if "火锅" in cuisine_blob:
        if _NAME_NON_HOTPOT_CORE.search(name) and not _NAME_HOTPOT.search(name):
            return False
        if _NAME_SUPPORT.search(name):
            return True
        # 列表菜系本身就是「xx火锅」（非「牛羊肉火锅+烤全羊店」误伤）
        if re.search(
            r"(四川|重庆|北京|考北京|菌菇?|菌菲|鱼|贵州)?火锅", cuisine_blob
        ) and not _NAME_NON_HOTPOT_CORE.search(name):
            # 店名完全无火锅相关字时，仅接受「xx火锅」类菜系且店名不像正餐地名店
            if re.search(r"(四川|重庆|北京|考北京|菌菇?|菌菲|鱼)火锅", cuisine_blob):
                return True

    return False


def iter_shop_files(root: Path):
    for city_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        for cuisine_dir in sorted(p for p in city_dir.iterdir() if p.is_dir()):
            if cuisine_dir.name == HOTPOT_DIR:
                continue
            for path in sorted(cuisine_dir.glob("*.json")):
                if path.name in SUMMARY_JSON_NAMES:
                    continue
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if not is_shop_json_file(path, data):
                    continue
                yield city_dir, cuisine_dir, path, data


def aggregate_meat_veg(cuisine_dir: Path) -> dict[str, int]:
    buckets: dict[str, list[str]] = {t: [] for t in MEAT_VEG}
    shops = 0
    for path in sorted(cuisine_dir.glob("*.json")):
        if path.name in SUMMARY_JSON_NAMES:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not is_shop_json_file(path, data):
            continue
        shops += 1
        dishes = data.get("dishes") or {}
        for tag in MEAT_VEG:
            for name in dishes.get(tag) or []:
                if isinstance(name, str) and name.strip():
                    buckets[tag].append(name.strip())
    for tag in MEAT_VEG:
        (cuisine_dir / f"{tag}.json").write_text(
            json.dumps(buckets[tag], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    # 火锅目录不写汤/主；若旧文件存在则删除以免误用
    for extra in ("汤羹.json", "主食.json", "素菜_食材.json", "荤菜_食材.json"):
        p = cuisine_dir / extra
        if p.is_file():
            p.unlink()
    return {t: len(buckets[t]) for t in MEAT_VEG} | {"shops": shops}


def reaggregate_full(cuisine_dir: Path) -> None:
    """源菜系目录：重算荤素汤主。"""
    tags = ("荤菜", "素菜", "汤羹", "主食")
    buckets: dict[str, list[str]] = {t: [] for t in tags}
    for path in sorted(cuisine_dir.glob("*.json")):
        if path.name in SUMMARY_JSON_NAMES:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not is_shop_json_file(path, data):
            continue
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


def main() -> None:
    if not OUTPUT_DIR.is_dir():
        print(f"无目录：{OUTPUT_DIR}")
        return

    # —— 分析 ——
    print("=== 火锅店识别（按城市）===\n")
    planned: list[tuple[Path, Path, dict]] = []  # src, dest, data
    by_city: dict[str, list[tuple[str, str]]] = {}

    for city_dir, cuisine_dir, path, data in iter_shop_files(OUTPUT_DIR):
        if not is_hotpot_shop(data, path.stem):
            continue
        name = data.get("shop_name") or path.stem
        by_city.setdefault(city_dir.name, []).append((cuisine_dir.name, name))
        dest_dir = city_dir / HOTPOT_DIR
        dest = dest_dir / path.name
        planned.append((path, dest, data))

    total = 0
    for city in sorted(by_city):
        items = by_city[city]
        print(f"## {city}（{len(items)}）")
        for src_cui, name in items:
            print(f"  [{src_cui} → {HOTPOT_DIR}] {name}")
        total += len(items)
        print()
    print(f"合计将迁移 {total} 家\n")

    if not planned:
        print("无店铺需要迁移")
        return

    # —— 迁移 ——
    touched_src: set[Path] = set()
    moved = 0
    for src, dest, data in planned:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.resolve() == src.resolve():
            continue
        if dest.exists():
            print(f"  跳过（目标已存在）: {dest.relative_to(OUTPUT_DIR)}")
            continue
        # 标记菜系字段便于后续识别
        data = dict(data)
        data["shop_cuisine"] = HOTPOT_DIR
        if not data.get("moved_from_cuisine"):
            data["moved_from_cuisine"] = src.parent.name
        dest.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        src.unlink()
        touched_src.add(src.parent)
        moved += 1
        print(f"  移动 {src.relative_to(OUTPUT_DIR)} → {dest.parent.name}/")

    print(f"\n已移动 {moved} 家")

    # —— 汇总火锅荤素 ——
    print("\n=== 汇总各城「火锅」荤/素 ===")
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        hp = city_dir / HOTPOT_DIR
        if not hp.is_dir():
            continue
        stats = aggregate_meat_veg(hp)
        print(
            f"  {city_dir.name}/{HOTPOT_DIR}: 店={stats['shops']} "
            f"荤={stats['荤菜']} 素={stats['素菜']}"
        )

    # —— 源菜系重汇总 ——
    print("\n=== 重汇总被改动的原菜系目录 ===")
    for d in sorted(touched_src):
        if not d.is_dir():
            continue
        reaggregate_full(d)
        print(f"  已重汇总 {d.relative_to(OUTPUT_DIR)}")

    print("\n完成")


if __name__ == "__main__":
    main()
