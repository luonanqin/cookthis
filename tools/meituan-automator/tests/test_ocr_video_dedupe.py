import json

from ocr_video_frames import dedupe_preserve_order, main


def test_dedupe_preserve_order():
    assert dedupe_preserve_order(["青椒肉丝", "鱼香肉丝", "青椒肉丝", "米饭"]) == [
        "青椒肉丝",
        "鱼香肉丝",
        "米饭",
    ]


def test_dedupe_skips_empty():
    assert dedupe_preserve_order(["", "A", "", "A", "B"]) == ["A", "B"]


def _run_main(tmp_path, monkeypatch, ocr_image):
    # --full-frame：测试用假 jpg 字节，跳过真实裁剪
    monkeypatch.setattr(
        "sys.argv", ["ocr_video_frames.py", str(tmp_path), "--full-frame"]
    )
    monkeypatch.setattr("ocr_video_frames.ocr_image", ocr_image)
    monkeypatch.setattr(
        "ocr_video_frames.extract_product_names",
        lambda raw: list(raw),
    )
    try:
        main()
    except SystemExit as e:
        code = e.code
        return code if isinstance(code, int) else 1
    return 0


def test_main_empty_frames_exits_without_writing(tmp_path, monkeypatch, capsys):
    (tmp_path / "ocr_raw.jsonl").write_text("old\n", encoding="utf-8")
    (tmp_path / "dishes.txt").write_text("旧菜\n", encoding="utf-8")
    (tmp_path / "note.jpg").write_bytes(b"not a frame_")

    code = _run_main(tmp_path, monkeypatch, lambda *a, **k: ["不会调用"])

    err = capsys.readouterr().out
    assert code == 1
    assert "没有" in err and "frame_" in err
    assert (tmp_path / "ocr_raw.jsonl").read_text(encoding="utf-8") == "old\n"
    assert (tmp_path / "dishes.txt").read_text(encoding="utf-8") == "旧菜\n"


def test_main_all_frames_fail_exits_without_empty_dishes(tmp_path, monkeypatch, capsys):
    (tmp_path / "frame_0001.jpg").write_bytes(b"a")
    (tmp_path / "frame_0002.png").write_bytes(b"b")
    (tmp_path / "ocr_raw.jsonl").write_text("keep\n", encoding="utf-8")
    (tmp_path / "dishes.txt").write_text("旧菜\n", encoding="utf-8")

    def boom(*_a, **_k):
        raise RuntimeError("ocr down")

    code = _run_main(tmp_path, monkeypatch, boom)
    err = capsys.readouterr().out
    assert code == 1
    assert "成功 0" in err and "失败 2" in err
    assert "全部" in err and "失败" in err
    assert (tmp_path / "ocr_raw.jsonl").read_text(encoding="utf-8") == "keep\n"
    assert (tmp_path / "dishes.txt").read_text(encoding="utf-8") == "旧菜\n"


def test_main_partial_success_writes_only_successful_frames(tmp_path, monkeypatch, capsys):
    (tmp_path / "frame_0001.jpg").write_bytes(b"a")
    (tmp_path / "frame_0002.jpg").write_bytes(b"b")
    (tmp_path / "frame_0003.jpg").write_bytes(b"c")
    (tmp_path / "ocr_raw.jsonl").write_text("stale\n", encoding="utf-8")

    def ocr(path, **_k):
        if path.name == "frame_0002.jpg":
            raise RuntimeError("bad frame")
        if path.name == "frame_0001.jpg":
            return ["青椒肉丝", "青椒肉丝"]
        return ["鱼香肉丝"]

    code = _run_main(tmp_path, monkeypatch, ocr)
    out = capsys.readouterr().out
    assert code == 0
    assert "成功 2" in out and "失败 1" in out
    assert (tmp_path / "dishes.txt").read_text(encoding="utf-8") == "青椒肉丝\n鱼香肉丝\n"
    lines = (tmp_path / "ocr_raw.jsonl").read_text(encoding="utf-8").splitlines()
    assert [json.loads(line)["file"] for line in lines] == [
        "frame_0001.jpg",
        "frame_0003.jpg",
    ]
    assert "stale" not in (tmp_path / "ocr_raw.jsonl").read_text(encoding="utf-8")
