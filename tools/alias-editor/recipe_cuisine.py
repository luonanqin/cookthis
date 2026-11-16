"""菜谱菜系分桶与批量更新（recipes-builtin.cuisineTags）。"""
from __future__ import annotations

from typing import Any

from recipe_difficulty import name_sort_key

# 通用 + 19 地方系（与 cloudfunctions cuisinePrefs 对齐）
CUISINE_COMMON = "home_style"
CUISINE_OPTIONS: list[tuple[str, str]] = [
    (CUISINE_COMMON, "通用"),
    ("sichuan", "川菜"),
    ("cantonese", "粤菜"),
    ("shandong", "鲁菜"),
    ("jiangsu", "苏菜"),
    ("zhejiang", "浙菜"),
    ("fujian", "闽菜"),
    ("hunan", "湘菜"),
    ("anhui", "徽菜"),
    ("northeast", "东北菜"),
    ("northwest", "西北菜"),
    ("shanghai", "本帮/上海"),
    ("beijing", "京菜"),
    ("henan", "豫菜"),
    ("yunnan", "云南菜"),
    ("guizhou", "贵州菜"),
    ("inner_mongolia", "内蒙菜"),
    ("xinjiang", "新疆菜"),
    ("hubei", "湖北菜"),
    ("jiangxi", "江西菜"),
]
CUISINE_CODES = [c for c, _ in CUISINE_OPTIONS]
CUISINE_LABELS = {c: lab for c, lab in CUISINE_OPTIONS}
NAV_ORDER = ["unlabeled", *CUISINE_CODES]


# 超过该数量的地方系 → 视为通用（仅 home_style）
CUISINE_REGIONAL_MAX = 5


def normalize_cuisine_tags(tags: Any) -> list[str]:
    """去重校验；含通用或地方系超过 CUISINE_REGIONAL_MAX → 仅 home_style。"""
    if not isinstance(tags, list):
        return []
    allowed = set(CUISINE_CODES)
    out: list[str] = []
    seen: set[str] = set()
    for t in tags:
        s = str(t or "").strip()
        if s not in allowed or s in seen:
            continue
        seen.add(s)
        out.append(s)
    if not out:
        return []
    if CUISINE_COMMON in out:
        return [CUISINE_COMMON]
    regionals = [t for t in out if t != CUISINE_COMMON]
    if len(regionals) > CUISINE_REGIONAL_MAX:
        return [CUISINE_COMMON]
    return regionals


def summarize_cuisine_recipe(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "mainIngredients": list(row.get("mainIngredients") or []),
        "cuisineTags": normalize_cuisine_tags(row.get("cuisineTags")),
    }


def group_by_cuisine(
    recipes: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """通用（home_style）只进通用栏，不进任何地方系。"""
    by: dict[str, list[dict[str, Any]]] = {k: [] for k in NAV_ORDER}
    for row in recipes or []:
        summary = summarize_cuisine_recipe(row)
        tags = summary["cuisineTags"]
        if not tags:
            by["unlabeled"].append(summary)
        elif CUISINE_COMMON in tags:
            summary["cuisineTags"] = [CUISINE_COMMON]
            by[CUISINE_COMMON].append(summary)
        else:
            for t in tags:
                by[t].append(summary)
    for k in NAV_ORDER:
        by[k].sort(key=lambda r: name_sort_key(str(r.get("name") or "")))
    return by


def counts_by_cuisine(by: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    return {k: len(by.get(k) or []) for k in NAV_ORDER}


def apply_cuisine_changes(
    recipes: list[dict[str, Any]],
    changes: dict[str, list[str]],
) -> tuple[list[str], list[str]]:
    if not isinstance(changes, dict):
        raise ValueError("changes must be object")
    by_id = {str(r.get("id") or ""): r for r in recipes}
    updated: list[str] = []
    missing: list[str] = []
    for rid, tags in changes.items():
        rid_s = str(rid or "").strip()
        if not rid_s:
            continue
        if not isinstance(tags, list):
            raise ValueError(f"tags must be list for {rid_s}")
        cleaned = normalize_cuisine_tags(tags)
        row = by_id.get(rid_s)
        if row is None:
            missing.append(rid_s)
            continue
        row["cuisineTags"] = cleaned
        updated.append(rid_s)
    return updated, missing
