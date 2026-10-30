"""清洗后刷新 pending：按字数门槛列出未标记食材，供人工 r/a/s。

用法（只刷新 pending，不重跑清洗）：
  .venv/bin/python pending_review.py --min-len 3
  .venv/bin/python pending_review.py --min-len 3 --max-len 3   # 只看三字
  .venv/bin/python pending_review.py --min-len 4 --max-len 4   # 只看四字
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

from alias_match import load_aliases
from review_lists import ReviewLists, load_review_lists

CATALOG = Path(__file__).resolve().parents[2] / "data" / "catalog"
BUILTIN_JSONL = CATALOG / "ingredients-builtin.jsonl"
ALL_JSON = CATALOG / "ingredients-all.json"
ALIASES_JSON = CATALOG / "aliases.json"
REVIEW_DIR = CATALOG / "review"
PENDING_NAME = "pending.txt"
INBOX = Path(__file__).resolve().parent / "screenshots_inbox"

# 清洗/导出默认门槛（可用 CLI --min-len / --max-len 覆盖）
DEFAULT_MIN_LEN = 3
# ingredients-all 里短于此（含）的整名视为已认识材，不再进 pending
# （长粘连名也会进 all，不能整表当「已认识」否则会漏审）
KNOWN_ALL_MAX_LEN = 3


def _header(min_len: int, max_len: int | None) -> str:
    if max_len is None:
        span = f"len≥{min_len}"
        short = f"<{min_len}"
    elif max_len == min_len:
        span = f"len={min_len}"
        short = f"≠{min_len}"
    else:
        span = f"{min_len}≤len≤{max_len}"
        short = f"不在此区间"
    return (
        f"# 自动生成：各城清洗后货架上 {span} 的名（{short} 不进本表）\n"
        "# 已在 reject / accept / segment-hints（原串或拆出的段）里标记过的不再列出\n"
        f"# 已在 ingredients-all 且字数≤{KNOWN_ALL_MAX_LEN}、或 builtin/别名 的整名也不列出\n"
        "# 冻结下次不出现：r→reject 或 a→accept；s= 拆开后原串离开货架即消失\n"
        "# 标注在「食材名」后、Tab 前：\n"
        "#   名 r\\t城/类            → 不要\n"
        "#   名 a\\t城/类            → 整段保留为食材\n"
        "#   名 s?=… / 改成 s=…     → 取出食材（未确认 / 已确认）\n"
        "# 只刷新本表：.venv/bin/python pending_review.py --min-len N [--max-len N]\n"
        "# 标完：.venv/bin/python finish_review.py\n"
    )

_MARK_AT_NAME = re.compile(
    r"^(?P<name>.+?)(?:\s+(?P<mark>r|a|s\?=[^\t]+|s=[^\t]+))?\t(?P<locs>.*)$"
)


def load_builtin_names(path: Path = BUILTIN_JSONL) -> set[str]:
    names: set[str] = set()
    if not path.is_file():
        return names
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        name = (rec.get("name") or "").strip()
        if name:
            names.add(name)
    return names


def load_alias_surface_names(path: Path = ALIASES_JSON) -> set[str]:
    if not path.is_file():
        return set()
    aliases = load_aliases(path)
    out: set[str] = set()
    for canonical, alias_list in aliases.items():
        out.add(canonical)
        out.update(alias_list)
    return out


def load_ingredients_all_names(path: Path = ALL_JSON) -> set[str]:
    if not path.is_file():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for items in (data.get("categories") or {}).values():
        if not isinstance(items, list):
            continue
        for name in items:
            n = (name or "").strip()
            if n:
                names.add(n)
    return names


def build_dict_lexicon(
    review: ReviewLists,
    short_names: set[str],
    *,
    catalog: Path = CATALOG,
) -> set[str]:
    """分词词典：短货架名 ∪ accept ∪ segment 各段 ∪ builtin ∪ 别名 ∪ ingredients-all。"""
    from clean_city_products import load_builtin_lexicon

    lex = load_builtin_lexicon(catalog / "ingredients-builtin.jsonl")
    lex |= short_names
    lex |= set(review.accept)
    for parts in review.segments.values():
        lex.update(parts)
    lex |= load_alias_surface_names(catalog / "aliases.json")
    lex |= load_ingredients_all_names(catalog / "ingredients-all.json")
    return lex


def build_known_ingredient_names(
    review: ReviewLists,
    *,
    catalog: Path = CATALOG,
) -> set[str]:
    """
    已认识材整名：进 pending 时整串命中则跳过。
    含 builtin / accept / segment 段 / 别名，以及 ingredients-all 里 ≤KNOWN_ALL_MAX_LEN 的短名。
    """
    from clean_city_products import load_builtin_lexicon

    known = load_builtin_lexicon(catalog / "ingredients-builtin.jsonl")
    known |= set(review.accept)
    for parts in review.segments.values():
        known.update(parts)
    known |= load_alias_surface_names(catalog / "aliases.json")
    for name in load_ingredients_all_names(catalog / "ingredients-all.json"):
        if len(name) <= KNOWN_ALL_MAX_LEN:
            known.add(name)
    return known


def needs_human_review(
    name: str,
    *,
    min_len: int = DEFAULT_MIN_LEN,
    max_len: int | None = None,
) -> bool:
    n = len(name)
    if n < min_len:
        return False
    if max_len is not None and n > max_len:
        return False
    return True


def collect_cleaned_locations(inbox: Path) -> dict[str, list[str]]:
    locs: dict[str, list[str]] = defaultdict(list)
    seen: dict[str, set[str]] = defaultdict(set)
    for city_dir in sorted(p for p in inbox.iterdir() if p.is_dir()):
        path = city_dir / "ingredients-cleaned.json"
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        city = data.get("city") or city_dir.name
        for key, names in data.items():
            if key in ("city", "_meta") or not isinstance(names, list):
                continue
            for name in names:
                if not isinstance(name, str) or not name:
                    continue
                tag = f"{city}/{key}"
                if tag in seen[name]:
                    continue
                seen[name].add(tag)
                locs[name].append(tag)
    return dict(locs)


def load_existing_marks(pending_path: Path) -> dict[str, str]:
    """名 → r|a|s?=…|s=…（保留未 apply 的标注；刷新时不覆盖你的 r/a/s=）。"""
    out: dict[str, str] = {}
    if not pending_path.is_file():
        return out
    for line in pending_path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        m = _MARK_AT_NAME.match(line)
        if not m or not m.group("mark"):
            continue
        out[m.group("name").strip()] = m.group("mark")
    return out


def _dedupe_consecutive(parts: list[str]) -> list[str]:
    out: list[str] = []
    for p in parts:
        if out and out[-1] == p:
            continue
        out.append(p)
    return out


def extract_from_lexicon(name: str, lexicon: set[str]) -> list[str]:
    """在原文中按最长优先抽出词典食材（可跳过广告字），保序、去连续重复。"""
    usable = sorted(
        (w for w in lexicon if w and w != name and len(w) >= 2),
        key=len,
        reverse=True,
    )
    if not usable:
        return []
    max_w = len(usable[0])
    n = len(name)
    parts: list[str] = []
    i = 0
    while i < n:
        matched: str | None = None
        for length in range(min(max_w, n - i), 1, -1):
            w = name[i : i + length]
            if w in lexicon and w != name:
                matched = w
                break
        if matched:
            if not parts or parts[-1] != matched:
                parts.append(matched)
            i += len(matched)
        else:
            i += 1
    return parts


def suggest_segment(name: str, lexicon: set[str]) -> str | None:
    """先整串切开；不行再从清洗词典里抽取子串食材。"""
    from clean_city_products import segment_name

    parts = segment_name(name, lexicon)
    if "".join(parts) == name:
        parts = _dedupe_consecutive(parts)
        if len(parts) == 1 and parts[0] == name:
            parts = []
        elif len(parts) >= 1 and (len(parts) >= 2 or parts[0] != name):
            return "s?=" + "+".join(parts)

    extracted = extract_from_lexicon(name, lexicon)
    if extracted:
        return "s?=" + "+".join(extracted)
    return None


def select_pending(
    locations: dict[str, list[str]],
    review: ReviewLists,
    *,
    min_len: int = DEFAULT_MIN_LEN,
    max_len: int | None = None,
    known_names: set[str] | None = None,
) -> list[tuple[str, list[str]]]:
    """按字数门槛进 pending（已标记 / 已认识材整名除外）。"""
    resolved = set(review.reject) | set(review.accept) | set(review.segments)
    for parts in review.segments.values():
        resolved.update(parts)
    known = known_names or set()
    rows: list[tuple[str, list[str]]] = []
    for name, locs in locations.items():
        if name in resolved:
            continue
        # 词典里已有的整名（如「芋艿」）不必再审
        if name in known:
            continue
        if not needs_human_review(name, min_len=min_len, max_len=max_len):
            continue
        rows.append((name, locs))
    rows.sort(key=lambda r: (-len(r[0]), r[0]))
    return rows


def format_pending_body(
    rows: list[tuple[str, list[str]]],
    *,
    marks: dict[str, str],
    lexicon: set[str],
) -> str:
    lines: list[str] = []
    for name, locs in rows:
        mark = marks.get(name)
        # 已确认的 r/a/s= 保留；s?= 或无标记则用最新建议
        if not mark or mark.startswith("s?="):
            mark = suggest_segment(name, lexicon) or mark or ""
        if mark:
            lines.append(f"{name} {mark}\t{', '.join(locs)}")
        else:
            lines.append(f"{name}\t{', '.join(locs)}")
    return "\n".join(lines) + ("\n" if lines else "")


def write_pending(
    inbox: Path,
    *,
    review_dir: Path = REVIEW_DIR,
    catalog: Path = CATALOG,
    min_len: int = DEFAULT_MIN_LEN,
    max_len: int | None = None,
) -> int:
    if max_len is not None and max_len < min_len:
        raise ValueError(f"max_len({max_len}) < min_len({min_len})")
    review = load_review_lists(review_dir)
    locations = collect_cleaned_locations(inbox)
    # 建议用词典：短于 min_len 的货架名 + accept + segment 段 + builtin
    short_cap = max(1, min_len - 1)
    short_names = {n for n in locations if len(n) <= short_cap}
    for parts in review.segments.values():
        short_names.update(p for p in parts if len(p) <= short_cap)
    short_names |= {n for n in review.accept if len(n) <= 6}
    lexicon = build_dict_lexicon(review, short_names, catalog=catalog)
    known = build_known_ingredient_names(review, catalog=catalog)
    rows = select_pending(
        locations,
        review,
        min_len=min_len,
        max_len=max_len,
        known_names=known,
    )
    pending_path = review_dir / PENDING_NAME
    marks = load_existing_marks(pending_path)
    review_dir.mkdir(parents=True, exist_ok=True)
    pending_path.write_text(
        _header(min_len, max_len)
        + format_pending_body(rows, marks=marks, lexicon=lexicon),
        encoding="utf-8",
    )
    return len(rows)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="按字数刷新 data/catalog/review/pending.txt（不重跑清洗）"
    )
    ap.add_argument("--inbox", type=Path, default=INBOX)
    ap.add_argument("--review-dir", type=Path, default=REVIEW_DIR)
    ap.add_argument("--catalog", type=Path, default=CATALOG)
    ap.add_argument(
        "--min-len",
        type=int,
        default=DEFAULT_MIN_LEN,
        help=f"最短字数（含），默认 {DEFAULT_MIN_LEN}",
    )
    ap.add_argument(
        "--max-len",
        type=int,
        default=None,
        help="最长字数（含）；省略表示不限制。与 --min-len 相同则只看该长度",
    )
    args = ap.parse_args()
    n = write_pending(
        args.inbox,
        review_dir=args.review_dir,
        catalog=args.catalog,
        min_len=args.min_len,
        max_len=args.max_len,
    )
    span = (
        f"len={args.min_len}"
        if args.max_len == args.min_len
        else (
            f"len≥{args.min_len}"
            if args.max_len is None
            else f"{args.min_len}≤len≤{args.max_len}"
        )
    )
    print(f"review/pending.txt: {n} 条（{span}）→ {args.review_dir / PENDING_NAME}")


if __name__ == "__main__":
    main()
