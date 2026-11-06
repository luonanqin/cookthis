from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from city_recipes import (  # noqa: E402
    city_recipes_only,
    group_by_city,
    set_recipe_cities,
    summarize_recipe,
)


def test_city_recipes_only_filters_empty_cities():
    rows = [
        {"id": "a", "name": "全国菜", "cities": []},
        {"id": "b", "name": "涮羊肉", "cities": ["包头市"]},
    ]
    out = city_recipes_only(rows)
    assert len(out) == 1
    assert out[0]["id"] == "b"


def test_group_by_city_indexes_each_city():
    rows = [
        {
            "id": "b",
            "name": "涮羊肉",
            "cities": ["包头市"],
            "mainIngredients": ["羊肉"],
        },
        {
            "id": "c",
            "name": "青椒炒肉",
            "cities": ["昌都市", "拉萨市"],
            "mainIngredients": ["猪肉", "青椒"],
        },
    ]
    by = group_by_city(rows)
    assert set(by.keys()) == {"包头市", "昌都市", "拉萨市"}
    assert by["昌都市"][0]["id"] == "c"
    assert by["拉萨市"][0]["name"] == "青椒炒肉"


def test_set_recipe_cities_clears_for_nationwide():
    rows = [
        {"id": "b", "name": "涮羊肉", "cities": ["包头市"], "mainIngredients": ["羊肉"]}
    ]
    updated = set_recipe_cities(rows, "b", [])
    assert updated is not None
    assert updated["cities"] == []
    assert rows[0]["cities"] == []


def test_set_recipe_cities_missing_id():
    assert set_recipe_cities([], "nope", []) is None


def test_summarize_recipe_shape():
    s = summarize_recipe(
        {
            "id": "x",
            "name": "菜",
            "cities": ["北京市"],
            "mainIngredients": ["白菜"],
            "meatVeg": "veg",
            "seasonings": ["盐"],
        }
    )
    assert s == {
        "id": "x",
        "name": "菜",
        "cities": ["北京市"],
        "mainIngredients": ["白菜"],
        "meatVeg": "veg",
    }
