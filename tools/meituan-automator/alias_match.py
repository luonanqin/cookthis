"""Expand city shelf names once via aliases, then test recipe ⊆ expanded shelf."""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path


def load_aliases(path: Path) -> dict[str, list[str]]:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    return {
        str(k): list(v)
        for k, v in data.items()
        if not str(k).startswith("_") and isinstance(v, list)
    }


def build_equivalence(aliases: dict[str, list[str]]) -> dict[str, frozenset[str]]:
    equiv: dict[str, frozenset[str]] = {}
    for canonical, alias_list in aliases.items():
        group = frozenset({canonical, *alias_list})
        equiv[canonical] = group
        for alias in alias_list:
            equiv[alias] = group
    return equiv


def expand_shelf(
    shelf_names: Iterable[str],
    equiv: dict[str, frozenset[str]],
) -> set[str]:
    expanded: set[str] = set()
    for name in shelf_names:
        group = equiv.get(name)
        if group is None:
            expanded.add(name)
        else:
            expanded |= set(group)
    return expanded


def recipe_covered(
    recipe_ingredients: Iterable[str],
    expanded_shelf: set[str],
) -> bool:
    return set(recipe_ingredients) <= expanded_shelf
