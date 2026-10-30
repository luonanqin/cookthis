from pathlib import Path

from pending_review import (
    format_pending_body,
    needs_human_review,
    select_pending,
    suggest_segment,
)
from review_lists import ReviewLists


def test_needs_human_review_range():
    assert needs_human_review("猪肉", min_len=3) is False
    assert needs_human_review("三文鱼", min_len=3) is True
    assert needs_human_review("三文鱼", min_len=3, max_len=3) is True
    assert needs_human_review("五花肉块", min_len=3, max_len=3) is False
    assert needs_human_review("五花肉块", min_len=4, max_len=4) is True


def test_select_pending_skips_resolved():
    locs = {
        "猪肉": ["重庆/荤菜"],
        "三文鱼": ["西宁/海鲜水产"],
        "五花肉块": ["重庆/荤菜"],
        "洋葱炒猪肝片": ["重庆/荤菜"],
        "已接受长名字啊": ["天津/素菜"],
        "已拒绝长名字啊": ["成都/素菜"],
        "鸡中翅": ["北京/荤菜"],
    }
    review = ReviewLists(
        reject={"已拒绝长名字啊"},
        accept={"已接受长名字啊"},
        segments={"鸡中翅鸡翅": ["鸡中翅", "鸡翅"]},
    )
    rows = select_pending(locs, review, min_len=3)
    assert [r[0] for r in rows] == ["洋葱炒猪肝片", "五花肉块", "三文鱼"]
    only3 = select_pending(locs, review, min_len=3, max_len=3)
    assert [r[0] for r in only3] == ["三文鱼"]


def test_select_pending_skips_known_catalog_name():
    """ingredients-all / 词典里已有的整名（如芋艿）不进 pending。"""
    locs = {
        "芋艿": ["西安/素菜"],
        "神秘两字": ["西安/素菜"],
        "紫薯糯米丸子": ["西安/素菜"],
    }
    review = ReviewLists(reject=set(), accept=set(), segments={})
    rows = select_pending(
        locs,
        review,
        min_len=2,
        known_names={"芋艿"},
    )
    assert [r[0] for r in rows] == ["紫薯糯米丸子", "神秘两字"]


def test_format_prefills_mark():
    body = format_pending_body(
        [("牛百叶毛肚", ["重庆/荤菜"])],
        marks={},
        lexicon={"牛百叶", "毛肚"},
    )
    assert body.startswith("牛百叶毛肚 s?=牛百叶+毛肚\t")


def test_suggest_segment():
    assert suggest_segment("牛百叶毛肚", {"牛百叶", "毛肚"}) == "s?=牛百叶+毛肚"
    assert suggest_segment("神秘长词啊啊", {"牛百叶", "毛肚"}) is None
    assert suggest_segment("内酯豆腐内酯豆腐", {"内酯豆腐"}) == "s?=内酯豆腐"
    assert suggest_segment("聚源天润内酯豆腐", {"内酯豆腐"}) == "s?=内酯豆腐"
    assert suggest_segment("天然纯草饲祁连山牦牛肉", {"牦牛肉", "牛肉"}) == "s?=牦牛肉"


def test_write_pending_preserves_marks(tmp_path: Path):
    from pending_review import write_pending

    catalog = tmp_path / "catalog"
    review = catalog / "review"
    review.mkdir(parents=True)
    (review / "reject.txt").write_text("", encoding="utf-8")
    (review / "accept.txt").write_text("", encoding="utf-8")
    (review / "segment-hints.txt").write_text("", encoding="utf-8")
    (catalog / "ingredients-builtin.jsonl").write_text(
        '{"name":"鸡蛋","category":"egg_dairy"}\n', encoding="utf-8"
    )
    (catalog / "aliases.json").write_text("{}\n", encoding="utf-8")
    (review / "pending.txt").write_text(
        "猪后腿带骨猪肘子 r\t重庆/荤菜\n", encoding="utf-8"
    )

    inbox = tmp_path / "inbox"
    city = inbox / "重庆"
    city.mkdir(parents=True)
    (city / "ingredients-cleaned.json").write_text(
        '{"city":"重庆","荤菜":["鸡蛋","三文鱼","猪后腿带骨猪肘子"],"_meta":{}}',
        encoding="utf-8",
    )
    n = write_pending(
        inbox, review_dir=review, catalog=catalog, min_len=3, max_len=3
    )
    assert n == 1
    text = (review / "pending.txt").read_text(encoding="utf-8")
    assert "len=3" in text
    assert any(ln.startswith("三文鱼") for ln in text.splitlines() if "\t" in ln)
    assert "猪后腿" not in text  # max_len=3 不含长串
