from pathlib import Path

from alias_match import (
    build_equivalence,
    expand_shelf,
    load_aliases,
    recipe_covered,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
ALIASES_PATH = REPO_ROOT / "data" / "catalog" / "aliases.json"


def test_load_aliases_seed():
    aliases = load_aliases(ALIASES_PATH)
    assert "鸡脚" in aliases["鸡爪"] and "凤爪" in aliases["鸡爪"]
    assert "西红柿" in aliases["番茄"]
    assert "_meta" not in aliases


def test_catalog_canonicals_in_ingredients_all():
    """每个通用名键应落在全量食材中（别名可超出全量）。"""
    import json

    all_names = {
        x
        for items in json.loads(
            (REPO_ROOT / "data" / "catalog" / "ingredients-all.json").read_text(
                encoding="utf-8"
            )
        )["categories"].values()
        for x in items
    }
    aliases = load_aliases(ALIASES_PATH)
    missing = sorted(k for k in aliases if k not in all_names)
    assert missing == [], f"canonical not in ingredients-all: {missing}"


def test_no_surface_name_collision():
    aliases = load_aliases(ALIASES_PATH)
    owner: dict[str, str] = {}
    for canonical, alias_list in aliases.items():
        for name in {canonical, *alias_list}:
            prev = owner.get(name)
            assert prev is None or prev == canonical, (
                f"{name!r} maps to both {prev!r} and {canonical!r}"
            )
            owner[name] = canonical


def test_expand_chicken_foot():
    aliases = {"鸡爪": ["鸡脚", "凤爪"]}
    equiv = build_equivalence(aliases)
    expanded = expand_shelf(["鸡脚", "折耳根"], equiv)
    assert {"鸡脚", "鸡爪", "凤爪", "折耳根"} <= expanded


def test_recipe_covered_hongshao():
    expanded = {"鸡脚", "鸡爪", "凤爪", "折耳根"}
    assert recipe_covered(["鸡爪"], expanded) is True
    assert recipe_covered(["鸡爪", "土豆"], expanded) is False


def test_expand_tomato_alias():
    aliases = {"番茄": ["西红柿"]}
    equiv = build_equivalence(aliases)
    expanded = expand_shelf(["西红柿"], equiv)
    assert {"番茄", "西红柿"} <= expanded

