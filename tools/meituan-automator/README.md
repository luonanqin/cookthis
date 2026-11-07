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

启动后选城市、再选类别（荤菜/素菜/汤羹/主食/火锅食材/豆制品/海鲜水产）。手机滑到合适位置后，在终端按**回车**抓当前屏（也可继续用手机截屏键）。监听中可输入：

| 命令 | 作用 |
|------|------|
| 回车（空行） | `adb screencap` 抓当前屏 → 裁剪 OCR |
| `t` | 切换类别 |
| `c` | 切换城市 |
| `s` | 看当前状态 |
| `q` | 退出 |

OCR 默认 **RapidOCR**（中文更准）。对比或回退旧引擎：

```bash
.venv/bin/python run_screenshot_pipeline.py --ocr tesseract
MEITUAN_OCR_ENGINE=tesseract .venv/bin/python run_screenshot_pipeline.py
.venv/bin/python ocr_products.py --ocr rapid path/to/crop.png
.venv/bin/python ocr_products.py --ocr tesseract path/to/crop.png
```

说明：Python 3.14 上常用 `openvino` 作 Rapid 推理后端（`onnxruntime` 暂无轮子）；装好 `requirements.txt` 即可。

目录与结果：

| 路径 | 内容 |
|------|------|
| `screenshots_inbox/{城市}/{类别}/*.jpg` | 全屏截图 |
| `screenshots_inbox/{城市}/{类别}/crops/` | 裁剪区 |
| `screenshots_inbox/{城市}/products.jsonl` | 全市各类别汇总（追加），含 `city`/`category`/`before`/`after` |

```bash
.venv/bin/python run_screenshot_pipeline.py --city 上海 --category 素菜
# 重跑已有截图 OCR（会先清掉该范围内 products.jsonl 旧行再写入）
.venv/bin/python run_screenshot_pipeline.py --local --city 武汉 --category 素菜
.venv/bin/python run_screenshot_pipeline.py --local --city 武汉          # 该城全部类别
.venv/bin/python run_screenshot_pipeline.py --local                      # inbox 全部
```

## 录屏入库（按城，与截图合并）

手录视频放到 `video/{城市}/`（**只认城市目录名，忽略视频文件名**；可混录；**默认 `category=未分类`**）。入口脚本一次完成抽帧 + OCR + 写入同城 `products.jsonl`：

```bash
cd tools/meituan-automator
.venv/bin/pip install -r requirements.txt

.venv/bin/python ingest_video_city.py --city 上海
.venv/bin/python ingest_video_city.py --city 上海 --skip-extract  # 已有帧只重跑 OCR
```

| 路径 | 内容 |
|------|------|
| `video/{城市}/*` | 手录入口（文件名随意） |
| `screenshots_inbox/{城市}/_video/frame_*.jpg` | 该城所有视频停稳帧汇总编号 |
| 同上 `crops/`、`ocr_raw.jsonl`、`dishes.txt` | 裁剪与 OCR 副产物 |
| `screenshots_inbox/{城市}/products.jsonl` | **截图 + 视频**汇总（`file` 为 `_video/frame_….jpg`；重跑该城会先清旧视频行） |

OCR 默认只认商品列表区（Appium 1080×2244 坐标 `230,440,1070,2070`，按帧分轴缩放）。底层仍可单独调用：

- `extract_still_frames.py VIDEO --out DIR`
- `ocr_video_frames.py FRAMES_DIR`（`--region` / `--full-frame`）

入库后走下方「食材大全」即可（旧城追加、新城如上海从零建货架同一套命令）。

## 食材大全（城货架 / 全量 / 别名）

1. 清洗：`.venv/bin/python clean_city_products.py`（或 `--city 上海`）  
   - 短名进货架 + 词典；达到字数门槛的进 `review/pending.txt`（已标记过的除外）  
   - 视频混录名在 **`未分类`** 桶，后续靠 by-category / 别名编辑器补类  
2. **只刷新 pending（不定时查看）**：  
   ```bash
   .venv/bin/python pending_review.py --min-len 3              # len≥3
   .venv/bin/python pending_review.py --min-len 3 --max-len 3  # 只看三字
   .venv/bin/python pending_review.py --min-len 4 --max-len 4  # 只看四字
   ```  
3. 人工标注：`r` / `a` / `s?=`→`s=`  
4. 一次写回并更新货架：`.venv/bin/python finish_review.py`  
   （内部依次：`apply_pending_marks.py` → `clean_city_products.py` → `build_ingredient_catalog.py` → `build_aliases.py`；仍可单独跑）  
   - `build_ingredient_catalog` 写出 `ingredients-all.json` 后同步刷新 `ingredients-all-by-category.json`（14 类、一项一类；已有归属优先保留）  
   - 只重刷品类：`.venv/bin/python ingredients_by_category.py`  
   - `build_aliases` 用 `alias-info.txt` + `ingredients-all` 类内同义 − `reject.txt` 重写 `aliases.json`（学名不进表）  
   - 只重刷别名：`.venv/bin/python build_aliases.py`  
   - 同步到小程序/云函数：仓库根目录 `node scripts/sync-alias-runtime-data.js`  
5. 云库导入食材（仓库根目录）：  
   ```bash
   node scripts/sync-builtin-from-all-catalog.js
   node scripts/import-ingredients.js
   # → data/catalog/ingredients-for-import.json
   ```  
6. 匹配示例：见 `alias_match.py` 中 `expand_shelf` / `recipe_covered`
