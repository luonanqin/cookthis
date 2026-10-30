#!/usr/bin/env python3
"""把扩展导出的结果写到本目录 result/，与已有文件按食材名合并（不丢旧数据）。

用法（采集前开着）:
  python3 tools/xiachufang-popularity-ext/save-server.py

默认 http://127.0.0.1:18765
  POST /save  JSON: {"filename":"xiachufang-category-results.json","text":"..."}
  GET  /health
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "result"
ARCHIVE_DIR = RESULT_DIR / "archive"

KNOWN = {
    "xiachufang-ingredient-progress.json",
    "xiachufang-category-results.json",
    "xiachufang-search-results.json",
    "xiachufang-no-results.json",
    "xiachufang-keyword-absent.json",
}

SAFE_NAME = re.compile(r"^[A-Za-z0-9._\-]+\.json$")


def merge_progress(old: dict, new: dict) -> dict:
    searched = sorted(
        set(old.get("searched") or []) | set(new.get("searched") or [])
    )
    out = dict(new)
    out["searched"] = searched
    if "version" not in out:
        out["version"] = old.get("version", 3)
    return out


def merge_items_doc(old: dict, new: dict) -> dict:
    """同名食材以本次写入为准，其它旧条目保留。"""
    items = {}
    items.update(old.get("items") or {})
    items.update(new.get("items") or {})
    out = dict(new)
    out["items"] = items
    if not out.get("updatedAt"):
        out["updatedAt"] = old.get("updatedAt") or ""
    return out


def _sorted_names(items: dict) -> list[str]:
    try:
        return sorted(items.keys(), key=lambda a: a.encode("gb18030"))
    except Exception:
        return sorted(items.keys())


def format_recipe_results(doc: dict) -> str:
    """与扩展一致：每个菜谱一行。"""
    items = doc.get("items") or {}
    updated_at = doc.get("updatedAt") or ""
    names = _sorted_names(items)
    lines = [
        "{",
        f'  "updatedAt": {json.dumps(updated_at, ensure_ascii=False)},',
        '  "items": {',
    ]
    for i, name in enumerate(names):
        rec = items.get(name) or {}
        comma = "," if i < len(names) - 1 else ""
        cats = json.dumps(rec.get("categories") or [], ensure_ascii=False)
        count = rec.get("count", 0) or 0
        recipes = rec.get("recipes") or []
        lines.append(f"    {json.dumps(name, ensure_ascii=False)}: {{")
        lines.append(f'      "categories": {cats},')
        lines.append(f'      "count": {count},')
        if not recipes:
            lines.append('      "recipes": []')
        else:
            lines.append('      "recipes": [')
            for j, r in enumerate(recipes):
                rc = "," if j < len(recipes) - 1 else ""
                body = {
                    "title": (r or {}).get("title") or "",
                    "count": (r or {}).get("count", 0) or 0,
                    "ingredients": (r or {}).get("ingredients") or [],
                }
                lines.append(
                    "        "
                    + json.dumps(body, ensure_ascii=False, separators=(",", ":"))
                    + rc
                )
            lines.append("      ]")
        lines.append(f"    }}{comma}")
    lines.append("  }")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def format_absent_results(doc: dict) -> str:
    items = doc.get("items") or {}
    updated_at = doc.get("updatedAt") or ""
    names = _sorted_names(items)
    lines = [
        "{",
        f'  "updatedAt": {json.dumps(updated_at, ensure_ascii=False)},',
        '  "items": {',
    ]
    for i, name in enumerate(names):
        rec = items.get(name) or {}
        comma = "," if i < len(names) - 1 else ""
        body = {
            "categories": rec.get("categories") or [],
            "page": rec.get("page") or "",
        }
        lines.append(
            f"    {json.dumps(name, ensure_ascii=False)}: "
            f"{json.dumps(body, ensure_ascii=False, separators=(',', ':'))}{comma}"
        )
    lines.append("  }")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def format_none_results(doc: dict) -> str:
    items = doc.get("items") or {}
    updated_at = doc.get("updatedAt") or ""
    names = _sorted_names(items)
    lines = [
        "{",
        f'  "updatedAt": {json.dumps(updated_at, ensure_ascii=False)},',
        '  "items": {',
    ]
    for i, name in enumerate(names):
        rec = items.get(name) or {}
        comma = "," if i < len(names) - 1 else ""
        body = {"categories": rec.get("categories") or []}
        lines.append(
            f"    {json.dumps(name, ensure_ascii=False)}: "
            f"{json.dumps(body, ensure_ascii=False, separators=(',', ':'))}{comma}"
        )
    lines.append("  }")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def dump_body(filename: str, merged: dict) -> str:
    if filename == "xiachufang-ingredient-progress.json":
        return json.dumps(merged, ensure_ascii=False, indent=2) + "\n"
    if filename in (
        "xiachufang-category-results.json",
        "xiachufang-search-results.json",
    ):
        return format_recipe_results(merged)
    if filename == "xiachufang-keyword-absent.json":
        return format_absent_results(merged)
    if filename == "xiachufang-no-results.json":
        return format_none_results(merged)
    return json.dumps(merged, ensure_ascii=False, indent=2) + "\n"


def merge_and_write(filename: str, text: str) -> dict:
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    path = RESULT_DIR / filename
    try:
        incoming = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid json: {e}") from e

    if path.is_file():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            existing = {}
        if filename == "xiachufang-ingredient-progress.json":
            merged = merge_progress(
                existing if isinstance(existing, dict) else {},
                incoming if isinstance(incoming, dict) else {},
            )
        elif isinstance(incoming, dict) and "items" in incoming:
            merged = merge_items_doc(
                existing if isinstance(existing, dict) else {},
                incoming,
            )
        else:
            merged = incoming
    else:
        merged = incoming

    body = dump_body(filename, merged if isinstance(merged, dict) else {})

    path.write_text(body, encoding="utf-8")

    # 归档：带时间戳，永不覆盖
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    stem = Path(filename).stem
    arch = ARCHIVE_DIR / f"{stem}-{stamp}.json"
    arch.write_text(body, encoding="utf-8")

    n_items = None
    if isinstance(merged, dict):
        if "searched" in merged:
            n_items = len(merged.get("searched") or [])
        elif "items" in merged:
            n_items = len(merged.get("items") or {})
    return {
        "ok": True,
        "path": str(path),
        "archive": str(arch),
        "keys": n_items,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[xcf-save] {args[0] if args else fmt}")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {"ok": True, "resultDir": str(RESULT_DIR)},
                    ensure_ascii=False,
                ).encode("utf-8")
            )
            return
        self.send_response(404)
        self._cors()
        self.end_headers()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/save":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            filename = str(payload.get("filename") or "").strip()
            text = payload.get("text")
            if not isinstance(text, str):
                raise ValueError("text must be string")
            if filename not in KNOWN and not SAFE_NAME.match(filename):
                raise ValueError(f"filename not allowed: {filename}")
            # 只允许落在已知名，避免乱写
            if filename not in KNOWN:
                raise ValueError(f"filename not allowed: {filename}")
            info = merge_and_write(filename, text)
            body = json.dumps(info, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            print(
                f"[xcf-save] wrote {filename} keys={info.get('keys')} -> {info['path']}"
            )
        except Exception as e:
            err = json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode(
                "utf-8"
            )
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.end_headers()
            self.wfile.write(err)
            print(f"[xcf-save] error: {e}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=18765)
    args = ap.parse_args()
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[xcf-save] listening http://{args.host}:{args.port}")
    print(f"[xcf-save] result dir: {RESULT_DIR}")
    print(f"[xcf-save] archive dir: {ARCHIVE_DIR}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
