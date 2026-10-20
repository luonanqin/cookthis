#!/usr/bin/env python3
"""
导出城市货架并合并全量食材：

读取 screenshots_inbox/{城}/ingredients-cleaned.json，
写出 data/catalog/cities/{城}/ingredients.json，
再与 ingredients-builtin.jsonl（经 builtin-to-meituan-category.json）
合并为 data/catalog/ingredients-all.json。

用法：
  .venv/bin/python build_ingredient_catalog.py
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

INBOX = Path(__file__).resolve().parent / "screenshots_inbox"
CATALOG = Path(__file__).resolve().parents[2] / "data" / "catalog"
CLEANED_NAME = "ingredients-cleaned.json"
SHELF_NAME = "ingredients.json"
ALL_NAME = "ingredients-all.json"
MAPPING_NAME = "builtin-to-meituan-category.json"
BUILTIN_JSONL = "ingredients-builtin.jsonl"
UNMAPPED = "未映射"

# 清洗产物里出现的中文类名
MEITUAN_CATS = ("海鲜水产", "火锅食材", "素菜", "荤菜", "豆制品")


def map_builtin_category(cat: str, mapping: dict[str, str]) -> str:
    return mapping.get(cat, UNMAPPED)


def city_shelf_from_cleaned(cleaned: dict) -> dict:
    categories: dict[str, list] = {}
    for key, value in cleaned.items():
        if key in ("city", "_meta"):
            continue
        categories[key] = list(value)
    return {
        "city": cleaned.get("city"),
        "categories": categories,
        "_meta": dict(cleaned.get("_meta") or {}),
    }


def merge_all(
    city_shelves: list[dict],
    builtin_rows: list[dict],
    mapping: dict,
) -> dict:
    by_cat: dict[str, set[str]] = defaultdict(set)
    cities: list[str] = []
    for shelf in city_shelves:
        city = shelf.get("city")
        if city:
            cities.append(str(city))
        for cat, names in (shelf.get("categories") or {}).items():
            by_cat[cat].update(names)
    for row in builtin_rows:
        name = row.get("name")
        if not name:
            continue
        cat = map_builtin_category(row.get("category") or "", mapping)
        by_cat[cat].add(name)
    categories = {cat: sorted(names) for cat, names in sorted(by_cat.items())}
    return {
        "categories": categories,
        "_meta": {
            "sources": ["cities/*", "ingredients-builtin.jsonl"],
            "cities": cities,
            "note": "按类合并去重；同一字符串可出现在多类（暂不强制一类一物）",
        },
    }


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.is_file():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def load_mapping(path: Path) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def build_catalog(inbox: Path, catalog_root: Path) -> dict:
    builtin_path = catalog_root / BUILTIN_JSONL
    if not builtin_path.is_file():
        print(f"缺少内置食材源：{builtin_path}")
        raise SystemExit(1)
    mapping = load_mapping(catalog_root / MAPPING_NAME)
    builtin_rows = load_jsonl(builtin_path)
    shelves: list[dict] = []
    for city_dir in sorted(p for p in inbox.iterdir() if p.is_dir()):
        cleaned_path = city_dir / CLEANED_NAME
        if not cleaned_path.is_file():
            continue
        cleaned = json.loads(cleaned_path.read_text(encoding="utf-8"))
        if not cleaned.get("city"):
            cleaned["city"] = city_dir.name
        shelf = city_shelf_from_cleaned(cleaned)
        _dump(catalog_root / "cities" / shelf["city"] / SHELF_NAME, shelf)
        counts = {k: len(v) for k, v in shelf["categories"].items()}
        print(f"{shelf['city']}: {counts}  → cities/{shelf['city']}/{SHELF_NAME}")
        shelves.append(shelf)
    all_ = merge_all(shelves, builtin_rows, mapping)
    _dump(catalog_root / ALL_NAME, all_)
    total = sum(len(v) for v in all_["categories"].values())
    print(f"all: { {k: len(v) for k, v in all_['categories'].items()} }  unique_sum={total}")
    return all_


def main(inbox: Path | None = None, catalog_root: Path | None = None) -> None:
    if inbox is None or catalog_root is None:
        ap = argparse.ArgumentParser(
            description="导出 screenshots_inbox/*/ingredients-cleaned.json → 城货架 + 全量"
        )
        ap.add_argument("--inbox", type=Path, default=INBOX)
        ap.add_argument("--catalog-root", type=Path, default=CATALOG)
        ap.add_argument(
            "--pending-min-len",
            type=int,
            default=None,
            help="刷新 pending 最短字数（默认 pending_review.DEFAULT_MIN_LEN）",
        )
        ap.add_argument(
            "--pending-max-len",
            type=int,
            default=None,
            help="刷新 pending 最长字数（含）",
        )
        args = ap.parse_args()
        inbox = inbox or args.inbox
        catalog_root = catalog_root or args.catalog_root
        pending_min_len = args.pending_min_len
        pending_max_len = args.pending_max_len
    else:
        pending_min_len = None
        pending_max_len = None
    assert inbox is not None and catalog_root is not None
    if not inbox.is_dir():
        print(f"无目录：{inbox}")
        raise SystemExit(1)
    build_catalog(inbox, catalog_root)
    from pending_review import DEFAULT_MIN_LEN, write_pending

    n_pending = write_pending(
        inbox,
        review_dir=catalog_root / "review",
        catalog=catalog_root,
        min_len=pending_min_len if pending_min_len is not None else DEFAULT_MIN_LEN,
        max_len=pending_max_len,
    )
    print(f"review/pending.txt: {n_pending} 条待人工处理")


if __name__ == "__main__":
    main()
