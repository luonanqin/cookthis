"""Build data/catalog/ingredient-popularity.json from xiachufang cleaned + aliases + by-category."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]

CATEGORY_CLEANED = (
    REPO_ROOT / "data/recipes/xiachufang/xiachufang-category-results.cleaned.json"
)
SEARCH_CLEANED = (
    REPO_ROOT / "data/recipes/xiachufang/xiachufang-search-results.cleaned.json"
)
ALIASES_PATH = REPO_ROOT / "data/catalog/aliases.json"
BY_CATEGORY_PATH = REPO_ROOT / "data/catalog/ingredients-all-by-category.json"
OUTPUT_PATH = REPO_ROOT / "data/catalog/ingredient-popularity.json"


def _items_map(doc: dict[str, Any] | None) -> dict[str, Any]:
    if not doc:
        return {}
    return doc.get("items") or {}


def _dedupe_recipes(recipes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_title: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for recipe in recipes:
        title = recipe.get("title") or ""
        count = int(recipe.get("count") or 0)
        if title not in by_title:
            by_title[title] = {**recipe, "count": count}
            order.append(title)
            continue
        existing = by_title[title]
        existing_count = int(existing.get("count") or 0)
        if count > existing_count:
            by_title[title] = {**recipe, "count": count}
    return [by_title[t] for t in order]


def merge_cleaned_items(
    category_doc: dict[str, Any], search_doc: dict[str, Any] | None = None
) -> dict[str, dict[str, Any]]:
    """Merge category + search cleaned items; dedupe recipes by title (higher count wins; tie: first)."""
    merged: dict[str, dict[str, Any]] = {}
    for source in (category_doc, search_doc or {}):
        for name, entry in _items_map(source).items():
            recipes = list((entry or {}).get("recipes") or [])
            if name not in merged:
                merged[name] = {"recipes": _dedupe_recipes(recipes)}
            else:
                combined = merged[name]["recipes"] + recipes
                merged[name]["recipes"] = _dedupe_recipes(combined)
    return merged


def score_ingredients(items: dict[str, dict[str, Any]]) -> dict[str, int]:
    """Sum recipe.count per ingredient key only; empty or zero total → 1."""
    scores: dict[str, int] = {}
    for name, entry in items.items():
        recipes = (entry or {}).get("recipes") or []
        total = sum(int(r.get("count") or 0) for r in recipes)
        scores[name] = total if total > 0 else 1
    return scores


def _alias_groups(aliases_doc: dict[str, Any]) -> list[set[str]]:
    groups: list[set[str]] = []
    for key, value in aliases_doc.items():
        if key.startswith("_"):
            continue
        if not isinstance(value, list):
            continue
        group = {key, *value}
        groups.append(group)
    return groups


def apply_alias_max(
    scores: dict[str, int], aliases_doc: dict[str, Any]
) -> dict[str, int]:
    """Each alias surface name gets max score within its group."""
    out = dict(scores)
    for group in _alias_groups(aliases_doc):
        group_max = max(out.get(name, 1) for name in group)
        for name in group:
            out[name] = group_max
    return out


def assign_categories(by_category_doc: dict[str, Any]) -> dict[str, str | None]:
    """First category hit in JSON categories key order; names not listed → absent from map."""
    mapping: dict[str, str | None] = {}
    categories = by_category_doc.get("categories") or {}
    for category_name, names in categories.items():
        if not isinstance(names, list):
            continue
        for name in names:
            if name not in mapping:
                mapping[name] = category_name
    return mapping


def _all_catalog_names(by_category_doc: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for category_names in (by_category_doc.get("categories") or {}).values():
        if isinstance(category_names, list):
            names.update(category_names)
    return names


def build_popularity_doc(
    category_doc: dict[str, Any],
    search_doc: dict[str, Any] | None,
    aliases_doc: dict[str, Any],
    by_category_doc: dict[str, Any],
) -> dict[str, Any]:
    merged = merge_cleaned_items(category_doc, search_doc)
    scores = score_ingredients(merged)
    scores = apply_alias_max(scores, aliases_doc)

    category_map = assign_categories(by_category_doc)
    catalog_names = _all_catalog_names(by_category_doc)

    all_names = set(scores.keys()) | catalog_names
    for name in catalog_names:
        scores.setdefault(name, 1)

    items: dict[str, dict[str, Any]] = {}
    for name in sorted(all_names):
        items[name] = {
            "score": scores[name],
            "category": category_map.get(name),
        }

    sources = ["xiachufang-category-results.cleaned.json"]
    if search_doc:
        sources.append("xiachufang-search-results.cleaned.json")

    return {
        "_meta": {
            "builtAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "popularitySource": sources,
            "categorySource": "ingredients-all-by-category.json",
            "categoryRule": "first category in JSON key order when name appears in multiple",
        },
        "items": items,
    }


def main() -> None:
    category_doc = json.loads(CATEGORY_CLEANED.read_text(encoding="utf-8"))
    search_doc = None
    if SEARCH_CLEANED.is_file():
        search_doc = json.loads(SEARCH_CLEANED.read_text(encoding="utf-8"))

    aliases_doc = json.loads(ALIASES_PATH.read_text(encoding="utf-8"))
    by_category_doc = json.loads(BY_CATEGORY_PATH.read_text(encoding="utf-8"))

    out_doc = build_popularity_doc(
        category_doc, search_doc, aliases_doc, by_category_doc
    )
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(out_doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH} ({len(out_doc['items'])} items)")


if __name__ == "__main__":
    main()
