# 美团录屏停稳抽帧 + 批 OCR 设计

| 项 | 内容 |
|----|------|
| 日期 | 2026-11-06 |
| 背景 | 在美团商家页滑动录屏，停住时采屏，事后 OCR 识别菜名 |
| 位置 | `tools/meituan-automator/`（复用现有 RapidOCR / 清洗逻辑） |
| 状态 | 已确认并实现 |

---

## 1. 目标

录屏后自动：

1. 检测「滑动停下」的时刻并保存全屏帧（**帧级不去重**）
2. 全部抽帧结束后，对帧目录**整体跑 OCR**
3. **仅对 OCR 识别结果去重**，得到菜名列表

不要求实时边滑边截；不替代现有「回车抓屏」半自动流水线。

---

## 2. 流程

```
video/{城}/*.mp4
   │
   ▼
ingest_video_city.py
   │  抽帧（>0.2s）→ OCR → 追加 products.jsonl（category=未分类）
   ▼
screenshots_inbox/{城}/_video/frame_*.jpg   ← 只认城市目录，忽略视频文件名
screenshots_inbox/{城}/products.jsonl       ← 与截图 OCR 合并（file=_video/…）
   │
   ▼
clean_city_products → cities/{城}/ingredients.json → all / review / aliases → for-import
```

（已弃用 `screenshots_inbox/_from_video/`；请用按城 `_video/`。）

---

## 3. 停稳判定

| 参数 | 值 | 说明 |
|------|-----|------|
| 静止时长 | **> 0.2s** | 连续帧差异低于阈值的时长超过 0.2 秒即采一帧 |
| 差异度量 | 缩小灰度帧的平均绝对差（或等价轻量指标） | 实现时可调阈值，默认偏「略敏感」以少漏停 |
| 采样 | 按视频帧率逐帧或降采样到 ~10–15 fps 判静止 | 输出仍用停稳区间内的清晰帧（区间末帧或中位帧） |
| 帧去重 | **不做** | 同一屏停多次、或 OCR 前重复帧均保留 |

一次「动 → 静」周期只在进入停稳时存 **1** 张（进入静止且累计 >0.2s 的那一刻）；之后若一直静着不再连存；再次滑动再停，再存一张。

---

## 4. 脚本与产出

### 4.1 `extract_still_frames.py`

```bash
.venv/bin/python extract_still_frames.py path/to/video.mp4
# 可选：--out DIR  --min-still 0.2  --diff-threshold …
```

- 依赖：优先 OpenCV 读视频；若环境无 OpenCV，可用 `ffmpeg` 抽帧再判静止（实现时二选一，README 写明）。
- 默认输出：`screenshots_inbox/_from_video/{video_stem}/frame_XXXX.jpg`

### 4.2 批 OCR + 结果去重

```bash
.venv/bin/python ocr_video_frames.py screenshots_inbox/_from_video/{stem}
```

- 复用 `ocr_products` 的引擎选择与行清洗（噪声行、价格等）；商家**菜名**场景可先沿用，后续若噪声模式不同再加开关。
- 输出示例：
  - `…/ocr_raw.jsonl`：每帧原始/清洗后条目（便于排查）
  - `…/dishes.txt`：去重后菜名（一行一个，保序）

去重键：清洗后的菜名字符串；大小写/空白已在清洗阶段处理。

---

## 5. 非目标（本版不做）

- 手机端实时「停滑自动截」
- 截图/帧内容相似度去重
- Appium 自动滑动美团页
- 自动写入 `recipes-builtin`（仅产出菜名列表，人工或后续脚本再入库）

---

## 6. 验收

1. 一段「滑—停—滑—停」测试视频，停稳次数与输出帧数大致对应（每段静 >0.2s 至少 1 帧）。
2. 故意同一屏停两次 → 得到 2 张帧；OCR 后同名只保留 1 条。
3. README 补充用法；现有回车抓屏流水线行为不变。
