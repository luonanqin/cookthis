"""忌口 avoidTags 纯函数：词表、池、成员、从 builtin 灌入、导出。"""

from __future__ import annotations

import re
from typing import Any

# 空文件种子；与 miniprogram/pages/mine/mine.js AVOID_OPTIONS 一致（不含 lamb/other）
AVOID_VOCAB = [
    {"id": "pork", "label": "猪肉类"},
    {"id": "seafood", "label": "海鲜"},
    {"id": "offal", "label": "内脏"},
    {"id": "coriander", "label": "香菜"},
    {"id": "peanut", "label": "花生"},
    {"id": "dairy", "label": "乳制品"},
]

AVOID_IDS = {x["id"] for x in AVOID_VOCAB}

_G_ID = re.compile(r"^g(\d+)$")


def vocab_ids(vocab: list) -> set[str]:
    return {str(x.get("id") or "") for x in (vocab or []) if x.get("id")}


def next_g_id(vocab: list) -> str:
    nmax = 0
    for x in vocab or []:
        m = _G_ID.match(str(x.get("id") or ""))
        if m:
            nmax = max(nmax, int(m.group(1)))
    return f"g{nmax + 1}"


def add_avoid_group(
    vocab: list, members: dict, label: str
) -> tuple[list, dict, str]:
    label = str(label or "").strip()
    if not label:
        raise ValueError("label required")
    vocab = [dict(x) for x in (vocab or [])]
    members = {k: list(v) for k, v in (members or {}).items()}
    if any(str(x.get("label") or "") == label for x in vocab):
        raise ValueError("duplicate label")
    nid = next_g_id(vocab)
    vocab.append({"id": nid, "label": label})
    members.setdefault(nid, [])
    return vocab, members, nid


def remove_avoid_group(vocab: list, members: dict, code: str) -> tuple[list, dict]:
    code = str(code or "").strip()
    vocab = [dict(x) for x in (vocab or [])]
    members = {k: list(v) for k, v in (members or {}).items()}
    if not any(x.get("id") == code for x in vocab):
        raise KeyError(code)
    vocab = [x for x in vocab if x.get("id") != code]
    members.pop(code, None)
    return vocab, members


def ensure_avoid_fields(major_minor: dict) -> dict:
    """若缺则写入空 avoidVocab / avoidMembers；原地改并返回同一 dict。"""
    if not isinstance(major_minor.get("avoidVocab"), list) or not major_minor["avoidVocab"]:
        major_minor["avoidVocab"] = [dict(x) for x in AVOID_VOCAB]
    if not isinstance(major_minor.get("avoidMembers"), dict):
        major_minor["avoidMembers"] = {
            str(x["id"]): [] for x in major_minor["avoidVocab"] if x.get("id")
        }
    else:
        for x in major_minor["avoidVocab"]:
            i = x.get("id")
            if i:
                major_minor["avoidMembers"].setdefault(str(i), [])
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


def add_member(
    avoid_members: dict,
    code: str,
    name: str,
    *,
    allowed_ids: set[str] | None = None,
) -> dict:
    """幂等 append；原地改 avoid_members。"""
    ids = allowed_ids if allowed_ids is not None else AVOID_IDS
    name = str(name or "").strip()
    code = str(code or "").strip()
    if not name or code not in ids:
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


def _resolve_ids(vocab: list | None) -> set[str]:
    if vocab is not None:
        return vocab_ids(vocab)
    return set(AVOID_IDS)


def bootstrap_from_builtin(
    builtin_list: list, aliases: dict, vocab: list | None = None
) -> dict[str, list[str]]:
    """
    对每个 builtin 条目的每个 tag∈词表，把 canonical 名加入对应 list（去重）。
    忽略词表外 tag（如 lamb）。
    """
    ids = _resolve_ids(vocab)
    members: dict[str, list[str]] = {i: [] for i in ids}
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
            if t in ids:
                add_member(members, t, canon, allowed_ids=ids)
    return members


def export_avoid_tags(
    builtin_list: list,
    avoid_members: dict,
    aliases: dict,
    vocab: list | None = None,
) -> tuple[list, dict[str, Any]]:
    """
    全量重算每条 builtin 的 avoidTags（含别名表面名）。
    返回 (new_list, report) report: updated, cleared, missingInBuiltin
    """
    ids = _resolve_ids(vocab)
    surface_to_codes: dict[str, set[str]] = {}
    all_canons: list[str] = []
    for code in ids:
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
