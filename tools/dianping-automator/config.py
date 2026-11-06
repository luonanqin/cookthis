"""P0 正式采集配置（城市 / 菜系 / 每系店数）。"""

from __future__ import annotations

# 省会（首府）+ 直辖市，体量大致从大到小（暂不含港澳台）
CITIES: list[str] = [
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
]

# 每个城市都跑的搜索关键词（凑满成功店数的计数维度）
CUISINES: list[str] = [
    "川菜",
    "粤菜",
    "鲁菜",
    "苏菜",
    "浙菜",
    "闽菜",
    "湘菜",
    "徽菜",
    "东北菜",
    "西北菜",
    "本帮菜",
    "京菜",
    "豫菜",
    "云南菜",
    "贵州菜",
    "内蒙菜",
    "新疆菜",
    "湖北菜",
    "江西菜",
    "火锅",
    "烧烤",
]

# 每个搜索菜系成功落库店铺数
SHOPS_PER_CUISINE = 5

# —— 设备连接（Appium / adb 的 udid）——
# 无线需先：adb connect 192.168.31.21:5555，且 adb devices 显示 device
UDID_USB = "CLB0218723006111"
UDID_WIFI = "192.168.31.21:5555"
# 无线不稳时用 USB；要无线改成 UDID_WIFI
UDID = UDID_USB

# 断点续跑：跳过此点之前的城/菜系（含更早的城市整段）。
# 设为 None 表示从头跑。中断后续跑示例：上海 + 京菜
RESUME_CITY: str | None = "天津"
RESUME_CUISINE: str | None = "豫菜"

# —— 节流（降低风控；单位秒，每次在区间内随机）——
# Appium 本身也有自动化特征，间隔只能减轻不能根除
THROTTLE_AFTER_SHOP = (2.5, 5.0)  # 每成功采完一家
THROTTLE_AFTER_SKIP = (0.8, 1.8)  # 跳过一家（已有/同分店）
THROTTLE_LIST_SWIPE = (0.6, 1.4)  # 搜索列表上滑
THROTTLE_MENU_SWIPE = (0.4, 0.9)  # 菜单内上滑
THROTTLE_BETWEEN_CUISINE = (8.0, 18.0)  # 换搜索菜系前
THROTTLE_BETWEEN_CITY = (15.0, 35.0)  # 切城市前
CAPTCHA_CHECK = False  # 不做滑动验证检测（page_source 在无线下很慢；有风控再改 True）

# —— 卡死自动恢复（杀点评进程 → 新会话 → 重开 App → 从当前城/菜系续）——
AUTO_RECOVER = True
SHOP_HANG_TIMEOUT_S = 240  # 单店采集超时（秒）视为卡死
CAPTCHA_WAIT_MAX_S = 300  # 滑动验证等人手最长秒数，超时则杀进程重开
MAX_RECOVERIES = 25  # 整次跑矩阵最多自动恢复次数
