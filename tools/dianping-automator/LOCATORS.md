# 大众点评 UI 自动化 — 控件定位记录

机型：华为 EML-AL00（`CLB0218723006111`）  
包名：`com.dianping.v1`  
启动 Activity：`com.dianping.v1.NovaMainActivity`  
约定：不更新 App、不改分辨率；列表类控件用语义定位，不用固定坐标。

## 已验证控件

### 1. 打开切城市（首页当前城市入口）

| 项 | 值 |
|----|-----|
| 展示文案 | `TextView` / `com.dianping.v1:id/tab_text` / text=当前城市（如「上海」） |
| 整块入口 | `ViewGroup` / `com.dianping.v1:id/tab_item` |
| **下拉箭头（优先点这个）** | `ImageView` / `com.dianping.v1:id/tab_arrow` |
| 箭头属性 | `clickable=true`，`focusable=true`，bounds 示例 `[284,135][320,150]` |

打开切城市（推荐）：

```text
resourceId("com.dianping.v1:id/tab_arrow")
```

读当前城市文案（须在含 arrow 的 tab_item 下，勿取「关注」）：

```text
//*[@resource-id="…/tab_item"][.//*[@resource-id="…/tab_arrow"]]//*[@resource-id="…/tab_text"]
```

### 2. 城市选择页 — 搜索框（推荐选城方式）

| 项 | 值 |
|----|-----|
| 容器 | `LinearLayout` / `com.dianping.v1:id/search_layout`（可能仍在） |
| **进页即可见的占位（现版）** | `TextView` text=`搜索城市/区县`，**无 id**，`clickable=false`；bounds 例 `[245,123][494,168]` |
| **实际输入** | 同带 `EditText`（常无 id；hint 在 TextView 上时自身 text 可能为空） |
| 旧版兼容 | `id/start_search` + `id/search_edit` |

流程：

```text
1. 等到 TextView「搜索城市/区县」= 城市页就绪（进页即可输入，不必再点美食式占位）
2. 对顶栏 EditText：clear → send_keys("城市名")（找不到则点 hint 中心聚焦）
3. 点结果 id/area（contains 城市名）
```

推荐：

```text
//android.widget.TextView[contains(@text,"搜索城市")]   # 就绪信号
# 输入：顶栏 EditText / 旧 id/search_edit
```

**搜索结果第一条**（输入城市后第一条即目标城市）：

| 项 | 值 |
|----|-----|
| 整行 | `ViewGroup`，常无 id，`clickable=false`；bounds 例 `[0,207][1080,345]` |
| 城市名（若有） | `TextView` / `com.dianping.v1:id/area`（也可能暂时找不到） |
| 列表容器 | `ListView` / `android:id/list`（若有） |

推荐定位：

```text
# 优先：列表里第一条 area（不校验文案）
(//*[@resource-id="android:id/list"]//*[@resource-id="com.dianping.v1:id/area"])[1]

# 兜底：点第一条结果行中心 (540, 276)
```

### 2b. 城市选择页 — 热门城市「第一格」

无稳定 `resource-id`。以**屏幕上热门网格左上角那一格**为准（当前文案多为「北京」，但脚本不写死城市名）。

实测属性（分辨率固定机）：

| 项 | 值 |
|----|-----|
| class | `android.widget.TextView` |
| text | 示例「北京」（会变，勿作唯一条件） |
| clickable / focusable | `true` |
| bounds | `[42,998][264,1097]` |

注意：不要用 `recommend_category_container` 里 `find_elements()[0]`——容易先点到「当前/历史」里的「上海」。

定位方式（本机固定分辨率）：

- Appium 的 `UiSelector` **没有** `bounds()`，不能写进 selector。
- 脚本会枚举 `clickable` 的 `TextView`，用元素 `rect` 对齐 `[42,998][264,1097]`（容差约 24px），并跳过当前城市文案（如「上海」）。
- 对不齐时兜底：点击格子中心 `(153, 1047)`。

### 3. 首页分类 — 美食（入口）

| 项 | 值 |
|----|-----|
| 图标 | `ImageView` / `com.dianping.v1:id/iv_category_icon`（**多分类共用 id，勿单独用**） |
| 文案 | `TextView` / `com.dianping.v1:id/tv_category_name` / text=「美食」 |

推荐定位：

```text
resourceId("com.dianping.v1:id/tv_category_name").text("美食")
```

