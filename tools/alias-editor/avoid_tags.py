"""忌口 avoidTags 纯函数：词表、池、成员、从 builtin 灌入、导出。"""

from __future__ import annotations

from typing import Any

# 与 miniprogram/pages/mine/mine.js AVOID_OPTIONS 一致（不含 lamb/other）
AVOID_VOCAB = [
    {"id": "pork", "label": "猪肉类"},
    {"id": "seafood", "label": "海鲜"},
    {"id": "offal", "label": "内脏"},
    {"id": "coriander", "label": "香菜"},
    {"id": "peanut", "label": "花生"},
    {"id": "dairy", "label": "乳制品"},
]

AVOID_IDS = {x["id"] for x in AVOID_VOCAB}


def ensure_avoid_fields(major_minor: dict) -> dict:
    """若缺则写入空 avoidVocab / avoidMembers；原地改并返回同一 dict。"""
    if not isinstance(major_minor.get("avoidVocab"), list) or not major_minor["avoidVocab"]:
        major_minor["avoidVocab"] = [dict(x) for x in AVOID_VOCAB]
    if not isinstance(major_minor.get("avoidMembers"), dict):
        major_minor["avoidMembers"] = {x["id"]: [] for x in AVOID_VOCAB}
    else:
        for x in AVOID_VOCAB:
            major_minor["avoidMembers"].setdefault(x["id"], [])
    return major_minor


def canons_for_category(editor_doc: dict, category: str) -> list[str]:
    """该品类 groups 的 canon + ungrouped（去重保序）。"""
    cats = (editor_doc or {}).get("categories") or {}
    bucket = cats.get(category) or {}
    out: list[str] = []
    seen: set[str] = set()
    for g in bucket.get("groups") or []:
        c = str((g or {}).get("canon") or "").strip()
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    for n in bucket.get("ungrouped") or []:
        s = str(n or "").strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def add_member(avoid_members: dict, code: str, name: str) -> dict:
    """幂等 append；原地改 avoid_members。"""
    name = str(name or "").strip()
    if not name or code not in AVOID_IDS:
        return avoid_members
    lst = avoid_members.setdefault(code, [])
    if name not in lst:
        lst.append(name)
    return avoid_members


def remove_member(avoid_members: dict, code: str, name: str) -> dict:
    name = str(name or "").strip()
    lst = avoid_members.get(code)
    if not isinstance(lst, list) or not name:
        return avoid_members
    avoid_members[code] = [x for x in lst if x != name]
    return avoid_members


def _alias_surface_to_canon(aliases: dict) -> dict[str, str]:
    """表面名 → canon（含 canon 自身）。"""
    m: dict[str, str] = {}
    for canon, vals in (aliases or {}).items():
        c = str(canon or "").strip()
        if not c:
            continue
        m[c] = c
        for a in vals or []:
            s = str(a or "").strip()
            if s:
                m[s] = c
    return m


def canonical_of(surface: str, aliases: dict) -> str:
    """若 surface 是某键或出现在某键的 list 中 → 返回该键，否则 surface。"""
    s = str(surface or "").strip()
    if not s:
        return s
    return _alias_surface_to_canon(aliases).get(s, s)


def bootstrap_from_builtin(builtin_list: list, aliases: dict) -> dict[str, list[str]]:
    """
    对每个 builtin 条目的每个 tag∈六码，把 canonical 名加入对应 list（去重）。
    忽略 lamb 等词表外 tag。
    """
    members: dict[str, list[str]] = {x["id"]: [] for x in AVOID_VOCAB}
    for row in builtin_list or []:
        name = str((row or {}).get("name") or "").strip()
        if not name:
            continue
        tags = (row or {}).get("avoidTags") or []
        if not isinstance(tags, list):
            continue
        canon = canonical_of(name, aliases)
        for tag in tags:
            t = str(tag or "").strip()
            if t in AVOID_IDS:
                add_member(members, t, canon)
    return members


def export_avoid_tags(
    builtin_list: list, avoid_members: dict, aliases: dict
) -> tuple[list, dict[str, Any]]:
    """
    全量重算每条 builtin 的 avoidTags（含别名表面名）。
    返回 (new_list, report) report: updated, cleared, missingInBuiltin
    """
    surface_to_codes: dict[str, set[str]] = {}
    all_canons: list[str] = []
    for code in AVOID_IDS:
        for canon in (avoid_members or {}).get(code) or []:
            n = str(canon or "").strip()
            if not n:
                continue
            all_canons.append(n)
            surfaces = {n}
            for a in (aliases or {}).get(n) or []:
                s = str(a or "").strip()
                if s:
                    surfaces.add(s)
            for s in surfaces:
                surface_to_codes.setdefault(s, set()).add(code)

    # builtin 中出现的表面名（用于 missing）
    hit_surfaces: set[str] = set()
    new_list: list = []
    updated = 0
    cleared = 0
    for row in builtin_list or []:
        item = dict(row or {})
        name = str(item.get("name") or "").strip()
        if name:
            hit_surfaces.add(name)
        old = item.get("avoidTags") or []
        if not isinstance(old, list):
            old = []
        old_norm = [str(x) for x in old]
        codes = sorted(surface_to_codes.get(name) or [])
        if codes != old_norm:
            updated += 1
            if old_norm and not codes:
                cleared += 1
        item["avoidTags"] = codes
        new_list.append(item)

    # missing：底稿 canon 在 builtin 任何 name 或别名表面都未命中
    missing: list[str] = []
    seen_miss: set[str] = set()
    for canon in all_canons:
        if canon in seen_miss:
            continue
        surfaces = {canon}
        for a in (aliases or {}).get(canon) or []:
            s = str(a or "").strip()
            if s:
                surfaces.add(s)
        if surfaces.isdisjoint(hit_surfaces):
            missing.append(canon)
            seen_miss.add(canon)

    report = {
        "updated": updated,
        "cleared": cleared,
        "missingInBuiltin": missing,
    }
    return new_list, report
