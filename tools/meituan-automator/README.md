# 美团收货地址批量新增

按 `addresses.json` 循环：新增 → 选城 → 搜地址 → 门牌=城市名 → 点推荐联系人 → 保存。

## 准备

1. 手机打开美团，进入 **收货地址列表**（能看到「新增收货地址」）
2. 关掉 Appium Inspector Session
3. 终端保持 `appium` 运行；`adb devices` 为 device
4. 改 `config.py` 的 `UDID` / `RESUME_CITY`；改地址只动 `addresses.json`

```bash
cd tools/meituan-automator
pip install -r requirements.txt
python add_addresses.py
```

失败会打印日志并 **暂停**，人工处理好后回车重试当前城市。

## 菜场按地址采集食材

场景说明见 `SCENARIO_菜场采集.md`。

1. 手机打开美团，搜索 **菜场**，停在 **搜索结果页**
2. 关掉 Inspector；`appium` 运行中
3. `config.py`：`MARKET_RESUME_CITY` / `MARKET_SHOPS_PER_ADDRESS`（默认 1）

```bash
cd tools/meituan-automator
python scrape_market_by_address.py
```

启动后回车才开始。产出写入 `screenshots_inbox/{城市}/market.json`，并自动解析为同目录 `products.jsonl`（与截图 OCR 同一套清洗）；进度 `screenshots_inbox/_market_progress.json`。

## 半自动截图采集（少触发风控）

按**城市 × 类别**采集：① 拉截图 → ② 裁剪 → ③ OCR 追加到该城汇总（不覆盖）。

```bash
cd tools/meituan-automator
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # 首次
.venv/bin/python run_screenshot_pipeline.py
```

启动后选城市、再选类别（荤菜/素菜/汤羹/主食/火锅食材/豆制品/海鲜水产）。监听中可输入：

| 命令 | 作用 |
|------|------|
| `t` | 切换类别 |
| `c` | 切换城市 |
| `s` | 看当前状态 |
| `q` | 退出 |

目录与结果：

| 路径 | 内容 |
|------|------|
| `screenshots_inbox/{城市}/{类别}/*.jpg` | 全屏截图 |
| `screenshots_inbox/{城市}/{类别}/crops/` | 裁剪区 |
| `screenshots_inbox/{城市}/products.jsonl` | 全市各类别汇总（追加），含 `city`/`category`/`before`/`after` |

```bash
.venv/bin/python run_screenshot_pipeline.py --city 上海 --category 素菜
.venv/bin/python run_screenshot_pipeline.py --local   # 遍历已有城市/类别补跑 OCR
```

## 食材大全（城货架 / 全量 / 别名）

1. 清洗：`.venv/bin/python clean_city_products.py`
2. 导出合并：`.venv/bin/python build_ingredient_catalog.py`
3. 人工改：`data/catalog/review/{reject,accept,segment-hints}.txt` 与 `data/catalog/aliases.json`
4. 匹配示例：见 `alias_match.py` 中 `expand_shelf` / `recipe_covered`
