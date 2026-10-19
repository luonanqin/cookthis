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
    assert aliases["鸡爪"] == ["鸡脚", "凤爪"]
    assert aliases["番茄"] == ["西红柿"]


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

