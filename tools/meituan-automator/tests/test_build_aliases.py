"""build_aliases：alias-info + ingredients-all 同义 − reject → aliases.json"""

from __future__ import annotations

import json
from pathlib import Path

from build_aliases import (
    build_aliases_doc,
    parse_alias_info,
    synonym_groups_from_all,
    write_aliases_json,
)


def test_parse_alias_info_skips_sections_and_splits(tmp_path: Path):
    p = tmp_path / "alias-info.txt"
    p.write_text(
        "三文鱼：鲑鱼、大马哈鱼\n"
        "肉禽内脏\n"
        "鸡爪：凤爪、鸡脚\n"
        "\n"
        "# 注释\n",
        encoding="utf-8",
    )
    pairs = parse_alias_info(p)
    assert ("三文鱼", "鲑鱼") in pairs
    assert ("三文鱼", "大马哈鱼") in pairs
    assert ("鸡爪", "凤爪") in pairs
    assert not any(a == "肉禽内脏" or b == "肉禽内脏" for a, b in pairs)


def test_synonym_groups_size_prefix_within_category():
    all_doc = {
        "categories": {
            "荤菜": ["公鸡", "大公鸡", "猪肉"],
            "素菜": ["青椒", "大青椒", "萝卜"],
        }
    }
    groups = synonym_groups_from_all(all_doc)
    flat = {frozenset(g) for g in groups}
    assert frozenset({"公鸡", "大公鸡"}) in flat
    assert frozenset({"青椒", "大青椒"}) in flat
    # 跨类不连
    assert not any("猪肉" in g and "青椒" in g for g in groups)


def test_build_merges_info_and_synonyms_drops_reject(tmp_path: Path):
    catalog = tmp_path / "catalog"
    catalog.mkdir()
    (catalog / "alias-info.txt").write_text(
        "黄鱼：黄花鱼\n鸡爪：凤爪\n",
        encoding="utf-8",
    )
    (catalog / "ingredients-all.json").write_text(
        json.dumps(
            {
                "categories": {
                    "海鲜水产": ["黄鱼", "大黄鱼", "小黄鱼", "带鱼"],
                    "荤菜": ["鸡爪", "鸡脚"],
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    review = catalog / "review"
    review.mkdir()
    (review / "reject.txt").write_text("大黄鱼\n", encoding="utf-8")

    doc = build_aliases_doc(catalog)
    assert "_meta" in doc
    # 大黄鱼被 reject，不应出现在键或值里
    for k, als in doc.items():
        if k == "_meta":
            continue
        assert k != "大黄鱼"
        assert "大黄鱼" not in als
    # 黄鱼族：黄花鱼（info）+ 小黄鱼（同义）
    host = "黄鱼" if "黄鱼" in doc else next(
        k for k, als in doc.items() if k != "_meta" and ("黄鱼" in als or "小黄鱼" in als)
    )
    bucket = {host, *doc[host]}
    assert "黄花鱼" in bucket
    assert "小黄鱼" in bucket
    assert "大黄鱼" not in bucket
    # info 鸡爪
    assert "鸡爪" in doc or any("鸡爪" in v for k, v in doc.items() if k != "_meta")


def test_write_aliases_json_roundtrip(tmp_path: Path):
    out = tmp_path / "aliases.json"
    doc = {
        "_meta": {"note": "t"},
        "鸡爪": ["凤爪", "鸡脚"],
    }
    write_aliases_json(out, doc)
    loaded = json.loads(out.read_text(encoding="utf-8"))
    assert loaded["鸡爪"] == ["凤爪", "鸡脚"]
    # 同义数组尽量一行
    text = out.read_text(encoding="utf-8")
    assert '"鸡爪": ["凤爪", "鸡脚"]' in text or '"鸡爪": ["凤爪", "鸡脚"]' in text.replace(
        ", ", ","
    )
