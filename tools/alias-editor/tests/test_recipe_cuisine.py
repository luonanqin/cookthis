from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from recipe_cuisine import (  # noqa: E402
    apply_cuisine_changes,
    group_by_cuisine,
    normalize_cuisine_tags,
)


def test_normalize_drops_unknown_and_dedupes():
    assert normalize_cuisine_tags(["sichuan", "foo", "sichuan", "hunan"]) == [
        "sichuan",
        "hunan",
    ]


def test_normalize_home_style_alone():
    assert normalize_cuisine_tags(["sichuan", "home_style"]) == ["home_style"]


def test_normalize_too_many_regionals_become_common():
    tags = ["sichuan", "cantonese", "hunan", "anhui", "beijing", "shanghai"]
    assert len(tags) > 5
    assert normalize_cuisine_tags(tags) == ["home_style"]


def test_group_unlabeled_and_multi():
    rows = [
        {"id": "1", "name": "青椒土豆丝", "cuisineTags": []},
        {"id": "2", "name": "宫保鸡丁", "cuisineTags": ["sichuan", "home_style"]},
        {"id": "3", "name": "白切鸡", "cuisineTags": ["cantonese"]},
        {
            "id": "4",
            "name": "乱炖",
            "cuisineTags": [
                "sichuan",
                "cantonese",
                "hunan",
                "anhui",
                "beijing",
                "shanghai",
            ],
        },
    ]
    by = group_by_cuisine(rows)
    assert [r["id"] for r in by["unlabeled"]] == ["1"]
    assert by["sichuan"] == []
    assert {r["id"] for r in by["home_style"]} == {"2", "4"}
    assert {r["id"] for r in by["cantonese"]} == {"3"}


def test_apply_cuisine_changes():
    rows = [
        {"id": "a", "name": "A", "cuisineTags": []},
        {"id": "b", "name": "B", "cuisineTags": ["sichuan"]},
    ]
    updated, missing = apply_cuisine_changes(
        rows, {"a": ["home_style"], "ghost": ["hunan"]}
    )
    assert updated == ["a"]
    assert missing == ["ghost"]
    assert rows[0]["cuisineTags"] == ["home_style"]
