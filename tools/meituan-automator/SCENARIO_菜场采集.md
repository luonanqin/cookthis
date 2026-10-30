# 场景：美团「菜场」按收货地址采集食材

状态：**脚本已实现** `scrape_market_by_address.py`  
记录日期：2026-10-13

## 前置

- 初始页：已搜索关键字 **「菜场」**，停留在 **搜索结果页**
- Appium 已连接；收货地址列表里已有各城市地址（可由 `add_addresses.py` 预先加好）
- **启动脚本时**：打印提醒「请确认已在菜场搜索结果页」，**回车后再开始**（不自动跳转/搜索）

## 流程概要

```
搜索结果页（关键字=菜场）
  └─ 对每一个收货地址循环：
        1. 点击地址入口，展开地址列表
        2. 点击「展开更多地址」（若有）
        3. 点击地址列表里的目标地址
        4. 点击「完成」，等待搜索结果刷新
        5. 点击店铺进入（默认第 1 家；预留第 2 家，见 P6）
        6–7. 左侧含「菜/蛋/肉/豆/海鲜/菌/猪/牛/羊/鱼/火锅」且不含「现切/半成品/净菜/泡/酱」的分类：点击 → 读右侧食材 → 上滑直到其他标签
        8. 返回搜索结果页（若采 2 家则再进第 2 家后返回）
        9. 换下一地址，重复
```

## 定位步骤（留空，按步补充）

每步可贴：可见文案 / resource-id / class / bounds / 其它备注。  
能属性读取的步骤注明「只读不点」。

### P0 确认在「菜场」搜索结果页

- 关键信息：
- 备注：脚本侧只需 `input` 提醒人工确认后回车；不在此步做页面校验也可（实现时再定）

### P1 点击地址入口（展开地址列表）

- 关键信息：
  - package: `com.sankuai.meituan`
  - class: `android.widget.LinearLayout`
  - resource-id: `com.sankuai.meituan:id/filter_container`
  - text: （空）
  - clickable: true / focusable: true
  - bounds: `[23,333][315,407]`
- 备注：筛选项容器；点此展开地址列表。定位优先用 resource-id，勿依赖 elementId

### P2 点击「展开更多地址」（可选）

- 关键信息：
  - package: `com.sankuai.meituan`
  - class: `android.widget.TextView`
  - text: `展开更多地址`
  - resource-id: `com.sankuai.meituan:id/bcy`（混淆 id，可能随版本变；优先用 text）
  - clickable: false → 需坐标点击 bounds 中心
  - bounds: `[45,1094][279,1148]`
- 备注：无此按钮时跳过；`clickable=false` 时用 `clickGesture` 点 bounds

### P3 点击地址列表中的某一条地址

- 关键信息（单条地址行）：
  - 外层：`android.view.ViewGroup`，`clickable=true`，`focusable=true`
  - 样例 bounds：`[45,692][1035,843]`（全宽一行；具体 top 随列表位置变）
  - 内部结构：
    - `LinearLayout` → `TextView`（`com.sankuai.meituan:id/bcy`）展示地址文案，如「新达商务大厦」——**文案随地址变，不要写死**
    - 另有空 `LinearLayout`（`id/jzu`）
    - `ImageView`（`com.sankuai.meituan:id/selected_icon`）选中态图标
  - 注意：`id/bcy` 也用于 P2「展开更多地址」，不能单靠 id 区分，要结合「是否在可点 ViewGroup 行内 + 文案/行宽」

- 列表顺序（上→下，与城市倒序一致，**按序点，不写死 POI 名**）：
  ```
  拉萨 → 西宁 → 银川 → 呼和浩特 → 海口 → 兰州 → 乌鲁木齐 → 南宁 → 太原 → 贵阳 →
  南昌 → 石家庄 → 长春 → 哈尔滨 → 昆明 → 济南 → 福州 → 合肥 → 沈阳 → 长沙 →
  郑州 → 南京 → 西安 → 杭州 → 武汉 → 成都 → 天津 → 重庆 → 广州 → 北京 → 上海
  ```

