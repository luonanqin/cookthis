from pathlib import Path
from review_lists import ReviewLists
from clean_city_products import refine_to_parts

def test_segment_hint_splits():
    r = ReviewLists(reject=set(), accept=set(), segments={"洋葱炒猪肝": ["洋葱", "猪肝"]})
    assert refine_to_parts("洋葱炒猪肝", r) == ["洋葱", "猪肝"]

def test_reject_drops():
    r = ReviewLists(reject={"超值单品"}, accept=set(), segments={})
    assert refine_to_parts("超值单品", r) == []

def test_accept_keeps_exact_junk_name():
    # 「食材」在 _DROP_EXACT；accept 应救回
    r = ReviewLists(reject=set(), accept={"食材"}, segments={})
    assert refine_to_parts("食材", r) == ["食材"]
