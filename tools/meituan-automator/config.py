"""美团收货地址批量新增配置。"""

from __future__ import annotations

from pathlib import Path

APPIUM_URL = "http://127.0.0.1:4723"

UDID_USB = "CLB0218723006111"
UDID_WIFI = "192.168.31.21:5555"
UDID = UDID_USB

PACKAGE = "com.sankuai.meituan"
# 仅附着已打开的美团；请先停在「收货地址」列表页
ACTIVITY = "com.meituan.android.pt.homepage.activity.MainActivity"

ADDRESSES_FILE = Path(__file__).resolve().parent / "addresses.json"

# 推荐联系人芯片文案（含空格）
CONTACT_CHIP = "罗 13641723359"

# 门牌号填城市名（与 addresses.json 的 city 一致）
HOUSE_NUMBER_USE_CITY = True

# 断点：从此城开始（含）；None 表示从头
RESUME_CITY: str | None = None

# 分段调试：选完城市搜索结果后暂停，回车再继续填详细地址
STEP_PAUSE_AFTER_CITY = False

# 逐步停顿（秒）
PAUSE_SHORT = 0.8
PAUSE_MED = 1.5
PAUSE_LONG = 2.5

# —— 菜场采集（scrape_market_by_address.py）——
# 地址列表上→下顺序（与加地址时倒序城市一致）
MARKET_CITIES: list[str] = [
    "拉萨",
    "西宁",
    "银川",
    "呼和浩特",
    "海口",
    "兰州",
    "乌鲁木齐",
    "南宁",
    "太原",
    "贵阳",
    "南昌",
    "石家庄",
    "长春",
    "哈尔滨",
    "昆明",
    "济南",
    "福州",
    "合肥",
    "沈阳",
    "长沙",
    "郑州",
    "南京",
    "西安",
    "杭州",
    "武汉",
    "成都",
    "天津",
    "重庆",
    "广州",
    "北京",
    "上海",
]
MARKET_SHOPS_PER_ADDRESS = 1  # 每地址进几家店（预留 2）
MARKET_REFRESH_WAIT_S = 5  # 点「完成」后等待秒数
MARKET_RESUME_CITY: str | None = None  # 从此城开始（含）；优先于进度文件
# Appium 菜场结果写入 screenshots_inbox/{城市}/（与截图 OCR 同一目录，统一清洗）
_TOOLS_ROOT = Path(__file__).resolve().parent
SCREENSHOTS_INBOX = _TOOLS_ROOT / "screenshots_inbox"
MARKET_OUTPUT_DIR = SCREENSHOTS_INBOX  # 兼容旧名：实际按城分子目录
MARKET_PROGRESS_FILE = SCREENSHOTS_INBOX / "_market_progress.json"
# 手录视频入口：video/{城市}/*.mp4 → screenshots_inbox/{城市}/_video/ + products.jsonl
VIDEO_DIR = _TOOLS_ROOT / "video"
# 混录不分荤素等；清洗时进「未分类」桶，后续靠 by-category / 编辑器补类
VIDEO_DEFAULT_CATEGORY = "未分类"

# 半自动截图 OCR：商品名区域（Appium 坐标，与 1080 宽截图一致）
# 左上 (x1,y1) → 右下 (x2,y2)
OCR_REGION = (565, 470, 1020, 1610)

# 录屏抽帧 OCR：商品列表文字区（Appium 窗口坐标；帧按 ref 宽高分轴缩放后裁剪）
# 左上 (x1,y1) → 右下 (x2,y2)；ref = driver.get_window_size()
VIDEO_OCR_REGION = (230, 440, 1070, 2070)
VIDEO_OCR_REF_SIZE = (1080, 2244)  # width, height

# 截图采集分类（可切换；解析文本按城市汇总追加）
OCR_CATEGORIES: list[str] = ["荤菜", "素菜", "汤羹", "主食", "火锅食材", "豆制品", "海鲜水产"]
