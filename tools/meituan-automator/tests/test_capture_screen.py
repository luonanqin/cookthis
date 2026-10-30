"""adb screencap → 本机 PNG（终端回车抓屏）。"""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

import watch_screenshots as ws


def test_capture_screen_writes_png(tmp_path: Path) -> None:
    out = tmp_path / "enter_test.png"
    png = b"\x89PNG\r\n\x1a\n" + b"fake"

    def fake_run(cmd, **kwargs):
        assert cmd[:3] == ["adb", "-s", ws.UDID]
        assert cmd[3:] == ["exec-out", "screencap", "-p"]
        assert kwargs.get("capture_output") is True
        assert kwargs.get("text") is not True
        return subprocess.CompletedProcess(cmd, 0, stdout=png, stderr=b"")

    with patch("watch_screenshots.subprocess.run", side_effect=fake_run):
        got = ws.capture_screen(out)

    assert got == out
    assert out.read_bytes() == png


def test_capture_screen_returns_none_on_failure(tmp_path: Path) -> None:
    out = tmp_path / "enter_fail.png"

    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 1, stdout=b"", stderr=b"device offline")

    with patch("watch_screenshots.subprocess.run", side_effect=fake_run):
        got = ws.capture_screen(out)

    assert got is None
    assert not out.exists()


def test_capture_screen_rejects_empty_payload(tmp_path: Path) -> None:
    out = tmp_path / "enter_empty.png"

    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 0, stdout=b"", stderr=b"")

    with patch("watch_screenshots.subprocess.run", side_effect=fake_run):
        got = ws.capture_screen(out)

    assert got is None
    assert not out.exists()
