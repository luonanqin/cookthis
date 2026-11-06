"""城菜全国可见：从 recipes-builtin 拉带城菜，更新 cities。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_recipes(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("recipes-builtin.json must be a JSON array")
    return raw


def write_recipes(path: Path, recipes: list[dict[str, Any]]) -> None:
    path.write_text(
        json.dumps(recipes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def city_recipes_only(recipes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in recipes:
        cities = (row or {}).get("cities") or []
        if isinstance(cities, list) and len(cities) > 0:
            out.append(row)
    return out


def summarize_recipe(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "cities": list(row.get("cities") or []),
        "mainIngredients": list(row.get("mainIngredients") or []),
        "meatVeg": row.get("meatVeg"),
    }


def group_by_city(recipes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by: dict[str, list[dict[str, Any]]] = {}
    for row in city_recipes_only(recipes):
        summary = summarize_recipe(row)
        for city in summary["cities"]:
            c = str(city or "").strip()
            if not c:
                continue
            by.setdefault(c, []).append(summary)
    for city in by:
        by[city].sort(key=lambda r: str(r.get("name") or ""))
    return dict(sorted(by.items(), key=lambda kv: kv[0]))


def set_recipe_cities(
    recipes: list[dict[str, Any]], recipe_id: str, cities: list[str]
) -> dict[str, Any] | None:
    """Update cities on matching id; returns updated summary or None if missing."""
    rid = str(recipe_id or "").strip()
    if not rid:
        raise ValueError("id required")
    if not isinstance(cities, list):
        raise ValueError("cities must be list")
    cleaned = [str(c).strip() for c in cities if str(c).strip()]
    for row in recipes:
        if str(row.get("id") or "") != rid:
            continue
        row["cities"] = cleaned
        return summarize_recipe(row)
    return None