### 4. 美食列表页 — 左上角「美食」标题（就绪信号）

视觉是红色「美食」字，实际是 **ImageView**（无 text / content-desc / resource-id）。

| 项 | 值 |
|----|-----|
| class | `android.widget.ImageView` |
| clickable / focusable | `true` |
| bounds | `[114,122][234,176]` |
| index | `2` |

脚本用 `rect` 对齐该 bounds，作为「已进入美食页且标题栏渲染完成」的同步条件，再截图。

### 5. 美食列表页 — 左上角返回（回首页）

从美食页要再去切城市时，需先回首页。

| 项 | 值 |
|----|-----|
| class | `android.widget.ImageView` |
| text / content-desc / resource-id | 均无 |
| clickable / focusable | `false` |
| bounds | `[33,116][99,182]` |

定位：用 `rect` 对齐该 bounds 后 `click()`；无效可：

```text
driver.press_keycode(4)   # Android KEYCODE_BACK，常比点图标更稳
```

回首页后再等 `tv_category_name`「美食」出现，确认已回到首页。

## 首页搜索菜系 → 进店（P1，部分）

| 步骤 | 定位 | 备注 |
|------|------|------|
| 点首页搜索区 | `View` clickable，bounds `[135,207][779,300]` | 无 id，分辨率固定下可用 |
| 输入菜系 | `EditText` / `id/search_keyword_edit` | 与城市页 `search_edit` 不同 |
| 点搜索 | `id/search_button` text=`搜索` | |
| 店铺卡片 | `id/shop_item_shop_view` | clickable，列表多项 |
| 列表店名 | `id/search_shop_title_text` | |
| 已进店 | text=`打卡` | 底部栏信号 |

## 店铺页 / 列表字段（P2）

| 项 | 定位 | 备注 |
|----|------|------|
| 推荐菜（先点） | `TextView` text=`推荐菜` | 店详首屏；无则跳过店；点后跳到推荐菜模块 |
| 菜单入口 | `TextView` `菜单 (N)` 或 `文字菜单` | 点推荐菜后再扫（最多轻滑几次）；勿整页盲滑 |
| 店名 | 列表 `id/search_shop_title_text` | 进店前读取 |
| 列表第三行 | `id/search_shop_third_line` | 无障碍文案 → 区域 OCR |
| 菜系（采用） | OCR 原文按 `/` 取第一段并去空格 | 例 `川 菜 / 酸 菜 鱼 / …` → `川菜`；失败再读店内「口味」行 |
| 回搜索列表 | 系统返回键 | |

## 菜单页菜品（P3）

| 项 | 定位 | 备注 |
|----|------|------|
| 侧栏 | 不点击；仅用 x&lt;200 排除 |
| 分区顺序 | 荤菜→素菜→甜品→小吃→汤羹→主食→饮品 | 标题滑出仍保持当前区，直到看见下一标题 |
| 菜名 | 右侧列 + **同行有 ¥/￥** | 排除顶部「官方菜单/上传菜单…」；无顶栏时列表从顶部开始也适用 |
| 结束 | 主食后出现饮品等，或滑到底 | 中间空白区不影响 |
| 回店铺首页 | 系统返回 | |

## 列表翻店（P4）

| 项 | 定位 | 备注 |
|----|------|------|
| 任意店铺卡片 | `id/shop_item_shop_view` | 与第 1 家相同 id；`find_elements` 取第 N 个 |
| 店名去重 | `id/search_shop_title_text` | 滑回列表后按店名跳过已采 |
| 一屏约 | 3 家 | 上滑一屏约再露出 3 家 |

## 全流程（P5）

| 项 | 策略 |
|----|------|
| 切城市 | 复用 `smoke_city_food`：`tab_arrow` → 城市 EditText（无 id）→ `id/area` |
| 进菜系 | **不走美食分类**，首页直接搜菜系 |
| 空态 / 登录弹窗 | 不处理（无空态；已登录、无青少年模式） |


## 验证脚本流程（当前）

见 `smoke_city_food.py`：

1. 人工停在首页（建议当前为上海）
2. 搜索切到杭州 → 美食 → `food_杭州.png` → 返回首页
3. 搜索切到成都 → 美食 → `food_成都.png` → 返回首页
4. 搜索切到北京 → 美食 → `food_北京.png` → 返回首页
5. 搜索切回上海首页结束（共 3 张图）
