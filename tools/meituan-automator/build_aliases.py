#!/usr/bin/env python3
"""
生成 data/catalog/aliases.json：

1. 解析 alias-info.txt（人工别名）
2. 对 ingredients-all.json 各类内做编辑距离同义聚类（变体名）
3. 合并为等价类；去掉 reject.txt 中的名字
4. 选通用名作键，其余作别名写出

用法：
  .venv/bin/python build_aliases.py
  .venv/bin/python build_aliases.py --catalog-root ../../data/catalog
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from review_lists import load_name_set

HERE = Path(__file__).resolve().parent
CATALOG = HERE.parents[1] / "data" / "catalog"

# 学名 / 拉丁化中文学名：不进别名表
SCIENTIFIC_NAMES = {
    "刀额新对虾",
    "斑点叉尾鮰",
    "克氏原螯虾",
    "中华绒螯蟹",
    "博氏巨鲶",
    "青海湖裸鲤",
    "长吻鮠",
    "叉尾鮰",
    "刺芹侧耳",
    "叶用莴苣",
    "缢蛏",
    "鳗鲡",
    "犬牙鱼",
    "枪乌贼",
    "鳆鱼",
    "舌鳎",
    "胡子鲶",
    "团头鲂",
    "结球白菜",
    "蕺菜",
    "茶薪菇",
    "侧耳",
    "蛹虫草",
    "中国对虾",
}

# 前后缀修饰字（同义聚类用）
_MOD = set(
    "大小中老嫩鲜活生熟干湿冻冰冷热香甜辣酸咸麻酥脆薄厚细粗长短圆扁宽胖瘦"
    "青红黄白黑紫绿粉灰金银"
    "公母仔幼土野家水海河湖洋基"
    "净整片丝条块段粒米仁头尾足须皮骨排结卷"
    "北南新陈糟卤炸烤煎煮炖焖焗"
)

_ALIAS_LINE = re.compile(r"^(.+?)[：:](.+)$")


def parse_alias_info(path: Path) -> list[tuple[str, str]]:
    """返回 (左, 右) 别名对；跳过空行、注释、无冒号的分节标题。"""
    if not path.is_file():
        return []
    pairs: list[tuple[str, str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = _ALIAS_LINE.match(line)
        if not m:
            continue
        left = m.group(1).strip()
        right = m.group(2).strip()
        if not left or not right:
            continue
        # 纯分节行误写成「标题：」无内容已跳过；有内容才收
        parts = [p.strip() for p in re.split(r"[、,，]", right) if p.strip()]
        for p in parts:
            pairs.append((left, p))
    return pairs


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if len(a) < len(b):
        a, b = b, a
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _shared_char_count(a: str, b: str) -> int:
    ca, cb = Counter(a), Counter(b)
    return sum(min(ca[c], cb[c]) for c in ca.keys() & cb.keys())


def _lcs_len(a: str, b: str) -> int:
    best = 0
    for i in range(len(a)):
        for j in range(len(b)):
            k = 0
            while i + k < len(a) and j + k < len(b) and a[i + k] == b[j + k]:
                k += 1
            if k > best:
                best = k
    return best


def _affix_ok(affix: str) -> bool:
    return bool(affix) and len(affix) <= 2 and all(c in _MOD for c in affix)


def names_similar(a: str, b: str) -> bool:
    """同类内同义：共享≥2字且连续子串≥2；前后缀为修饰字。"""
    if a == b:
        return True
    if _shared_char_count(a, b) < 2 or _lcs_len(a, b) < 2:
        return False
    la, lb = len(a), len(b)
    if min(la, lb) / max(la, lb) < 0.5:
        return False
    short, long = (a, b) if la <= lb else (b, a)
    if long.startswith(short) and _affix_ok(long[len(short) :]):
        return True
    if long.endswith(short) and _affix_ok(long[: len(long) - len(short)]):
        return True
    if short in long and _levenshtein(a, b) == abs(la - lb):
        i = long.index(short)
        left, right = long[:i], long[i + len(short) :]
        if 0 < len(left) + len(right) <= 2 and all(c in _MOD for c in left + right):
            return True
    return False


def _cluster_category(names: list[str]) -> list[list[str]]:
    names = sorted(set(names))
    stars: list[list[str]] = []
    for root in sorted(names, key=lambda x: (len(x), x)):
        members = [root] + [n for n in names if n != root and names_similar(root, n)]
        if len(members) >= 2:
            stars.append(sorted(set(members)))
    stars.sort(key=lambda g: (-len(g), len(min(g, key=len)), min(g, key=len)))
    assigned: set[str] = set()
    groups: list[list[str]] = []
    for g in stars:
        left = [x for x in g if x not in assigned]
        if len(left) < 2:
            continue
        root = min(left, key=lambda x: (len(x), x))
        final = sorted({root} | {x for x in left if x != root and names_similar(root, x)})
        if len(final) >= 2:
            groups.append(final)
            assigned.update(final)
    return groups


def synonym_groups_from_all(all_doc: dict) -> list[list[str]]:
    groups: list[list[str]] = []
    cats = all_doc.get("categories") or {}
    for _cat, names in cats.items():
        if not isinstance(names, list):
            continue
        groups.extend(_cluster_category([str(n) for n in names if n]))
    return groups


def _pick_canon(members: set[str], all_names: set[str]) -> str:
    def hub(n: str) -> int:
        return sum(1 for m in members if m != n and n in m)

    return sorted(
        members,
        key=lambda n: (
            -hub(n),
            0 if n in all_names else 1,
            len(n),
            n,
        ),
    )[0]


def build_aliases_doc(catalog_root: Path) -> dict:
    info_path = catalog_root / "alias-info.txt"
    all_path = catalog_root / "ingredients-all.json"
    reject = load_name_set(catalog_root / "review" / "reject.txt")
    ban = reject | SCIENTIFIC_NAMES

    all_doc: dict = {}
    if all_path.is_file():
        all_doc = json.loads(all_path.read_text(encoding="utf-8"))
    all_names: set[str] = set()
    for names in (all_doc.get("categories") or {}).values():
        if isinstance(names, list):
            all_names.update(str(n) for n in names if n)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        if a in ban or b in ban:
            return
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for left, right in parse_alias_info(info_path):
        if left in ban or right in ban:
            continue
        union(left, right)

    for g in synonym_groups_from_all(all_doc):
        kept = [n for n in g if n not in ban]
        if len(kept) < 2:
            continue
        for x in kept[1:]:
            union(kept[0], x)

    comps: dict[str, set[str]] = defaultdict(set)
    for name in parent:
        if name in ban:
            continue
        comps[find(name)].add(name)

    aliases: dict[str, list[str]] = {}
    for members in comps.values():
        members = {m for m in members if m not in ban}
        if len(members) < 2:
            continue
        canon = _pick_canon(members, all_names)
        others = sorted(m for m in members if m != canon)
        if others:
            aliases[canon] = others

    aliases = dict(sorted(aliases.items(), key=lambda kv: kv[0]))
    return {
        "_meta": {
            "note": (
                "键=通用名（优先取 ingredients-all 中名）；值=同物异名/同义变体。"
                "别名可来自 alias-info，也可为 ingredients-all 中的其它食材名。"
                "reject.txt 与学名不进入本表。不含大小类/部位父子关系。"
            ),
            "sources": [
                "alias-info.txt",
                "ingredients-all.json（类内编辑距离同义）",
                "review/reject.txt（排除）",
            ],
        },
        **aliases,
    }


def write_aliases_json(path: Path, doc: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["{"]
    items = list(doc.items())
    for i, (k, v) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(
            f"  {json.dumps(k, ensure_ascii=False)}: "
            f"{json.dumps(v, ensure_ascii=False, separators=(', ', ': '))}{comma}"
        )
    lines.append("}")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def build_aliases(catalog_root: Path | None = None) -> dict:
    root = catalog_root or CATALOG
    doc = build_aliases_doc(root)
    out = root / "aliases.json"
    write_aliases_json(out, doc)
    n = sum(1 for k in doc if k != "_meta")
    print(f"aliases.json: {n} 组 → {out}")
    return doc


def main() -> None:
    ap = argparse.ArgumentParser(description="生成 aliases.json（alias-info + all 同义 − reject）")
    ap.add_argument("--catalog-root", type=Path, default=CATALOG)
    args = ap.parse_args()
    if not args.catalog_root.is_dir():
        print(f"无目录：{args.catalog_root}")
        raise SystemExit(1)
    build_aliases(args.catalog_root)


if __name__ == "__main__":
    main()
