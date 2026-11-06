#!/usr/bin/env python3
"""根据人工标注规律，为 review-titles-over-6.txt 补全清洗菜名。"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IN = ROOT / "data/recipes/xiachufang/review-titles-over-6.txt"
INGREDIENTS_ALL = ROOT / "data/catalog/ingredients-all.json"
INGREDIENTS_BUILTIN = ROOT / "data/catalog/ingredients-builtin.json"
ALIASES_JSON = ROOT / "data/catalog/aliases.json"

# 做法词后允许接的食材最长字数（贪心匹配上限）
ING_MATCH_MAX = 6
DISH_MAX_LEN = 12

METHODS_SORTED = sorted(
    [
        "凉拌",
        "红烧",
        "清蒸",
        "水煮",
        "蒜蓉",
        "蒜香",
        "椒盐",
        "白灼",
        "糖醋",
        "麻辣",
        "香辣",
        "泰式",
        "照烧",
        "干锅",
        "酱爆",
        "葱爆",
        "爆炒",
        "清炒",
        "干煸",
        "黄焖",
        "红烩",
        "香煎",
        "香烤",
        "慢烤",
        "白切",
        "空气炸锅",
        "迷迭香",
        "金汤",
        "孜然",
        "葱油",
        "腐乳",
        "铁锅炖",
        "砂锅",
        "手撕",
        "卤",
        "炖",
        "焖",
        "烧",
        "炒",
        "蒸",
        "煮",
        "拌",
        "煎",
        "炸",
        "烤",
        "焯",
        "烩",
        "汆",
        "焗",
        "烙",
        "煲",
        "涮",
        "浸",
        "酿",
        "腌",
    ],
    key=len,
    reverse=True,
)
METHOD_RE = re.compile("|".join(re.escape(m) for m in METHODS_SORTED))

HEAD_FLUFF = sorted(
    [
        "今天这个",
        "饭店里面",
        "被爸爸外婆连说好吃好吃的",
        "夏天连吃三大碗饭的秘密武器",
        "不切蓑衣刀也可以貌美如花",
        "孩子长高一定要多吃",
        "妈妈家的味道吃了停不下来的",
        "一端上桌就被秒光的时蔬",
        "不用炸不吸油咸香入味三分的",
        "好吃到舔盘的",
        "好吃到舔盘",
        "招牌菜销魂",
        "绝味广式",
        "这样做的",
        "香辣过瘾最销魂的",
        "超嫩",
        "鲜香",
        "超脆爽的",
        "两分钟做好",
        "荷塘月色",
        "强强联手的",
        "光盘神器",
        "赛过大排档的",
        "不放一滴油的",
        "最的",
        "煎出最原汁原味的",
        "嫩滑多汁就上瘾的",
        "不用厨艺的",
        "拿肉都不换的",
        "给肉都不换的",
        "网红版烤箱",
        "金牌",
        "下饭神器又来了试试这道",
        "三碗米饭还不够酸辣过瘾的",
        "看似复杂其实三步的",
        "巨清新吃一次就上瘾的",
        "口感超细腻的一款清蒸鱼",
        "鲜得连汤汁都不留一滴的",
        "一个小技巧做不输餐馆的",
        "厨房小白也可以做的老乡鸡",
        "无需放肉一样香疯了的",
        "弹爽口好吃到嗦手指的",
        "入冬养生汤推荐味道",
        "如何把鸡胸肉做的好吃",
        "一个话唠包教包会的",
        "一定要试试的清新爽口",
        "一定要试试的",
        "广东大排档风味椒丝",
        "搞得定刁嘴岳父大人的",
        "鲜与香的绝佳搭配淡",
        "比烧烤店好吃一百倍的",
        "又脆又香可以烧烤店的",
        "还记得小时候校门口的",
        "超级入味儿之彩椒",
        "初一饺子配几个小菜",
        "九十岁没牙老人爱吃的",
        "三伏天吃这个太合适了",
        "做一朵开在碗里的花",
        "超详细入味马杀鸡",
        "好吃到飙泪的秘汁多汁",
        "鲜嫩多汁比鲍鱼还好吃",
        "比红烧肉好吃百倍的",
        "10分钟完成不加水的",
        "比外卖好吃百倍超级的",
        "这玩意我能天天吃的",
        "炒出和饭店一样好吃的",
        "终于成功山姆的这个",
        "夏天素菜的",
        "完美天宝兄弟的",
        "小孩也爱吃的家常",
        "可以送三碗米饭的",
        "堪比餐馆的超嫩重庆",
        "你没吃过的烤肉系列",
        "清新爽口的一碟家常",
        "5块钱搞定湖南名菜",
        "嫩滑多汁空气炸锅",
        "酸辣脆爽夏天必吃的",
        "开胃爽口又营养的",
        "这么做中餐厅里的",
        "不好喝负法律责任的",
        "皮蛋的神仙吃法的",
        "成功率百分之百的",
        "无油版巨嫩无比的",
        "一点不输饭店的",
        "比外面好吃太多的",
        "减肥期易做味道",
        "无比鲜嫩多汁的",
        "小朋友百吃不厌的",
        "适合的健康蒸菜",
        "下饭夹馍都好吃的",
        "比辣条好吃百倍的",
        "下饭好吃到尖叫的",
        "三分钟真香",
        "鲜掉舌头的",
        "东北名菜铁锅炖",
        "东北名菜",
        "闻中家常海味一",
        "能干掉两碗大米饭的",
        "夏日爽口开胃小菜",
        "恨不得抱着锅舔的",
        "酷炫屌炸天好吃的",
        "只需要就可以的",
        "丈母娘吃了都夸的",
        "年夜饭必做的凉菜",
        "每次做都光盘的",
        "比烧烤店还好吃的",
        "唇齿留香的爽口",
        "萝卜比鸭好吃的",
        "比辣条还好吃百倍",
        "最好吃的",
        "健身厨男版",
        "私房红烧",
        "私房",
        "易学的",
        "爆好吃的",
        "超级的",
        "下饭神器",
        "家常鲜",
        "开胃泡菜",
        "少女心水果酸奶溶豆蓝莓火龙果",
        "少女心",
        "料汁",
        "拌一盘光一盘好吃到无法停下来的节奏",
        "只需一个窍门即可做出香酥可口脆的",
        "好吃到连汤汁都不剩的",
        "夏季凉拌菜油醋汁酸辣可口低卡拌啥都好吃",
        "重庆李子坝梁山鸡",
        "美容润肤益气补血桃胶皂角米",
        "不会破皮且肉质筋道的滋补",
        "化繁为简原汁原味的",
        "又省事在家也能吃出高级感的",
        "8分钟锁住营养清蒸鱼有窍门",
        "8分钟锁住营养",
        "老少皆宜",
        "和酒店一模一样的",
        "不用烧烤胜似烧烤的",
        "开胃消食下饭的",
        "很有牌面的宴客菜",
        "下饭小菜脆爽",
        "没胃口必看高纤维",
        "全网最鲜的鱼乖鱼",
        "新手零基础",
        "大朋友的壮腰益肾",
        "紫霞仙子降临",
        "西兰花虾仁",
        "不用再出去买了用帝伯朗的锅就能搞定",
        "只需摆好材料去微波惊艳全家的早餐端上桌",
        "第6道",
        "酸辣开胃的",
        "法炖一锅牛肉",
        "冬季",
        "家常主食",
        "家常",
    ],
    key=len,
    reverse=True,
)

STOP_MARKERS = [
    "是超级",
    "简直",
    "每周",
    "新增",
    "香辣下饭",
    "爱吃",
    "朋友看过来",
    "给肉都不换",
    "凭什么",
    "你看你也行",
    "边吃边想念",
    "拌饭巨香",
    "拌饭绝了",
    "总之",
    "鲜香补钙",
    "刮油解馋",
    "健脾润肤",
    "上桌秒空盘",
    "汤都喝干了",
    "鲜甜抢着吃",
    "春天餐桌",
    "下去满嘴",
    "减脂餐",
    "饭店口感",
    "轻松做拿手",
    "电饭煲",
    "炒锅都可以",
    "卤蛋",
    "版轻松",
    "雪碧水果",
    "一根甜玉米",
    "一勺",
    "就能做",
    "非常适合",
    "都可以做",
    "可以直接出去",
    "烤圣女果",
    "新手速",
    "附剥",
    "含花胶",
    "原料",
    "不加一滴",
    "不加一",
    "三碗米饭",
    "不可少的菜",
    "蒜蓉花蛤",
    "竹节虾",
    "斑节虾竹",
    "黄鸭叫",
    "边吃边",
    "奶白菜",
]

BAD_AFTER_DE_PREFIX = (
    "朋友",
    "节奏",
    "一款",
    "时蔬",
    "滋补",
    "清新爽口",
    "秘汁",
    "超嫩",
    "烤肉系列",
    "家常",
    "老乡鸡",
    "健康蒸菜",
    "花",
    "门腔",
    "大豆腐",
    "或干",
    "排骨或",
)

ING_ALIAS = {
    "豆油皮": ["豆腐皮", "豆皮"],
    "油豆皮": ["豆腐皮", "豆皮"],
    "猪龙骨": ["龙骨"],
    "猪舌头": ["猪舌"],
    "水芹菜": ["芹菜", "水芹菜"],
    "青虾仁": ["虾仁"],
    "鸡中翅": ["鸡翅"],
    "鸡翅中": ["鸡翅"],
    "鸡全翅": ["鸡翅"],
    "豆腐泡": ["豆泡", "油豆腐"],
    "油豆腐": ["油豆腐", "豆泡"],
    "脆骨": ["脆骨", "鸡脆骨"],
    "小黄鱼": ["黄花鱼", "小黄鱼", "黄鱼"],
    "干腐竹": ["腐竹"],
    "牛棒骨": ["牛骨髓", "骨髓"],
    "鸡蛋": ["鸡蛋", "蛋"],
    "猪大排": ["猪排", "大排"],
    "九节虾": ["九节虾", "斑节虾", "竹节虾"],
    "黄心菜": ["黄心菜", "奶白菜"],
    "黄辣丁": ["黄辣丁", "黄鸭叫"],
    "鸡小腿": ["鸡腿"],
    "小鸡腿": ["鸡腿"],
    "琵琶腿": ["鸡腿", "琵琶腿"],
    "鸡大腿": ["鸡腿"],
    "鸡胸肉": ["鸡胸肉", "鸡胸"],
    "鸡脯肉": ["鸡胸肉", "鸡胸"],
    "鸡小胸": ["小胸", "鸡胸", "鸡小胸"],
    "美人椒": ["美人椒"],
    "南瓜尖": ["瓜尖", "南瓜尖"],
    "樱桃萝卜": ["萝卜", "樱桃萝卜"],
    "里脊肉": ["里脊"],
    "小里脊": ["里脊"],
    "牛腱肉": ["牛腱子", "牛腱"],
    "筒骨": ["筒子骨", "筒骨"],
    "甜玉米": ["玉米", "甜玉米"],
    "猪筒骨": ["筒子骨", "筒骨"],
    "牛蹄筋": ["牛筋", "蹄筋", "筋头巴脑"],
    "干虾皮": ["虾皮", "干虾皮"],
}

REWRITE_OK = {
    "番茄炒蛋",
    "百合银耳汤",
    "韩式海带汤",
    "仔姜炒鸡肾",
    "空气炸锅三黄鸡",
    "莲藕筒子骨",
    "红烧牛筋头巴脑",
    "蒜蓉粉丝娃娃菜",
    "清蒸老虎斑",
    "小胸炒平菇",
    "爆炒脆骨",
    "白切猪舌",
    "美人椒拌萝卜丝",
    "洋瓜尖炒肉",
    "红烧小黄鱼",
    "水芹菜炒香干",
    "凉拌豆腐皮",
    "香辣豆腐皮",
    "香辣豆皮",
}

_CATALOG_NAMES: set[str] | None = None


def load_catalog_names() -> set[str]:
    """食材词表：builtin + all + aliases，供做法词后匹配。"""
    global _CATALOG_NAMES
    if _CATALOG_NAMES is not None:
        return _CATALOG_NAMES
    names: set[str] = set()
    if INGREDIENTS_ALL.is_file():
        doc = json.loads(INGREDIENTS_ALL.read_text(encoding="utf-8"))
        for arr in (doc.get("categories") or {}).values():
            for n in arr or []:
                if isinstance(n, str) and len(n.strip()) >= 2:
                    names.add(n.strip())
    if INGREDIENTS_BUILTIN.is_file():
        for x in json.loads(INGREDIENTS_BUILTIN.read_text(encoding="utf-8")):
            n = (x.get("name") or "").strip() if isinstance(x, dict) else ""
            if len(n) >= 2:
                names.add(n)
    if ALIASES_JSON.is_file():
        doc = json.loads(ALIASES_JSON.read_text(encoding="utf-8"))
        for k, v in doc.items():
            if k.startswith("_"):
                continue
            if len(k) >= 2:
                names.add(k)
            if isinstance(v, list):
                for a in v:
                    if isinstance(a, str) and len(a.strip()) >= 2:
                        names.add(a.strip())
            elif isinstance(v, str) and len(v.strip()) >= 2:
                names.add(v.strip())
    # 常见菜名里出现、词表可能缺失的配料
    names.update(
        {
            "藕片",
            "肉丝",
            "肉片",
            "肉末",
            "虾仁",
            "粉丝",
            "粉条",
            "鸡蛋",
            "香肠",
            "青椒",
            "牛肉",
            "土豆",
            "西红柿",
            "番茄",
            "蒜苔",
            "蒜薹",
        }
    )
    _CATALOG_NAMES = names
    return names


def match_ingredient_at(s: str, pos: int, vocab: set[str]) -> str:
    """从 pos 起最长匹配一条食材名。"""
    if pos >= len(s):
        return ""
    best = ""
    upper = min(ING_MATCH_MAX, len(s) - pos)
    for L in range(upper, 1, -1):
        frag = s[pos : pos + L]
        if frag in vocab:
            best = frag
            break
    return best


def match_trailing_ingredients(s: str, vocab: set[str] | None = None) -> str:
    """做法后贪心匹配连续食材（可夹「加/和/与/配」）。"""
    vocab = vocab or load_catalog_names()
    out: list[str] = []
    i = 0
    while i < len(s):
        if s[i] in "加和与配":
            nxt = match_ingredient_at(s, i + 1, vocab)
            if nxt:
                out.append(s[i] + nxt)
                i += 1 + len(nxt)
                continue
            break
        hit = match_ingredient_at(s, i, vocab)
        if not hit:
            break
        out.append(hit)
        i += len(hit)
    return "".join(out)


def ends_with_method(s: str) -> str:
    """若以做法词结尾，返回该做法词，否则空。"""
    for m in METHODS_SORTED:
        if s.endswith(m):
            return m
    return ""


def extend_dish_with_ingredients(dish: str, title: str) -> str:
    """
    若菜名落在标题中且以做法结尾（或做法后还有词表食材），
    用词表把后面的食材补上。
    """
    if not dish or not title:
        return dish
    vocab = load_catalog_names()
    # 优先在标题里定位 dish，再向后补
    idx = title.find(dish)
    if idx < 0:
        # 尝试去掉「的」前缀再找
        if "的" in dish:
            short = dish.rsplit("的", 1)[-1]
            idx2 = title.find(short)
            if idx2 >= 0:
                dish, idx = short, idx2
            else:
                return dish
        else:
            return dish
    rest = title[idx + len(dish) :]
    # 已以做法结尾：rest 应是食材
    if ends_with_method(dish):
        extra = match_trailing_ingredients(rest, vocab)
        if extra:
            cand = dish + extra
            if len(cand) <= DISH_MAX_LEN:
                return cand
            # 超长则只留第一段食材
            one = match_ingredient_at(rest, 0, vocab)
            if one and len(dish) + len(one) <= DISH_MAX_LEN:
                return dish + one
        return dish
    # 未以做法结尾，但标题里 dish 后紧跟食材且 dish 内已有做法：也补上
    if METHOD_RE.search(dish):
        extra = match_trailing_ingredients(rest, vocab)
        if extra and len(dish) + len(extra) <= DISH_MAX_LEN:
            return dish + extra
    return dish


def anchors_for(ing: str) -> list[str]:
    out = [ing] + ING_ALIAS.get(ing, [])
    for pref in ("青", "小", "大", "鲜", "干", "老", "土", "嫩", "细"):
        if ing.startswith(pref) and len(ing) > len(pref) + 1:
            out.append(ing[len(pref) :])
    if ing.endswith("肉") and len(ing) > 2:
        out.append(ing[:-1])
    seen: set[str] = set()
    res: list[str] = []
    for x in out:
        if x and x not in seen:
            seen.add(x)
            res.append(x)
    return res


def strip_de_modifiers(s: str) -> str:
    """「xxx的 / xxx之」基本都是修饰：反复取最后一个「的/之」后面的部分。"""
    s = (s or "").strip()
    while True:
        cut = -1
        for sep in ("的", "之"):
            i = s.rfind(sep)
            if i > cut:
                cut = i
        if cut < 0:
            break
        after = s[cut + 1 :].strip()
        if len(after) < 2 or after == s:
            break
        s = after
    return s


def strip_head(s: str) -> str:
    changed = True
    while changed:
        changed = False
        for h in HEAD_FLUFF:
            if s.startswith(h):
                s = s[len(h) :]
                changed = True
                break
        if s.startswith("的"):
            s = s[1:]
            changed = True
    return strip_de_modifiers(s)


def cut_at_stop(s: str) -> str:
    cut = len(s)
    for m in STOP_MARKERS:
        i = s.find(m)
        if i >= 3:
            cut = min(cut, i)
    return s[:cut]


def upgrade_method(dish: str, title: str) -> str:
    for long, short in [
        ("凉拌", "拌"),
        ("红烧", "烧"),
        ("清蒸", "蒸"),
        ("爆炒", "炒"),
        ("清炒", "炒"),
        ("蒜蓉", "蓉"),
        ("腐乳", "乳"),
        ("白灼", "灼"),
    ]:
        if dish.startswith(short) and not dish.startswith(long):
            alt = long + dish[len(short) :]
            if alt in title and 3 <= len(alt) <= 10:
                return alt
    return dish


def is_dish_like(s: str) -> bool:
    if len(s) < 2 or len(s) > DISH_MAX_LEN:
        return False
    if len(s) == 2 and s not in load_catalog_names():
        return False
    if re.search(r"[0-9a-zA-Z丨|]", s):
        return False
    if s[0] in "的了吗呢吧啊个这那就也很最不把被用和与及或等附含版是节奏款武器时蔬滋补一朋友绝佳搭配淡下来":
        return False
    if s[-1] in "的了吗呢吧啊呀哦版法是或":
        return False
    return True


def extract_dish(title: str, ing: str) -> str:
    t = re.sub(r"\s+", "", title or "")
    if not t:
        return ""

    if ing in ("玉米", "甜玉米") and "玉米烙" in t:
        return "玉米烙"
    if ing in ("鸡蛋", "蛋") and "番茄鸡蛋" in t:
        return "番茄炒蛋"
    if ing in ("银耳", "百合") and "百合银耳" in t:
        return "百合银耳汤"
    if ing == "海带" and "韩式海带" in t:
        return "韩式海带汤"
    if "子姜炒" in t and ing == "鸡肾":
        return "仔姜炒鸡肾"
    if "空气炸锅" in t and ing == "三黄鸡":
        return "空气炸锅三黄鸡"
    if ing == "猪筒骨" and "筒子骨" in t and "莲藕" in t:
        return "莲藕筒子骨"
    if ing == "牛蹄筋" and "牛筋头巴脑" in t:
        return "红烧牛筋头巴脑"
    if ing == "娃娃菜" and "粉丝" in t and "娃娃菜" in t:
        return "蒜蓉粉丝娃娃菜"
    if ing == "芝麻菜" and "油醋汁拌芝麻菜" in t:
        return "油醋汁拌芝麻菜"
    if ing == "老虎斑" and "清蒸" in t:
        return "清蒸老虎斑"
    if ing == "水芹菜" and "芹菜炒香干" in t:
        return "水芹菜炒香干"
    if ing == "猪舌头" and "白切" in t:
        return "白切猪舌"
    if ing == "脆骨" and "爆炒" in t:
        return "爆炒脆骨"
    if ing == "鸡小胸" and "炒平菇" in t:
        return "小胸炒平菇"

    anchors = anchors_for(ing)
    cands: dict[str, int] = {}

    def add(dish: str, score: int) -> None:
        dish = upgrade_method(dish.strip("的了吗呢吧"), t)
        dish = extend_dish_with_ingredients(dish, t)
        # 光杆做法结尾且补不出食材 → 降权/丢弃
        if ends_with_method(dish):
            score -= 40
        if not is_dish_like(dish):
            return
        has_m = bool(METHOD_RE.search(dish))
        has_a = any(a in dish for a in anchors)
        if not has_m and not has_a:
            return
        if not has_m and not (has_a and len(dish) <= 6):
            return
        sc = score
        if has_m:
            sc += 8
        if has_a:
            sc += 6
        if ing in dish:
            sc += 4
        # 做法后带词表食材加分
        m = ends_with_method(dish)
        if not m:
            for meth in METHODS_SORTED:
                i = dish.rfind(meth)
                if i >= 0 and i + len(meth) < len(dish):
                    tail = dish[i + len(meth) :]
                    if match_trailing_ingredients(tail) == tail and tail:
                        sc += 12
                        break
        if 4 <= len(dish) <= 7:
            sc += 6
        elif len(dish) == 8:
            sc += 2
        elif len(dish) >= 10:
            sc -= 2
        if dish not in t and dish not in REWRITE_OK:
            sc -= 20
        # 仍带明显营销前缀的减分
        if dish.startswith(("超脆爽", "两分钟", "赛过", "拿肉", "给肉", "网红", "金牌")):
            sc -= 30
        cands[dish] = max(cands.get(dish, -999), sc)

    if "的" in t:
        after = cut_at_stop(t.rsplit("的", 1)[-1])
        if after and not after.startswith(BAD_AFTER_DE_PREFIX):
            add(after, 100)

    body = cut_at_stop(strip_head(t))
    if 3 <= len(body) <= 10:
        add(body, 120)
    elif len(body) > 10:
        for m in METHODS_SORTED:
            i = 0
            while True:
                i = body.find(m, i)
                if i < 0:
                    break
                for anc in anchors:
                    j = body.find(anc, i)
                    if 0 <= j - i <= 8:
                        add(body[i : j + len(anc)], 110)
                    k = body.rfind(anc, max(0, i - 6), i + 1)
                    if k >= 0:
                        end = i + len(m)
                        extra = match_trailing_ingredients(body[end:])
                        end2 = end + len(extra)
                        if end2 - k <= DISH_MAX_LEN:
                            add(body[k:end2], 115)
                        else:
                            add(body[k:end], 100)
                i += 1
        for n in range(min(8, len(body)), 2, -1):
            pref = body[:n]
            if METHOD_RE.search(pref) and any(a in pref for a in anchors):
                add(pref, 105)
                break

    for n in range(min(8, len(t)), 2, -1):
        pref = t[:n]
        if pref.startswith(("易学", "超级", "爆好", "今天", "饭店", "私房", "料汁", "冬季", "家常蒜蓉花甲蒜")):
            continue
        if METHOD_RE.search(pref) and any(a in pref for a in anchors):
            add(pref, 125)
            break

    for L in range(3, 9):
        frag = t[-L:]
        if METHOD_RE.search(frag) and any(a in frag for a in anchors):
            add(frag, 80)
        if "的" in t:
            idx = t.rfind("的")
            frag = t[idx + 1 : idx + 1 + L]
            if len(frag) == L and not frag.startswith(BAD_AFTER_DE_PREFIX):
                add(frag, 90)

    if not cands:
        if "的" in t:
            after = cut_at_stop(t.rsplit("的", 1)[-1])
            if (
                3 <= len(after) <= 8
                and any(a in after for a in anchors)
                and not after.startswith(BAD_AFTER_DE_PREFIX)
            ):
                return after
        return ""

    ranked = sorted(cands.items(), key=lambda x: (-x[1], len(x[0]), x[0]))
    best = ranked[0][0]
    best = extend_dish_with_ingredients(best, t)
    # 最终再剥一层「xxx的」修饰
    best = strip_de_modifiers(best)
    best = extend_dish_with_ingredients(best, t)
    return best


def parse_space_annotation(field4: str) -> tuple[str, str]:
    m = re.match(r"^(.*?)\s{2,}(\S+)\s*$", field4)
    if m and 2 <= len(m.group(2)) <= 12:
        return m.group(1), m.group(2)
    return field4.rstrip(), ""


def load_rows(path: Path) -> list[tuple[str, str, str, str, str]]:
    """Return list of (len, count, ing, title, existing_dish)."""
    rows: list[tuple[str, str, str, str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        ln, cnt, ing, rest = parts[0], parts[1], parts[2], parts[3]
        dish = parts[4].strip() if len(parts) >= 5 else ""
        title, space_dish = parse_space_annotation(rest)
        if not dish and space_dish:
            dish = space_dish
        title = re.sub(r"\s+清蒸老虎斑$", "", title)
        rows.append((ln, cnt, ing, title, dish))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="在 review-titles-over-6.txt 内补全空的清洗菜名")
    ap.add_argument("--input", type=Path, default=DEFAULT_IN)
    ap.add_argument("--write", action="store_true", help="写回原文件；默认只预览统计")
    ap.add_argument(
        "--refill-all",
        action="store_true",
        help="连已有清洗菜名也重抽（默认只填空列）",
    )
    ap.add_argument(
        "--from-line",
        type=int,
        default=0,
        help="从文件物理行号起重抽清洗菜名（含该行）；之前行原样保留",
    )
    args = ap.parse_args()

    load_catalog_names()
    raw_lines = args.input.read_text(encoding="utf-8").splitlines()

    # 解析数据行，记录物理行号
    data_rows: list[tuple[int, str, str, str, str, str]] = []
    for i, line in enumerate(raw_lines, 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        dish = parts[4].strip() if len(parts) >= 5 else ""
        title, space_dish = parse_space_annotation(parts[3])
        if not dish and space_dish:
            dish = space_dish
        title = re.sub(r"\s+清蒸老虎斑$", "", title)
        data_rows.append((i, parts[0], parts[1], parts[2], title, dish))

    title_kept: dict[str, list[tuple[str, str]]] = defaultdict(list)
    # 保留区（from-line 之前）的已有清洗名，可供同标题复用
    for i, ln, cnt, ing, title, dish in data_rows:
        if args.from_line and i < args.from_line and dish:
            title_kept[title].append((ing, dish))
        elif not args.from_line and not args.refill_all and dish:
            title_kept[title].append((ing, dish))

    new_dish_by_line: dict[int, str] = {}
    kept = filled = empty = skipped = 0
    for i, ln, cnt, ing, title, existing in data_rows:
        if args.from_line and i < args.from_line:
            skipped += 1
            continue
        if existing and not args.refill_all and not args.from_line:
            dish = existing
            kept += 1
        else:
            dish = ""
            for i2, d2 in title_kept.get(title, []):
                if any(a in d2 for a in anchors_for(ing)):
                    dish = d2
                    break
            if not dish:
                dish = extract_dish(title, ing)
            if dish:
                filled += 1
                title_kept[title].append((ing, dish))
            else:
                empty += 1
        new_dish_by_line[i] = dish

    print(
        f"skipped_before={skipped} kept={kept} "
        f"refilled={filled} empty={empty} catalog={len(load_catalog_names())}"
    )

    if not args.write:
        # 预览 from-line 起前 20 条变化
        n = 0
        for i, ln, cnt, ing, title, existing in data_rows:
            if i not in new_dish_by_line:
                continue
            new = new_dish_by_line[i]
            if new != existing:
                print(f"L{i}: {existing!r} -> {new!r} | {ing} | {title[:28]}")
                n += 1
                if n >= 25:
                    break
        print("(dry-run；加 --write 写回)")
        return

    out: list[str] = []
    for i, line in enumerate(raw_lines, 1):
        if i in new_dish_by_line:
            parts = line.split("\t")
            title, _ = parse_space_annotation(parts[3])
            title = re.sub(r"\s+清蒸老虎斑$", "", title)
            dish = new_dish_by_line[i]
            out.append(f"{parts[0]}\t{parts[1]}\t{parts[2]}\t{title}\t{dish}")
        else:
            out.append(line)
    args.input.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {args.input}")


if __name__ == "__main__":
    main()
