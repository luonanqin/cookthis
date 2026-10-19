from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path


def load_name_set(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    out: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        out.add(s)
    return out


def load_segment_hints(path: Path) -> dict[str, list[str]]:
    if not path.is_file():
        return {}
    out: dict[str, list[str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        left, right = s.split("=", 1)
        parts = [p.strip() for p in right.split("+") if p.strip()]
        if left.strip() and parts:
            out[left.strip()] = parts
    return out


@dataclass(frozen=True)
class ReviewLists:
    reject: set[str]
    accept: set[str]
    segments: dict[str, list[str]]


def load_review_lists(review_dir: Path) -> ReviewLists:
    return ReviewLists(
        reject=load_name_set(review_dir / "reject.txt"),
        accept=load_name_set(review_dir / "accept.txt"),
        segments=load_segment_hints(review_dir / "segment-hints.txt"),
    )
