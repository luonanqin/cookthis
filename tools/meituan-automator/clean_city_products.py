#!/usr/bin/env python3
"""
清洗美团菜场食材名：

读取 screenshots_inbox/{城市}/products.jsonl（截图 OCR 或 Appium 解析），
写出 screenshots_inbox/{城市}/ingredients-cleaned.json。

Appium 原始 JSON 请先：
  from watch_screenshots import ingest_market_json
  ingest_market_json(Path('.../market.json'))

用法：
  .venv/bin/python clean_city_products.py
  .venv/bin/python clean_city_products.py --city 北京
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

from ocr_products import clean_product_name
from review_lists import ReviewLists, load_review_lists

INBOX = Path(__file__).resolve().parent / "screenshots_inbox"
OUT_NAME = "ingredients-cleaned.json"
_BUILTIN_JSONL = (
    Path(__file__).resolve().parents[2] / "data" / "catalog" / "ingredients-builtin.jsonl"
)

_CJK = re.compile(r"[\u4e00-\u9fff]")
# 整词噪声
_NOISE_EXACT = {
    "冷冻",
    "体冻",
    "速冻",
    "一箱",
    "袋",
    "盒",
    "散称",
    "miss",
    "amiss",
    "mess",
    "sbf",
    "matinz",
    "以上",
    "中国",
    "品牌随机日本",
}
# 去掉未闭合残缺尾巴后再剥一层常见垃圾前缀/后缀
_TRAIL_JUNK = re.compile(
    r"[)）\]】}>»\"'‘’“”…~`^|\\「『【\[（({]+$"
    r"|[A-Za-z0-9]+$"  # 尾部英数乱码：三黄鸡t / 包菜卷心菜BOR
)
_LEAD_JUNK = re.compile(r"^[#*xX×·•「『【\[（(「;:：]+")
# 逗号、冒号等符号直接删掉，不因此整条丢弃
_SYMBOLS = re.compile(
    r"[，。、；;：:！!？?·•…—–\-_.,|/\\()（）【】\[\]「」『』{}<>《》&*#@^`~'\"“”‘’]"
)
# 先剥长词再剥单字，避免「冷冻」被拆成「冷」
_STRIP_WORDS = (
    "鲜活",
    "活鲜",
    "速冻",
    "冷冻",
    "冷鲜",
    "现杀",
    "杀前",
    "现切",
    "鲜切",
    "现做",
    "现卖",
    "散养",
    "家养",
    "手工",
    "整条",
    "整只",
    "杀好",
    "净重",
    "左右",
    "冷水",
    "去皮",
    "带皮",
    "散称",
    "散装",
    "品牌",
    "国产",
    "规格",
    "品种",
    "偏瘦",
    "偏肥",
    "精品",
    "蔬菜",
    "手剥",
    "带壳",
    "带泥",
    "洗净",
    "火锅食材",
    "冷水",
    "农家",
    "农村",
    "切好",
    "去叶",
    "正宗",
    "谷物",
    "原味",
    "放养",
    "普通",
    "活杀",
    "原切",
    "团购",
    "切块",
    "冻",
    "新",
    "冰",
)

# 成菜做法：先剥掉再分词（洋葱炒猪肝 → 洋葱+猪肝）；不含烤/酱（免伤烤麸、花生酱）
_COOK_METHODS = (
    "红烧",
    "清蒸",
    "小炒",
    "清炒",
    "爆炒",
    "炒",
    "炖",
    "焖",
    "烩",
    "煸",
)

# 分词词典补充（粘连切开用；不做别名合并）
_LEXICON_EXTRA = frozenset(
    {
        "鸡脚",
        "眉毛肉",
        "鸡大胸",
        "鸡翅中",
        "牛腱子",
        "小黄鱼",
        "大黄鱼",
        "龙利鱼",
        "巴沙鱼",
        "西蓝花",
        "莴笋头",
        "莴笋杆",
        "青笋头",
        "青笋杆",
        "小米椒",
        "小米辣",
        "小红椒",
        "牛肝菌",
        "牛杆菌",
        "红苕",
        "干辣椒",
        "干海椒",
        "鸡中翅",
        "猪脚",
        "豆腐皮",
        "鲜豆皮",
        "水面筋",
        "海白虾",
        "香干",
        "豆干",
        "油菜",
        "上海青",
        "折耳根",
        "鱼腥草",
        "千层肚",
        "牛百叶",
        "筒子骨",
        "琵琶腿",
        "白条鸭",
        "咸鸭蛋",
        "海鸭蛋",
        "虾滑",
        "牛肉丸",
    }
)


# 数词紧挨量词/单位才删：一只、一个、一条、一根、一盒、二两、半只、整个
# 「二荆条」「牛肋条」里的「条」不挨数词，保留
_MEASURE = re.compile(
    r"(?:一|两|二|三|四|五|六|七|八|九|十|半|俩|几)"
    r"(?:只|个|条|袋|盒|斤|两|根|把|份|块|片|颗|串|包|支|碗|瓶|罐|盘|粒|捆)"
    r"|整个"
)
# 尾部规格残留：一张/一朵/半边/小份/切块…；不动二荆条、折耳根、毛豆粒、千张
_TRAIL_SPEC = re.compile(
    r"(?:"
    r"一切两半|"
    r"半边|半纲|"
    r"小份|"
    r"切块|切片|"
    r"一(?:只|个|条|袋|盒|斤|两|根|把|份|块|片|颗|串|包|支|碗|瓶|罐|盘|粒|捆|朵|枚|张|双|颖)"
    r")$"
)
# 末尾单独数量字：莲藕一、大葱一、老鸭半…
_TRAIL_NUM = re.compile(r"[一二三四五六七八九十两俩几半]$")
# 末尾「块」一律剥；「片」仅保留这些整名
_KEEP_PIAN = frozenset({"玉兰片", "生鱼片", "藕片"})


def _strip_trail_kuai_pian(text: str) -> str:
    t = text
    # 末尾「块」「段」一律剥（切配规格）
    if len(t) >= 2 and t[-1] in ("块", "段"):
        t = t[:-1]
    # 以玉兰片/生鱼片/藕片结尾的保留「片」，其余末尾「片」剥掉
    if t.endswith("片") and len(t) >= 2 and not any(
        t.endswith(k) for k in _KEEP_PIAN
    ):
        t = t[:-1]
    return t


def _strip_qualifiers(text: str) -> str:
    t = text
    changed = True
    while changed:
        changed = False
        for w in _STRIP_WORDS:
            if w in t:
                t = t.replace(w, "")
                changed = True
    # 成菜做法剥掉，留给后续分词拆食材
    changed = True
    while changed:
        changed = False
        for w in _COOK_METHODS:
            if w in t:
                t = t.replace(w, "")
                changed = True
    # 开头的「鲜」去掉（鲜牛肉 → 牛肉）
    while t.startswith("鲜"):
        t = t[1:]
    return t


def _strip_edge_junk(text: str) -> str:
    """反复剥首尾乱码/尾部英数，保留主体汉字。"""
    t = text
    while True:
        n = t
        t = _LEAD_JUNK.sub("", t)
        t = _TRAIL_JUNK.sub("", t)
        t = t.strip(" \t-—_/|.,，。、#*")
        if t == n:
            break
    return t


# OCR 常错字
_OCR_FIX = (
    ("菲", "菇"),
    ("考", "老"),
    ("鲨", "鲢"),
    ("内脂", "内酯"),
    ("化肉", "花肉"),
    ("撬", "擀"),
    ("菩", "菇"),
    ("未", "末"),
    ("腹", "腿"),
    ("苔", "苕"),
    ("茨", "蒜"),
    ("莉", "莴"),
)

# 冲/决：后面跟冻 → 冷（冲冻/决冻 → 冷冻）；否则 → 冻
_CHONG_JUE_BEFORE_DONG = re.compile(r"[冲决](?=冻)")
_CHONG_JUE = re.compile(r"[冲决]")


def _fix_chong_jue(text: str) -> str:
    t = _CHONG_JUE_BEFORE_DONG.sub("冷", text)
    return _CHONG_JUE.sub("冻", t)

# 整条精确丢掉（A 界面杂讯 + C OCR 乱码）
_DROP_EXACT = frozenset(
    {
        # A
        "一门门门",
        "上才有下午易缺货",
        "个太大切开卖",
        "么人木目乙",
        "人相邝",
        "以前有货",
        "会切开",
        "伟人木目乙",
        "依但门呈义占心铀人材火",
        "健康纸杯",
        "刚察羊肉不膻不骚",
        "前需清水泡发以免太咸",
        "加载更多",
        "可生吃",
        "和平区猪肉加工类复购榜",
        "和平区食酱菜复购榜",
        "嘎嘎香",
        "基地直供直达",
        "小人木目乙",
        "巳右工巴",
        "提升荷育风味绝佳",
        "毛血旺涮肉食材",
        "浓情端午粽子食材",
        "潮件睾",
        "火铜丸类",
        "火铮丸类",
        "火锅丸类",
        "火锅肠类",
        "火锏丸类",
        "火锡丸类",
        "灯钺酥莴火铁仓材",
        "点击右上",
        "片有差异以实物为准可",
        "特别辣",
        "矶棣亦氙酣访",
        "种随季节变化",
        "绿叶牌不沾油棕刷",
        "袋装",
        "认安断",
        "讨浅气心钾滑勺子",
        "豆浆袋装",
        "超值单品",
        "超值单品任选",
        "退货免运费",
        "透明加厚带盖",
        "途中易缺氧晕死介意慎",
        "酸菜鱼食材",
        "重量会有变化",
        "钾川怡如",
        "限购早",
        "限购时间早",
        "随季节变化",
        "需清水泡发以免太成",
        "食材",
        "香浓软糯家常美味",
        # C
        "万门",
        "古人目",
        "啦嘎租",
        "木才",
        "札目",
    }
)

# 整条丢掉（含这些地名/来源/套装）
_DROP_CONTAINS = (
    "重庆",
    "清远",
    "组合",
    "第",
    "肉片",
    "肉末",
    "肉沫",
    "调料",
    "适合",
    "宰",
    "口",
    "默认",
    "生态",
    "配",
    "预",
    "馆",
    "现",
    "的",
    "汤",
    "腌",
    "麻辣",
    "随机",
    "备注",
    "简装",
    "绍",
    "龚",
    "拼盘",
    "莫",
    "什锦",
    "馅",
    "做",
    # Appium/店铺页噪声、非生鲜食材
    "坏必赔",
    "一次性",
    "餐具",
    "餐盒",
    "代买",
    "蘸料",
    "调味",
    "火腿肠",
    "三文治",
    "酱油",
    "蚝油",
    "芝麻酱",
    "花生酱",
    # 广告/营销话术 / A 类界面杂讯
    "包赔",
    "放心",
    "购买",
    "称重",
    "超实惠",
    "特价",
    "促销",
    "限时",
    "爆款",
    "热销",
    "手挑",
    "小苏打",
    "雪后食用",
    "省心",
    "神价",
    "超值单品",
    "退货免运费",
    "复购榜",
    "加载更多",
    "限购",
    "丸类",
    "肠类",
    "以实物为准",
    "随季节",
    "泡发以免",
    "参加",
    "耐心",
    "催",
    "染",
    "浪费",
    "承诺",
    "更优惠",
    # 货架噪声：含则整行删
    "多点",
    "熟食",
    "实拍",
    "支持",
    "可切",
    "营养",
    "食材",
    "烧烤",
    "仅限",
    "传奇",
    "必备",
    "勿拍",
    "复购",
    "差额",
    "烹饪",
    "家常",
    "勿点",
    "退款",
    "优惠",
    "到手价",
    # B 类品牌速食/调味成品（虾滑/牛肉丸 在 _apply_place_variety 先行保留）
    "安井",
    "海底捞",
    "双汇",
    "美宁",
    "梅林",
    "金锣",
    "金龙鱼",
    "王致和",
    "智琪",
    "桥头",
    "大红袍",
    "丰彩",
    "广味源",
    "徽味佳",
    "欢建",
    "马佳肴",
    "雪域红",
    "裕海源",
    "金沙河",
    "紫薯庄园",
    "正大",
    "午餐肉",
    "脆皮肠",
    "啵啵肠",
    "油碟",
    "底料",
    "罐头",
    "方便面",
    "川粉",
    "挂面",
    "龙须面",
    "腐乳",
    "辣椒酱",
    "香辣酱",
    "二八酱",
    "蟹味棒",
    "迷你小油条",
    "料包",
    "代餐",
    "火锅面",
    "腊肠香肠",
    "风味香肠",
)
# 直接剥掉的地名（保留其余）
_STRIP_PLACES = (
    "固城湖",
    "天津",
    "潮州",
    "潮汕",
    "湖南",
    "荔浦",
    "广西",
    "平昌特产",
    "平昌",
)
# 猪品种前缀
_STRIP_PIG = ("黑毛猪", "土猪", "黑猪")
# 闸后必须跟蟹：大闸 → 大闸蟹
_GATE_CRAB = re.compile(r"闸(?!蟹)")

# 单字仅保留「虾」「藕」；其余单字多为 OCR 残片
_FOOD_SINGLE = frozenset({"虾", "藕"})


def _apply_place_variety(text: str, skip_drop: bool = False) -> str | None:
    """地名/品种规则；返回 None 表示整条丢掉。"""
    t = text

    # B 类例外：虾滑 / 牛肉丸 归一保留（其余品牌速食走下方丢弃）
    if "虾滑" in t:
        return "虾滑"
    if "牛肉丸" in t:
        return "牛肉丸"

    if not skip_drop:
        if t in _DROP_EXACT:
            return None

        # 重庆、清远、品牌成品等：整条删
        if any(k in t for k in _DROP_CONTAINS):
            return None

    # 「锅」：仅允许「火锅」；去掉火锅后仍含锅 → 整条删
    if "锅" in t.replace("火锅", ""):
        return None

    # 「日」：仅允许「日本豆腐」；去掉后仍含日 → 整条删
    if "日" in t.replace("日本豆腐", ""):
        return None

    # 云南：只留「云南小瓜」，其余含云南的删掉
    if "云南" in t:
        if "云南小瓜" in t:
            return "云南小瓜"
        return None

    # 东北：保留「东北酸菜丝」，其它去掉「东北」
    if "东北" in t:
        if "东北酸菜" in t:
            return "东北酸菜丝"
        t = t.replace("东北", "")

    # 平昌/任意米豆腐 → 米豆腐
    if "米豆腐" in t:
        return "米豆腐"

    # 剥地名
    for p in _STRIP_PLACES:
        t = t.replace(p, "")

    # 闸后面都跟蟹
    t = _GATE_CRAB.sub("闸蟹", t)

    # 猪：去掉黑毛猪、土猪等
    for p in _STRIP_PIG:
        t = t.replace(p, "")

    # 牛：肥牛卷只保留一种
    if "肥牛卷" in t:
        return "肥牛卷"

    # 鸡蛋只有一种（没有土鸡蛋）
    t = t.replace("土鸡蛋", "鸡蛋")

    # 黄花鱼：大/小黄花鱼 → 大/小黄鱼；其余「黄花鱼」（前无大小）直接去掉该词
    t = t.replace("大黄花鱼", "大黄鱼").replace("小黄花鱼", "小黄鱼")
    t = t.replace("黄花鱼", "")

    # 番茄 / 土豆 只有一种
    if "番茄" in t or "西红柿" in t:
        return "番茄"
    if "土豆" in t or "马铃薯" in t or "洋芋" in t:
        return "土豆"

    return t


def refine_name(raw: str, review: ReviewLists | None = None) -> str | None:
    """再清洗；不合格返回 None。"""
    t = clean_product_name(raw or "")
    if not t:
        return None
    for wrong, right in _OCR_FIX:
        t = t.replace(wrong, right)
    t = _fix_chong_jue(t)
    t = _strip_qualifiers(t)
    t = _MEASURE.sub("", t)
    t = _SYMBOLS.sub("", t)
    t = _strip_edge_junk(t)
    if not t:
        return None
    skip_drop = bool(review and t in review.accept)
    t = _apply_place_variety(t, skip_drop=skip_drop)
    if not t:
        return None
    # 剥尾部规格量词、单独数量字、块/片（白名单片名除外）
    while True:
        n = _TRAIL_SPEC.sub("", t)
        n = _TRAIL_NUM.sub("", n)
        n = _strip_trail_kuai_pian(n)
        if n == t:
            break
        t = n
    if not t:
        return None
    low = t.lower()
    if low in _NOISE_EXACT:
        return None
    # 名字里带有非汉字 → 整行丢
    cjk = _CJK.findall(t)
    if len(cjk) != len(t):
        return None
    if len(cjk) < 1:
        return None
    # 过长多半是 OCR 粘行
    if len(cjk) > 12:
        return None
    # 单字：只留「虾」「藕」
    if len(cjk) == 1 and cjk[0] not in _FOOD_SINGLE:
        return None
    # 剥尾后再拦一次精确 junk（如「古人目九」→「古人目」）
    if t in _DROP_EXACT and not (review and t in review.accept):
        return None
    if review and t in review.reject:
        return None
    return t


def _expand_segment_hint(
    key: str, review: ReviewLists
) -> list[str] | None:
    """若 key 在 segment-hints 中，返回各段 refine 后的名；否则 None。"""
    hinted = review.segments.get(key)
    if not hinted:
        return None
    out: list[str] = []
    for part in hinted:
        name = refine_name(part, review)
        if name:
            out.append(name)
    return out or None


def refine_to_parts(raw: str, review: ReviewLists | None = None) -> list[str]:
    """有 segment hint 则拆成 parts；否则 refine_name 成功为 [name]，失败 []。

    hint 在 clean_product_name 与 refine_name 两档都查（避免「鸡中翅-鸡翅」
    归一成「鸡中翅鸡翅」后匹配不到、整段仍进货架）。
    """
    if review and review.segments:
        expanded = _expand_segment_hint(clean_product_name(raw or ""), review)
        if expanded is not None:
            return expanded
    name = refine_name(raw, review)
    if not name:
        return []
    if review and review.segments:
        expanded = _expand_segment_hint(name, review)
        if expanded is not None:
            return expanded
    return [name]


def load_builtin_lexicon(path: Path = _BUILTIN_JSONL) -> set[str]:
    """内置食材名 + 手工补充，作分词词典种子。"""
    names: set[str] = set(_FOOD_SINGLE) | set(_LEXICON_EXTRA)
    if not path.is_file():
        return names
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        name = (rec.get("name") or "").strip()
        if name and all("\u4e00" <= ch <= "\u9fff" for ch in name):
            names.add(name)
    return names


def segment_name(text: str, lexicon: set[str]) -> list[str]:
    """
    清洗后分词：若整串能被 ≥2 个词典词完整覆盖则拆开；
    否则原样保留。不做别名合并（鸡爪 / 鸡脚 可并存）。
    用 DP 而非纯贪心，避免「鸡翅中鸡中」这类残片抢走更长前缀。
    """
    if len(text) < 4:
        return [text]
    usable = {
        w
        for w in lexicon
        if w
        and w != text
        and (len(w) >= 2 or w in _FOOD_SINGLE)
    }
    if not usable:
        return [text]
    n = len(text)
    # dp[i] = 覆盖 text[:i] 的最优切分（段数更少优先）
    dp: list[list[str] | None] = [None] * (n + 1)
    dp[0] = []
    for i in range(n):
        if dp[i] is None:
            continue
        for w in usable:
            j = i + len(w)
            if j > n or text[i:j] != w:
                continue
            cand = dp[i] + [w]
            prev = dp[j]
            if prev is None or len(cand) < len(prev):
                dp[j] = cand
    parts = dp[n]
    if parts is not None and len(parts) >= 2:
        return parts
    return [text]


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def iter_refined(city_dir: Path, review: ReviewLists | None = None):
    """产出 (category, cleaned_parts, raw_n_delta)。"""
    jsonl = city_dir / "products.jsonl"
    for rec in load_jsonl(jsonl):
        cat = (rec.get("category") or "未分类").strip() or "未分类"
        for name in rec.get("after") or []:
            yield cat, refine_to_parts(name, review), 1


def _accumulate(
    by_cat: dict[str, set[str]],
    cat: str,
    names: list[str],
    lexicon: set[str],
    review: ReviewLists | None = None,
) -> tuple[int, int]:
    """写入 by_cat；返回 (kept_delta, split_delta)。

    len≥4 且未经 accept 的：整段保留进货架，供 pending（不自动拆）。
    """
    kept = 0
    split_delta = 0
    accept = review.accept if review else set()
    for cleaned in names:
        if len(cleaned) >= 4 and cleaned not in accept:
            parts = [cleaned]
        else:
            parts = segment_name(cleaned, lexicon)
        if len(parts) >= 2:
            split_delta += 1
        for part in parts:
            if len(part) == 1 and part not in _FOOD_SINGLE:
                continue
            by_cat[cat].add(part)
            kept += 1
    return kept, split_delta


def clean_city(
    city_dir: Path,
    lexicon: set[str],
    review: ReviewLists | None = None,
) -> dict:
    jsonl = city_dir / "products.jsonl"
    city = city_dir.name
    by_cat: dict[str, set[str]] = defaultdict(set)
    raw_n = kept_n = split_n = 0

    for cat, parts, _ in iter_refined(city_dir, review):
        raw_n += 1
        k, s = _accumulate(by_cat, cat, parts, lexicon, review)
        kept_n += k
        split_n += s

    out: dict = {"city": city}
    for cat in sorted(by_cat.keys()):
        out[cat] = sorted(by_cat[cat])
    out["_meta"] = {
        "source": str(jsonl.name),
        "raw_after": raw_n,
        "kept": kept_n,
        "split_glued": split_n,
        "unique": sum(len(v) for k, v in out.items() if k not in ("city", "_meta")),
    }
    return out


def _write_cleaned(data: dict, out_path: Path) -> None:
    meta = data.pop("_meta", {})
    ordered: dict = {"city": data.pop("city")}
    for k in sorted(data.keys()):
        ordered[k] = data[k]
    ordered["_meta"] = meta
    out_path.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    counts = {k: len(v) for k, v in ordered.items() if k not in ("city", "_meta")}
    print(
        f"{ordered['city']}: {counts}  → {out_path.name}  "
        f"(raw={meta.get('raw_after')} kept_unique={meta.get('unique')} "
        f"split={meta.get('split_glued')})"
    )


def main() -> None:
    REVIEW_DIR = Path(__file__).resolve().parents[2] / "data" / "catalog" / "review"
    review = load_review_lists(REVIEW_DIR)
    ap = argparse.ArgumentParser(
        description="清洗 screenshots_inbox/{城}/products.jsonl → ingredients-cleaned.json"
    )
    ap.add_argument("--inbox", type=Path, default=INBOX)
    ap.add_argument("--city", type=str, default=None, help="只处理指定城市")
    ap.add_argument(
        "--out-name",
        type=str,
        default=OUT_NAME,
        help="输出文件名（写在城市目录下）",
    )
    ap.add_argument(
        "--pending-min-len",
        type=int,
        default=None,
        help="刷新 pending 的最短字数（默认用 pending_review.DEFAULT_MIN_LEN）",
    )
    ap.add_argument(
        "--pending-max-len",
        type=int,
        default=None,
        help="刷新 pending 的最长字数（含）；省略不限制",
    )
    args = ap.parse_args()

    inbox: Path = args.inbox
    if not inbox.is_dir():
        print(f"无目录：{inbox}")
        raise SystemExit(1)

    # 若城目录仅有 market.json、尚无 products.jsonl，先解析
    from watch_screenshots import ingest_market_json

    for city_dir in sorted(p for p in inbox.iterdir() if p.is_dir()):
        market_json = city_dir / "market.json"
        products = city_dir / "products.jsonl"
        if market_json.is_file() and not products.is_file():
            ingest_market_json(market_json, inbox, keep_raw=True)

    cities = sorted(
        p
        for p in inbox.iterdir()
        if p.is_dir() and (p / "products.jsonl").is_file()
    )
    if args.city:
        cities = [p for p in cities if p.name == args.city]
        if not cities:
            print(f"未找到城市或 products.jsonl：{args.city}")
            raise SystemExit(1)

    # 词典：builtin + accept + segment 段 + 仅 ≤3 字清洗名（≥4 留给 pending）
    lexicon = load_builtin_lexicon()
    lexicon |= set(review.accept)
    for segs in review.segments.values():
        lexicon.update(segs)
    for city_dir in cities:
        for _, parts, _ in iter_refined(city_dir, review):
            for cleaned in parts:
                if len(cleaned) <= 3:
                    lexicon.add(cleaned)

    for city_dir in cities:
        data = clean_city(city_dir, lexicon, review)
        _write_cleaned(data, city_dir / args.out_name)

    # 全量清洗后刷新待审（单城时也基于 inbox 里已有 cleaned 汇总）
    from pending_review import DEFAULT_MIN_LEN, write_pending

    pend_kw: dict = {"review_dir": REVIEW_DIR}
    if args.pending_min_len is not None:
        pend_kw["min_len"] = args.pending_min_len
    else:
        pend_kw["min_len"] = DEFAULT_MIN_LEN
    if args.pending_max_len is not None:
        pend_kw["max_len"] = args.pending_max_len
    n_pending = write_pending(inbox, **pend_kw)
    print(f"review/pending.txt: {n_pending} 条待人工处理 → {REVIEW_DIR / 'pending.txt'}")


if __name__ == "__main__":
    main()
