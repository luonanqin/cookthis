"""对 Appium 元素区域截图并用 Tesseract OCR 识别中文。"""

from __future__ import annotations

import io
import shutil

from PIL import Image, ImageOps


def ocr_element(driver, el, debug_path=None) -> str:
    """
    按元素 bounds 裁剪当前截图并 OCR（chi_sim+eng）。
    自动按 screenshot 与 window 尺寸比例缩放坐标。
    """
    if not shutil.which("tesseract"):
        raise RuntimeError("未找到 tesseract，请 brew install tesseract tessdata")

    import pytesseract

    png = driver.get_screenshot_as_png()
    img = Image.open(io.BytesIO(png)).convert("RGB")
    win = driver.get_window_size()
    scale_x = img.width / float(win["width"])
    scale_y = img.height / float(win["height"])

    rect = el.rect
    left = max(0, int(rect["x"] * scale_x))
    top = max(0, int(rect["y"] * scale_y))
    right = min(img.width, int((rect["x"] + rect["width"]) * scale_x))
    bottom = min(img.height, int((rect["y"] + rect["height"]) * scale_y))
    if right <= left or bottom <= top:
        return ""

    # 略微加高一点，避免裁切过紧
    pad = 4
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(img.width, right + pad)
    bottom = min(img.height, bottom + pad)

    crop = img.crop((left, top, right, bottom))
    # 放大 + 灰度，提升小字识别率
    w, h = crop.size
    crop = crop.resize((w * 3, h * 3), Image.Resampling.LANCZOS)
    crop = ImageOps.grayscale(crop)
    crop = ImageOps.autocontrast(crop)

    if debug_path is not None:
        crop.save(debug_path)

    text = pytesseract.image_to_string(crop, lang="chi_sim+eng")
    return " ".join(text.split())
