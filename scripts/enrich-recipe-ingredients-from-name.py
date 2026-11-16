#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""根据菜名补全 recipes-builtin 明显缺失的食材；新名写入 ingredients-all 未映射 + 编辑器未分类。"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from enrichRecipeIngredientsFromName import (  # noqa: E402
    CATALOG,
    build_equiv,
    collect_vocab,
    enrich_recipes,
    ensure_in_editor_uncategorized,
    ensure_in_ingredients_all,
    load_json,
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="写回文件（默认只 dry-run）")
    ap.add_argument("--limit", type=int, default=0, help="最多打印变更条数，0=全部")
    args = ap.parse_args()

    recipes_path = CATALOG / "recipes-builtin.json"
    all_path = CATALOG / "ingredients-all.json"
    by_path = CATALOG / "ingredients-all-by-category.json"
    aliases_path = CATALOG / "aliases.json"
    editor_path = CATALOG / "aliases-editor.json"

    recipes = load_json(recipes_path)
    ingredients_all = load_json(all_path)
    by_cat = load_json(by_path)
    aliases = load_json(aliases_path)
    editor = load_json(editor_path)

    # 已在 ingredients-all 的名字
    in_all: set[str] = set()
    for arr in (ingredients_all.get("categories") or {}).values():
        in_all.update(str(x) for x in (arr or []))

    vocab, seasoning = collect_vocab(ingredients_all, by_cat, aliases, editor)
    equiv = build_equiv(aliases)
    # 也把 by-cat / editor 名并入 aliases 组外单点
    recipes, changes, _ = enrich_recipes(recipes, vocab, seasoning, equiv)

    added_to_recipes: set[str] = set()
    for ch in changes:
        added_to_recipes.update(ch.get("addMain") or [])
        added_to_recipes.update(ch.get("addSeasoning") or [])
    need_all = {n for n in added_to_recipes if n not in in_all}

    print(f"recipes changed: {len(changes)}")
    print(f"unique ingredients appended: {len(added_to_recipes)}")
    print(f"new for ingredients-all/未分类: {len(need_all)}")
    lim = args.limit or len(changes)
    for ch in changes[:lim]:
        bits = []
        if ch["addMain"]:
            bits.append("主料+" + "、".join(ch["addMain"]))
        if ch["addSeasoning"]:
            bits.append("调味+" + "、".join(ch["addSeasoning"]))
        print(f"  {ch['name']}: {'; '.join(bits)}")
    if lim < len(changes):
        print(f"  ... ({len(changes) - lim} more)")

    if not args.apply:
        print("dry-run only; pass --apply to write")
        return 0

    recipes_path.write_text(
        json.dumps(recipes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    added_all = ensure_in_ingredients_all(ingredients_all, need_all)
    all_path.write_text(
        json.dumps(ingredients_all, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    added_ed = ensure_in_editor_uncategorized(editor, need_all)
    editor_path.write_text(
        json.dumps(editor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {recipes_path}")
    print(f"ingredients-all 未映射 +{len(added_all)}: {added_all}")
    print(f"aliases-editor 未分类 +{len(added_ed)}: {added_ed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
