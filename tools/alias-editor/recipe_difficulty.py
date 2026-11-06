"""菜谱难度分桶与批量更新（recipes-builtin.difficulty）。"""
from __future__ import annotations

from typing import Any

DIFFICULTY_LEVELS = ("easy", "home", "advanced")
DIFFICULTY_LABELS = {
    "easy": "轻松上手",
    "home": "家常水平",
    "advanced": "进阶一点",
}


def effective_difficulty(row: dict[str, Any] | None) -> str:
    d = (row or {}).get("difficulty")
    if d in DIFFICULTY_LEVELS:
        return str(d)
    return "home"


def summarize_difficulty_recipe(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "mainIngredients": list(row.get("mainIngredients") or []),
        "difficulty": effective_difficulty(row),
    }


def group_by_difficulty(
    recipes: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    by: dict[str, list[dict[str, Any]]] = {k: [] for k in DIFFICULTY_LEVELS}
    for row in recipes or []:
        summary = summarize_difficulty_recipe(row)
        by[summary["difficulty"]].append(summary)
    for k in DIFFICULTY_LEVELS:
        by[k].sort(key=lambda r: str(r.get("name") or ""))
    return by


def counts_by_difficulty(by: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    return {k: len(by.get(k) or []) for k in DIFFICULTY_LEVELS}


def apply_difficulty_changes(
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
        if level_s not in DIFFICULTY_LEVELS:
            raise ValueError(f"invalid difficulty: {level_s}")
        cleaned[rid_s] = level_s
    by_id = {str(r.get("id") or ""): r for r in recipes}
    updated: list[str] = []
    missing: list[str] = []
    for rid, level in cleaned.items():
        row = by_id.get(rid)
        if row is None:
            missing.append(rid)
            continue
        row["difficulty"] = level
        updated.append(rid)
    return updated, missing