- 推荐点击策略（不写死地址）：
  1. 展开列表（P1 + 可选 P2）后，收集所有「像地址行」的可点 `ViewGroup`：
     - `clickable=true`
     - 宽度接近全屏（如 width > 800）
     - 子节点含 `selected_icon` 或含非「展开更多地址」的地址 `TextView`
  2. 按 `bounds.top` **从小到大**排序 = 屏幕从上到下
  3. 第 `i` 轮点排序后的第 `i` 行（对应上表第 `i` 个城市）
  4. 一屏显示不全时：点完可见行后对列表区域上滑，重新采集尚未点过的行（可用已点过的 `top`/文案去重），直到 31 个城市都点过
  5. 点击目标：点外层 `ViewGroup`（或行中心坐标），不要依赖具体 POI 字符串

- 备注：若以后门牌号稳定为城市名且会出现在子 TextView 里，可加「文案包含城市名」作校验；当前以**列表顺序**为准即可

### P4 点击「完成」

- 关键信息：
  - package: `com.sankuai.meituan`
  - class: `android.widget.TextView`
  - text: `完成`
  - resource-id: `com.sankuai.meituan:id/s7i`（混淆 id，优先用 text）
  - clickable: true / focusable: true
  - bounds: `[552,1788][1032,1908]`（底部右侧）
- 备注：定位优先 `@text="完成"`；可直接 click 或点 bounds 中心

### P5 等待搜索结果随地址刷新完成

- 关键信息 / 等待条件：点击「完成」后 **固定等待 5 秒** 即可
- 备注：暂不做列表变化检测；若实机偏慢再加长

### P6 点击搜索结果中的店铺（预留最多 2 家）

当前流程先点 **第 1 家**；后续可能扩展为第 1、第 2 家都进店采集，定位一并记下。

- 第 1 家店铺：
  - package: `com.sankuai.meituan`
  - class: `android.view.ViewGroup`
  - resource-id: `com.sankuai.meituan:id/wzn`（混淆 id，可能随版本变）
  - text: （空）
  - clickable: false / focusable: true → 用 bounds 中心 `clickGesture`
  - bounds: `[0,431][1080,1250]`（列表上部大卡片）
- 第 2 家店铺（预留）：
  - class: `android.widget.FrameLayout`
  - text: （空）
  - clickable: false / focusable: false → 同样坐标点击
  - bounds: `[0,1250][1080,2069]`（紧接第 1 家下方）
- 策略备注：
  - 两行都是「整卡大块」且纵向紧挨；可按 `bounds.top` 排序取前 2 个大卡片，避免写死店名
  - 卡片 `clickable=false`，点卡片中上部（避免点到底部广告/按钮区）
  - 实现开关建议：`SHOPS_PER_ADDRESS = 1`（默认），以后改 `2` 即可跑两家

### P7 店内：识别左侧分类栏 / 单个标签块

- 整块标签（样例「推荐」那一行）：
  - class: `android.view.ViewGroup`
  - text: （空）
  - clickable: false / focusable: false
  - bounds: `[0,800][230,935]` → 左侧栏宽约 **0–230**，单行高约 135
- 标签文案 TextView（样例）：
  - class: `android.widget.TextView`
  - text: `推荐`（随分类变化，如「叶菜」「肉类」等）
  - clickable: false
  - bounds: `[102,843][171,891]`（落在左侧栏内）
- 备注：下方还会有更多同类 ViewGroup + TextView 纵向排列；无稳定 resource-id，靠 **左侧 x 范围 + TextView 文案** 识别

### P8 店内：左侧目标标签（文案含 菜/蛋/肉/豆/海鲜/菌/猪/牛/羊/鱼/火锅）

- 关键信息：复用 P7；枚举左侧栏内所有 `TextView`，按排除词 → 关键字匹配
- 先排除（含任一则跳过）：`现切`、`半成品`、`净菜`、`泡`、`酱`
- 匹配关键字：`菜`、`蛋`、`肉`、`豆`、`海鲜`、`菌`、`猪`、`牛`、`羊`、`鱼`、`火锅`
- 枚举策略：
  1. 找 `TextView`，中心 x 或 right < ~250（落在左侧栏）
  2. 按 `bounds.top` 排序
  3. 含排除词 → 跳过；否则文案命中关键字 → 记为待点标签（「推荐」等不命中则跳过）
  4. 一屏看不全：对左侧栏区域上滑，继续采新文案（已点/已采集过的标签名去重）
- 备注：够用做识别；注意误伤（如将来出现含「菜」但无关的词）实现时可再收紧

### P9 店内：点击某个左侧标签

