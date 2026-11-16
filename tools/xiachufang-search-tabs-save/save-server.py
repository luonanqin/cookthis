#!/usr/bin/env python3
"""搜索页批量采集落盘：持续写入本扩展专用结果文件 + 已查关键字进度。

不碰 popularity-ext 的 xiachufang-*-results.json。

用法:
  python3 tools/xiachufang-search-tabs-ext/save-server.py

默认 http://127.0.0.1:18766
  GET  /health
  POST /save-batch  JSON body = 一整批搜索结果（按 keyword merge 进结果文件）
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]  # cookthis/
OUT_DIR = ROOT / "data" / "recipes" / "xiachufang" / "search-tabs"
RESULTS_FILE = "search-tab-results.json"
PROGRESS_FILE = "search-tab-progress.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _sorted_names(names) -> list[str]:
    try:
        return sorted(names, key=lambda a: str(a).encode("gb18030"))
    except Exception:
        return sorted(names)


def format_results(doc: dict) -> str:
    """紧凑可读：每个关键词一块，菜谱各占一行。"""
    items = doc.get("items") or {}
    updated_at = doc.get("updatedAt") or ""
    names = _sorted_names(items.keys())

    lines = [
        "{",
        f'  "updatedAt": {json.dumps(updated_at, ensure_ascii=False)},',
        '  "items": {',
    ]
    for i, name in enumerate(names):
        rec = items.get(name) or {}
        comma = "," if i < len(names) - 1 else ""
        url = json.dumps(rec.get("url") or "", ensure_ascii=False)
        scraped_at = json.dumps(rec.get("scrapedAt") or "", ensure_ascii=False)
        recipes = rec.get("recipes") or []
        lines.append(f"    {json.dumps(name, ensure_ascii=False)}: {{")
        lines.append(f'      "url": {url},')
        lines.append(f'      "scrapedAt": {scraped_at},')
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


def format_progress(doc: dict) -> str:
    searched = _sorted_names(doc.get("searched") or [])
    return (
        json.dumps(
            {
                "updatedAt": doc.get("updatedAt") or "",
                "searched": searched,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )


def _load_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def dedupe_recipes_by_title(recipes: list) -> list:
    """同名菜去重：保留做过人数更高的；人数相同则后写可刷新食材。"""
    by_title: dict[str, dict] = {}
    order: list[str] = []
    for r in recipes or []:
        if not isinstance(r, dict):
            continue
        title = str(r.get("title") or "").strip()
        if not title:
            continue
        count = int(r.get("count") or 0)
        ings = r.get("ingredients") if isinstance(r.get("ingredients"), list) else []
        if title not in by_title:
            by_title[title] = {
                "title": title,
                "count": count,
                "ingredients": list(ings),
            }
            order.append(title)
            continue
        prev = by_title[title]
        prev_count = int(prev.get("count") or 0)
        if count > prev_count:
            by_title[title] = {
                "title": title,
                "count": count,
                "ingredients": list(ings),
            }
        elif count == prev_count and ings:
            prev["ingredients"] = list(ings)
    return [by_title[t] for t in order]


def merge_keyword_rec(old: dict | None, new: dict | None) -> dict:
    """同关键字：合并菜谱并按菜名去重。"""
    old = old if isinstance(old, dict) else {}
    new = new if isinstance(new, dict) else {}
    recipes = dedupe_recipes_by_title(
        list(old.get("recipes") or []) + list(new.get("recipes") or [])
    )
    return {
        "url": new.get("url") or old.get("url") or "",
        "scrapedAt": new.get("scrapedAt") or old.get("scrapedAt") or "",
        "recipes": recipes,
    }


def merge_and_write(payload: dict) -> dict:
    """本次 items 按 keyword 合并进 search-tab-results（同关键字菜名去重）；关键字并入 progress。"""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results_path = OUT_DIR / RESULTS_FILE
    progress_path = OUT_DIR / PROGRESS_FILE

    incoming_items = payload.get("items") or {}
    if not isinstance(incoming_items, dict):
        raise ValueError("items must be object")

    existing = _load_json(results_path)
    merged_items = {}
    if isinstance(existing.get("items"), dict):
        merged_items.update(existing["items"])
    for k, v in incoming_items.items():
        if not k:
            continue
        key = str(k)
        merged_items[key] = merge_keyword_rec(merged_items.get(key), v)

    updated_at = payload.get("updatedAt") or _now_iso()
    results_doc = {"updatedAt": updated_at, "items": merged_items}
    results_path.write_text(format_results(results_doc), encoding="utf-8")

    prog = _load_json(progress_path)
    old_searched = {
        str(x) for x in (prog.get("searched") or []) if isinstance(x, str) and x
    }
    new_keys = {str(k) for k in incoming_items.keys() if k}
    searched = sorted(old_searched | new_keys)
    # 保持中文排序
    searched = _sorted_names(searched)
    progress_doc = {"updatedAt": updated_at, "searched": searched}
    progress_path.write_text(format_progress(progress_doc), encoding="utf-8")

    return {
        "ok": True,
        "resultsPath": str(results_path),
        "progressPath": str(progress_path),
        "resultsFile": RESULTS_FILE,
        "progressFile": PROGRESS_FILE,
        "batchKeys": len(new_keys),
        "totalKeys": len(merged_items),
        "searchedCount": len(searched),
        "newKeywords": sorted(new_keys - old_searched),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[xcf-tabs-save] {args[0] if args else fmt}")

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
            prog = _load_json(OUT_DIR / PROGRESS_FILE)
            results = _load_json(OUT_DIR / RESULTS_FILE)
            searched = prog.get("searched") or []
            items = results.get("items") or {}
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "ok": True,
                        "outDir": str(OUT_DIR),
                        "resultsFile": RESULTS_FILE,
                        "progressFile": PROGRESS_FILE,
                        "searchedCount": len(searched)
                        if isinstance(searched, list)
                        else 0,
                        "resultsCount": len(items) if isinstance(items, dict) else 0,
                    },
                    ensure_ascii=False,
                ).encode("utf-8")
            )
            return
        self.send_response(404)
        self._cors()
        self.end_headers()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/save-batch":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("body must be object")
            if "items" not in payload or not isinstance(payload.get("items"), dict):
                raise ValueError("items must be object")
            info = merge_and_write(payload)
            body = json.dumps(info, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            print(
                f"[xcf-tabs-save] merge +{info.get('batchKeys')} "
                f"total={info.get('totalKeys')} searched={info.get('searchedCount')} "
                f"-> {info['resultsFile']} / {info['progressFile']}"
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
            print(f"[xcf-tabs-save] error: {e}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=18766)
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[xcf-tabs-save] listening http://{args.host}:{args.port}")
    print(f"[xcf-tabs-save] results: {OUT_DIR / RESULTS_FILE}")
    print(f"[xcf-tabs-save] progress: {OUT_DIR / PROGRESS_FILE}")
    print("[xcf-tabs-save] each POST merges into these two files (not popularity-ext)")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
