#!/usr/bin/env python3
"""
从各菜系目录的 素菜.json / 荤菜.json 中，提取「整词即单一食材」的名称，
分别写入 素菜_食材.json / 荤菜_食材.json。

规则（从严）：
- 整串（或去掉末尾丝/片/块等形态字后）必须等于词表里的一种食材
  如「豆腐」「土豆丝」→ 土豆；「猴头菇」；「排骨」「鸡翅」
- 「皱皮椒土豆丝」「猪油四季豆」「本味茄子」等带配料/修饰的 → 不要
- 含烹饪手法或拼盘标记的 → 不要
- 可重复执行（覆盖写入）
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

# (源汇总文件名, 输出食材文件名)
SRC_OUT_PAIRS = (
    ("素菜.json", "素菜_食材.json"),
    ("荤菜.json", "荤菜_食材.json"),
)
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BUILTIN_INGREDIENTS = _REPO_ROOT / "data" / "catalog" / "ingredients-builtin.jsonl"

# 词表里常见缺失、但拼菜名里高频的食材（含油脂/豆制品/畜禽水产等）
_EXTRA_INGREDIENTS = """
豆腐 北豆腐 南豆腐 内酯豆腐 冻豆腐 油豆腐 豆腐皮 豆腐干 香干 豆干 千张 百叶 豆皮 腐竹
猪油 猪板油 油渣 肥膘
粉丝 粉条 宽粉 凉粉 面筋 烤麸 素鸡 素鸭 素鹅
茭白 莴笋 青笋 芥兰 芥蓝 芥菜 菜苔 白菜苔 白菜 苋菜 红苋菜 空心菜 油菜 娃娃菜 上海青
四季豆 豇豆 扁豆 豆角 荷兰豆 豌豆 豌豆尖 碗豆尖 毛豆 蚕豆
茄子 西红柿 番茄 黄瓜 丝瓜 苦瓜 冬瓜 南瓜 山药 芋头 香芋 土豆 小土豆 红薯 地瓜 萝卜 白萝卜 胡萝卜 藕 莲藕
木耳 银耳 香菇 平菇 金针菇 杏鲍菇 茶树菇 猴头菇 竹荪 羊肚菌 牛肝菌 口蘑 鸡枞 鸡枞菌 榛蘑 松茸 见手青 奶浆菌
百合 笋 冬笋 春笋 竹笋 脆笋 芦笋 莴苣 丝瓜尖 苦瓜尖
尖椒 青椒 杭椒 线椒 彩椒 辣椒 皱皮椒 邹皮椒 驺皮椒 美人椒 红美人椒
青蒜 蒜苗 韭菜 韭菜花 韭黄 洋葱 大葱 小葱
芹菜 西芹 水芹 水芹菜 香菜 茴香 茼蒿 马兰头 荠菜 蕨菜 枸杞叶 红薯叶 红薯尖
西兰花 花菜 菜花 包菜 卷心菜 紫甘蓝 生菜 罗马生菜 油麦菜 苦菊
玉米 玉米笋 豆芽 黄豆芽 绿豆芽 花生 花生米 核桃 核桃仁 松仁 板栗 莲子 栗子
海带 紫菜 裙带菜 海白菜 沙葱 茨菇 茨菰 芋艿 毛芋艿 菜心 广东菜心 芽菜 黄芽菜
酸菜 野菜 香蕉 樱桃 红豆 蜜豆 芝麻菜
猪肉 牛肉 羊肉 鸡肉 鸭肉 鹅肉 兔肉 五花肉 排骨 肋排 小排 牛排 羊排
猪肝 猪肚 猪蹄 猪耳 猪血 肥肠 腊肉 香肠 火腿 培根
牛腩 牛腱 牛百叶 羊蝎子
鸡翅 鸡爪 鸡脚 鸡腿 鸡胸 鸡胗 鸡肝 鸡杂 童子鸡
鸭血 鸭肠 鸭脖 盐水鸭 板鸭
虾仁 大虾 河虾 小龙虾 基围虾 鱿鱼 墨鱼 带鱼 鲈鱼 草鱼 鲫鱼 鲤鱼 黑鱼 黄鱼
鱼头 螃蟹 大闸蟹 蟹黄 花蛤 蛤蜊 生蚝 鲍鱼 海参 田鸡 牛蛙
鸡蛋 鸭蛋 皮蛋 咸蛋 鹅蛋
""".split()

# 烹饪 / 口味手法（出现任一即排除）
_METHOD_CHARS = (
    "炒煮炖蒸炸煎拌烤烧焖烩爆焗煨卤泡腌烙烫涮煲煸溜汆焯熬扣酿炝熏"
    "煸烩焗煲烙焗"
)
_METHOD_WORDS = (
    "清炒",
    "干煸",
    "手撕",
    "白灼",
    "油淋",
    "蒜蓉",
    "蒜泥",
    "蒜茸",
    "拍蒜",
    "椒盐",
    "椒麻",
    "麻辣",
    "香辣",
    "酸辣",
    "糖醋",
    "红烧",
    "干锅",
    "水煮",
    "上汤",
    "金汤",
    "酸汤",
    "浓汤",
    "蚝油",
    "豉油",
    "红油",
    "姜葱",
    "姜汁",
    "鱼香",
    "宫保",
    "地三鲜",
    "小炒",
    "大炒",
    "农家",
    "家常",
    "风味",
    "特色",
    "秘制",
    "招牌",
    "经典",
    "创意",
    "拔丝",
    "脆皮",
)

# 多料 / 非单食材结构
_MULTI_MARKERS = (
    "配",
    "加",
    "和",
    "与",
    "拼",
    "双拼",
    "什锦",
    "套餐",
    "拼盘",
    "拼菜",
    "合菜",
    "盒菜",
    "时蔬",
    "时令",
    "杂菜",
    "蔬菜",
    "食蔬",
    "烩菜",
    "素什锦",
    "素三样",
    "素烧",
    "素炒",
)

_BAD_EXACT = {
    "下菜",
    "食蔬",
    "时蔬",
    "时疏",
    "蔬菜",
    "杂菜",
    "烩菜",
    "素面",
    "年糕",
    "响铃",
    "茄盒",
    "凤尾",  # 多指菜式部位/造型，偏菜名
}

_NON_INGREDIENT_RE = re.compile(
    r"[\d¥￥折条/\\|（）()\[\]【】《》<>·•_\-—~～,，.。!！?？:：;；]"
)

# 切配形态：允许「土豆丝」「藕片」归一到词表食材
_SHAPE_SUFFIXES = tuple("丝片块丁条段粒泥末卷")


@lru_cache(maxsize=1)
def _ingredient_lexicon() -> frozenset[str]:
    names: set[str] = set()
    if _BUILTIN_INGREDIENTS.is_file():
        for line in _BUILTIN_INGREDIENTS.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            n = (obj.get("name") or "").strip()
            if len(n) >= 2:
                names.add(n)
    for n in _EXTRA_INGREDIENTS:
        n = n.strip()
        if len(n) >= 2:
            names.add(n)
    # 单字食材（常与丝/片等形态搭配）
    for n in ("藕",):
        names.add(n)
    return frozenset(names)


def resolve_single_ingredient(name: str) -> str | None:
    """
    若整串就是一种食材（可带切配后缀），返回词表中的食材名；否则 None。
    「皱皮椒土豆丝」因整串/去丝后都不在词表 → None。
    """
    t = (name or "").strip()
    if not (2 <= len(t) <= 8):
        return None
    if t in _BAD_EXACT:
        return None
    if _NON_INGREDIENT_RE.search(t):
        return None
    if any(ch in t for ch in _METHOD_CHARS):
        return None
    if any(w in t for w in _METHOD_WORDS):
        return None
    if any(w in t for w in _MULTI_MARKERS):
        return None

    lexicon = _ingredient_lexicon()
    if t in lexicon:
        return t
    if t.endswith(_SHAPE_SUFFIXES) and len(t) >= 2:
        base = t[:-1]
        if base in lexicon:
            return base
    return None


def is_pure_ingredient(name: str) -> bool:
    """整串是否可视为单一食材名。"""
    return resolve_single_ingredient(name) is not None


def extract_from_list(names: list) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        if not isinstance(raw, str):
            continue
        ing = resolve_single_ingredient(raw.strip())
        if not ing or ing in seen:
            continue
        seen.add(ing)
        out.append(ing)
    out.sort(key=lambda s: (len(s), s))
    return out


def process_one(cuisine_dir: Path, src_name: str, out_name: str) -> tuple[int, int]:
    src = cuisine_dir / src_name
    if not src.is_file():
        return 0, 0
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except Exception:
        return 0, 0
    if not isinstance(data, list):
        return 0, 0
    ingredients = extract_from_list(data)
    out = cuisine_dir / out_name
    out.write_text(
        json.dumps(ingredients, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(data), len(ingredients)


def main() -> None:
    if not OUTPUT_DIR.is_dir():
        print(f"无目录：{OUTPUT_DIR}")
        return
    print("从各菜系 素菜/荤菜 提取纯食材 → *_食材.json")
    print(f"食材词表 {len(_ingredient_lexicon())} 个（含 builtin + 补充）")
    total_src = total_ing = 0
    files = 0
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        for cuisine_dir in sorted(p for p in city_dir.iterdir() if p.is_dir()):
            for src_name, out_name in SRC_OUT_PAIRS:
                src_n, ing_n = process_one(cuisine_dir, src_name, out_name)
                if src_n == 0 and not (cuisine_dir / src_name).is_file():
                    continue
                files += 1
                total_src += src_n
                total_ing += ing_n
                tag = src_name.replace(".json", "")
                print(f"  {city_dir.name}/{cuisine_dir.name}/{tag}: {src_n} → 食材 {ing_n}")
    print(f"\n完成：{files} 个文件 | 条目 {total_src} → 食材 {total_ing}")


if __name__ == "__main__":
    main()