- 关键信息：点对应标签的外层 `ViewGroup`（P7 整块）中心，或点该 `TextView` 的 bounds 中心（二者皆 `clickable=false`，用 `clickGesture`）
- 备注：优先点整块 ViewGroup，热区更大

### P10 店内：右侧食材/商品名列表（只读）

- 关键信息（商品名样例）：
  - class: `android.widget.TextView`
  - text: `西红柿250g`（名称+规格连在一起，随商品变）
  - clickable: false / focusable: false
  - bounds: `[578,1040][791,1094]` → 在左侧栏右侧（left ≈ 578 > 230）
- 读取策略（**只读 text，不点击**，避免进详情）：
  1. 一次 `page_source`，定位右侧商品 `RecyclerView`（left≳250）
  2. **按项结构取名**：每张卡片只要最浅层 `FrameLayout > TextView` 标题（`ViewGroup > FrameLayout > TextView`）；「坏必赔」等在兄弟 ViewGroup 的更深分支里，且常与 `ImageView` 同级 → 结构上排除
  3. 分区标题仍按 `left≈252` 短文案识别；价格/月售等用轻量噪声过滤
  4. 同一屏去重后写入当前「地址 × 店 × 左侧标签」下
- 备注：不要对商品行做 click/tap

### P11 店内：右侧列表向上滑动 + 分区标题（停止条件）

- 右侧分区标题样例（非商品名）：
  - class: `android.widget.TextView`
  - text: `年货专区`（随下一分区变化）
  - clickable: false
  - bounds: `[252,1272][408,1326]` → left≈252，紧贴左侧栏右侧，多为**分区标题**
- 含义：能读到该标题 → 其下方商品属于该分区；对当前已点左侧标签而言，若右侧出现**另一个分区标题**，表示当前标签内容已滑完/进入下一段
- 滑动区域：右侧商品区（x > ~250，避开左侧栏），在区域内 `swipe` 上滑
- 右侧分区标题样例：
  - 子分类（继续采）：`茄果豆类`，bounds 如 `[252,1125][408,1179]`——**不在左侧栏列表里**
  - 新左侧标签（停止）：`平价专区`，bounds 如 `[252,936][408,990]`——**能在左侧栏列表里找到**
- 停止条件（已实现）：
  1. 预先扫全左侧栏，得到全部左侧标签名集合 + 需采集的目标标签
  2. 上滑时读右侧 `left≈252` 的标题
  3. 标题 ∉ 左侧列表 → 当前标签的子分类，继续
  4. 标题 ∈ 左侧列表且 ≠ 当前标签 → 已到新左侧标签，停止并换下一个目标
  5. 兜底：连续多次上滑无新商品

### P12 从店铺返回「菜场」搜索结果页

- 关键信息：系统返回键 `press_keycode(4)`
- 备注：直到再次看到 `filter_container` 视为回到搜索结果页

### P13 地址循环结束 + 断点续跑（能做到）

- 结束条件：P3 城市顺序共 **31** 个，从「拉萨」点到「上海」全部采完即结束
- 城市 ↔ 地址位置：第 `i` 个城市 = 地址列表按 `bounds.top` 排序后的第 `i` 行（**不写死 POI 文案**）
- 断点续跑：**能做到**
  - 配置如 `RESUME_CITY = "昆明"` 或 `RESUME_INDEX = 14`（从该城/该下标开始，含本身）
  - 进度可写本地文件（每完成一城追加），中断后读进度续跑
  - 续跑时：仍从搜索结果页进地址列表，滑到目标行可见再点第 `i` 行
- 备注：列表顺序若被用户改过地址簿，需与脚本内城市顺序保持一致；脚本侧以「顺序下标」为准

## 采集目标（预期产物，实现时再定格式）

- 按 **地址（城市）** × **店铺** × **左侧分类标签** 汇总右侧读到的食材/商品名
- 只读文本、尽量少误点进详情

## 相关文件

- 地址配置：`addresses.json`
- 批量加地址：`add_addresses.py`
- 本场景脚本：`scrape_market_by_address.py`
- 产出：`screenshots_inbox/{城市}/market.json` + `products.jsonl`；进度：`screenshots_inbox/_market_progress.json`

```bash
cd tools/meituan-automator
# 手机停在「菜场」搜索结果页
python scrape_market_by_address.py
```
