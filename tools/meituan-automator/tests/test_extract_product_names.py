"""RapidOCR 原文抽取：保留带 / 的菜名，滤掉月售/坏必赔。"""

from __future__ import annotations

from ocr_products import clean_product_name, extract_product_names


def test_extract_keeps_slash_alias_titles() -> None:
    raw = "\n".join(
        [
            "新鲜莴笋 约480g-520g",
            "月售21|袋装|整根莴笋",
            "坏必赔",
            "¥8.59",
            "+",
            "【平价】豇豆/长豆角约",
            "300g±50/份",
            "月售63",
            "坏必赔",
            "¥6.8",
            "+",
            "西红柿约450-500g/份",
            "月售11|袋装",
            "坏必赔",
            "¥6.8",
            "+",
            "大蒜粒约50g/份",
        ]
    )
    before = extract_product_names(raw)
    after = []
    seen: set[str] = set()
    for b in before:
        c = clean_product_name(b)
        if c and c not in seen:
            seen.add(c)
            after.append(c)
    assert "莴笋" in after
    assert "豇豆/长豆角" in after
    assert "西红柿" in after
    assert "大蒜粒" in after
    assert "日售" not in after
    assert "月售" not in "".join(after)


def test_extract_drops_sales_pipe_lines_but_not_product_slash() -> None:
    names = extract_product_names("豇豆/长豆角约300g\n月售21|袋装\n坏必赔")
    assert any("豇豆" in n for n in names)
    assert not any("月售" in n for n in names)


def test_extract_strips_glued_sales_and_misread_日售() -> None:
    raw = "大蒜粒约50g/份日售68蒜米\n西红柿约450-500g/份月售11|袋装坏必赔"
    before = extract_product_names(raw)
    after = [clean_product_name(b) for b in before]
    after = [a for a in after if a]
    assert "大蒜粒" in after
    assert "西红柿" in after
    assert "日售" not in after
    assert not any("蒜米" == a for a in after)
