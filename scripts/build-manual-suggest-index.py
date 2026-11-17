#!/usr/bin/env python3
"""Build data/catalog/manual-suggest-index.json from aliases.json.

Each canonical name and each alias becomes one entry:

  { "surface", "canonical", "py", "initials" }

`py` and `initials` are lowercase, tone-free pinyin from pypinyin.
Characters that are not Han are left out of that concatenation.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parents[1]
ALIASES = ROOT / "data" / "catalog" / "aliases.json"
OUT = ROOT / "data" / "catalog" / "manual-suggest-index.json"


def is_han(ch: str) -> bool:
    o = ord(ch)
    return (
        0x3400 <= o <= 0x4DBF
        or 0x4E00 <= o <= 0x9FFF
        or 0xF900 <= o <= 0xFAFF
        or 0x20000 <= o <= 0x2A6DF
        or 0x2A700 <= o <= 0x2B73F
        or 0x2B740 <= o <= 0x2B81F
        or 0x2B820 <= o <= 0x2CEAF
        or 0x2CEB0 <= o <= 0x2EBEF
        or 0x30000 <= o <= 0x3134F
    )


def han_only(text: str) -> str:
    return "".join(ch for ch in text if is_han(ch))


def ascii_syllable(raw: str) -> str:
    s = raw.replace("ü", "v").replace("u:", "v").lower()
    if s.isascii() and s.isalpha():
        return s
    return ""


def pinyin_fields(surface: str) -> tuple[str, str]:
    han = han_only(surface)
    if not han:
        return "", ""
    syllables = lazy_pinyin(
        han,
        style=Style.NORMAL,
        errors="ignore",
        strict=True,
        v_to_u=False,
    )
    parts: list[str] = []
    initials: list[str] = []
    for syl in syllables:
        s = ascii_syllable(syl)
        if not s:
            continue
        parts.append(s)
        initials.append(s[0])
    return "".join(parts), "".join(initials)


def surfaces_for(canon: str, aliases: list) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in [canon, *aliases]:
        if not isinstance(raw, str):
            continue
        surface = raw.strip()
        if not surface or surface in seen:
            continue
        seen.add(surface)
        out.append(surface)
    return out


def build_entries(aliases_obj: dict) -> tuple[list[dict], dict]:
    entries: list[dict] = []
    canon_n = 0
    alias_n = 0
    empty_py: list[str] = []
    non_han_surfaces: list[str] = []

    for canon, aliases in aliases_obj.items():
        if not isinstance(canon, str) or not canon or canon.startswith("_"):
            continue
        if not isinstance(aliases, list):
            continue
        canon_n += 1
        surfaces = surfaces_for(canon, aliases)
        alias_n += max(0, len(surfaces) - 1)
        for surface in surfaces:
            if han_only(surface) != surface:
                non_han_surfaces.append(surface)
            py, initials = pinyin_fields(surface)
            if not py:
                empty_py.append(surface)
            entries.append(
                {
                    "surface": surface,
                    "canonical": canon,
                    "py": py,
                    "initials": initials,
                }
            )

    stats = {
        "canons": canon_n,
        "alias_surfaces": alias_n,
        "surfaces": canon_n + alias_n,
        "entries": len(entries),
        "empty_py": empty_py,
        "non_han_surfaces": non_han_surfaces,
    }
    return entries, stats


def main() -> int:
    aliases_obj = json.loads(ALIASES.read_text(encoding="utf-8"))
    entries, stats = build_entries(aliases_obj)
    doc = {
        "_meta": {
            "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "aliases.json",
            "engine": "pypinyin",
        },
        "entries": entries,
    }
    OUT.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {OUT.relative_to(ROOT)} "
        f"entries={stats['entries']} surfaces={stats['surfaces']} "
        f"canons={stats['canons']} aliases={stats['alias_surfaces']}"
    )
    if stats["non_han_surfaces"]:
        print(
            f"non-han surfaces: {len(stats['non_han_surfaces'])} "
            f"e.g. {stats['non_han_surfaces'][:8]}",
            file=sys.stderr,
        )
    if stats["empty_py"]:
        print(
            f"empty py: {len(stats['empty_py'])} e.g. {stats['empty_py'][:8]}",
            file=sys.stderr,
        )
    if stats["entries"] != stats["surfaces"]:
        print("ERROR: entry count != surface count", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
