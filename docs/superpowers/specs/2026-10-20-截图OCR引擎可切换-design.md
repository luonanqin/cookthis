# 截图 OCR：RapidOCR 默认，可切回 Tesseract

状态：已定稿  
日期：2026-10-20

## 目标

半自动截图流水线默认用 **RapidOCR（onnx）** 识别中文商品名，效果不够时可切回 **Tesseract** 对比。抽取商品名与清洗逻辑不变。

## 已定决策

| 项 | 决定 |
|----|------|
| 默认引擎 | `rapid`（包名 `rapidocr`） |
| 备用引擎 | `tesseract`（现有 `pytesseract` + `chi_sim`） |
| 切换 | CLI `--ocr rapid\|tesseract`；环境变量 `MEITUAN_OCR_ENGINE`；CLI 优先 |
| Rapid 推理后端 | 优先 `onnxruntime`；当前 Python 3.14 无轮子时用 `openvino` |
| 文本后处理 | `extract_product_names` / `clean_product_name` 共用，不因引擎分叉 |
| 依赖 | `rapidocr` + `openvino`（或 onnxruntime）写入 requirements；Tesseract 仍保留 |
| 缺依赖 | 明确报错；提示可 `--ocr tesseract` |

## 实现要点

1. `ocr_products.py`：`resolve_ocr_engine()` + `ocr_image(..., engine=)`；Rapid 按检测框自上而下拼行。
2. `run_screenshot_pipeline.py` / `ocr_products` CLI：透传 `--ocr`，启动时打印当前引擎。
3. README 半自动截图一节补一句切换说明。
4. 包名用新版 `rapidocr`（旧包 `rapidocr-onnxruntime` 不支持较新 Python）。

## 非目标

- 本轮不做食材词表纠偏
- 不引入完整 PaddlePaddle
- 不改 OCR 裁剪区域
