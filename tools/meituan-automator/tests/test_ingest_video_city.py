"""ingest_video_city：按城汇总 _video/，忽略视频文件名。"""
from __future__ import annotations

import json
from pathlib import Path

from ingest_video_city import append_video_records, remove_video_products


def test_remove_and_append_by_city_video_prefix(tmp_path: Path, monkeypatch) -> None:
    import ingest_video_city as mod

    monkeypatch.setattr(mod, "SCREENSHOTS_INBOX", tmp_path)
    city = "上海"
    city_dir = tmp_path / city
    city_dir.mkdir()
    jsonl = city_dir / "products.jsonl"
    jsonl.write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "file": "_video/frame_0001.jpg",
                        "before": ["旧A"],
                        "after": ["旧A"],
                        "city": city,
                        "category": "未分类",
                    },
                    ensure_ascii=False,
                ),
                json.dumps(
                    {
                        "file": "Screenshot_x.jpg",
                        "before": ["截图菜"],
                        "after": ["截图菜"],
                        "city": city,
                        "category": "素菜",
                    },
                    ensure_ascii=False,
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    assert remove_video_products(jsonl) == 1
    rows = [
        json.loads(l)
        for l in jsonl.read_text(encoding="utf-8").splitlines()
        if l.strip()
    ]
    assert len(rows) == 1
    assert rows[0]["after"] == ["截图菜"]

    n = append_video_records(
        city,
        [{"file": "frame_0001.jpg", "before": ["新A"], "after": ["新A"]}],
        category="未分类",
    )
    assert n == 1
    rows = [
        json.loads(l)
        for l in jsonl.read_text(encoding="utf-8").splitlines()
        if l.strip()
    ]
    assert len(rows) == 2
    assert rows[0]["file"] == "Screenshot_x.jpg"
    assert rows[1]["file"] == "_video/frame_0001.jpg"
    assert rows[1]["category"] == "未分类"
