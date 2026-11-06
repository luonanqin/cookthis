from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from recipe_difficulty import (  # noqa: E402
    apply_difficulty_changes,
    effective_difficulty,
    group_by_difficulty,
    summarize_difficulty_recipe,
)


def test_effective_difficulty_defaults_missing_to_home():
    assert effective_difficulty({}) == "home"
    assert effective_difficulty({"difficulty": "nope"}) == "home"
    assert effective_difficulty({"difficulty": "advanced"}) == "advanced"


def test_group_by_difficulty_buckets_and_sorts():
    rows = [
        {"id": "2", "name": "红烧肉", "difficulty": "advanced", "mainIngredients": ["猪肉"]},
        {"id": "1", "name": "炒青菜", "difficulty": "easy", "mainIngredients": ["青菜"]},
        {"id": "3", "name": "番茄炒蛋", "mainIngredients": ["番茄", "鸡蛋"]},  # missing → home
    ]
    by = group_by_difficulty(rows)
    assert set(by.keys()) == {"easy", "home", "advanced"}
    assert [r["id"] for r in by["easy"]] == ["1"]
    assert [r["id"] for r in by["home"]] == ["3"]
    assert [r["id"] for r in by["advanced"]] == ["2"]
    assert by["home"][0]["mainIngredients"] == ["番茄", "鸡蛋"]


def test_apply_difficulty_changes_updates_and_reports_missing():
    rows = [
        {"id": "a", "name": "A", "difficulty": "easy"},
        {"id": "b", "name": "B", "difficulty": "home"},
    ]
    updated, missing = apply_difficulty_changes(
        rows, {"a": "advanced", "ghost": "easy"}
    )
    assert updated == ["a"]
    assert missing == ["ghost"]
    assert rows[0]["difficulty"] == "advanced"
    assert rows[1]["difficulty"] == "home"


def test_apply_difficulty_changes_rejects_bad_enum():
    rows = [{"id": "a", "difficulty": "easy"}]
    try:
        apply_difficulty_changes(rows, {"a": "hard"})
        assert False, "expected ValueError"
    except ValueError as e:
        assert "hard" in str(e) or "difficulty" in str(e).lower()


def test_summarize_shape():
    s = summarize_difficulty_recipe(
        {"id": "x", "name": "菜", "mainIngredients": ["白菜"], "difficulty": "easy", "cities": []}
    )
    assert s == {
        "id": "x",
        "name": "菜",
        "mainIngredients": ["白菜"],
        "difficulty": "easy",
    }
