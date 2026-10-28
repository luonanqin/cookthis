#!/usr/bin/env python3
"""清洗下厨房结果 JSON 中的 recipes[].title：去营销修饰，保留食材与做法。

- 不单独删除「家常」「下饭」等可作菜名组成部分的词（如家常豆腐、下饭炒鸡蛋）。
- 去掉口感修饰（鲜美、低脂、细嫩、Q弹、浓郁、爆汁…）。
- 通用去营销尾：在标题中定位食材锚点（优先当前条目名 → 菜谱 ingredients → 词表最长匹配）；
  若锚点后的后缀不以做法词（炒/蒸/拌…）开头，则整段截掉
  （例：麻汁面藕酱料可拌一切→麻汁面藕；番茄炒蛋保留）。
- 去掉全部英文与标点；字数 < 3、为空、或恰为纯食材名 → 删除。
- category-results：清洗后标题与条目食材名的字符交叉 / 食材字数 ≤ 50% → 删除
  （例：红烧鲢鱼 ∩ 白鲢鱼 = 鲢鱼 2 字，2/3 > 50% 保留）。
- 同一食材下按 title 去重。默认写 *.cleaned.json；--in-place 覆盖原文件。

用法:
  python3 scripts/clean-xiachufang-recipe-titles.py
  python3 scripts/clean-xiachufang-recipe-titles.py --in-place
  python3 scripts/clean-xiachufang-recipe-titles.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT / "data" / "recipes" / "xiachufang"
INGREDIENTS_ALL = ROOT / "data" / "catalog" / "ingredients-all.json"
DEFAULT_FILES = (
    "xiachufang-category-results.json",
    "xiachufang-search-results.json",
)


def load_ingredient_names(path: Path = INGREDIENTS_ALL) -> set[str]:
    """全量食材名；清洗后 title 恰好命中则视为「只有食材名」。"""
    if not path.is_file():
        return set()
    doc = json.loads(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for arr in (doc.get("categories") or {}).values():
        for n in arr or []:
            if isinstance(n, str) and n.strip():
                names.add(n.strip())
    return names

EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F9FF"
    "\U00002700-\U000027BF"
    "\U00002600-\U000026FF"
    "\U0001FA00-\U0001FAFF"
    "\U0000200D"
    "\U0000FE0F"
    "❤♥♪☆★✨🔥💯✅❗❕❓❔"
    "]+",
    flags=re.UNICODE,
)

QUOTED_DISH_RE = re.compile(r"[「『“\"']([^」』”\"']{2,40})[」』”\"']")
SPLIT_RE = re.compile(r"\s*[—–\-－～~｜|]\s*")
METHOD_HINT = re.compile(
    r"(炒|蒸|煮|炖|焖|烧|拌|煎|炸|烤|焯|卤|酱|烩|汆|焗|烙|煲|凉拌|红烧|清蒸|水煮|蒜蓉|蒜香|清炒)"
)
# 紧接食材后的做法（用于判断后缀是菜名延续还是营销尾巴；不含「酱」以免「酱料…」误判）
METHOD_AT_SUFFIX_START = re.compile(
    r"^(炒|蒸|煮|炖|焖|烧|拌|煎|炸|烤|焯|卤|烩|汆|焗|烙|煲|熘|爆|凉拌|红烧|清蒸|水煮|蒜蓉|蒜香|清炒)"
)
TRAILING_PUNCT_RE = re.compile(r"[，,。．.!！?？、；;：:\s～~…·•]+$")
LEADING_PUNCT_RE = re.compile(r"^[，,。．.!！?？、；;：:\s～~…·•\-—–｜|]+")
MULTI_SPACE_RE = re.compile(r"\s+")
ONLY_NOISE_RE = re.compile(r"^[\W_\d]+$", re.UNICODE)
ENGLISH_RE = re.compile(r"[A-Za-z]+")
# 只保留汉字与数字（标点/符号/空白全部去掉）
KEEP_CHARS_RE = re.compile(r"[^\u4e00-\u9fff0-9]+")
MIN_TITLE_LEN = 3

# 人工判定直接删除的清洗后菜名（精确匹配）
DROP_TITLES = {
    "泡广西灯笼椒",
    "韩国海带",
    "在河南冬天吃凉粉",
    "马卡龙夹馅之香草盐英式奶油霜",
    "英式下午茶好吃百搭",
    "茉莉青提韩式马卡龙",
    "泡灯笼辣椒",
    "麻婆的不只是豆腐还有猪脑",
    "简便猪脑",
    "铁锅猪蹄炖鱼心管炖鱼",
    "养生安神猪心",
    "红烧蘑菇炒口蘑",
    "森记酱油鹅掌",
    "5分钟做个海带芽",
    "凉拌菜料汁",
    "夹子的早餐",
    "节省一半时间的大包子",
    "玫瑰马卡龙",
    "玫瑰花肉龙消灭剩饺子馅的妙计",
    "澳洲青龙虾",
    "马卡龙夹馅",
    "香草马卡龙",
    "黑法师马卡龙",
    "抹茶茉莉戚风蛋糕",
    "玫瑰花馒头",
    "开心果花轮马卡龙满满都是绿开心果",
}

# 整段/后缀套话；不单独删「家常」「下饭」
PHRASE_RES = [
    re.compile(p)
    for p in [
        r"厨师长教你[：:]?",
        r"教你做一道[^：:]*[：:]",
        r"教你做?",
        r"一看就会",
        r"附[^，。！!？?]{0,20}步骤",
        r"家常下饭菜",
        r"快手家常菜",
        r"好吃的家常菜[：:]?",
        r"简单又?好吃的家常菜[：:]?",
        r"超级?下饭的?",
        r"超级?好吃的?",
        r"无敌美味的?",
        r"无敌好吃的?",
        r"极好吃滴?",
        r"巨好吃的?",
        r"敲好吃的?",
        r"真的比肉香",
        r"比清炒好吃太多",
        r"好吃哭",
        r"好吃到舔手指",
        r"绝绝子",
        r"秒杀一切[^，。！!]*",
        r"小心吃撑哦?",
        r"白吃不腻的家常菜[－\-—]?",
        r"连吃三碗的",
        r"五分钟美食",
        r"\d+\s*分钟学会",
        r"\d+\s*分钟搞定的?",
        r"第\d+道低卡减脂菜",
        r"第\d+道菜",
        r"低卡减脂",
        r"热量\d+\s*[Kk]?(?:cal)?",
        r"\d+\s*[Kk]cal(?:/\d+g)?",
        r"增肌减脂必备",
        r"减脂期必备[｜|]?",
        r"清脆爽口的?",
        r"香辣爽口",
        r"麻酱多多的",
        r"轻食素菜",
        r"简单家常素菜",
        r"家常素菜",
        r"西式美食",
        r"宝宝辅食",
        r"附处理[^，。]*",
        r"听起来就很好吃的",
        r"谁说[^？?]+[？?]",
        r"味道很浓郁呀?",
        r"脆嫩又好吃",
        r"超鲜超嫩的",
        r"肉质细嫩",
        r"鲜香嫩滑",
        r"好吃不胖的",
        # 口感/营销修饰（整词删；不伤「家常」「下饭」）
        r"鲜美的?",
        r"低脂的?",
        r"细嫩的?",
        r"[Qq]弹的?",
        r"浓郁的?",
        r"爆汁的?",
        r"一口一个",
        r"五彩缤纷",
        r"秒杀",
        r"无敌",
        r"不加一滴水",
        r"好吃到爆",
        r"一道",
        r"地道",
        r"处理",
        r"复刻",
        r"武汉家庭版",
        r"重庆口味",
        r"正宗",
        r"吃不腻的",
        r"炒鸡好吃的",
        r"无油无水",
        r"一点不腻的",
        r"春季时令",
        r"超绝10分钟能下两碗饭",
        r"香而不腻",
        r"饭光光",
        r"小白也能做成功的",
        r"保留最原始鲜味儿?的",
        r"鲜掉眉毛",
        r"一口",
        r"和饭店一个味的",
        r"香糟一切",
        r"不放肉的",
        r"如此精致的",
        r"简单嘎吱脆的",
        r"清爽可口、?低卡又好吃",
        r"解暑开胃颜值爆表",
        r"夏日神仙水[！!]?",
        r"3步get",
        r"同款",
        r"网红菜[^，。]*",
        r"自古就是[^，。]*",
        r"一上桌就被抢光",
        r"人人都可Get的小技能",
        r"分分钟搞定",
        r"看得口水直流",
        r"酸辣开胃，爽脆可口",
        r"怎样才不腻[？?]?",
        r"你吃过吗[？?]?",
        r"专治[^，。！!]{2,20}",
        r"民间偏方[—\-－]*",
        r"便利店同款",
        r"在河南冬天吃凉粉，越吃越暖人[！!]?",
        r"春天的菜苔这样做[！!]?",
        r"这样炒来吃",
        r"这样炒好吃",
        r"的最佳搭配是牛",
        r"太好吃",
        r"简易版",
        r"贼香",
        r"超多膏的",
        r"敲好吃",
        r"巨简单",
        r"超简单",
        r"超香",
        r"超好吃的?",
        r"极好吃",
        r"美味无敌的?",
        r"美味的?",
        r"简单又?好吃的?",
        r"简单(?=凉拌|炒|蒸|煮|炖|烧|拌|煎)",
        r"好吃又掉秤",
        r"下饭菜/零食都是绝绝子",
        r"下饭菜",
        r"家常菜[～~]?",
        r"快手菜[｜|]?",
        r"快手",
        r"懒人",
        r"零失败",
        r"必学",
        r"的做法",
        r"做法",
        r"万能的?",
        r"家庭自制",
        r"来试试不一样的小油条吧",
        r"做成小罐装又是今年一爆品[！!]?",
        r"做蛋糕必备的",
        r"这料汁匹配一切蔬菜",
        r"匹配一切[^，。]*",
        r"袁姗姗特别喜欢的一种蔬菜",
        r"搭配五花肉炒",
        r"云南人必吃的传统小吃",
        r"广东人养娃[：:]?",
        r"春夏交接必须祛湿",
        r"没谁了最好吃的",
        r"不用煎鱼仿三里桥",
        r"人人都会不用煎鱼",
        r"人人都会",
        r"高蛋白低卡",
        r"一口一个爆汁",
        r"拌面拌饭绝配",
        r"[“\"]鲜[”\"]美的简单",
        r"94消耗柠檬的美食集锦",
        r"耗柠檬的美食集锦",
        r"轻食",
        r"必备",
        r"真的",
    ]
]


def strip_emoji(s: str) -> str:
    return EMOJI_RE.sub("", s)


def pick_segment(parts: list[str]) -> str:
    raw_parts = [p.strip() for p in parts if p and p.strip()]
    if not raw_parts:
        return ""
    # 先对每段去套话再打分，避免「年夜饭-无敌美味龙虾」误选前段
    candidates = []
    for raw in raw_parts:
        cleaned = apply_phrases(strip_emoji(raw))
        if cleaned:
            candidates.append(cleaned)
        else:
            candidates.append(raw)
    if len(candidates) == 1:
        return candidates[0]

    def score(p: str) -> tuple:
        has_method = 1 if METHOD_HINT.search(p) else 0
        # 过长像说明文；否则偏爱有做法、长度适中、略长者
        too_long = 1 if len(p) > 28 else 0
        return (has_method, -too_long, -abs(len(p) - 10), len(p))

    return max(candidates, key=score)


def apply_phrases(s: str) -> str:
    prev = None
    while prev != s:
        prev = s
        for rx in PHRASE_RES:
            s = rx.sub("", s)
        s = TRAILING_PUNCT_RE.sub("", s)
        s = LEADING_PUNCT_RE.sub("", s)
        s = MULTI_SPACE_RE.sub("", s)
    return s.strip()


def find_ingredient_anchor(
    text: str,
    parent_name: str = "",
    recipe_ingredients: list[str] | None = None,
    catalog_names: set[str] | None = None,
) -> tuple[int, int, str] | None:
    """在标题中定位食材锚点，返回 (start, end, matched)。"""
    if not text:
        return None
    if parent_name and parent_name in text:
        i = text.find(parent_name)
        return i, i + len(parent_name), parent_name

    cands = [n for n in (recipe_ingredients or []) if n and n in text]
    if cands:
        name = max(cands, key=len)
        i = text.find(name)
        return i, i + len(name), name

    catalog = catalog_names or set()
    best = None  # (len, start, end, name)
    for n in catalog:
        if len(n) < 2 or n not in text:
            continue
        i = text.find(n)
        hit = (len(n), i, i + len(n), n)
        if best is None or hit[0] > best[0] or (hit[0] == best[0] and hit[1] < best[1]):
            best = hit
    if best:
        return best[1], best[2], best[3]
    return None


def trim_marketing_after_ingredient(
    text: str,
    parent_name: str = "",
    recipe_ingredients: list[str] | None = None,
    catalog_names: set[str] | None = None,
) -> str:
    """锚点后的后缀若不以做法词开头，视为营销尾巴并截掉。"""
    anchor = find_ingredient_anchor(
        text, parent_name, recipe_ingredients, catalog_names
    )
    if not anchor:
        return text
    _start, end, _name = anchor
    suffix = text[end:]
    if not suffix:
        return text
    if METHOD_AT_SUFFIX_START.match(suffix):
        return text
    return text[:end]


def clean_title(
    raw: str,
    *,
    parent_name: str = "",
    recipe_ingredients: list[str] | None = None,
    catalog_names: set[str] | None = None,
) -> str:
    if not raw or not isinstance(raw, str):
        return ""
    s = strip_emoji(raw).strip()
    if not s:
        return ""

    quotes = QUOTED_DISH_RE.findall(s)
    if quotes:
        scored = sorted(
            quotes,
            key=lambda q: (0 if METHOD_HINT.search(q) else 1, len(q)),
        )
        candidate = scored[0].strip()
        if 2 <= len(candidate) <= 30:
            s = candidate

    if SPLIT_RE.search(s):
        s = pick_segment(SPLIT_RE.split(s))

    if "，" in s or "," in s:
        bits = re.split(r"[，,]", s)
        if len(bits) >= 2:
            head, *rest = bits
            rest_join = "".join(rest)
            if METHOD_HINT.search(head) and (
                re.search(
                    r"(好吃|下饭|开胃|浓郁|清爽|简单|美味|香|脆|嫩)",
                    rest_join,
                )
                and not METHOD_HINT.search(rest_join)
            ):
                s = head

    # 先去掉英文/标点，便于锚点匹配
    s = ENGLISH_RE.sub("", s)
    s = KEEP_CHARS_RE.sub("", s)

    # 通用：截掉食材后的营销尾巴
    s = trim_marketing_after_ingredient(
        s, parent_name, recipe_ingredients, catalog_names
    )

    s = apply_phrases(s)
    s = ENGLISH_RE.sub("", s)
    s = KEEP_CHARS_RE.sub("", s)
    s = re.sub(r"^的+", "", s)
    s = re.sub(r"的+$", "", s)

    if not s or ONLY_NOISE_RE.match(s) or len(s) < MIN_TITLE_LEN:
        return ""
    return s


def ingredient_overlap_ratio(title: str, ingredient: str) -> float:
    """食材名中有多少字出现在标题里 / 食材字数（食材占比）。"""
    if not ingredient or not title:
        return 0.0
    title_chars = set(title)
    hit = sum(1 for c in ingredient if c in title_chars)
    return hit / len(ingredient)


def clean_doc(
    doc: dict,
    ingredient_names: set[str] | None = None,
    *,
    require_parent_overlap: bool = False,
    parent_overlap_min: float = 0.5,
) -> tuple[dict, dict]:
    names = ingredient_names if ingredient_names is not None else load_ingredient_names()
    items_in = doc.get("items") or {}
    items_out: dict = {}
    stats = {
        "recipes_in": 0,
        "recipes_out": 0,
        "titles_changed": 0,
        "recipes_dropped": 0,
        "dropped_ingredient_only": 0,
        "dropped_low_overlap": 0,
        "dropped_denylist": 0,
        "deduped": 0,
        "examples": [],
    }
    for name, rec in items_in.items():
        recipes_out: list[dict] = []
        seen_titles: dict[str, int] = {}  # title -> index in recipes_out
        for r in list(rec.get("recipes") or []):
            stats["recipes_in"] += 1
            old = r.get("title") or ""
            ings = [x for x in (r.get("ingredients") or []) if x]
            new = clean_title(
                old,
                parent_name=name,
                recipe_ingredients=ings,
                catalog_names=names,
            )
            if not new:
                stats["recipes_dropped"] += 1
                if len(stats["examples"]) < 30:
                    stats["examples"].append(("DROP", old, ""))
                continue
            # 清洗后只剩纯食材名（词表命中，或等于当前条目名）→ 删除
            if new in names or new == name:
                stats["recipes_dropped"] += 1
                stats["dropped_ingredient_only"] += 1
                if len(stats["examples"]) < 40:
                    stats["examples"].append(("DROP_ING", old, new))
                continue
            # 黑名单：清洗后标题，或原文去掉标点/英文后的精确命中
            old_compact = KEEP_CHARS_RE.sub("", ENGLISH_RE.sub("", old or ""))
            if new in DROP_TITLES or old_compact in DROP_TITLES or old in DROP_TITLES:
                stats["recipes_dropped"] += 1
                stats["dropped_denylist"] += 1
                if len(stats["examples"]) < 40:
                    stats["examples"].append(("DROP_DENY", old, new))
                continue
            # category：清洗后与食材名字符交叉 / 食材字数须 > 阈值
            if require_parent_overlap and name:
                ratio = ingredient_overlap_ratio(new, name)
                if ratio <= parent_overlap_min:
                    stats["recipes_dropped"] += 1
                    stats["dropped_low_overlap"] += 1
                    if len(stats["examples"]) < 40:
                        stats["examples"].append(
                            ("DROP_LOW_OVERLAP", old, f"{new} ({ratio:.0%})")
                        )
                    continue
            recipe_count = r.get("count")
            if recipe_count is None:
                recipe_count = 0
            else:
                try:
                    recipe_count = int(recipe_count)
                except (TypeError, ValueError):
                    recipe_count = 0
            if new in seen_titles:
                stats["recipes_dropped"] += 1
                stats["deduped"] += 1
                # 合并 ingredients（保序去重）；做过人数取较大值
                idx = seen_titles[new]
                merged = list(recipes_out[idx]["ingredients"])
                have = set(merged)
                for x in ings:
                    if x not in have:
                        merged.append(x)
                        have.add(x)
                recipes_out[idx]["ingredients"] = merged
                prev_c = recipes_out[idx].get("count", 0) or 0
                recipes_out[idx]["count"] = max(int(prev_c), recipe_count)
                if len(stats["examples"]) < 40:
                    stats["examples"].append(("DEDUP", old, new))
                continue
            if new != old:
                stats["titles_changed"] += 1
                if len(stats["examples"]) < 40:
                    stats["examples"].append(("CHG", old, new))
            seen_titles[new] = len(recipes_out)
            recipes_out.append(
                {"title": new, "count": recipe_count, "ingredients": ings}
            )
            stats["recipes_out"] += 1
        items_out[name] = {
            "categories": list(rec.get("categories") or []),
            "count": rec.get("count", 0),
            "recipes": recipes_out,
        }
    return {"updatedAt": doc.get("updatedAt") or "", "items": items_out}, stats


def format_recipe_results(updated_at: str, items: dict) -> str:
    try:
        names = sorted(items.keys(), key=lambda a: a.encode("gb18030"))
    except Exception:
        names = sorted(items.keys())

    lines = [
        "{",
        f'  "updatedAt": {json.dumps(updated_at, ensure_ascii=False)},',
        '  "items": {',
    ]
    for i, name in enumerate(names):
        rec = items[name] or {}
        comma = "," if i < len(names) - 1 else ""
        cats = json.dumps(rec.get("categories") or [], ensure_ascii=False)
        count = rec.get("count", 0)
        recipes = rec.get("recipes") or []
        lines.append(f"    {json.dumps(name, ensure_ascii=False)}: {{")
        lines.append(f'      "categories": {cats},')
        lines.append(f'      "count": {count},')
        if not recipes:
            lines.append('      "recipes": []')
        else:
            lines.append('      "recipes": [')
            for j, r in enumerate(recipes):
                rc = "," if j < len(recipes) - 1 else ""
                body = {
                    "title": r.get("title") or "",
                    "count": r.get("count", 0) or 0,
                    "ingredients": r.get("ingredients") or [],
                }
                lines.append(
                    "        "
                    + json.dumps(body, ensure_ascii=False, separators=(",", ":"))
                    + rc
                )
            lines.append("      ]")
        lines.append(f"    }}{comma}")
    lines.append("  }")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    ap.add_argument("--in-place", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("files", nargs="*", default=list(DEFAULT_FILES))
    args = ap.parse_args()

    ingredient_names = load_ingredient_names()
    print(f"ingredient lexicon: {len(ingredient_names)} names")

    total = {
        "recipes_in": 0,
        "recipes_out": 0,
        "titles_changed": 0,
        "recipes_dropped": 0,
        "dropped_ingredient_only": 0,
        "dropped_low_overlap": 0,
        "dropped_denylist": 0,
        "deduped": 0,
    }

    for fname in args.files:
        path = args.dir / fname
        if not path.is_file():
            print(f"skip missing: {path}", file=sys.stderr)
            continue
        require_overlap = "category-results" in fname
        doc = json.loads(path.read_text(encoding="utf-8"))
        out_doc, stats = clean_doc(
            doc, ingredient_names, require_parent_overlap=require_overlap
        )
        for k in total:
            total[k] += stats[k]
        print(f"== {fname} ==")
        print(
            f"  in={stats['recipes_in']} out={stats['recipes_out']} "
            f"changed={stats['titles_changed']} dropped={stats['recipes_dropped']} "
            f"(ingredient-only={stats['dropped_ingredient_only']} "
            f"low-overlap={stats['dropped_low_overlap']} "
            f"deny={stats['dropped_denylist']} deduped={stats['deduped']})"
            + (" [parent overlap >50%]" if require_overlap else "")
        )
        for kind, old, new in stats["examples"][:15]:
            if kind == "DROP":
                print(f"  DROP  {old!r}")
            elif kind == "DROP_ING":
                print(f"  DROP_ING {old!r} -> {new!r}")
            elif kind == "DROP_LOW_OVERLAP":
                print(f"  DROP_LOW_OVERLAP {old!r} -> {new!r}")
            elif kind == "DROP_DENY":
                print(f"  DROP_DENY {old!r} -> {new!r}")
            elif kind == "DEDUP":
                print(f"  DEDUP {old!r} -> {new!r}")
            else:
                print(f"  {old!r}")
                print(f"    -> {new!r}")

        if args.dry_run:
            continue
        text = format_recipe_results(
            out_doc.get("updatedAt") or "", out_doc.get("items") or {}
        )
        out_path = (
            path if args.in_place else path.parent / (path.stem + ".cleaned.json")
        )
        out_path.write_text(text, encoding="utf-8")
        print(f"  wrote {out_path}")

    print(
        f"TOTAL in={total['recipes_in']} out={total['recipes_out']} "
        f"changed={total['titles_changed']} dropped={total['recipes_dropped']} "
        f"(ingredient-only={total['dropped_ingredient_only']} "
        f"low-overlap={total['dropped_low_overlap']} "
        f"deny={total['dropped_denylist']} deduped={total['deduped']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
