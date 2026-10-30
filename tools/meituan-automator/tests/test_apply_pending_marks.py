from pathlib import Path

from apply_pending_marks import apply_marks


def test_apply_r_a_s(tmp_path: Path):
    review = tmp_path / "review"
    review.mkdir()
    (review / "reject.txt").write_text("#\n", encoding="utf-8")
    (review / "accept.txt").write_text("#\n", encoding="utf-8")
    (review / "segment-hints.txt").write_text("#\n", encoding="utf-8")
    pending = review / "pending.txt"
    pending.write_text(
        "# head\n"
        "垃圾名 r\t天津/素菜\n"
        "牦牛肉干 a\t西宁/荤菜\n"
        "洋葱炒猪肝 s=洋葱+猪肝\t重庆/荤菜\n"
        "内酯豆腐内酯豆腐 s=内酯豆腐+内酯豆腐\t天津/豆制品\n"
        "牛百叶毛肚 s?=牛百叶+毛肚\t重庆/火锅食材\n"
        "未标记长名字啊\t成都/素菜\n",
        encoding="utf-8",
    )
    stats = apply_marks(pending, review)
    assert stats["reject"] == 1
    assert stats["accept"] == 1
    assert stats["segment"] == 2
    assert stats["left"] == 2  # s?= + unmarked
    assert "垃圾名" in (review / "reject.txt").read_text(encoding="utf-8")
    assert "牦牛肉干" in (review / "accept.txt").read_text(encoding="utf-8")
    seg = (review / "segment-hints.txt").read_text(encoding="utf-8")
    assert "洋葱炒猪肝=洋葱+猪肝" in seg
    assert "内酯豆腐内酯豆腐=内酯豆腐" in seg
    left = pending.read_text(encoding="utf-8")
    assert "未标记长名字啊\t成都/素菜" in left
    assert "牛百叶毛肚 s?=牛百叶+毛肚" in left
    assert "垃圾名" not in left
