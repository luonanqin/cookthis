from avoid_tags import (
    canons_for_category,
    add_member,
    remove_member,
    export_avoid_tags,
    bootstrap_from_builtin,
    AVOID_VOCAB,
)


def test_vocab_six():
    assert [x["id"] for x in AVOID_VOCAB] == [
        "pork", "seafood", "offal", "coriander", "peanut", "dairy"
    ]


def test_canons_for_category():
    editor = {
        "categories": {
            "肉类": {
                "groups": [
                    {"id": "g1", "canon": "猪肉", "aliases": ["精肉"]},
                    {"id": "g2", "canon": "五花肉", "aliases": []},
                ],
                "ungrouped": ["里脊"],
            }
        }
    }
    assert canons_for_category(editor, "肉类") == ["猪肉", "五花肉", "里脊"]


def test_add_remove_member():
    m = {}
    add_member(m, "pork", "五花肉")
    add_member(m, "pork", "五花肉")
    assert m["pork"] == ["五花肉"]
    remove_member(m, "pork", "五花肉")
    assert m["pork"] == []


def test_export_tags_alias_surfaces_and_full_recompute():
    aliases = {"猪肉": ["精肉"]}
    avoid_members = {"pork": ["猪肉"], "seafood": []}
    builtin = [
        {"name": "猪肉", "avoidTags": ["lamb"]},
        {"name": "精肉", "avoidTags": []},
        {"name": "带鱼", "avoidTags": ["seafood"]},
    ]
    out, report = export_avoid_tags(builtin, avoid_members, aliases)
    by = {x["name"]: x["avoidTags"] for x in out}
    assert by["猪肉"] == ["pork"]
    assert by["精肉"] == ["pork"]
    assert by["带鱼"] == []  # 全量重算：底稿无 seafood 成员则清空
    assert "带鱼" not in (report.get("missingInBuiltin") or [])


def test_bootstrap_from_builtin():
    aliases = {"鸡爪": ["鸡脚"]}
    builtin = [
        {"name": "五花肉", "avoidTags": ["pork"]},
        {"name": "鸡脚", "avoidTags": ["pork"]},
        {"name": "带鱼", "avoidTags": ["seafood", "lamb"]},
    ]
    m = bootstrap_from_builtin(builtin, aliases)
    assert "五花肉" in m["pork"]
    assert "鸡爪" in m["pork"]  # 表面名归到 canon
    assert "带鱼" in m["seafood"]
    assert "lamb" not in m
