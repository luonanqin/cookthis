import json
from pathlib import Path

import pytest

from build_ingredient_catalog import (
    city_shelf_from_cleaned,
    map_builtin_category,
    merge_all,
)


def test_city_shelf_shape():
    cleaned = {"city": "重庆", "荤菜": ["鸡脚"], "素菜": ["折耳根"], "_meta": {"kept": 2}}
    shelf = city_shelf_from_cleaned(cleaned)
    assert shelf["city"] == "重庆"
    assert shelf["categories"]["荤菜"] == ["鸡脚"]


def test_merge_union_and_builtin():
    shelves = [
        {"city": "重庆", "categories": {"荤菜": ["鸡脚"]}, "_meta": {}},
        {"city": "天津", "categories": {"荤菜": ["鸡爪"]}, "_meta": {}},
    ]
    builtin = [{"name": "猪肉", "category": "meat"}]
    mapping = {"meat": "荤菜"}
    all_ = merge_all(shelves, builtin, mapping)
    assert set(all_["categories"]["荤菜"]) == {"鸡脚", "鸡爪", "猪肉"}


def test_map_builtin_category_defaults_unmapped():
    assert map_builtin_category("meat", {"meat": "荤菜"}) == "荤菜"
    assert map_builtin_category("seasoning", {"meat": "荤菜"}) == "未映射"
    assert map_builtin_category("unknown", {}) == "未映射"


def test_city_shelf_keeps_meta_and_other_cats():
    cleaned = {"city": "重庆", "荤菜": ["鸡脚"], "素菜": ["折耳根"], "_meta": {"kept": 2}}
    shelf = city_shelf_from_cleaned(cleaned)
    assert shelf["categories"]["素菜"] == ["折耳根"]
    assert shelf["_meta"] == {"kept": 2}


def test_merge_all_sorted_unique_and_unmapped():
    shelves = [
        {"city": "重庆", "categories": {"荤菜": ["猪肉", "鸡脚"]}, "_meta": {}},
        {"city": "天津", "categories": {"荤菜": ["猪肉"]}, "_meta": {}},
    ]
    builtin = [
        {"name": "盐", "category": "seasoning"},
        {"name": "鸡蛋", "category": "egg_dairy"},
    ]
    mapping = {"egg_dairy": "荤菜"}
    all_ = merge_all(shelves, builtin, mapping)
    assert all_["categories"]["荤菜"] == ["猪肉", "鸡脚", "鸡蛋"]
    assert all_["categories"]["未映射"] == ["盐"]
    assert "_meta" in all_


def test_cli_writes_city_and_all(tmp_path: Path):
    inbox = tmp_path / "inbox"
    city_dir = inbox / "重庆"
    city_dir.mkdir(parents=True)
    (city_dir / "ingredients-cleaned.json").write_text(
        json.dumps(
            {"city": "重庆", "荤菜": ["鸡脚"], "素菜": ["折耳根"], "_meta": {"kept": 2}},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    catalog = tmp_path / "catalog"
    catalog.mkdir()
    (catalog / "builtin-to-meituan-category.json").write_text(
        json.dumps({"meat": "荤菜"}),
        encoding="utf-8",
    )
    (catalog / "ingredients-builtin.jsonl").write_text(
        json.dumps({"name": "猪肉", "category": "meat"}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    from build_ingredient_catalog import main

    main(inbox=inbox, catalog_root=catalog)

    shelf = json.loads((catalog / "cities" / "重庆" / "ingredients.json").read_text(encoding="utf-8"))
    assert shelf["city"] == "重庆"
    assert shelf["categories"]["荤菜"] == ["鸡脚"]
    all_ = json.loads((catalog / "ingredients-all.json").read_text(encoding="utf-8"))
    assert set(all_["categories"]["荤菜"]) == {"鸡脚", "猪肉"}
    assert set(all_["categories"]["素菜"]) == {"折耳根"}


def test_cli_missing_builtin_jsonl_exits_nonzero(tmp_path: Path, capsys):
    inbox = tmp_path / "inbox"
    city_dir = inbox / "重庆"
    city_dir.mkdir(parents=True)
    (city_dir / "ingredients-cleaned.json").write_text(
        json.dumps(
            {"city": "重庆", "荤菜": ["鸡脚"], "_meta": {"kept": 1}},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    catalog = tmp_path / "catalog"
    catalog.mkdir()
    (catalog / "builtin-to-meituan-category.json").write_text(
        json.dumps({"meat": "荤菜"}),
        encoding="utf-8",
    )

    from build_ingredient_catalog import main

    with pytest.raises(SystemExit) as ei:
        main(inbox=inbox, catalog_root=catalog)
    assert ei.value.code not in (0, None)
    captured = capsys.readouterr()
    assert "ingredients-builtin.jsonl" in captured.out + captured.err
    assert not (catalog / "ingredients-all.json").exists()
