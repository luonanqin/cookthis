from pathlib import Path
from review_lists import load_name_set, load_segment_hints, load_review_lists


def test_load_name_set_skips_blank_and_comment(tmp_path: Path):
    p = tmp_path / "reject.txt"
    p.write_text("# 注释\n\n超值单品\n食材\n", encoding="utf-8")
    assert load_name_set(p) == {"超值单品", "食材"}


def test_load_segment_hints(tmp_path: Path):
    p = tmp_path / "segment-hints.txt"
    p.write_text("洋葱炒猪肝=洋葱+猪肝\n", encoding="utf-8")
    assert load_segment_hints(p) == {"洋葱炒猪肝": ["洋葱", "猪肝"]}


def test_load_review_lists(tmp_path: Path):
    (tmp_path / "reject.txt").write_text("垃圾\n", encoding="utf-8")
    (tmp_path / "accept.txt").write_text("珍品\n", encoding="utf-8")
    (tmp_path / "segment-hints.txt").write_text("甲乙=甲+乙\n", encoding="utf-8")
    r = load_review_lists(tmp_path)
    assert r.reject == {"垃圾"}
    assert r.accept == {"珍品"}
    assert r.segments == {"甲乙": ["甲", "乙"]}
