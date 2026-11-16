"""菜谱荤素汤分桶与批量更新（recipes-builtin.meatVeg）。

本 tab 只展示/编辑 meat|veg|soup；staple 等其它值不进分桶。
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from recipe_difficulty import name_sort_key

MEAT_VEG_LEVELS = ("meat", "veg", "soup")
MEAT_VEG_LABELS = {
    "meat": "荤",
    "veg": "素",
    "soup": "汤",
}


def effective_meat_veg(row: dict[str, Any] | None) -> str | None:
    """仅返回 meat|veg|soup；其它（含 staple / 缺失）返回 None。"""
    v = (row or {}).get("meatVeg")
    if v in MEAT_VEG_LEVELS:
        return str(v)
    return None


def summarize_meat_veg_recipe(row: dict[str, Any]) -> dict[str, Any] | None:
    mv = effective_meat_veg(row)
    if mv is None:
        return None
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "mainIngredients": list(row.get("mainIngredients") or []),
        "seasonings": list(row.get("seasonings") or []),
        "meatVeg": mv,
    }


def group_by_meat_veg(
    recipes: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    by: dict[str, list[dict[str, Any]]] = {k: [] for k in MEAT_VEG_LEVELS}
    for row in recipes or []:
        summary = summarize_meat_veg_recipe(row)
        if summary is None:
            continue
        by[summary["meatVeg"]].append(summary)
    for k in MEAT_VEG_LEVELS:
        by[k].sort(key=lambda r: name_sort_key(str(r.get("name") or "")))
    return by


def counts_by_meat_veg(by: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    return {k: len(by.get(k) or []) for k in MEAT_VEG_LEVELS}


def apply_meat_veg_changes(
    recipes: list[dict[str, Any]],
    changes: dict[str, str],
) -> tuple[list[str], list[str]]:
    if not isinstance(changes, dict):
        raise ValueError("changes must be object")
    cleaned: dict[str, str] = {}
    for rid, level in changes.items():
        rid_s = str(rid or "").strip()
        level_s = str(level or "").strip()
        if not rid_s:
            continue
        if level_s not in MEAT_VEG_LEVELS:
            raise ValueError(f"invalid meatVeg: {level_s}")
        cleaned[rid_s] = level_s
    by_id = {str(r.get("id") or ""): r for r in recipes}
    updated: list[str] = []
    missing: list[str] = []
    for rid, level in cleaned.items():
        row = by_id.get(rid)
        if row is None:
            missing.append(rid)
            continue
        row["meatVeg"] = level
        updated.append(rid)
    return updated, missing


def delete_recipe_by_id(
    recipes: list[dict[str, Any]],
    recipe_id: str,
) -> dict[str, Any] | None:
    """按 id 从列表硬删一道菜；返回被删摘要，找不到返回 None。"""
    rid = str(recipe_id or "").strip()
    if not rid:
        raise ValueError("id required")
    for i, row in enumerate(recipes or []):
        if str(row.get("id") or "") != rid:
            continue
        removed = recipes.pop(i)
        return {
            "id": removed.get("id"),
            "name": removed.get("name"),
            "mainIngredients": list(removed.get("mainIngredients") or []),
            "seasonings": list(removed.get("seasonings") or []),
            "meatVeg": removed.get("meatVeg"),
        }
    return None


def normalize_ingredient_list(raw: Any) -> list[str]:
    """trim、丢空串、保序去重。非 list 视为空。"""
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        s = str(item or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def apply_recipe_ingredients(
    recipes: list[dict[str, Any]],
    recipe_id: str,
    main_ingredients: Any,
    seasonings: Any,
) -> dict[str, Any] | None:
    """写入主料/调味；不改 meatVeg。找不到 id 返回 None。"""
    rid = str(recipe_id or "").strip()
    if not rid:
        raise ValueError("id required")
    mains = normalize_ingredient_list(main_ingredients)
    seas = normalize_ingredient_list(seasonings)
    for row in recipes or []:
        if str(row.get("id") or "") != rid:
            continue
        row["mainIngredients"] = mains
        row["seasonings"] = seas
        summary = summarize_meat_veg_recipe(row)
        if summary is not None:
            return summary
        return {
            "id": row.get("id"),
            "name": row.get("name"),
            "mainIngredients": mains,
            "seasonings": seas,
            "meatVeg": row.get("meatVeg"),
        }
    return None


def editor_known_names(doc: dict[str, Any] | None) -> set[str]:
    """别名编辑稿中全部已有名字（各组 canon/aliases + 各品类 ungrouped）。"""
    known: set[str] = set()
    for bucket in ((doc or {}).get("categories") or {}).values():
        if not isinstance(bucket, dict):
            continue
        for g in bucket.get("groups") or []:
            if not isinstance(g, dict):
                continue
            c = str(g.get("canon") or "").strip()
            if c:
                known.add(c)
            for a in g.get("aliases") or []:
                s = str(a or "").strip()
                if s:
                    known.add(s)
        for n in bucket.get("ungrouped") or []:
            s = str(n or "").strip()
            if s:
                known.add(s)
    return known


def add_to_uncategorized(
    doc: dict[str, Any],
    names: list[str],
) -> list[str]:
    """把尚未出现在编辑稿的名字追加到「未分类」ungrouped；返回实际新增。"""
    if not isinstance(doc, dict):
        raise ValueError("editor doc must be object")
    cats = doc.setdefault("categories", {})
    if not isinstance(cats, dict):
        raise ValueError("categories must be object")
    bucket = cats.setdefault("未分类", {"groups": [], "ungrouped": []})
    if not isinstance(bucket, dict):
        raise ValueError("未分类 bucket must be object")
    ug = bucket.setdefault("ungrouped", [])
    if not isinstance(ug, list):
        raise ValueError("ungrouped must be list")
    known = editor_known_names(doc)
    added: list[str] = []
    for n in names:
        s = str(n or "").strip()
        if not s or s in known:
            continue
        ug.append(s)
        known.add(s)
        added.append(s)
    bucket["ungrouped"] = sorted(set(str(x).strip() for x in ug if str(x).strip()))
    return added


def _make_ingredient_id(name: str, existing_ids: set[str]) -> str:
    digest = hashlib.sha1(str(name).encode("utf-8")).hexdigest()
    base = f"ing_{digest[:10]}"
    if base not in existing_ids:
        return base
    i = 1
    while f"{base}_{i}" in existing_ids:
        i += 1
    return f"{base}_{i}"


def ensure_names_in_ingredients_builtin(
    builtin: list[dict[str, Any]],
    names: list[str],
    *,
    category: str = "未分类",
) -> list[str]:
    """把缺失名追加进 ingredients-builtin 列表；返回实际新增的名字。

    import-recipes 只认 ingredients-builtin 的 name；食材编辑若只写别名稿会导出失败。
    """
    if not isinstance(builtin, list):
        raise ValueError("ingredients-builtin must be list")
    present: set[str] = set()
    existing_ids: set[str] = set()
    for row in builtin:
        if not isinstance(row, dict):
            continue
        n = str(row.get("name") or "").strip()
        if n:
            present.add(n)
        rid = str(row.get("id") or "").strip()
        if rid:
            existing_ids.add(rid)
    added: list[str] = []
    cat = str(category or "").strip() or "未分类"
    is_seasoning = cat == "调味"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    for n in names:
        s = str(n or "").strip()
        if not s or s in present:
            continue
        rid = _make_ingredient_id(s, existing_ids)
        existing_ids.add(rid)
        present.add(s)
        row: dict[str, Any] = {
            "id": rid,
            "name": s,
            "category": cat,
            "cities": [],
            "kind": "seasoning" if is_seasoning else "main",
            "sort": 99,
            "avoidTags": [],
            "source": "builtin",
            "updatedAt": now,
        }
        if is_seasoning:
            pass
        else:
            row["onConfirmPage"] = False
            row["availability"] = "year_round"
        builtin.append(row)
        added.append(s)
    return added


def collect_recipe_main_ingredient_names(
    recipes: list[dict[str, Any]],
) -> list[str]:
    """收集菜谱全部主料名（保序去重）。"""
    return normalize_ingredient_list(
        [n for row in (recipes or []) for n in (row.get("mainIngredients") or [])]
    )


def ingredient_suggest_names(
    ingredients_all: dict[str, Any] | None,
    editor_doc: dict[str, Any] | None = None,
) -> list[str]:
    """联想用：ingredients-all 各品类名 ∪ 编辑稿已有名。"""
    names: set[str] = set()
    for lst in ((ingredients_all or {}).get("categories") or {}).values():
        if not isinstance(lst, list):
            continue
        for n in lst:
            s = str(n or "").strip()
            if s:
                names.add(s)
    names |= editor_known_names(editor_doc)
    return sorted(names)
