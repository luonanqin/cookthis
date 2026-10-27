from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_ingredient_popularity import (
    merge_cleaned_items,
    score_ingredients,
    apply_alias_max,
    assign_categories,
)


def test_merge_dedupes_title_keeps_higher_count():
    a = {"items": {"番茄": {"recipes": [{"title": "炒番茄", "count": 10}]}}}
    b = {
        "items": {
            "番茄": {
                "recipes": [
                    {"title": "炒番茄", "count": 20},
                    {"title": "番茄蛋", "count": 5},
                ]
            }
        }
    }
    merged = merge_cleaned_items(a, b)
    titles = {r["title"]: r["count"] for r in merged["番茄"]["recipes"]}
    assert titles["炒番茄"] == 20
    assert titles["番茄蛋"] == 5


def test_merge_dedup_tie_keeps_first():
    a = {"items": {"番茄": {"recipes": [{"title": "炒番茄", "count": 10}]}}}
    b = {"items": {"番茄": {"recipes": [{"title": "炒番茄", "count": 10}]}}}
    merged = merge_cleaned_items(a, b)
    assert merged["番茄"]["recipes"][0]["count"] == 10


def test_score_only_self_key_and_missing_is_one():
    items = {
        "番茄": {
            "recipes": [{"title": "a", "count": 3, "ingredients": ["番茄", "蛋"]}]
        },
        "西瓜": {"recipes": []},
    }
    scores = score_ingredients(items)
    assert scores["番茄"] == 3
    assert scores["西瓜"] == 1


def test_score_zero_sum_is_one():
    items = {"巴旦木": {"recipes": [{"title": "x", "count": 0}]}}
    assert score_ingredients(items)["巴旦木"] == 1


def test_score_ignores_top_level_count():
    items = {
        "八爪鱼": {
            "count": 9999,
            "recipes": [{"title": "a", "count": 2}, {"title": "b", "count": 3}],
        }
    }
    assert score_ingredients(items)["八爪鱼"] == 5


def test_alias_max():
    scores = {"鸡爪": 10, "鸡脚": 50}
    aliases = {"鸡爪": ["鸡脚", "凤爪"]}
    out = apply_alias_max(scores, aliases)
    assert out["鸡爪"] == 50 and out["鸡脚"] == 50 and out["凤爪"] == 50


def test_assign_categories_first_hit_in_key_order():
    by_cat = {
        "categories": {
            "瓜果": ["番茄", "西瓜"],
            "菜叶": ["番茄", "菠菜"],
        }
    }
    mapping = assign_categories(by_cat)
    assert mapping["番茄"] == "瓜果"
    assert mapping["西瓜"] == "瓜果"
    assert mapping["菠菜"] == "菜叶"
    assert mapping.get("未知") is None


def test_assign_categories_lookup():
    by_cat = {"categories": {"肉类": ["鸡爪"]}}
    assert assign_categories(by_cat)["鸡爪"] == "肉类"
