import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from recipe_meat_veg import (  # noqa: E402
    add_to_uncategorized,
    apply_meat_veg_changes,
    apply_recipe_ingredients,
    counts_by_meat_veg,
    delete_recipe_by_id,
    editor_known_names,
    effective_meat_veg,
    group_by_meat_veg,
    ingredient_suggest_names,
    normalize_ingredient_list,
    summarize_meat_veg_recipe,
)


def test_effective_skips_staple_and_invalid():
    assert effective_meat_veg({"meatVeg": "meat"}) == "meat"
    assert effective_meat_veg({"meatVeg": "staple"}) is None
    assert effective_meat_veg({}) is None
    assert effective_meat_veg({"meatVeg": "other"}) is None


def test_group_excludes_staple():
    rows = [
        {"id": "1", "name": "炒青菜", "meatVeg": "veg", "mainIngredients": ["青菜"]},
        {"id": "2", "name": "红烧肉", "meatVeg": "meat", "mainIngredients": ["猪肉"]},
        {"id": "3", "name": "紫菜蛋汤", "meatVeg": "soup", "mainIngredients": ["紫菜"]},
        {"id": "4", "name": "炒饭", "meatVeg": "staple", "mainIngredients": ["米饭"]},
    ]
    by = group_by_meat_veg(rows)
    assert set(by.keys()) == {"meat", "veg", "soup"}
    assert [r["id"] for r in by["meat"]] == ["2"]
    assert [r["id"] for r in by["veg"]] == ["1"]
    assert [r["id"] for r in by["soup"]] == ["3"]
    assert counts_by_meat_veg(by) == {"meat": 1, "veg": 1, "soup": 1}


def test_summarize_includes_seasonings():
    s = summarize_meat_veg_recipe(
        {
            "id": "x",
            "name": "菜",
            "mainIngredients": ["白菜"],
            "seasonings": ["盐"],
            "meatVeg": "veg",
        }
    )
    assert s == {
        "id": "x",
        "name": "菜",
        "mainIngredients": ["白菜"],
        "seasonings": ["盐"],
        "meatVeg": "veg",
    }


def test_apply_updates_and_rejects_staple_target():
    rows = [
        {"id": "a", "name": "A", "meatVeg": "meat"},
        {"id": "b", "name": "B", "meatVeg": "veg"},
    ]
    updated, missing = apply_meat_veg_changes(rows, {"a": "soup", "z": "veg"})
    assert updated == ["a"]
    assert missing == ["z"]
    assert rows[0]["meatVeg"] == "soup"
    try:
        apply_meat_veg_changes(rows, {"b": "staple"})
        assert False, "expected ValueError"
    except ValueError as e:
        assert "staple" in str(e) or "meatVeg" in str(e).lower()


def test_normalize_ingredient_list():
    assert normalize_ingredient_list([" 鸡 ", "", "鸡", "盐", None]) == ["鸡", "盐"]
    assert normalize_ingredient_list("x") == []
    assert normalize_ingredient_list(None) == []


def test_delete_recipe_by_id():
    rows = [
        {"id": "a", "name": "A", "meatVeg": "meat", "mainIngredients": ["肉"]},
        {"id": "b", "name": "B", "meatVeg": "veg"},
    ]
    removed = delete_recipe_by_id(rows, "a")
    assert removed["id"] == "a" and removed["name"] == "A"
    assert [r["id"] for r in rows] == ["b"]
    assert delete_recipe_by_id(rows, "missing") is None
    try:
        delete_recipe_by_id(rows, "  ")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_apply_recipe_ingredients():
    rows = [
        {
            "id": "a",
            "name": "东北小鸡炖榛蘑",
            "mainIngredients": ["榛蘑"],
            "seasonings": [],
            "meatVeg": "veg",
        }
    ]
    summary = apply_recipe_ingredients(rows, "a", ["榛蘑", "鸡肉", ""], ["姜", "姜"])
    assert summary["mainIngredients"] == ["榛蘑", "鸡肉"]
    assert summary["seasonings"] == ["姜"]
    assert summary["meatVeg"] == "veg"
    assert rows[0]["mainIngredients"] == ["榛蘑", "鸡肉"]
    assert apply_recipe_ingredients(rows, "missing", [], []) is None


def test_ensure_names_in_ingredients_builtin():
    from recipe_meat_veg import ensure_names_in_ingredients_builtin

    builtin = [
        {
            "id": "ing_egg",
            "name": "鸡蛋",
            "category": "蛋奶",
            "kind": "main",
        }
    ]
    added = ensure_names_in_ingredients_builtin(builtin, ["鸡蛋", "白酒", "白酒", "  "])
    assert added == ["白酒"]
    assert any(r["name"] == "白酒" for r in builtin)
    row = next(r for r in builtin if r["name"] == "白酒")
    assert row["id"].startswith("ing_")
    assert row["category"] == "未分类"
    assert row["kind"] == "main"
    assert ensure_names_in_ingredients_builtin(builtin, ["白酒"]) == []


def test_add_to_uncategorized_skips_known():
    doc = {
        "categories": {
            "肉类": {
                "groups": [{"id": "1", "canon": "鸡肉", "aliases": ["童子鸡"]}],
                "ungrouped": ["鸭肉"],
            },
            "未分类": {"groups": [], "ungrouped": []},
        }
    }
    known = editor_known_names(doc)
    assert "鸡肉" in known and "童子鸡" in known and "鸭肉" in known
    added = add_to_uncategorized(doc, ["鸡肉", "新东西", "新东西", "  "])
    assert added == ["新东西"]
    assert "新东西" in doc["categories"]["未分类"]["ungrouped"]
    assert add_to_uncategorized(doc, ["新东西"]) == []


def test_ingredient_suggest_names_union():
    names = ingredient_suggest_names(
        {"categories": {"蔬菜": ["青菜", "土豆"]}},
        {"categories": {"未分类": {"groups": [], "ungrouped": ["神秘料"]}}},
    )
    assert names == ["土豆", "神秘料", "青菜"]
