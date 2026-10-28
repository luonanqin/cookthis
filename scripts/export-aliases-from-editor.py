#!/usr/bin/env python3
"""把 aliases-editor.json 压成 data/catalog/aliases.json（通用名 → 别名[]）。

之后请再跑：
  node scripts/sync-alias-runtime-data.js

云函数实际上传的是同步后的：
  cloudfunctions/recommend/data/aliases.json
（随 recommend 云函数一起部署）
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDITOR = ROOT / "data" / "catalog" / "aliases-editor.json"
ALIASES = ROOT / "data" / "catalog" / "aliases.json"


def main() -> int:
    editor = json.loads(EDITOR.read_text(encoding="utf-8"))
    out = {
        "_meta": {
            "note": "键=通用名；值=同物异名。由 aliases-editor.json 导回。",
            "sources": ["aliases-editor.json"],
        }
    }
    seen: dict[str, str] = {}
    dups = []
    groups_n = solo = 0

    for block in (editor.get("categories") or {}).values():
        for g in block.get("groups") or []:
            canon = (g.get("canon") or "").strip()
            aliases = [
                a.strip()
                for a in (g.get("aliases") or [])
                if isinstance(a, str) and a.strip()
            ]
            if not canon:
                continue
            groups_n += 1
            for m in [canon, *aliases]:
                if m in seen and seen[m] != canon:
                    dups.append((m, seen[m], canon))
                seen[m] = canon
            if not aliases:
                solo += 1
                continue
            uniq, have = [], {canon}
            for a in aliases:
                if a not in have:
                    uniq.append(a)
                    have.add(a)
            if uniq:
                out[canon] = uniq

    if dups:
        print(f"ERROR: {len(dups)} surfaces in multiple groups, e.g. {dups[:5]}", file=sys.stderr)
        return 1

    ALIASES.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    n = len([k for k in out if not k.startswith("_")])
    print(f"wrote {ALIASES.relative_to(ROOT)} keys={n} groups={groups_n} solo_skipped={solo}")
    print("next: node scripts/sync-alias-runtime-data.js")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
