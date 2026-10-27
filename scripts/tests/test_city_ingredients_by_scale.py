from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_city_ingredients_by_scale import (
    build_alias_index,
    cut_tiers,
    flatten_shelf_locals,
    map_shelf_to_candidates,
    split_seasonal,
)


def test_tier_cuts():
    names = ["a", "b", "c"]
    assert cut_tiers(names) == {
        "small": ["a"],
        "medium": ["a", "b"],
        "large": ["a", "b", "c"],
    }


def test_tier_cuts_empty():
    assert cut_tiers([]) == {"small": [], "medium": [], "large": []}


def test_tier_cuts_on_items():
    items = [{"name": "a"}, {"name": "b"}, {"name": "c"}]
    assert cut_tiers(items) == {
        "small": items[:1],
        "medium": items[:2],
        "large": items[:3],
    }


def test_seasonal_split_hits_alias_or_local():
    seasonal_set = {"番茄"}
    items = [{"name": "番茄", "displayName": "西红柿"}]
    s, y = split_seasonal(items, seasonal_set)
    assert [x["displayName"] for x in s] == ["西红柿"]
    assert y == []


def test_seasonal_split_hits_local_name():
    seasonal_set = {"西红柿"}
    items = [{"name": "番茄", "displayName": "西红柿"}]
    s, y = split_seasonal(items, seasonal_set)
    assert len(s) == 1
    assert y == []


def test_unmapped_logged_not_silent():
    alias_index = build_alias_index({})
    popularity = {"items": {}}
    category_map = {"菠菜": "菜叶"}
    locals_in_order = ["菠菜", "___not_in_catalog___"]
    entries, unmapped = map_shelf_to_candidates(
        locals_in_order, alias_index, popularity, category_map
    )
    assert len(entries) == 1
    assert entries[0]["name"] == "菠菜"
    assert unmapped == ["___not_in_catalog___"]


def test_first_local_wins_same_canonical():
    alias_index = build_alias_index({"番茄": ["西红柿"]})
    popularity = {"items": {"番茄": {"score": 10, "category": "瓜果"}}}
    category_map = {"番茄": "瓜果"}
    locals_in_order = ["西红柿", "番茄"]
    entries, unmapped = map_shelf_to_candidates(
        locals_in_order, alias_index, popularity, category_map
    )
    assert unmapped == []
    assert len(entries) == 1
    assert entries[0]["displayName"] == "西红柿"


def test_flatten_shelf_ignores_bucket_keys():
    doc = {
        "categories": {
            "美团素菜": ["a"],
            "美团荤菜": ["b", "c"],
        }
    }
    assert flatten_shelf_locals(doc) == ["a", "b", "c"]
