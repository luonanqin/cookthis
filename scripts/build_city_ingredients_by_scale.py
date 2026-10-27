"""Build per-city ingredients-by-scale.json from shelf + national popularity."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from build_ingredient_popularity import assign_categories

REPO_ROOT = Path(__file__).resolve().parents[1]

CITIES_DIR = REPO_ROOT / "data/catalog/cities"
POPULARITY_PATH = REPO_ROOT / "data/catalog/ingredient-popularity.json"
ALIASES_PATH = REPO_ROOT / "data/catalog/aliases.json"
BY_CATEGORY_PATH = REPO_ROOT / "data/catalog/ingredients-all-by-category.json"
SEASONAL_PATH = REPO_ROOT / "data/catalog/seasonal-ingredients.json"


def build_alias_index(aliases_doc: dict[str, Any]) -> dict[str, Any]:
    canon_map: dict[str, str] = {}
    for key, value in aliases_doc.items():
        if not key or key.startswith("_") or not isinstance(value, list):
            continue
        group = {key, *value}
        for surface in group:
            canon_map[surface] = key

    def canonical_of(surface: str) -> str:
        return canon_map.get(surface, surface)

    return {"canonical_of": canonical_of}


def flatten_shelf_locals(city_doc: dict[str, Any]) -> list[str]:
    """All local shelf names in document order (Meituan bucket labels are not taxonomy)."""
    out: list[str] = []
    categories = city_doc.get("categories") or {}
    for names in categories.values():
        if not isinstance(names, list):
            continue
        for name in names:
            if name:
                out.append(str(name))
    return out


def _score_for(canonical: str, popularity: dict[str, Any]) -> int:
    items = popularity.get("items") or {}
    entry = items.get(canonical) or {}
    return int(entry.get("score") or 1)


def _category_for(
    canonical: str, popularity: dict[str, Any], category_map: dict[str, str | None]
) -> str | None:
    items = popularity.get("items") or {}
    entry = items.get(canonical) or {}
    cat = entry.get("category")
    if cat:
        return str(cat)
    mapped = category_map.get(canonical)
    return str(mapped) if mapped else None


def map_shelf_to_candidates(
    locals_in_order: list[str],
    alias_index: dict[str, Any],
    popularity: dict[str, Any],
    category_map: dict[str, str | None],
) -> tuple[list[dict[str, Any]], list[str]]:
    canonical_of: Callable[[str], str] = alias_index["canonical_of"]
    seen_canonical: set[str] = set()
    entries: list[dict[str, Any]] = []
    unmapped: list[str] = []

    for local in locals_in_order:
        canonical = canonical_of(local)
        category = _category_for(canonical, popularity, category_map)
        if not category:
            unmapped.append(local)
            continue
        if canonical in seen_canonical:
            continue
        seen_canonical.add(canonical)
        entries.append(
            {
                "name": canonical,
                "displayName": local,
                "category": category,
                "score": _score_for(canonical, popularity),
            }
        )
    return entries, unmapped


def cut_tiers(ordered: list[Any]) -> dict[str, list[Any]]:
    n = len(ordered)
    if n == 0:
        return {"small": [], "medium": [], "large": []}
    return {
        "small": ordered[: math.ceil(n / 3)],
        "medium": ordered[: math.ceil(2 * n / 3)],
        "large": ordered[:],
    }


def split_seasonal(
    items: list[dict[str, Any]], seasonal_set: set[str]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    seasonal: list[dict[str, Any]] = []
    year_round: list[dict[str, Any]] = []
    for item in items:
        name = item.get("name") or ""
        display = item.get("displayName") or ""
        if name in seasonal_set or display in seasonal_set:
            seasonal.append(item)
        else:
            year_round.append(item)
    return seasonal, year_round


def _entry_out(item: dict[str, Any]) -> dict[str, str]:
    return {"name": item["name"], "displayName": item["displayName"]}


def flatten_seasonal_set(seasonal_doc: dict[str, Any]) -> set[str]:
    out: set[str] = set()
    for names in (seasonal_doc.get("categories") or {}).values():
        if isinstance(names, list):
            out.update(str(n) for n in names if n)
    return out


def build_city_scale_doc(
    city: str,
    city_doc: dict[str, Any],
    popularity: dict[str, Any],
    aliases_doc: dict[str, Any],
    by_category_doc: dict[str, Any],
    seasonal_doc: dict[str, Any],
) -> dict[str, Any]:
    alias_index = build_alias_index(aliases_doc)
    category_map = assign_categories(by_category_doc)
    category_order = list((by_category_doc.get("categories") or {}).keys())
    seasonal_set = flatten_seasonal_set(seasonal_doc)

    locals_in_order = flatten_shelf_locals(city_doc)
    candidates, unmapped = map_shelf_to_candidates(
        locals_in_order, alias_index, popularity, category_map
    )

    by_cat: dict[str, list[dict[str, Any]]] = {c: [] for c in category_order}
    for entry in candidates:
        cat = entry["category"]
        if cat in by_cat:
            by_cat[cat].append(entry)

    scales: dict[str, dict[str, dict[str, list[dict[str, str]]]]] = {
        scale: {"seasonal": {}, "yearRound": {}}
        for scale in ("small", "medium", "large")
    }

    for cat in category_order:
        pool = by_cat.get(cat) or []
        if not pool:
            continue
        ordered = sorted(pool, key=lambda e: (-e["score"], e["name"]))
        tiers = cut_tiers(ordered)
        for scale_name, tier_items in tiers.items():
            seasonal, year_round = split_seasonal(tier_items, seasonal_set)
            if seasonal:
                scales[scale_name]["seasonal"][cat] = [_entry_out(x) for x in seasonal]
            if year_round:
                scales[scale_name]["yearRound"][cat] = [_entry_out(x) for x in year_round]

    pop_meta = popularity.get("_meta") or {}
    return {
        "city": city,
        "categoriesTaxonomy": "ingredients-all-by-category",
        "scales": scales,
        "_meta": {
            "builtAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "popularitySource": pop_meta.get("popularitySource"),
            "unmapped": unmapped,
            "displayNameRule": "first local shelf name per canonical",
        },
    }


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def build_all_cities(repo_root: Path | None = None) -> list[tuple[str, int]]:
    root = repo_root or REPO_ROOT
    cities_dir = root / "data/catalog/cities"
    popularity = _load_json(root / "data/catalog/ingredient-popularity.json")
    aliases_doc = _load_json(root / "data/catalog/aliases.json")
    by_category_doc = _load_json(root / "data/catalog/ingredients-all-by-category.json")
    seasonal_doc = _load_json(root / "data/catalog/seasonal-ingredients.json")

    results: list[tuple[str, int]] = []
    for city_dir in sorted(cities_dir.iterdir()):
        shelf_path = city_dir / "ingredients.json"
        if not city_dir.is_dir() or not shelf_path.is_file():
            continue
        city_doc = _load_json(shelf_path)
        city = str(city_doc.get("city") or city_dir.name)
        doc = build_city_scale_doc(
            city, city_doc, popularity, aliases_doc, by_category_doc, seasonal_doc
        )
        out_path = city_dir / "ingredients-by-scale.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write("\n")
        unmapped_count = len(doc["_meta"]["unmapped"])
        results.append((city, unmapped_count))
        print(f"{city}: unmapped {unmapped_count}")
    total_unmapped = sum(n for _, n in results)
    print(f"Total unmapped: {total_unmapped} across {len(results)} cities")
    return results


def main() -> None:
    build_all_cities()


if __name__ == "__main__":
    main()
