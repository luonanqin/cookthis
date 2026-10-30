#!/usr/bin/env python3
"""把 pending.txt 行内「名后、Tab 前」的 r/a/s= 写入 review 清单。

s= 表示「从原文取出这些食材」（分词 / 提取 / 去重 同一标签），支持单段。
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from review_lists import load_name_set

CATALOG = Path(__file__).resolve().parents[2] / "data" / "catalog"
REVIEW = CATALOG / "review"
PENDING = REVIEW / "pending.txt"

# 名 + 可选标记 + Tab + 城/类…
_MARKED = re.compile(
    r"^(?P<name>.+?)"
    r"(?:\s+(?P<mark>r|a|s\?=[^\t]+|s=[^\t]+))?"
    r"\t(?P<locs>.*)$"
)


def _append_unique_lines(path: Path, new_lines: list[str], *, existing: set[str]) -> int:
    added = 0
    to_write: list[str] = []
    for line in new_lines:
        if line in existing:
            continue
        existing.add(line)
        to_write.append(line)
        added += 1
    if not to_write:
        return 0
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    if text and not text.endswith("\n"):
        text += "\n"
    path.write_text(text + "\n".join(to_write) + "\n", encoding="utf-8")
    return added


def apply_marks(pending_path: Path = PENDING, review_dir: Path = REVIEW) -> dict[str, int]:
    if not pending_path.is_file():
        raise SystemExit(f"无文件：{pending_path}")

    rejects: list[str] = []
    accepts: list[str] = []
    segments: list[str] = []  # "名=段1+段2"
    kept: list[str] = []
    bad: list[str] = []

    for raw in pending_path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.strip().startswith("#"):
            kept.append(raw)
            continue
        m = _MARKED.match(raw)
        if not m:
            kept.append(raw)
            continue
        name = m.group("name").strip()
        mark = m.group("mark")
        locs = m.group("locs")
        if not mark:
            kept.append(raw)
            continue
        if mark == "r":
            rejects.append(name)
        elif mark == "a":
            accepts.append(name)
        elif mark.startswith("s?="):
            # 未确认建议：留在 pending
            kept.append(raw)
            continue
        elif mark.startswith("s="):
            parts_raw = mark[2:].strip()
            part_list = [p.strip() for p in parts_raw.split("+") if p.strip()]
            # 连续重复去掉（内酯豆腐+内酯豆腐 → 内酯豆腐）
            deduped: list[str] = []
            for p in part_list:
                if deduped and deduped[-1] == p:
                    continue
                deduped.append(p)
            if not deduped:
                bad.append(raw)
                kept.append(raw)
                continue
            segments.append(f"{name}={'+'.join(deduped)}")
        else:
            bad.append(raw)
            kept.append(raw)
            continue
        # 已分流：从 pending 去掉该行

    reject_path = review_dir / "reject.txt"
    accept_path = review_dir / "accept.txt"
    seg_path = review_dir / "segment-hints.txt"

    n_r = _append_unique_lines(reject_path, rejects, existing=load_name_set(reject_path))
    n_a = _append_unique_lines(accept_path, accepts, existing=load_name_set(accept_path))
    existing_seg_lines: set[str] = set()
    if seg_path.is_file():
        for line in seg_path.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if s and not s.startswith("#") and "=" in s:
                existing_seg_lines.add(s)
    n_s = _append_unique_lines(seg_path, segments, existing=existing_seg_lines)

    # 重写 pending：只留注释 + 未标记行
    header_and_unmarked = [ln for ln in kept]
    pending_path.write_text("\n".join(header_and_unmarked) + "\n", encoding="utf-8")

    return {
        "reject": n_r,
        "accept": n_a,
        "segment": n_s,
        "bad": len(bad),
        "left": sum(1 for ln in header_and_unmarked if ln.strip() and not ln.strip().startswith("#")),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Apply r/a/s= marks from pending.txt")
    ap.add_argument("--pending", type=Path, default=PENDING)
    ap.add_argument("--review-dir", type=Path, default=REVIEW)
    args = ap.parse_args()
    stats = apply_marks(args.pending, args.review_dir)
    print(
        f"applied reject+{stats['reject']} accept+{stats['accept']} "
        f"segment+{stats['segment']} bad={stats['bad']} pending_left={stats['left']}"
    )


if __name__ == "__main__":
    main()
