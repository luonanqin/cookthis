#!/usr/bin/env python3
"""从 ingredients-all.json 生成 ingredients-all-by-category.json。

- 每个食材只进一个分类
- 已有分类文件中的归属优先保留（便于人工改完后增量）
- 新出现的名走规则归类；仍无法归类则进「调味」并打印警告
- 数组格式：每行至多 10 个食材

用法：
  .venv/bin/python ingredients_by_category.py
  .venv/bin/python ingredients_by_category.py --all path --out path
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[2] / "data" / "catalog"
ALL_NAME = "ingredients-all.json"
BY_CAT_NAME = "ingredients-all-by-category.json"

CATEGORY_ORDER = (
    "肉类",
    "内脏",
    "火锅",
    "菜叶",
    "瓜果",
    "根茎",
    "水果",
    "豆类",
    "豆制品",
    "主食",
    "菌菇",
    "鱼",
    "河鲜",
    "海鲜",
    "蛋奶",
    "调味",
)

# 显式覆盖（规则不好拆的词）
_OVERRIDE: dict[str, str] = {
    # 调味
    "葱": "调味",
    "大葱": "调味",
    "小葱": "调味",
    "香葱": "调味",
    "小香葱": "调味",
    "葱花": "调味",
    "姜": "调味",
    "老姜": "调味",
    "嫩姜": "调味",
    "子姜": "调味",
    "仔姜": "调味",
    "生姜": "调味",
    "嫩子姜": "调味",
    "嫩仔姜": "调味",
    "大黄姜": "调味",
    "小黄姜": "调味",
    "黄姜": "调味",
    "沙姜": "调味",
    "姜蒜": "调味",
    "蒜": "调味",
    "大蒜": "调味",
    "蒜头": "调味",
    "大蒜头": "调味",
    "大头蒜": "调味",
    "独蒜": "调味",
    "独头蒜": "调味",
    "蒜米": "调味",
    "蒜末": "调味",
    "蒜泥": "调味",
    "大蒜粒": "调味",
    "紫皮蒜": "调味",
    "甜蒜头": "调味",
    "糖蒜": "调味",
    "干葱头": "调味",
    "干葱仔": "调味",
    "红葱头": "调味",
    "毛葱头": "调味",
    "盐": "调味",
    "糖": "调味",
    "醋": "调味",
    "陈醋": "调味",
    "酱油": "调味",
    "料酒": "调味",
    "蚝油": "调味",
    "香油": "调味",
    "火锅香油": "调味",
    "酥油": "调味",
    "红油": "调味",
    "淀粉": "调味",
    "胡椒": "调味",
    "花椒": "调味",
    "青花椒": "调味",
    "地椒": "调味",
    "剁椒": "调味",
    "剁椒酱": "调味",
    "干辣椒": "调味",
    "油辣椒": "调味",
    "沙茶酱": "调味",
    "甜面酱": "调味",
    "芝麻酱": "调味",
    "豆瓣酱": "调味",
    "郫县豆瓣": "调味",
    "麻辣烫底料": "调味",
    "陈皮": "调味",
    "桂皮": "调味",
    "香茅": "调味",
    "香茅草": "调味",
    "迷迭香": "调味",
    "罗勒": "调味",
    "罗勒叶": "调味",
    "九层塔": "调味",
    "薄荷": "调味",
    "金不换": "调味",
    "紫苏": "调味",
    "紫苏叶": "调味",
    "茴香": "调味",
    "欧芹": "调味",
    "柠檬叶": "调味",
    "檬叶": "调味",
    "茶叶": "调味",
    "黑芝麻": "调味",
    "熟芝麻": "调味",
    "面包糠": "调味",
    "酸汤": "调味",
    "海鲜味": "调味",
    "泡小米辣": "调味",
    "二荆条": "调味",
    "天椒": "调味",
    "野山椒": "调味",
    "朝天椒": "调味",
    "小米椒": "调味",
    "小米辣": "调味",
    "青小米椒": "调味",
    "青小米辣": "调味",
    "发售": "调味",
    "切开": "调味",
    "叫头": "调味",
    "干贡": "调味",
    # 蛋奶
    "鸡蛋": "蛋奶",
    "鸭蛋": "蛋奶",
    "鹅蛋": "蛋奶",
    "生鹅蛋": "蛋奶",
    "生鸭蛋": "蛋奶",
    "海鸭蛋": "蛋奶",
    "鹌鹑蛋": "蛋奶",
    "鹑蛋": "蛋奶",
    "鸽子蛋": "蛋奶",
    "乌鸡蛋": "蛋奶",
    "皮蛋": "蛋奶",
    "松花蛋": "蛋奶",
    "松花皮蛋": "蛋奶",
    "心皮蛋": "蛋奶",
    "糟蛋": "蛋奶",
    "咸蛋": "蛋奶",
    "咸鸭蛋": "蛋奶",
    "咸蛋黄": "蛋奶",
    "生盐蛋": "蛋奶",
    "蛋白": "蛋奶",
    "牛奶": "蛋奶",
    "酸奶": "蛋奶",
    # 河鲜 / 鱼 / 海鲜 纠偏
    "牛蛙": "河鲜",
    "青蛙": "河鲜",
    "甲鱼": "河鲜",
    "田螺": "河鲜",
    "钉螺": "河鲜",
    "泥螺": "河鲜",
    "螺蛳": "河鲜",
    "花螺": "河鲜",
    "土笋": "河鲜",
    "小龙虾": "河鲜",
    "小龙虾尾": "河鲜",
    "河虾": "河鲜",
    "大闸蟹": "河鲜",
    "泥鳅": "河鲜",
    "黄鳝": "河鲜",
    "两母蟹": "河鲜",
    "罗氏虾": "河鲜",
    "青虾": "河鲜",
    "青虾仁": "河鲜",
    "河豚": "河鲜",
    "黄鳝鱼": "鱼",
    "鳝鱼": "鱼",
    "黄辣丁": "鱼",
    "腊草鱼干": "鱼",
    "老虎斑": "鱼",
    "银昌": "鱼",
    "八爪鱼": "海鲜",
    "火箭鱿": "海鲜",
    "大蛤蛎": "海鲜",
    "贝贝南瓜": "瓜果",
    "西葫芦": "瓜果",
    "仿蟹柳": "海鲜",
    "蟹肉棒": "海鲜",
    "虾滑": "海鲜",
    "海白菜": "海鲜",
    # 肉类
    "筒子骨": "肉类",
    "鹌鹑": "肉类",
    "蚕蛹": "肉类",
    # 内脏
    "白千层": "内脏",
    "脑花": "内脏",
    "鸭君": "内脏",
    "猪红": "内脏",
    "鸡菌": "内脏",
    "鸭菌子": "内脏",
    # 火锅
    "虾滑": "火锅",
    "虾泥": "火锅",
    "虾胶": "火锅",
    # 主食
    "荷叶饼": "主食",
    "苕皮": "主食",
    # 水果
    "酸嘢": "水果",
    # 其它
    "蒜苗": "菜叶",
    "嫩蒜苗": "菜叶",
    "蒜苔": "菜叶",
    "蒜薹": "菜叶",
    "蒜苕": "菜叶",
    "大蒜叶": "菜叶",
    "洋葱": "根茎",
    "玉米": "瓜果",
    "魔芋": "主食",
    "粽子叶": "菜叶",
}

_SEASONING_PEPPER = re.compile(
    r"(花椒|胡椒|剁椒|油辣椒|干辣椒|地椒|青花椒|泡小米|小米椒|小米辣|野山椒|朝天椒|二荆条|天椒)"
)
_TOFU_HINT = re.compile(
    r"(豆腐|腐竹|千张|香干|豆干|豆皮|豆花|油豆腐|臭豆腐|内酯|豆筋|豆棍|豆参|豆油皮|油豆|烤麸|素鸡|素鲍|腐乳|面筋|响铃)"
)
_STAPLE_EXACT = {
    "大米",
    "小米",
    "糯米",
    "糜米",
    "青稞",
    "杂粮",
    "面粉",
    "小麦粉",
    "粉丝",
    "宽粉",
    "粉皮",
    "拉皮",
    "红薯粉条",
    "藕粉",
    "凉粉",
    "白凉粉",
    "陈村粉",
    "青团粉",
    "手擀粉",
    "云丝",
    "碳水",
    "魔芋",
    "火锅魔芋",
    "魔芋结",
    "魔芋丝",
    "年糕",
    "火锅年糕",
    "馍",
    "馍馍",
    "馒头",
    "白馒头",
    "花卷",
    "烧饼",
    "馕",
    "列巴",
    "白吉馍",
    "馓子",
    "麻糖",
    "小米饼",
    "玉米饼",
    "水晶包",
    "抄手皮",
    "馄饨皮",
    "饺子皮",
    "燕饺",
    "虾饺",
    "牛筋面",
    "面线",
    "面疙瘩",
    "挂面",
    "拉面",
    "刀削面",
    "手擀面",
    "烩面",
    "裤带面",
    "荞麦面",
    "青稞面",
    "莜面",
    "鸡蛋面",
    "粗棒棒面",
    "圆细面",
    "火锅刀削面",
    "猫耳朵面",
    "猫耳面",
    "韭面",
    "韭叶面",
    "米粉",
    "米线",
    "细米线",
    "饵丝",
    "凉皮",
    "酿皮",
    "荷叶饼",
    "苕皮",
    "大宽面",
}
_FRUIT_HINT = re.compile(
    r"(苹果|梨|桃|莓|蕉|芒|荔|龙眼|葡萄|樱|杨梅|猕猴桃|西瓜|甜瓜|蜜瓜|柚|橙|柑|桔|"
    r"柠檬|椰子|石榴|山楂|沙棘|罗汉果|枣|柿|枸杞|板栗|巴旦|松仁|莲子|菠萝|酸嘢)"
)
_ROOT_HINT = re.compile(
    r"(土豆|红薯|红苕|地瓜|番薯|蜜薯|烟薯|紫薯|芋|山药|淮山|铁棍|藕|莲藕|萝卜|胡萝卜|胡萝|"
    r"竹笋|春笋|冬笋|笋|玉兰片|茭白|高笋|洋葱|百合|凉薯|马蹄|菱角|棱角|茅根|茅草根|锁阳|"
    r"银条|洋姜|槟榔芋|香芋|粉葛|藠头|芦笋|青笋|莴笋)"
)
_LEAF_HINT = re.compile(
    r"(菜|芹|菠菜|生菜|白菜|油菜|芥|苋|茼蒿|蒿|韭|香菜|空心菜|木耳菜|藤藤|红薯叶|红薯尖|"
    r"苕尖|南瓜尖|豌豆尖|豌豆苗|枸杞叶|芝麻菜|羽衣|甘蓝|包菜|圆白菜|莲花白|莲白|紫甘蓝|"
    r"娃娃菜|杭白菜|奶白菜|上海青|小棠菜|春菜|冬菜|贡菜|芽菜|酸菜|梅干菜|野菜|叶菜|"
    r"西生菜|罗马生菜|球生菜|沙拉菜|皇帝菜|黄芪菜|马齿苋|苜蓿|草头|荠菜|莼菜|龙须菜|"
    r"西洋菜|苦菊|苦苣|茴香菜|蒜苗|菜心|菜苔|菜薹|菜苕|儿菜|棒菜|花菜|西兰花|西蓝花|"
    r"芥蓝|芥兰|雪里红|雪里蕻|折耳根|鱼腥草|百合花|玫瑰|茉莉|牡丹|睡莲|粽子叶|紫苏叶|"
    r"大蒜叶|蒜苔|蒜薹|蒜苕|芦蒿|藜蒿|蒿子秆|沙葱|地菜|黄瓜花|黄瓜苗|莴笋尖|油麦菜|"
    r"鸡毛菜|牛心菜)"
)
_BEAN_HINT = re.compile(
    r"(花生|豆角|毛豆|豌豆|蚕豆|黄豆|红豆|绿豆|青豆|黑豆|刀豆|四季豆|荷兰豆|甜豆|芽豆|"
    r"无筋豆|豇豆|扁豆|赤小豆|胡豆|橄榄豆|老豆|脆皮豆|豆芽)"
)
_MUSHROOM_HINT = re.compile(r"(菇|蘑|菌|木耳|银耳|石耳|竹荪|松茸|虫草)")
_FISH_CHAR = re.compile(r"(鱼|鳝|泥鳅|鮰|鲅|鲢|鲤|鲫|鲈|鳜|鲑|鳕|鲟|鳗|鲮|鲳|鲶|鲇|鳟)")
_RIVER_HINT = re.compile(
    r"(小龙虾|河虾|田螺|钉螺|泥螺|螺蛳|花螺|大闸蟹|牛蛙|青蛙|甲鱼|土笋|两母蟹|罗氏虾|青虾|河豚|黄鳝|泥鳅)"
)
_SEA_HINT = re.compile(
    r"(虾|蟹|鱿|墨鱼|章鱼|八爪|鲍鱼|扇贝|海参|海带|海胆|海虹|海蛎|海螺|海米|龙虾|澳龙|"
    r"青龙|皮皮虾|濑尿|蛏|蚬|生蚝|象拔蚌|干贝|牡蛎|花蛤|花甲|蛤蜊|蛤蛎|文蛤|文哈|血哈|"
    r"沙甲|目鱼|紫菜|裙带|海鲜)"
)
_MEAT_HINT = re.compile(
    r"(猪|牛|羊|鸡|鸭|鹅|兔|驴|鹿|鸽|鹌鹑|肉|排骨|肋排|五花|腊|火腿|香肠|培根|午餐肉|"
    r"肘|蹄|肥肠|肚|肝|腰|肺|脑|血|翅|爪|掌|脖|架|胗|杂|郡|蝎|丸|肠|腱|腩|里脊|瘦肉|"
    r"腿肉|夹肉|板油|油渣|熏|酱肉|酱鸭|盐水鸭|板鸭|整鸭|母鸡|公鸡|三黄|乌鸡|乌骨|土鸡|"
    r"草鸡|文昌|仔鸡|老鸭|麻鸭|土鸭|仔鸭|乳鸽|血鸽|安格斯|牦牛|梅花|吊龙|筒骨|棒骨|龙骨|"
    r"扇骨|月牙|脆骨|脊骨|凤爪|琵琶|中翅|贡丸|亲亲|红肠|桂花肠|烤卤|毛肚|千层肚|百叶|"
    r"黄喉|蹄筋|软骨|雪花猪|子肉|二刀|三线|背柳|眉毛|梅条|梅头|纯瘦|精瘦|前夹|蚕蛹|"
    r"斤只|大盘鸡|低脂鸡|澳洲大|筒子骨|白千层)"
)
# 内脏 / 杂碎（须先于「肉类」判定；香肠等加工肠、牛上脑等部位除外）
_ORGAN_HINT = re.compile(
    r"(心管|黄喉|食管|百叶|毛肚|千层肚|白千层|肥肠|大肠|腰子|脑花|郡肝|鸡杂|羊杂|"
    r"鸭君|鸭郡|猪红|血旺|猪心|鸡心|鸭心|牛肚|猪肚|猪肝|鸡肝|鸭肝|猪肺|猪肠|鸡肠|鸭肠|"
    r"猪脑|牛脑|猪腰|牛腰|羊腰|鸡腰|鸡肾|鸡胗|鸭胗|猪舌|鸭舌|猪耳|猪血|鸡血|鸭血|"
    r"火锅鸭血|黑毛肚|白毛肚)"
)
_ORGAN_NOT = re.compile(
    r"(香肠|腊肠|红肠|桂花肠|亲亲肠|广味腊肠|猪肉肠|牛肉肠|鸡肉肠|鸡蛋肠|"
    r"牛上脑|血鸽|板油|牛心菜|鸡毛菜)"
)
_GOURD_HINT = re.compile(r"(瓜|茄|椒|番茄|柿子椒|玉米|秋葵|圣女果|三月茄)")


def _is_organ(name: str) -> bool:
    if _ORGAN_NOT.search(name):
        return False
    if name in _OVERRIDE and _OVERRIDE[name] != "内脏":
        return False
    if _ORGAN_HINT.search(name):
        return True
    # 短规则：动物名 + 内脏部位
    if re.search(r"(猪|牛|羊|鸡|鸭|鹅).*(心|肝|肺|腰|肾|肚|脑|血|胗|舌|耳)", name):
        if _ORGAN_NOT.search(name):
            return False
        return True
    return False


def _has(name: str, *parts: str) -> bool:
    return any(p in name for p in parts)


def _is_hotpot(name: str) -> bool:
    if "火锅" in name:
        return True
    if "丸" in name:
        return True
    if name in ("虾滑", "虾泥", "虾胶"):
        return True
    return False


def classify_ingredient(name: str) -> str | None:
    """规则归类；无法判断返回 None。"""
    if name in _OVERRIDE:
        return _OVERRIDE[name]

    # 火锅：名称含「火锅」/「丸」，或虾滑类；先于豆制品/主食等，避免「火锅豆腐」落豆制品
    if _is_hotpot(name):
        return "火锅"

    # 豆制品先于豆类（豆腐/豆干/千张…）
    if _TOFU_HINT.search(name) and not _BEAN_HINT.search(name):
        return "豆制品"
    if _has(
        name,
        "豆腐",
        "腐竹",
        "千张",
        "香干",
        "豆干",
        "豆皮",
        "豆花",
        "烤麸",
        "素鸡",
        "腐乳",
        "面筋",
        "响铃",
        "内酯",
        "油豆",
        "豆筋",
        "豆棍",
        "豆参",
        "豆油皮",
    ):
        return "豆制品"

    if "蛋" in name and not _has(name, "面", "肠"):
        return "蛋奶"
    if name in ("牛奶", "酸奶"):
        return "蛋奶"

    if _MUSHROOM_HINT.search(name):
        return "菌菇"

    if name in _STAPLE_EXACT:
        return "主食"
    if "面" in name and not _has(name, "面包蟹", "面鱼", "面藕"):
        return "主食"
    if _has(name, "米粉", "米线", "粉丝", "粉条", "粉皮", "宽粉"):
        return "主食"

    if "鱼腥草" in name:
        return "菜叶"
    if _FISH_CHAR.search(name) or name in ("黄辣丁", "江团", "江鱼", "老虎斑", "银昌"):
        if "鱼豆腐" in name:
            return "豆制品"
        return "鱼"

    if _RIVER_HINT.search(name):
        if "鱼" in name and name not in ("黄鳝",):
            return "鱼"
        return "河鲜"

    if name == "贝贝南瓜":
        return "瓜果"
    if _SEA_HINT.search(name):
        if "鱼" in name:
            return "鱼"
        if "菇" in name:
            return "菌菇"
        if _has(name, "河", "小龙虾", "田螺", "大闸", "青虾", "罗氏"):
            return "河鲜"
        return "海鲜"

    if _FRUIT_HINT.search(name):
        if _has(name, "萝卜", "胡萝卜", "胡萝"):
            return "根茎"
        if "枸杞叶" in name:
            return "菜叶"
        if "柠檬叶" in name:
            return "调味"
        return "水果"

    if _BEAN_HINT.search(name) or "花生" in name:
        if _has(name, "豆腐", "豆干", "豆皮", "豆花", "腐竹", "千张", "香干", "豆筋", "豆棍", "豆参"):
            return "豆制品"
        if "豆瓣酱" in name:
            return "调味"
        if _has(name, "豌豆尖", "豌豆苗"):
            return "菜叶"
        return "豆类"

    if _LEAF_HINT.search(name):
        if name == "海白菜":
            return "海鲜"
        if _has(name, "菜瓜", "菜椒", "菜南瓜"):
            return "瓜果"
        if "菜花香鱼" in name:
            return "鱼"
        if "豆芽" in name:
            return "豆类"
        return "菜叶"

    if _ROOT_HINT.search(name) or ("笋" in name and "玉米" not in name):
        if "魔芋豆腐" in name:
            return "豆制品"
        if "魔芋" in name:
            return "主食"
        return "根茎"

    if _GOURD_HINT.search(name):
        if _SEASONING_PEPPER.search(name):
            return "调味"
        return "瓜果"

    if _is_organ(name):
        return "内脏"

    if _MEAT_HINT.search(name):
        if _MUSHROOM_HINT.search(name):
            return "菌菇"
        if "鸡蛋" in name and "肠" not in name:
            return "蛋奶"
        if _has(name, "鸡毛菜", "牛心菜"):
            return "菜叶"
        if "鱼" in name:
            return "鱼"
        if _has(name, "虾", "蟹", "鱿", "章鱼", "八爪"):
            return "海鲜"
        if _is_organ(name):
            return "内脏"
        return "肉类"

    return None


def unique_names_from_all(all_doc: dict) -> list[str]:
    names: set[str] = set()
    for arr in (all_doc.get("categories") or {}).values():
        names.update(arr or [])
    return sorted(names, key=lambda s: s)


def load_existing_assignment(path: Path) -> dict[str, str]:
    """name -> category，来自已有 by-category 文件。"""
    if not path.is_file():
        return {}
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    out: dict[str, str] = {}
    cats = doc.get("categories") or {}
    for cat, items in cats.items():
        if cat not in CATEGORY_ORDER:
            continue
        for name in items or []:
            if name and name not in out:
                out[name] = cat
    return out


def build_by_category(
    names: list[str],
    *,
    prefer: dict[str, str] | None = None,
) -> tuple[dict[str, list[str]], list[str]]:
    """返回 (categories, fallback_used)。fallback_used 为规则未命中、落入调味的名。"""
    prefer = prefer or {}
    result: dict[str, list[str]] = {c: [] for c in CATEGORY_ORDER}
    fallback: list[str] = []
    for name in names:
        # 已有归属优先（含人工在别名编辑器里挪过的品类），不强制覆盖
        cat = prefer.get(name) if prefer.get(name) in CATEGORY_ORDER else None
        if not cat:
            cat = classify_ingredient(name)
        if not cat:
            cat = "调味"
            fallback.append(name)
        result[cat].append(name)
    for cat in CATEGORY_ORDER:
        result[cat] = sorted(set(result[cat]), key=lambda s: s)
    return result, fallback


def format_by_category_json(
    categories: dict[str, list[str]],
    *,
    total: int,
    source: str = ALL_NAME,
) -> str:
    """自定义缩进：每个分类数组一行最多 10 个。"""

    def fmt_arr(items: list[str]) -> str:
        if not items:
            return "[]"
        lines: list[str] = []
        for i in range(0, len(items), 10):
            chunk = items[i : i + 10]
            row = ", ".join(json.dumps(x, ensure_ascii=False) for x in chunk)
            last = i + 10 >= len(items)
            lines.append(f"      {row}" + ("" if last else ","))
        return "[\n" + "\n".join(lines) + "\n    ]"

    parts = [
        "{",
        '  "description": "由 ingredients-all.json 去重后按品类划分；每项仅属一个分类",',
        f'  "source": {json.dumps(source, ensure_ascii=False)},',
        f'  "total": {total},',
        '  "categories": {',
    ]
    for i, cat in enumerate(CATEGORY_ORDER):
        comma = "," if i < len(CATEGORY_ORDER) - 1 else ""
        parts.append(f"    {json.dumps(cat, ensure_ascii=False)}: {fmt_arr(categories[cat])}{comma}")
    parts.append("  }")
    parts.append("}")
    parts.append("")
    return "\n".join(parts)


def write_ingredients_by_category(
    catalog_root: Path,
    *,
    all_doc: dict | None = None,
) -> dict:
    """读 all → 写 by-category；返回写出文档结构（含 categories）。"""
    all_path = catalog_root / ALL_NAME
    out_path = catalog_root / BY_CAT_NAME
    if all_doc is None:
        if not all_path.is_file():
            raise FileNotFoundError(f"缺少 {all_path}")
        all_doc = json.loads(all_path.read_text(encoding="utf-8"))

    names = unique_names_from_all(all_doc)
    prefer = load_existing_assignment(out_path)
    categories, fallback = build_by_category(names, prefer=prefer)
    total = sum(len(v) for v in categories.values())
    text = format_by_category_json(categories, total=total, source=ALL_NAME)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")

    counts = {k: len(v) for k, v in categories.items()}
    print(f"by-category: {counts}  total={total}  → {BY_CAT_NAME}")
    if fallback:
        print(f"  警告：规则未命中、暂归「调味」({len(fallback)}): {', '.join(fallback[:20])}"
              + ("…" if len(fallback) > 20 else ""))
    kept = sum(1 for n in names if n in prefer)
    print(f"  保留已有归属 {kept}/{len(names)}，新归类 {len(names) - kept}")
    return {
        "description": "由 ingredients-all.json 去重后按品类划分；每项仅属一个分类",
        "source": ALL_NAME,
        "total": total,
        "categories": categories,
    }


def main(
    catalog_root: Path | None = None,
    all_path: Path | None = None,
    out_path: Path | None = None,
) -> None:
    if catalog_root is None and all_path is None:
        ap = argparse.ArgumentParser(description="生成 ingredients-all-by-category.json")
        ap.add_argument("--catalog-root", type=Path, default=CATALOG)
        ap.add_argument("--all", type=Path, default=None, help="ingredients-all.json 路径")
        ap.add_argument("--out", type=Path, default=None, help="输出路径")
        args = ap.parse_args()
        catalog_root = args.catalog_root
        all_path = args.all
        out_path = args.out

    assert catalog_root is not None
    if all_path is not None:
        all_doc = json.loads(all_path.read_text(encoding="utf-8"))
        # 临时写到指定 out：复用核心逻辑
        names = unique_names_from_all(all_doc)
        prefer_path = out_path if out_path and out_path.is_file() else catalog_root / BY_CAT_NAME
        prefer = load_existing_assignment(prefer_path)
        categories, fallback = build_by_category(names, prefer=prefer)
        total = sum(len(v) for v in categories.values())
        dest = out_path or (catalog_root / BY_CAT_NAME)
        dest.write_text(
            format_by_category_json(categories, total=total, source=str(all_path.name)),
            encoding="utf-8",
        )
        print(f"by-category total={total} → {dest}")
        if fallback:
            print(f"  警告：暂归调味 {fallback}")
        return

    write_ingredients_by_category(catalog_root)


if __name__ == "__main__":
    main()
