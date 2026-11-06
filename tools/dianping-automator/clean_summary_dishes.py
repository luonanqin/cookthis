#!/usr/bin/env python3
"""
清洗各菜系目录下的 荤菜/素菜/汤羹/主食.json，
在同目录生成 *_清洗.json（不覆盖原文件），便于人工先看再调规则。

剔除 / 规范化：
- 菜名末尾括号及其中内容（中英文/方括号），如「番茄炒蛋（微辣）」→「番茄炒蛋」
- 含省市/城市/常见商圈等地名
- 过长、含英文/数字规格、店名残留、营销话术等「奇怪」菜名
- 荤菜/素菜额外：整词即单一食材（与 extract_veg_ingredients 同规则，如「豆腐」「土豆丝」「排骨」「鸡翅」）
  洗掉后留给 荤菜_食材.json / 素菜_食材.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from extract_veg_ingredients import resolve_single_ingredient

OUTPUT_DIR = Path(__file__).resolve().parent / "output"

SRC_TAGS = ("荤菜", "素菜", "汤羹", "主食")
OUT_SUFFIX = "_清洗"

# 菜名里允许出现的「看起来像地名」的食材/菜式（整词或子串白名单优先放行）
_PLACE_WHITELIST = {
    "上海青",  # 青菜品种
    "西湖醋鱼",
    "东坡肉",
    "宫保",
    "回锅肉",
    "夫妻肺片",
    "担担面",
    "过桥米线",
    "麻婆豆腐",
}

# 省 / 自治区 / 直辖市 / 省会等（长的优先匹配）
_PLACES = sorted(
    {
        # 配置里的城市
        "上海",
        "北京",
        "广州",
        "重庆",
        "天津",
        "成都",
        "武汉",
        "杭州",
        "西安",
        "南京",
        "郑州",
        "长沙",
        "沈阳",
        "合肥",
        "福州",
        "济南",
        "昆明",
        "哈尔滨",
        "长春",
        "石家庄",
        "南昌",
        "贵阳",
        "太原",
        "南宁",
        "乌鲁木齐",
        "兰州",
        "海口",
        "呼和浩特",
        "银川",
        "西宁",
        "拉萨",
        # 省区简称/全称
        "内蒙古",
        "内蒙",
        "黑龙江",
        "新疆",
        "西藏",
        "广西",
        "宁夏",
        "青海",
        "云南",
        "贵州",
        "四川",
        "河南",
        "河北",
        "湖南",
        "湖北",
        "广东",
        "福建",
        "浙江",
        "江苏",
        "安徽",
        "江西",
        "山东",
        "山西",
        "陕西",
        "甘肃",
        "辽宁",
        "吉林",
        "海南",
        "呼市",
        # 常见产地/商圈（菜名里当卖点时偏脏）
        "渤海湾",
        "恩施",
        "樟树港",
        "台山",
        "茂名",
        "武夷山",
        "荔浦",
        "观音桥",
        "五大道",
        "莘庄",
        "闵行",
        "徐汇",
        "漕河泾",
        "七宝",
        "虹桥",
        "徐家汇",
        "解放碑",
        "春熙路",
        "王府井",
        "五一广场",
        "二七广场",
        "万象城",
        "恒隆",
        "领世郡",
        "北部新区",
        "南滨路",
        "未来广场",
        "世纪汇",
        "中庚",
    },
    key=len,
    reverse=True,
)

# 营销 / 店名 / 规格等怪模式
_WEIRD_RES = (
    re.compile(r"[A-Za-z]"),  # 拉丁字母（M7、JP…）
    re.compile(r"\d"),  # 含数字（8头、10秒、小份规格…）
    re.compile(r"[/／|｜]"),  # 多选写法
    re.compile(r"[…⋯]|\.\.\."),
    re.compile(r"(仅限|最多涮|加单|严选|特供|必点|推荐|人气|网红)"),
    re.compile(r"(爱吃的|丫头子|五虎上将)"),
    re.compile(r"(馆·|店·|·烧烤|·夜宵)$"),
    re.compile(r"(阿牧特|洞氮胡记|云其林严选)"),
    re.compile(r"[（(][^）)]{6,}[）)]"),  # 过长括号说明
)

_MAX_LEN = 12
_MIN_LEN = 2

# 去掉末尾一层或多层括号说明
_TRAILING_PAREN_RE = re.compile(r"[（(【\[][^（）()【\]\]]*?[）)】\]]\s*$")


def strip_trailing_parens(name: str) -> str:
    t = (name or "").strip()
    while True:
        n = _TRAILING_PAREN_RE.sub("", t).strip()
        if n == t:
            return t
        t = n


def _in_whitelist(name: str) -> bool:
    return any(w in name for w in _PLACE_WHITELIST)


def has_place_name(name: str) -> bool:
    if _in_whitelist(name):
        # 白名单命中后，仍检查是否还夹带其它地名
        stripped = name
        for w in sorted(_PLACE_WHITELIST, key=len, reverse=True):
            stripped = stripped.replace(w, "")
        for p in _PLACES:
            if p in stripped:
                return True
        return False
    for p in _PLACES:
        if p in name:
            return True
    return False


def is_weird(name: str) -> bool:
    t = name.strip()
    if not (_MIN_LEN <= len(t) <= _MAX_LEN):
        return True
    if t.startswith(("¥", "￥", "赞")):
        return True
    for rx in _WEIRD_RES:
        if rx.search(t):
            return True
    # 店名残留：中间点分隔且两侧都较长
    if "·" in t or "•" in t:
        parts = re.split(r"[·•]", t)
        if len(parts) >= 2 and all(len(p) >= 2 for p in parts[:2]):
            # 「蒜蓉·西兰花」少见；多数「品牌·品类」偏店名
            if any(k in t for k in ("火锅", "烧烤", "餐厅", "食府", "羊肉馆")):
                return True
    return False


def keep_dish(name: str, *, drop_pure_ingredient: bool = False) -> bool:
    t = (name or "").strip()
    if not t:
        return False
    if has_place_name(t):
        return False
    if is_weird(t):
        return False
    # 荤/素：纯食材名（词表整词 / 去丝片后仍是食材）洗掉，留给 *_食材.json
    if drop_pure_ingredient and resolve_single_ingredient(t) is not None:
        return False
    return True


def clean_list(names: list, *, drop_pure_ingredient: bool = False) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        if not isinstance(raw, str):
            continue
        t = strip_trailing_parens(raw.strip())
        if not keep_dish(t, drop_pure_ingredient=drop_pure_ingredient) or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def process_file(path: Path, *, tag: str) -> tuple[int, int]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0, 0
    if not isinstance(data, list):
        return 0, 0
    cleaned = clean_list(data, drop_pure_ingredient=(tag in ("素菜", "荤菜")))
    out_path = path.with_name(path.stem + OUT_SUFFIX + ".json")
    out_path.write_text(
        json.dumps(cleaned, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(data), len(cleaned)


def main() -> None:
    if not OUTPUT_DIR.is_dir():
        print(f"无目录：{OUTPUT_DIR}")
        return
    print(f"清洗 {OUTPUT_DIR} → 同目录 *{OUT_SUFFIX}.json")
    n_files = 0
    total_in = total_out = 0
    for city_dir in sorted(p for p in OUTPUT_DIR.iterdir() if p.is_dir()):
        for cuisine_dir in sorted(p for p in city_dir.iterdir() if p.is_dir()):
            for tag in SRC_TAGS:
                src = cuisine_dir / f"{tag}.json"
                if not src.is_file():
                    continue
                a, b = process_file(src, tag=tag)
                n_files += 1
                total_in += a
                total_out += b
                print(f"  {city_dir.name}/{cuisine_dir.name}/{tag}: {a} → {b}")
    print(f"\n完成：{n_files} 个文件 | {total_in} → {total_out}（保留 {total_out}/{total_in if total_in else 1}）")


if __name__ == "__main__":
    main()
