"""标准菜系目录识别（写入 / 整理 output 共用）。"""

from __future__ import annotations

from config import CUISINES

OTHER_DIR = "其他"

# OCR / 别称 → 标准菜系
_ALIASES: dict[str, str] = {
    "江浙菜": "浙菜",
    "苏浙菜": "浙菜",
    "淮扬菜": "苏菜",
    "北京菜": "京菜",
    "滇菜": "云南菜",
    "云贵菜": "云南菜",
    "黔菜": "贵州菜",
    "潮汕菜": "粤菜",
    "顺德菜": "粤菜",
    "闽粤菜": "粤菜",
    "河南菜": "豫菜",
    "陕菜": "西北菜",
    "山西菜": "西北菜",
    "西北菜": "西北菜",
    "重庆火锅": "火锅",
    "四川火锅": "火锅",
    "北京火锅": "火锅",
    "牛羊肉火锅": "火锅",
    "羊蝎子火锅": "火锅",
    "菌菇火锅": "火锅",
    "鱼火锅": "火锅",
    "火锅鸡": "火锅",
    "鸡窝火锅": "火锅",
    "烤串": "烧烤",
    "烤肉": "烧烤",
    "小龙虾": "烧烤",
}

_KNOWN_SORTED = sorted(CUISINES, key=len, reverse=True)
_ALIAS_SORTED = sorted(_ALIASES.keys(), key=len, reverse=True)


def _compact(s: str) -> str:
    return "".join((s or "").split())


def match_standard_cuisine(text: str) -> str | None:
    """从一段文案里识别标准菜系；识别不出返回 None。"""
    compact = _compact(text)
    if not compact:
        return None
    for name in _KNOWN_SORTED:
        if compact.startswith(name):
            return name
    for alias in _ALIAS_SORTED:
        if compact.startswith(alias) or alias in compact:
            return _ALIASES[alias]
    for name in _KNOWN_SORTED:
        if name in compact:
            return name
    return None


def resolve_dir_cuisine(
    *,
    shop_cuisine: str = "",
    search_cuisine: str = "",
) -> str:
    """
    决定 output/{城市}/{菜系}/ 目录名。
    优先 shop_cuisine 识别，其次 search_cuisine；都失败 → 其他。
    """
    for raw in (shop_cuisine, search_cuisine):
        hit = match_standard_cuisine(raw)
        if hit:
            return hit
    return OTHER_DIR
