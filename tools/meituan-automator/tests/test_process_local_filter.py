"""--local 按城市/类别筛选，并替换该范围旧 OCR 行。"""

from __future__ import annotations

import json
from pathlib import Path

from run_screenshot_pipeline import filter_jsonl_records, iter_local_shots


def test_filter_jsonl_drops_matching_city_category(tmp_path: Path) -> None:
    path = tmp_path / "products.jsonl"
    rows = [
        {"file": "a.png", "city": "武汉", "category": "素菜", "after": ["土豆"]},
        {"file": "b.png", "city": "武汉", "category": "荤菜", "after": ["排骨"]},
        {"file": "c.png", "city": "重庆", "category": "素菜", "after": ["青椒"]},
    ]
    path.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n",
        encoding="utf-8",
    )
    removed = filter_jsonl_records(path, city="武汉", category="素菜")
    assert removed == 1
    left = [
        json.loads(ln)
        for ln in path.read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]
    assert {(r["city"], r["category"]) for r in left} == {
        ("武汉", "荤菜"),
        ("重庆", "素菜"),
    }


def test_iter_local_shots_filters_city_and_category(tmp_path: Path) -> None:
    (tmp_path / "武汉" / "素菜").mkdir(parents=True)
    (tmp_path / "武汉" / "荤菜").mkdir(parents=True)
    (tmp_path / "重庆" / "素菜").mkdir(parents=True)
    (tmp_path / "武汉" / "素菜" / "enter_1.png").write_bytes(b"x")
    (tmp_path / "武汉" / "荤菜" / "enter_2.png").write_bytes(b"x")
    (tmp_path / "重庆" / "素菜" / "enter_3.png").write_bytes(b"x")

    got = list(iter_local_shots(tmp_path, city="武汉", category="素菜"))
    assert len(got) == 1
    assert got[0][0] == "武汉"
    assert got[0][1] == "素菜"
    assert got[0][2].name == "enter_1.png"
