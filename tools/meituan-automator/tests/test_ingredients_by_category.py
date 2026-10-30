import json
from pathlib import Path

from ingredients_by_category import (
    CATEGORY_ORDER,
    build_by_category,
    classify_ingredient,
    format_by_category_json,
    unique_names_from_all,
    write_ingredients_by_category,
)


def test_classify_basics():
    assert classify_ingredient("猪肉") == "肉类"
    assert classify_ingredient("豆腐") == "豆制品"
    assert classify_ingredient("豆角") == "豆类"
    assert classify_ingredient("草鱼") == "鱼"
    assert classify_ingredient("小龙虾") == "河鲜"
    assert classify_ingredient("基围虾") == "海鲜"
    assert classify_ingredient("大闸蟹") == "河鲜"
    assert classify_ingredient("鸡蛋") == "蛋奶"
    assert classify_ingredient("盐") == "调味"
    assert classify_ingredient("香菇") == "菌菇"
    assert classify_ingredient("大米") == "主食"
    assert classify_ingredient("菠菜") == "菜叶"
    assert classify_ingredient("土豆") == "根茎"
    assert classify_ingredient("黄瓜") == "瓜果"
    assert classify_ingredient("苹果") == "水果"
    assert classify_ingredient("毛肚") == "内脏"
    assert classify_ingredient("猪心") == "内脏"
    assert classify_ingredient("鸡胗") == "内脏"
    assert classify_ingredient("肥肠") == "内脏"
    assert classify_ingredient("白千层") == "内脏"
    assert classify_ingredient("血旺") == "内脏"
    assert classify_ingredient("猪黄喉") == "内脏"
    assert classify_ingredient("香肠") == "肉类"
    assert classify_ingredient("牛上脑") == "肉类"
    assert classify_ingredient("猪板油") == "肉类"
    assert classify_ingredient("血鸽") == "肉类"
    assert classify_ingredient("火锅豆腐") == "火锅"
    assert classify_ingredient("牛肉丸") == "火锅"
    assert classify_ingredient("虾滑") == "火锅"
    assert classify_ingredient("火锅鸭血") == "火锅"


def test_prefer_wins_over_classify():
    # 人工归属优先：即便规则会归内脏，prefer=肉类 仍保留
    cats, _ = build_by_category(
        ["猪肉", "毛肚", "香肠"],
        prefer={"毛肚": "肉类", "猪肉": "肉类", "香肠": "肉类"},
    )
    assert "毛肚" in cats["肉类"]
    assert "猪肉" in cats["肉类"]
    assert "香肠" in cats["肉类"]
    cats2, _ = build_by_category(["毛肚"])
    assert "毛肚" in cats2["内脏"]


def test_one_name_one_category():
    names = ["猪肉", "豆腐", "草鱼", "小龙虾", "盐", "未知xyz"]
    cats, fallback = build_by_category(names)
    flat = [n for arr in cats.values() for n in arr]
    assert len(flat) == len(set(flat)) == len(names)
    assert "未知xyz" in fallback
    assert "未知xyz" in cats["调味"]


def test_prefer_existing_assignment():
    names = ["猪肉", "草鱼"]
    cats, _ = build_by_category(names, prefer={"猪肉": "调味"})
    assert "猪肉" in cats["调味"]
    assert "猪肉" not in cats["肉类"]
    assert "草鱼" in cats["鱼"]


def test_unique_names_from_all_dedupes():
    doc = {"categories": {"荤菜": ["猪肉", "鸡肉"], "素菜": ["猪肉", "白菜"]}}
    names = unique_names_from_all(doc)
    assert set(names) == {"白菜", "猪肉", "鸡肉"}
    assert len(names) == 3


def test_format_ten_per_line():
    items = [f"n{i}" for i in range(23)]
    cats = {c: [] for c in CATEGORY_ORDER}
    cats["肉类"] = items
    text = format_by_category_json(cats, total=23)
    parsed = json.loads(text)
    assert parsed["total"] == 23
    assert len(parsed["categories"]["肉类"]) == 23
    # 肉类数组内容区应有多行，且非末行以逗号结尾的行含 10 个
    meat_block = text.split('"肉类": [', 1)[1].split("\n    ]", 1)[0]
    content_lines = [ln for ln in meat_block.splitlines() if ln.strip()]
    assert len(content_lines) == 3
    assert content_lines[0].count('"n') == 10
    assert content_lines[1].count('"n') == 10
    assert content_lines[2].count('"n') == 3


def test_write_after_all(tmp_path: Path):
    catalog = tmp_path / "catalog"
    catalog.mkdir()
    all_doc = {
        "categories": {
            "荤菜": ["猪肉", "草鱼"],
            "素菜": ["豆腐", "菠菜"],
            "未映射": ["盐"],
        }
    }
    (catalog / "ingredients-all.json").write_text(
        json.dumps(all_doc, ensure_ascii=False),
        encoding="utf-8",
    )
    # 先写一版人工归属
    (catalog / "ingredients-all-by-category.json").write_text(
        format_by_category_json(
            {
                **{c: [] for c in CATEGORY_ORDER},
                "调味": ["猪肉"],  # 人工把猪肉标成调味（测试保留）
            },
            total=1,
        ),
        encoding="utf-8",
    )
    out = write_ingredients_by_category(catalog, all_doc=all_doc)
    assert out["total"] == 5
    assert "猪肉" in out["categories"]["调味"]
    path = catalog / "ingredients-all-by-category.json"
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["total"] == 5
    flat = [n for arr in loaded["categories"].values() for n in arr]
    assert len(flat) == len(set(flat)) == 5
