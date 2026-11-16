# -*- coding: utf-8 -*-
"""从菜名补全明显缺失的食材（最长匹配 + 别名等价跳过）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "catalog"

# 烹饪动词/结构词：即便在词表里也不当「待补食材」
# 菜名常见但尚未进全量表的词，匹配后写入未映射/未分类
SEED_NEW_TERMS = {
    "豆腐乳",
    "面条鱼",
    "宽粉",
    "蒜苔",
    "菜薹",
    "葱油",
    "麻酱",
}

SKIP_TERMS = {
    "炒",
    "爆",
    "炖",
    "蒸",
    "煮",
    "烧",
    "烤",
    "煎",
    "炸",
    "焗",
    "烩",
    "焖",
    "涮",
    "拌",
    "烙",
    "汆",
    "焯",
    "凉拌",
    "清炒",
    "清蒸",
    "红烧",
    "糖醋",
    "鱼香",
    "宫保",
    "干煸",
    "干锅",
    "水煮",
    "白灼",
    "椒盐",
    "避风塘",
    "小炒",
    "家常",
    "酱爆",
    "葱油",
    "蒜蓉",
    "蒜香",
    "香辣",
    "麻辣",
    "酸辣",
    "海鲜",
    "时蔬",
    "什锦",
    "双椒",
    "三鲜",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_equiv(aliases: dict) -> dict[str, set[str]]:
    equiv: dict[str, set[str]] = {}
    for canon, alist in (aliases or {}).items():
        if not canon or str(canon).startswith("_"):
            continue
        group = {str(canon)} | {str(a) for a in (alist or [])}
        for n in group:
            equiv[n] = group
    return equiv


def collect_vocab(
    ingredients_all: dict, by_cat: dict, aliases: dict, editor: dict | None
) -> tuple[set[str], set[str]]:
    """返回 (全部候选名, 调味名集合)。"""
    names: set[str] = set()
    seasoning: set[str] = set()
    for cat, arr in (ingredients_all.get("categories") or {}).items():
        for n in arr or []:
            n = str(n).strip()
            if n:
                names.add(n)
    for cat, arr in (by_cat.get("categories") or {}).items():
        for n in arr or []:
            n = str(n).strip()
            if not n:
                continue
            names.add(n)
            if cat == "调味":
                seasoning.add(n)
    for canon, alist in (aliases or {}).items():
        if not canon or str(canon).startswith("_"):
            continue
        names.add(str(canon))
        for a in alist or []:
            names.add(str(a))
    if editor:
        for cat, bucket in (editor.get("categories") or {}).items():
            if not isinstance(bucket, dict):
                continue
            for g in bucket.get("groups") or []:
                c = str((g or {}).get("canon") or "").strip()
                if c:
                    names.add(c)
                for a in (g or {}).get("aliases") or []:
                    names.add(str(a).strip())
            for n in bucket.get("ungrouped") or []:
                names.add(str(n).strip())
    names |= {n for n in SEED_NEW_TERMS if n}
    names = {n for n in names if n and len(n) >= 2 and n not in SKIP_TERMS}
    return names, seasoning


# 不宜从菜名直接抠出的歧义词
NEVER_FROM_NAME = {"酱肉"}


def _ok_match_at(title: str, i: int, term: str) -> bool:
    if term in NEVER_FROM_NAME:
        return False
    if i <= 0:
        return True
    prev = title[i - 1]
    # 葱油菜心 / 蚝油菜心 → 不要匹配成油菜心/油菜
    if term in ("油菜心", "油菜") and prev in "葱蚝":
        return False
    # 蒜香油焖… → 不要匹配成香油
    if term == "香油" and prev in "蒜葱":
        return False
    # 麻酱油麦菜 → 不要匹配成酱油
    if term == "酱油" and prev in "麻甜":
        return False
    # 酸辣白菜 → 不要匹配成辣白菜
    if term == "辣白菜" and prev in "酸香":
        return False
    # 酒香草头 → 不要匹配成香草
    if term == "香草" and i + len(term) < len(title) and title[i + len(term)] == "头":
        return False
    if term == "香草" and prev in "酒花":
        return False
    return True


def find_mentions(title: str, vocab: set[str]) -> list[str]:
    """从左到右最长匹配，避免「蚝油菜心」误吃成「油菜心」。"""
    found: list[str] = []
    i = 0
    max_len = max((len(n) for n in vocab), default=0)
    while i < len(title):
        matched = None
        upper = min(max_len, len(title) - i)
        for L in range(upper, 1, -1):
            piece = title[i : i + L]
            if piece in SKIP_TERMS:
                continue
            if piece in vocab and _ok_match_at(title, i, piece):
                matched = piece
                break
        if matched:
            found.append(matched)
            i += len(matched)
        else:
            i += 1
    return found


def covered_by(existing: set[str], term: str, equiv: dict[str, set[str]]) -> bool:
    if term in existing:
        return True
    group = equiv.get(term) or {term}
    return bool(group & existing)


# 菜名里像食材、实为菜式名的误匹配
FALSE_POSITIVE_BY_TITLE = {
    "荔枝肉": {"荔枝"},
}


def enrich_recipes(
    recipes: list[dict],
    vocab: set[str],
    seasoning: set[str],
    equiv: dict[str, set[str]],
) -> tuple[list[dict], list[dict], set[str]]:
    changes: list[dict] = []
    new_names: set[str] = set()

    for r in recipes:
        title = str(r.get("name") or "").strip()
        if not title:
            continue
        mains = [str(x) for x in (r.get("mainIngredients") or []) if str(x).strip()]
        seas = [str(x) for x in (r.get("seasonings") or []) if str(x).strip()]
        existing = set(mains) | set(seas)
        mentions = find_mentions(title, vocab)
        skip_fp = FALSE_POSITIVE_BY_TITLE.get(title) or set()
        add_main: list[str] = []
        add_sea: list[str] = []
        for term in mentions:
            if term in skip_fp:
                continue
            if covered_by(existing, term, equiv):
                continue
            if term in SKIP_TERMS:
                continue
            # 菜名整词等于食材名时，通常已是单食材菜，跳过
            if term == title:
                continue
            if term in seasoning or term in {
                "盐",
                "糖",
                "醋",
                "酱油",
                "料酒",
                "生抽",
                "老抽",
                "蚝油",
                "香油",
                "花椒",
                "孜然",
                "胡椒",
                "辣椒",
                "干辣椒",
                "豆瓣酱",
                "郫县豆瓣",
                "豆豉",
                "蒜",
                "姜",
                "葱",
                "豉油",
                "红酒",
                "蒜泥",
                "酸汤",
            }:
                add_sea.append(term)
            else:
                add_main.append(term)
            existing.add(term)

        if not add_main and not add_sea:
            continue
        # 主料：补在前；调味：补在后（去重保序）
        if add_main:
            r["mainIngredients"] = list(dict.fromkeys(add_main + mains))
        if add_sea:
            r["seasonings"] = list(dict.fromkeys(seas + add_sea))
        for t in add_main + add_sea:
            new_names.add(t)
        changes.append(
            {
                "id": r.get("id"),
                "name": title,
                "addMain": add_main,
                "addSeasoning": add_sea,
            }
        )

    return recipes, changes, new_names


def ensure_in_ingredients_all(doc: dict, names: set[str]) -> list[str]:
    cats = doc.setdefault("categories", {})
    bucket = "未映射"
    arr = list(cats.get(bucket) or [])
    have = set(arr)
    for cat, items in cats.items():
        have.update(str(x) for x in (items or []))
    added = []
    for n in sorted(names):
        if n in have:
            continue
        arr.append(n)
        have.add(n)
        added.append(n)
    cats[bucket] = sorted(set(arr), key=lambda x: (len(x), x))
    # keep stable-ish: actually user may prefer append sorted into 未映射
    cats[bucket] = sorted(arr)
    return added


def ensure_in_editor_uncategorized(editor: dict, names: set[str]) -> list[str]:
    cats = editor.setdefault("categories", {})
    bucket = cats.setdefault("未分类", {"groups": [], "ungrouped": []})
    ungrouped = list(bucket.get("ungrouped") or [])
    have = set()
    for cat, b in cats.items():
        if not isinstance(b, dict):
            continue
        for g in b.get("groups") or []:
            c = str((g or {}).get("canon") or "").strip()
            if c:
                have.add(c)
            for a in (g or {}).get("aliases") or []:
                have.add(str(a).strip())
        for n in b.get("ungrouped") or []:
            have.add(str(n).strip())
    added = []
    for n in sorted(names):
        if n in have:
            continue
        ungrouped.append(n)
        have.add(n)
        added.append(n)
    bucket["ungrouped"] = sorted(set(ungrouped))
    return added
