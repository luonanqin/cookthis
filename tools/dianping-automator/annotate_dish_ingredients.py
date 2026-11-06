#!/usr/bin/env python3
"""
从各菜系目录的 *_清洗.json 菜名中识别食材，生成平行标注文件：
  荤菜_食材标注.json / 素菜_食材标注.json / 汤羹_食材标注.json / 主食_食材标注.json

格式：菜名|食材1+食材2（识别不到食材则只保留菜名）
识别：词表最长匹配 + 菜名常见别名归并（非简单分词）。
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from extract_veg_ingredients import _EXTRA_INGREDIENTS, _ingredient_lexicon

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
SRC_TAGS = ("荤菜", "素菜", "汤羹", "主食")
SRC_SUFFIX = "_清洗"
OUT_SUFFIX = "_食材标注"

# 菜名里常见写法 → 词表规范名（键按长度优先匹配）
_ALIASES: dict[str, str] = {
    # 蔬果
    "西红柿": "番茄",
    "蕃茄": "番茄",
    "洋芋": "土豆",
    "马铃薯": "土豆",
    "地瓜": "红薯",
    "番薯": "红薯",
    "红薯尖": "红薯叶",
    "莲藕": "藕",
    "荷藕": "藕",
    "青笋": "莴笋",
    "莴苣": "莴笋",
    "芥蓝": "芥兰",
    "邹皮椒": "皱皮椒",
    "驺皮椒": "皱皮椒",
    "杭椒": "青椒",
    "线椒": "青椒",
    "尖椒": "青椒",
    "柿子椒": "青椒",
    "菜椒": "青椒",
    "螺丝椒": "青椒",
    "干豆腐": "豆腐干",
    "豆干": "豆腐干",
    "香干": "豆腐干",
    "磨菇": "蘑菇",
    "冬菇": "香菇",
    "花菇": "香菇",
    "金菇": "金针菇",
    "娃娃菜": "白菜",
    "黄芽菜": "白菜",
    "大白菜": "白菜",
    "小白菜": "小白菜",
    "上海青": "上海青",
    "油麦菜": "油麦菜",
    "空心菜": "空心菜",
    "蒜苔": "蒜薹",
    "蒜毫": "蒜薹",
    "蒜苗": "青蒜",
    "大葱": "葱",
    "小葱": "葱",
    "香葱": "葱",
    "葱花": "葱",
    "生姜": "姜",
    "仔姜": "姜",
    "子姜": "姜",
    "老姜": "姜",
    "大蒜": "蒜",
    "蒜蓉": "蒜",
    "蒜泥": "蒜",
    "蒜茸": "蒜",
    "独头蒜": "蒜",
    # 豆制品 / 粉面
    "豆腐": "豆腐",
    "北豆腐": "豆腐",
    "南豆腐": "豆腐",
    "内酯豆腐": "豆腐",
    "嫩豆腐": "豆腐",
    "老豆腐": "豆腐",
    "冻豆腐": "冻豆腐",
    "油豆腐": "油豆腐",
    "豆腐皮": "豆腐皮",
    "千张": "千张",
    "百叶": "千张",
    "腐竹": "腐竹",
    "粉丝": "粉丝",
    "粉条": "粉条",
    "宽粉": "宽粉",
    "红薯粉": "粉条",
    "土豆粉": "粉条",
    "凉皮": "凉皮",
    "拉皮": "凉皮",
    # 蛋奶
    "土鸡蛋": "鸡蛋",
    "鸡蛋": "鸡蛋",
    "蛋清": "鸡蛋",
    "蛋黄": "鸡蛋",
    "皮蛋": "皮蛋",
    "咸蛋": "咸蛋",
    "鸭蛋": "鸭蛋",
    # 畜禽水产（菜名简称）
    "猪肉": "猪肉",
    "五花肉": "五花肉",
    "五花": "五花肉",
    "排骨": "排骨",
    "肋排": "排骨",
    "小排": "排骨",
    "肉丝": "猪肉",
    "肉片": "猪肉",
    "肉丁": "猪肉",
    "肉末": "猪肉",
    "肉沫": "猪肉",
    "瘦肉": "猪肉",
    "里脊": "猪肉",
    "猪肝": "猪肝",
    "猪肚": "猪肚",
    "猪蹄": "猪蹄",
    "猪耳": "猪耳",
    "猪血": "猪血",
    "肥肠": "肥肠",
    "腊肉": "腊肉",
    "香肠": "香肠",
    "火腿": "火腿",
    "牛肉": "牛肉",
    "牛腩": "牛腩",
    "牛腱": "牛肉",
    "牛百叶": "牛百叶",
    "肥牛": "牛肉",
    "羊肉": "羊肉",
    "羊排": "羊肉",
    "羊蝎子": "羊肉",
    "肥羊": "羊肉",
    "鸡肉": "鸡肉",
    "鸡翅": "鸡翅",
    "鸡爪": "鸡爪",
    "鸡脚": "鸡爪",
    "鸡腿": "鸡肉",
    "鸡胸": "鸡肉",
    "鸡胗": "鸡胗",
    "鸡肝": "鸡肝",
    "鸡杂": "鸡肉",
    "童子鸡": "鸡肉",
    "仔鸡": "鸡肉",
    "土鸡": "鸡肉",
    "溜达鸡": "鸡肉",
    "鸭子": "鸭肉",
    "鸭肉": "鸭肉",
    "烤鸭": "鸭肉",
    "鸭血": "鸭血",
    "鸭肠": "鸭肠",
    "鸭脖": "鸭脖",
    "大鹅": "鹅肉",
    "鹅肉": "鹅肉",
    "兔肉": "兔肉",
    "虾仁": "虾仁",
    "大虾": "虾",
    "基围虾": "虾",
    "河虾": "河虾",
    "小龙虾": "小龙虾",
    "龙虾": "小龙虾",
    "鱿鱼须": "鱿鱼",
    "鱿鱼": "鱿鱼",
    "墨鱼": "墨鱼",
    "带鱼": "带鱼",
    "鲈鱼": "鲈鱼",
    "草鱼": "草鱼",
    "鲫鱼": "鲫鱼",
    "鲤鱼": "鲤鱼",
    "黑鱼": "黑鱼",
    "黄鱼": "黄鱼",
    "带鱼": "带鱼",
    "鱼头": "鱼头",
    "鱼片": "鱼",
    "鱼块": "鱼",
    "鱼丸": "鱼",
    "螃蟹": "螃蟹",
    "大闸蟹": "大闸蟹",
    "蟹黄": "蟹黄",
    "花蛤": "花蛤",
    "蛤蜊": "花蛤",
    "生蚝": "生蚝",
    "牡蛎": "生蚝",
    "鲍鱼": "鲍鱼",
    "海参": "海参",
    "田鸡": "田鸡",
    "牛蛙": "牛蛙",
    # 主食相关
    "大米": "米",
    "米饭": "米",
    "糯米": "糯米",
    "米粉": "米粉",
    "米线": "米线",
    "面条": "面条",
    "挂面": "面条",
    "冷面": "面条",
    "饺子": "饺子",
    "水饺": "饺子",
    "馄饨": "馄饨",
    "包子": "包子",
    "馒头": "馒头",
    "花卷": "花卷",
    "年糕": "年糕",
    "粽子": "粽子",
    "土豆丝": "土豆",
    "藕片": "藕",
    "茄子": "茄子",
    "豆角": "豆角",
    "干豆角": "豆角",
    "油豆角": "豆角",
    "四季豆": "四季豆",
    "豇豆": "豇豆",
    "芥末": "芥末",
    "酸菜": "酸菜",
    "泡菜": "泡菜",
    "野菜": "野菜",
    "花生米": "花生",
    "花生": "花生",
    "核桃仁": "核桃",
    "板栗": "板栗",
    "栗子": "板栗",
    "马蹄": "马蹄",
    "荸荠": "马蹄",
}

# 单字匹配白名单（避免「桃」「梨」「糖」等误伤）
_SINGLE_OK = frozenset(
    {"藕", "鱼", "虾", "蟹", "蒜", "姜", "葱", "笋", "椒", "肉", "鸡", "鸭", "鹅", "蛋", "茄"}
)

# 匹配到后归并的单字
_SINGLE_CANON = {
    "肉": "猪肉",
    "鸡": "鸡肉",
    "鸭": "鸭肉",
    "鹅": "鹅肉",
    "虾": "虾",
    "鱼": "鱼",
    "蟹": "螃蟹",
    "椒": "辣椒",
    "笋": "笋",
    "藕": "藕",
    "蒜": "蒜",
    "姜": "姜",
    "葱": "葱",
    "蛋": "鸡蛋",
    "茄": "茄子",
}

# 不做食材输出的词（调味/虚词；即使在 builtin 里）
_SKIP_AS_INGREDIENT = frozenset(
    {
        "盐",
        "糖",
        "醋",
        "油",
        "酱油",
        "生抽",
        "老抽",
        "料酒",
        "味精",
        "鸡精",
        "胡椒",
        "花椒",
        "孜然",
        "十三香",
        "豆瓣酱",
        "郫县豆瓣",
        "甜面酱",
        "芝麻酱",
        "耗油",
        "蚝油",
        "香油",
        "麻油",
        "淀粉",
        "水",
        "冰",
    }
)

_SHAPE = tuple("丝片块丁条段粒泥末卷")
_NON_WORD = re.compile(r"[\s\d¥￥折/\\|（）()\[\]【】《》<>·•_\-—~～,，.。!！?？:：;；]+")


@lru_cache(maxsize=1)
def _match_table() -> list[tuple[str, str]]:
    """(匹配串, 规范食材名)，按匹配串长度降序。"""
    canon: dict[str, str] = {}

    for n in _ingredient_lexicon():
        n = n.strip()
        if len(n) < 1 or n in _SKIP_AS_INGREDIENT:
            continue
        canon[n] = n

    for n in _EXTRA_INGREDIENTS:
        n = n.strip()
        if len(n) >= 2 and n not in _SKIP_AS_INGREDIENT:
            canon.setdefault(n, n)

    # 别名覆盖 / 补充
    for alias, target in _ALIASES.items():
        alias = alias.strip()
        target = target.strip()
        if len(alias) < 1:
            continue
        canon[alias] = target
        # 确保规范名自身也可匹配
        if target not in _SKIP_AS_INGREDIENT:
            canon.setdefault(target, target)

    # 单字简称（锅包肉→肉、辣子鸡→鸡、炒蛋→蛋）
    for ch, target in _SINGLE_CANON.items():
        canon.setdefault(ch, target)

    # 形态后缀：土豆丝 → 土豆（仅当去掉后缀后在表中）
    extras: dict[str, str] = {}
    for key, target in list(canon.items()):
        if key.endswith(_SHAPE) and len(key) >= 3:
            base = key[:-1]
            if base in canon:
                extras[key] = canon[base]
    canon.update(extras)

    items = [(k, v) for k, v in canon.items() if k not in _SKIP_AS_INGREDIENT]
    items.sort(key=lambda kv: (-len(kv[0]), kv[0]))
    return items


def extract_ingredients(dish: str) -> list[str]:
    """从菜名尽可能抽出食材（最长匹配，保序去重）。"""
    s = _NON_WORD.sub("", (dish or "").strip())
    if not s:
        return []

    table = _match_table()
    found: list[str] = []
    seen: set[str] = set()
    i = 0
    n = len(s)
    while i < n:
        matched = False
        for key, target in table:
            kl = len(key)
            if kl == 1 and key not in _SINGLE_OK:
                continue
            if i + kl <= n and s[i : i + kl] == key:
                name = _SINGLE_CANON.get(target, target) if len(target) == 1 else target
                name = _SINGLE_CANON.get(name, name)
                if name and name not in _SKIP_AS_INGREDIENT and name not in seen:
                    seen.add(name)
                    found.append(name)
                i += kl
                matched = True
                break
        if not matched:
            i += 1
    return found


def format_annotated(dish: str) -> str:
    ings = extract_ingredients(dish)
    if not ings:
        return dish
    return f"{dish}|{'+'.join(ings)}"


def process_file(src: Path, dst: Path) -> tuple[int, int]:
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except Exception:
        return 0, 0
    if not isinstance(data, list):
        return 0, 0
    out: list[str] = []
    hit = 0
    for raw in data:
        if not isinstance(raw, str):
            continue
        dish = raw.strip()
        if not dish:
            continue
        line = format_annotated(dish)
        if "|" in line:
            hit += 1
        out.append(line)
    dst.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return len(out), hit


def main() -> None:
    if not OUTPUT_DIR.is_dir():
        print(f"无目录：{OUTPUT_DIR}")
        return
    print(f"从 *_清洗.json 标注食材 → *{OUT_SUFFIX}.json")
    print(f"匹配词条 {_match_table().__len__()}（词表+别名）")
    # 自检样例
    for demo in ("芥末菠菜", "番茄炒蛋", "青椒肉丝", "冻豆腐炖白菜", "酸菜猪肉水饺", "干煸鱿鱼须"):
        print(f"  样例 {demo} → {format_annotated(demo)}")

    total = hit_total = files = 0
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        for cuisine_dir in sorted(p for p in city_dir.iterdir() if p.is_dir()):
            for tag in SRC_TAGS:
                src = cuisine_dir / f"{tag}{SRC_SUFFIX}.json"
                if not src.is_file():
                    continue
                dst = cuisine_dir / f"{tag}{OUT_SUFFIX}.json"
                n, h = process_file(src, dst)
                files += 1
                total += n
                hit_total += h
                print(f"  {city_dir.name}/{cuisine_dir.name}/{tag}: {n} 道，识别到食材 {h}")
    print(f"\n完成：{files} 个文件 | 菜名 {total} | 含食材标注 {hit_total}")


if __name__ == "__main__":
    main()
