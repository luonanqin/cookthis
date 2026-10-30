"""OCR 引擎选择与 Rapid 文本拼行。"""

from __future__ import annotations

from unittest.mock import patch

import ocr_products as op


def test_resolve_ocr_engine_default_rapid(monkeypatch) -> None:
    monkeypatch.delenv("MEITUAN_OCR_ENGINE", raising=False)
    assert op.resolve_ocr_engine(None) == "rapid"


def test_resolve_ocr_engine_env(monkeypatch) -> None:
    monkeypatch.setenv("MEITUAN_OCR_ENGINE", "tesseract")
    assert op.resolve_ocr_engine(None) == "tesseract"


def test_resolve_ocr_engine_cli_overrides_env(monkeypatch) -> None:
    monkeypatch.setenv("MEITUAN_OCR_ENGINE", "tesseract")
    assert op.resolve_ocr_engine("rapid") == "rapid"


def test_resolve_ocr_engine_rejects_unknown() -> None:
    try:
        op.resolve_ocr_engine("foo")
    except ValueError as e:
        assert "foo" in str(e)
    else:
        raise AssertionError("expected ValueError")


def test_rapid_lines_sort_by_box_top() -> None:
    class Fake:
        txts = ("下", "上")
        boxes = [
            [[0, 100], [10, 100], [10, 120], [0, 120]],
            [[0, 10], [10, 10], [10, 30], [0, 30]],
        ]

    assert op.rapid_result_to_text(Fake()) == "上\n下"


def test_ocr_image_dispatches_tesseract(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("MEITUAN_OCR_ENGINE", "tesseract")
    img = tmp_path / "x.png"
    from PIL import Image

    Image.new("RGB", (20, 20), "white").save(img)

    with patch.object(op, "_ocr_tesseract", return_value="土豆") as tess:
        with patch.object(op, "_ocr_rapid") as rapid:
            text = op.ocr_image(img, engine="tesseract")
    assert text == "土豆"
    tess.assert_called_once()
    rapid.assert_not_called()
