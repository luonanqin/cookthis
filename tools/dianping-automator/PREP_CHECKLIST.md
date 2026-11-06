# 大众点评采集 — 准备清单

按优先级从上到下补充。每完成一项：把对应 **Attributes**（或约定答案）贴给 AI，并在本文件把 `[ ]` 改成 `[x]`。

约定：

- 默认用 Inspector **Copy Attributes**
- 结构复杂（列表项、父子关系不清）再补一小段 **XML**
- 文案以真机为准；若 App 上不是「汤羹」而是「汤」，以真机为准并写明

---

## P0 — 配置（已确认）

### P0-1 城市列表

- [x] 范围：中国大陆各省/自治区**省会（首府）+ 直辖市**（暂不含港澳台）
- [x] 顺序：按城市体量大致从大到小（综合常用人口/经济体量排序，非官方排名）

```text
上海,北京,广州,重庆,天津,成都,武汉,杭州,西安,南京,郑州,长沙,沈阳,合肥,福州,济南,昆明,哈尔滨,长春,石家庄,南昌,贵阳,太原,南宁,乌鲁木齐,兰州,海口,呼和浩特,银川,西宁,拉萨
```

若要调整个别城市先后，直接改上面列表即可。

### P0-2 菜系列表

- [x] 每个城市都跑下列搜索关键词（用于首页搜索，凑满成功店数）

```text
川菜,粤菜,鲁菜,苏菜,浙菜,闽菜,湘菜,徽菜,东北菜,西北菜,本帮菜,京菜,豫菜,云南菜,贵州菜,内蒙菜,新疆菜,湖北菜,江西菜
```

### P0-3 数量与输出

- [x] 每个**搜索菜系**成功落库店铺数：`10`  
  （以搜索词维度计数：该搜索词下成功采集 10 家即可；不是按店铺页读到的菜系标签计数）
- [x] 输出格式：`json`（一店一文件，店内多菜放数组，不适合扁平成 csv 行）
- [x] 目录：`output/{城市}/{店铺菜系}/{店名}.json`  
  （目录菜系优先尝试列表第三行；若无障碍树文案则改用**店内菜系标签**；不是搜索框关键词）
- [x] 遇已有店名：`跳过`

### P0-4 业务边界

- [x] 店详首屏无「推荐菜」，或点推荐菜后仍无「菜单/文字菜单」：`跳过该店`（不再整页下滑找菜单）
- [x] 缺某一菜品标签：`跳过该标签，其余照读`
- [x] 菜名读取范围：`滑动尽量读全`
- [x] 店铺菜系来源：列表第三行 OCR → 按 `/` 取第一段并去空格（例 `川 菜 / …` → `川菜`）；失败再读店内标签
- [x] 列表滑到底仍凑不满 10 家：`结束该搜索菜系，进入下一个搜索菜系`
- [x] 四个标签真机文案：

| 逻辑类 | 真机标签文案 |
|--------|----------------|
| 荤菜 | 荤菜 |
| 素菜 | 素菜 |
| 汤羹 | 汤羹 |
| 主食 | 主食 |

### P0-5 起始状态

- [x] 初始城市随意；脚本开始时停在**首页**即可（会按城市列表切换）

### P0 JSON 结构（默认，若要改字段名再说）

```json
{
  "city": "上海",
  "search_cuisine": "川菜",
  "shop_name": "某店",
  "shop_cuisine_raw": "川 菜 / 酸 菜 鱼 / …",
  "shop_cuisine": "川菜",
  "dishes": {
    "荤菜": ["回锅肉", "水煮鱼"],
    "素菜": ["干煸豆角"],
    "汤羹": [],
    "主食": ["米饭"]
  }
}
```

- `search_cuisine`：搜索框关键词（用于凑满 10 家的计数维度）
- `shop_cuisine_raw`：列表第三行 OCR 原文
- `shop_cuisine`：`raw.split('/')[0]` 再去空格；目录用这个
- 某标签不存在或未读到：对应数组为 `[]`（该标签已跳过）
- 文件路径示例：`output/上海/川菜/某店.json`

---

## P1 — 首页搜索菜系 + 进第一家店（骨架就能跑）

### P1-1 首页搜索框（未聚焦）

- [x] Attributes 已提供  
- 备注：`android.view.View`，`clickable=true`，**无 resource-id**，bounds=`[135,207][779,300]`（本机分辨率下可点中心；若有带 id 的父/子更好）

```text
class=android.view.View, clickable=true, bounds=[135,207][779,300]
```

### P1-2 首页搜索输入框（EditText，可输入菜系名）

- [x] Attributes 已提供  
- 备注：与城市页 `search_edit` **不同**；综合搜索用 `search_keyword_edit`

```text
EditText / com.dianping.v1:id/search_keyword_edit / clickable=true, focusable=true
搜索按钮: TextView / com.dianping.v1:id/search_button / text=搜索
流程: 点首页搜索区 → search_keyword_edit.send_keys(菜系) → 点 search_button
```

### P1-3 搜索结果 — 第一个店铺

- [x] 整行/卡片：`com.dianping.v1:id/shop_item_shop_view`（`clickable=true`）  
- [x] 店名：`com.dianping.v1:id/search_shop_title_text`  
- 区分方式：有 `shop_item_shop_view` / `search_shop_title_text` 的视为店铺（可 `find_elements` 取第 N 个）

