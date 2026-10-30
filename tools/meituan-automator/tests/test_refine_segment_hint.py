from pathlib import Path

from clean_city_products import refine_to_parts
from review_lists import ReviewLists


def test_segment_hint_matches_after_hyphen_normalized():
    """鸡中翅-鸡翅 → 归一成鸡中翅鸡翅 后仍应命中 hint。"""
    review = ReviewLists(
        reject=set(),
        accept=set(),
        segments={"鸡中翅鸡翅": ["鸡中翅", "鸡翅"]},
    )
    assert refine_to_parts("鸡中翅-鸡翅", review) == ["鸡中翅", "鸡翅"]
    assert refine_to_parts("鸡中翅鸡翅", review) == ["鸡中翅", "鸡翅"]
