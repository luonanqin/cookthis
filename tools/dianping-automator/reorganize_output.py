#!/usr/bin/env python3
"""
整理 output/{城市}/：按 JSON 内菜系归入标准目录，无法识别进「其他」，
删掉非标准旧目录。
"""

from __future__ import annotations

import json
import shutil
from collections import Counter
from pathlib import Path

from config import CUISINES
from cuisine_util import OTHER_DIR, resolve_dir_cuisine
from smoke_p4_shops import OUTPUT_DIR, safe_filename

ALLOWED = set(CUISINES) | {OTHER_DIR}


def _unique_dest(dest: Path) -> Path:
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    for i in range(2, 1000):
        cand = dest.with_name(f"{stem}_{i}{suffix}")
        if not cand.exists():
            return cand
    raise RuntimeError(f"无法为冲突文件生成新名：{dest}")


def reorganize_city(city_dir: Path) -> Counter:
    stats: Counter = Counter()
    json_files = [p for p in city_dir.rglob("*.json") if p.is_file()]
    moves: list[tuple[Path, Path, str]] = []

    for src in json_files:
        try:
            data = json.loads(src.read_text(encoding="utf-8"))
        except Exception:
            stats["read_fail"] += 1
            continue
        cuisine = resolve_dir_cuisine(
            shop_cuisine=str(data.get("shop_cuisine") or ""),
            search_cuisine=str(data.get("search_cuisine") or ""),
        )
        dest_dir = city_dir / cuisine
        dest = dest_dir / src.name
        # 已在正确标准目录且文件名相同 → 不动
        if src.resolve() == dest.resolve():
            stats["already_ok"] += 1
            stats[f"dir:{cuisine}"] += 1
            continue
        if dest.exists():
            # 同名：若内容相同跳过源文件待删；否则改名
            try:
                same = src.read_text(encoding="utf-8") == dest.read_text(
                    encoding="utf-8"
                )
            except Exception:
                same = False
            if same:
                stats["dup_removed"] += 1
                src.unlink(missing_ok=True)
                stats[f"dir:{cuisine}"] += 1
                continue
            dest = _unique_dest(dest)
            stats["renamed"] += 1
        moves.append((src, dest, cuisine))

    for src, dest, cuisine in moves:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dest))
        stats["moved"] += 1
        stats[f"dir:{cuisine}"] += 1

    # 删除非标准目录（及空目录）
    for sub in list(city_dir.iterdir()):
        if not sub.is_dir():
            continue
        if sub.name in ALLOWED:
            # 标准目录若空也保留？保留空标准目录无必要，有文件的留下
            continue
        # 非标准：若还有 json 说明漏移，先报错不删
        leftover = list(sub.rglob("*.json"))
        if leftover:
            stats["leftover_dirs"] += 1
            print(f"  ! 仍有 JSON 未迁出，保留：{sub} ({len(leftover)})")
            continue
        shutil.rmtree(sub)
        stats["removed_dirs"] += 1

    # 清掉标准目录下残留的空子目录（一般没有）
    for sub in list(city_dir.iterdir()):
        if sub.is_dir() and sub.name not in ALLOWED:
            continue
        if sub.is_dir() and not any(sub.iterdir()):
            # 允许空的「其他」不强制删；空标准目录可删
            if sub.name != OTHER_DIR:
                try:
                    sub.rmdir()
                except OSError:
                    pass

    return stats


def main() -> None:
    if not OUTPUT_DIR.is_dir():
        print(f"无 output 目录：{OUTPUT_DIR}")
        return
    print(f"整理 {OUTPUT_DIR}")
    print(f"标准菜系：{', '.join(CUISINES)} + {OTHER_DIR}")
    total: Counter = Counter()
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        print(f"\n== {city_dir.name} ==")
        st = reorganize_city(city_dir)
        total.update(st)
        dirs = sorted(
            p.name for p in city_dir.iterdir() if p.is_dir()
        )
        print(
            f"  moved={st['moved']} already={st['already_ok']} "
            f"dup_rm={st['dup_removed']} renamed={st['renamed']} "
            f"rm_dirs={st['removed_dirs']}"
        )
        print(f"  现有目录：{dirs}")

    print("\n======== 合计 ========")
    print(
        f"moved={total['moved']} already={total['already_ok']} "
        f"dup_rm={total['dup_removed']} renamed={total['renamed']} "
        f"rm_dirs={total['removed_dirs']} leftover={total['leftover_dirs']}"
    )
    print("按目录归入：")
    for k in sorted(total):
        if k.startswith("dir:"):
            print(f"  {k[4:]}: {total[k]}")


if __name__ == "__main__":
    main()