```text
进店：点 shop_item_shop_view 的 instance(0) 或第 N 个
读列表店名：search_shop_title_text
```

### P1-4 「已进入店铺页」信号

- [x] 底部「打卡」文案（可用；无 resource-id）  
- （可选增强）若有店内店名的 resource-id 再补一条更稳

```text
TextView text=打卡（底部栏）
```

---

## P2 — 店铺首页：菜单入口、店名、菜系

### P2-1 菜单模块入口

- [x] 「菜单」Attributes 已提供；「文字菜单」同结构，只改文案匹配  
- 匹配：`contains("菜单")` 或 `contains("文字菜单")`（`菜单 (N)` 也能命中前者）  
- 不在首屏；经验约滑 4–5 次 → **脚本滚动查找**  
- `clickable=false` → 点该 TextView 或可点父节点  
- 两者都找不到 → 跳过该店

```text
滚动查找 TextView：text contains "菜单" 或 "文字菜单" → click
```

### P2-2 店铺名

- [x] 优先用列表 `id/search_shop_title_text`（进店前读取）  
- 店内大标题无 id，作备选

```text
id/search_shop_title_text
```

### P2-3 菜系

- [x] 列表 `search_shop_third_line`：无障碍文案 → OCR 备选  
- [x] 店内菜系（优选）：评分行同级 TextView  
  `口味4.6` / `环境4.4` / `服务4.4` / **`酸菜鱼/水煮鱼`** / `万源城/东兰路`  
  定位：`//TextView[starts-with(@text,"口味")]/following-sibling::TextView[3]`

```text
进店后找「口味」锚定 → 第 3 个 following-sibling = 菜系
```

### P2-4 从店铺页回到搜索列表

- [x] 返回方式：`系统返回键一次`（`press_keycode(4)`）

```text
driver.press_keycode(4)
```

---

## P3 — 菜单页：四类标签 + 菜名（已确认）

### P3-1～P3-4 标签

- [x] 荤菜 / 素菜 / 汤羹 / 主食：均为 `TextView`，`text` 即文案，**无 resource-id**，`clickable=false`  
- 点击：对 TextView `click()` 或点其父级；找不到某标签则跳过该类

```text
//android.widget.TextView[@text="荤菜"] 等
```

### P3-5 菜品名

- [x] 示例：`TextView` text=`秋塘莲藕炖大骨棒肉`，无 id，`clickable=false`  
- 一屏约 **20** 条；分类多时**滑动读全**（无需分页加载）  
- 识别策略：右侧列表（x 较大）的 TextView；排除侧栏标签、`¥`/`赞`/「推荐菜」「文字菜单」等；同行常有价格可辅助

```text
菜名 TextView + 可选同行 starts-with ¥
```

### P3-6 从菜单页回到店铺首页

- [x] 系统返回键一次

```text
driver.press_keycode(4)
```

---

## P4 — 列表翻店（凑满 10 家）

### P4-1 搜索结果列表 — 第 2 家店铺

- [x] Attributes 已提供（用于确认「下一店」定位方式）  
- 与第一家**相同** `resource-id`：`com.dianping.v1:id/shop_item_shop_view`  
- 用 `find_elements` 按屏幕上的**第 N 个**（或按店名）点进，不要依赖不同 id

```text
class=android.view.ViewGroup
resource-id=com.dianping.v1:id/shop_item_shop_view
clickable=true, focusable=true, long-clickable=true
bounds 示例（第 2 家某一帧）=[0,1394][1080,1779]
```

### P4-2 列表滑动

- [x] 一屏大约几家店：`3`  
- [x] 滑一下大概新露出几家：`3`  
- [x] 店铺卡片稳定特征：

```text
resource-id=com.dianping.v1:id/shop_item_shop_view（所有店共用）
店名=com.dianping.v1:id/search_shop_title_text
以店名去重；满 10 家成功或滑到底结束该搜索菜系
```

---

## P5 — 可选增强（有则更好）

- [x] 城市切换：沿用现有 `tab_arrow` + `search_edit` + `id/area`（`smoke_city_food.py` 已测通）
- [x] 首页「美食」分类入口：**暂不用**，直接首页搜索菜系
- [x] 空态/无结果页：不存在，不必处理
- [x] 登录/定位/青少年模式：App 已登录、无青少年模式，不必处理弹窗

---

## 交付进度（给你自己勾）

| 阶段 | 内容 | 完成后可让 AI 做什么 |
|------|------|---------------------|
| P0 | 配置 + 边界 | 定数据结构和主循环 |
| P1 | 搜菜系 → 进第一店 | 跑通单城单菜系进店 |
| P2 | 菜单入口 + 店名菜系 + 回列表 | 跳过无菜单店、写回列表 |
| P3 | 四标签 + 菜名 | 单店完整采集落文件 |
| P4 | 下一店 / 满 10 家 | 冒烟 2 家（`smoke_p4_shops.py`）已通 |
| 全部 | — | 正式：`python run_matrix.py`（`config.py`） |

---

## 粘贴区（对话里发也可以，这里备份）

把 Inspector 复制的 JSON 按编号贴在下面，例如：

### 备份：P1-1

```text

```

### 备份：P1-2

```text

```

### 备份：P1-3

```text

```

（按需继续追加 P1-4、P2-1…）
