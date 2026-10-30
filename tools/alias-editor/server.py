#!/usr/bin/env python3
"""
别名分组本地编辑器。

  python3 tools/alias-editor/server.py

本机：http://127.0.0.1:8765/
局域网：http://<本机IP>:8765/（启动时会打印）
数据文件：data/catalog/aliases-editor.json（拖完即写入）
"""

from __future__ import annotations

import json
import socket
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "catalog"
DATA_PATH = CATALOG / "aliases-editor.json"
ALIASES_PATH = CATALOG / "aliases.json"
BY_CAT_PATH = CATALOG / "ingredients-all-by-category.json"
MAJOR_MINOR_PATH = CATALOG / "ingredients-major-minor.json"
BUILTIN_PATH = CATALOG / "ingredients-builtin.json"
STATIC_DIR = Path(__file__).resolve().parent
# 0.0.0.0：本机 + 局域网可访问
HOST, PORT = "0.0.0.0", 8765

from avoid_tags import (  # noqa: E402
    AVOID_VOCAB,
    add_avoid_group,
    bootstrap_from_builtin,
    canons_for_category,
    ensure_avoid_fields,
    export_avoid_tags,
    remove_avoid_group,
    vocab_ids,
)


def _lan_ips() -> list[str]:
    """尽量列出本机局域网 IPv4，供打印访问地址。"""
    found: list[str] = []
    try:
        # UDP connect 不真正发包，用来取默认路由网卡 IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            found.append(ip)
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in found:
                found.append(ip)
    except OSError:
        pass
    return found


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _name_to_category(by_cat: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for cat, names in (by_cat.get("categories") or {}).items():
        for n in names:
            if n and n not in out:
                out[str(n)] = str(cat)
    return out


def build_initial_doc() -> dict:
    aliases = _load_json(ALIASES_PATH)
    by_cat = _load_json(BY_CAT_PATH)
    name_cat = _name_to_category(by_cat)
    cat_order = list((by_cat.get("categories") or {}).keys()) + ["未分类"]

    # category -> {groups: [], ungrouped: set}
    buckets: dict[str, dict] = {
        c: {"groups": [], "ungrouped": set()} for c in cat_order
    }

    assigned: set[str] = set()

    for key, vals in aliases.items():
        if key == "_meta" or not isinstance(vals, list):
            continue
        members = [key] + [str(v) for v in vals if v and str(v) != key]
        # dedupe keep order
        seen: list[str] = []
        for m in members:
            if m not in seen:
                seen.append(m)
        if len(seen) < 2:
            # 单元素不当成组，留给 ungrouped
            continue
        cat = name_cat.get(seen[0]) or next(
            (name_cat[m] for m in seen if m in name_cat), "未分类"
        )
        if cat not in buckets:
            buckets[cat] = {"groups": [], "ungrouped": set()}
        buckets[cat]["groups"].append(
            {
                "id": uuid.uuid4().hex[:10],
                "canon": seen[0],
                "aliases": seen[1:],
            }
        )
        assigned.update(seen)

    # 无别名的：按分类进 ungrouped
    for name, cat in name_cat.items():
        if name in assigned:
            continue
        if cat not in buckets:
            buckets[cat] = {"groups": [], "ungrouped": set()}
        buckets[cat]["ungrouped"].add(name)

    # aliases 里出现但不在 by-category、也未进组的（理论上不应多）
    for key, vals in aliases.items():
        if key == "_meta" or not isinstance(vals, list):
            continue
        for n in [key, *vals]:
            n = str(n)
            if n and n not in assigned and n not in name_cat:
                buckets.setdefault("未分类", {"groups": [], "ungrouped": set()})
                buckets["未分类"]["ungrouped"].add(n)

    categories = {}
    for cat in cat_order:
        if cat not in buckets:
            continue
        b = buckets[cat]
        categories[cat] = {
            "groups": b["groups"],
            "ungrouped": sorted(b["ungrouped"]),
        }
    # 若还有额外 cat
    for cat, b in buckets.items():
        if cat in categories:
            continue
        categories[cat] = {
            "groups": b["groups"],
            "ungrouped": sorted(b["ungrouped"]),
        }

    return {
        "_meta": {
            "note": "别名编辑器工作稿；确认后可再导入 aliases.json",
            "sources": ["aliases.json", "ingredients-all-by-category.json"],
        },
        "categories": categories,
    }


def ensure_data() -> dict:
    if DATA_PATH.is_file():
        return _load_json(DATA_PATH)
    doc = build_initial_doc()
    write_data(doc)
    print(f"initialized {DATA_PATH}")
    return doc


def write_data(doc: dict) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _load_list_json(path: Path) -> list:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict) and isinstance(raw.get("items"), list):
        return raw["items"]
    raise ValueError(f"expect list JSON at {path}")


def load_major_minor() -> dict:
    if not MAJOR_MINOR_PATH.is_file():
        doc: dict = {"categories": {}, "aliasMap": {}}
    else:
        doc = _load_json(MAJOR_MINOR_PATH)
        if not isinstance(doc, dict):
            raise ValueError("major-minor must be object")
    return ensure_avoid_fields(doc)


def write_major_minor(doc: dict) -> None:
    """写回 major-minor；调用方须保留原 categories/aliasMap/version。"""
    MAJOR_MINOR_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAJOR_MINOR_PATH.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _validate_avoid_members(avoid_members: object, allowed: set[str]) -> str | None:
    if not isinstance(avoid_members, dict):
        return "avoidMembers must be object"
    for code, names in avoid_members.items():
        if code not in allowed:
            return f"unknown avoid code: {code}"
        if not isinstance(names, list):
            return f"avoidMembers[{code}] must be list"
    return None


def _members_all_empty(avoid_members: dict, allowed: set[str]) -> bool:
    for i in allowed:
        names = avoid_members.get(i) or []
        if names:
            return False
    return True


def _automator_path() -> Path:
    return ROOT / "tools" / "meituan-automator"


def editor_name_to_category(doc: dict) -> dict[str, str]:
    """编辑器里每个名字当前所在品类（分组优先于未分组；跳过「未分类」）。"""
    out: dict[str, str] = {}
    for cat, bucket in (doc.get("categories") or {}).items():
        if not cat or cat == "未分类":
            continue
        for g in bucket.get("groups") or []:
            for n in [g.get("canon"), *(g.get("aliases") or [])]:
                if n and str(n) not in out:
                    out[str(n)] = str(cat)
        for n in bucket.get("ungrouped") or []:
            if n and str(n) not in out:
                out[str(n)] = str(cat)
    return out


def apply_editor_categories_to_by_cat(doc: dict) -> dict | None:
    """把编辑器里的品类挪动写回 ingredients-all-by-category.json。

    只改 all 里有的名字；别名异名（不在 all）忽略。
    这样 finish_review / 同步全量 会按 prefer 保留人工归属。
    """
    import sys

    automator = _automator_path()
    if str(automator) not in sys.path:
        sys.path.insert(0, str(automator))
    from ingredients_by_category import (
        ALL_NAME,
        CATEGORY_ORDER,
        classify_ingredient,
        format_by_category_json,
        unique_names_from_all,
    )

    all_path = CATALOG / ALL_NAME
    if not all_path.is_file():
        return None
    all_doc = _load_json(all_path)
    names = unique_names_from_all(all_doc)
    name_set = set(names)

    prefer: dict[str, str] = {}
    if BY_CAT_PATH.is_file():
        prefer = _name_to_category(_load_json(BY_CAT_PATH))
    for n, cat in editor_name_to_category(doc).items():
        if n in name_set and cat in CATEGORY_ORDER:
            prefer[n] = cat

    categories: dict[str, list[str]] = {c: [] for c in CATEGORY_ORDER}
    for n in names:
        cat = prefer.get(n) if prefer.get(n) in CATEGORY_ORDER else None
        if not cat:
            cat = classify_ingredient(n)
        if not cat:
            cat = "调味"
        categories[cat].append(n)
    for cat in CATEGORY_ORDER:
        categories[cat] = sorted(set(categories[cat]), key=lambda s: s)

    total = sum(len(v) for v in categories.values())
    text = format_by_category_json(categories, total=total, source=ALL_NAME)
    BY_CAT_PATH.write_text(text, encoding="utf-8")
    return {"total": total, "categories": categories}


def refresh_by_category() -> dict:
    """用最新 ingredients-all.json 重写品类表，返回 by-category 文档。"""
    import sys

    automator = _automator_path()
    if str(automator) not in sys.path:
        sys.path.insert(0, str(automator))
    from ingredients_by_category import write_ingredients_by_category

    return write_ingredients_by_category(CATALOG)


def sync_editor_with_catalog(doc: dict | None = None) -> tuple[dict, dict]:
    """把全量/品类里的新名字补进各分类「未分组」；不动已有别名组。

    - 先把编辑器里的品类挪动写回 by-category（保留人工调整）
    - 再按 ingredients-all 刷新品类表（已有归属 prefer 保留）
    - 已在某组（canon/aliases）里的名字不重复加入
    - 已从全量删除、且仅在 ungrouped 的名字会从未分组拿掉（组内保留，避免误删你的编辑）
    """
    doc = doc if doc is not None else ensure_data()
    apply_editor_categories_to_by_cat(doc)
    by_cat = refresh_by_category()
    name_cat = _name_to_category(by_cat)
    catalog_names = set(name_cat.keys())

    categories = doc.setdefault("categories", {})

    # 现有组内所有名字
    in_groups: set[str] = set()
    for bucket in categories.values():
        for g in bucket.get("groups") or []:
            if g.get("canon"):
                in_groups.add(g["canon"])
            in_groups.update(g.get("aliases") or [])

    # 确保品类键存在（含未分类）
    for cat in list((by_cat.get("categories") or {}).keys()) + ["未分类"]:
        categories.setdefault(cat, {"groups": [], "ungrouped": []})

    added = 0
    removed_ungrouped = 0
    moved = 0

    # 清理 / 归位 ungrouped
    for cat, bucket in list(categories.items()):
        kept: list[str] = []
        for n in bucket.get("ungrouped") or []:
            if n in in_groups:
                continue
            if n not in catalog_names:
                removed_ungrouped += 1
                continue
            want = name_cat.get(n, "未分类")
            if want != cat:
                categories.setdefault(want, {"groups": [], "ungrouped": []})
                ug = categories[want].setdefault("ungrouped", [])
                if n not in ug and n not in in_groups:
                    ug.append(n)
                    moved += 1
                continue
            kept.append(n)
        bucket["ungrouped"] = sorted(set(kept))

    # 补全新名字
    present_ungrouped: set[str] = set()
    for bucket in categories.values():
        present_ungrouped.update(bucket.get("ungrouped") or [])

    for name, cat in name_cat.items():
        if name in in_groups or name in present_ungrouped:
            continue
        categories.setdefault(cat, {"groups": [], "ungrouped": []})
        ug = categories[cat].setdefault("ungrouped", [])
        ug.append(name)
        present_ungrouped.add(name)
        added += 1

    for bucket in categories.values():
        bucket["ungrouped"] = sorted(set(bucket.get("ungrouped") or []))

    write_data(doc)
    stats = {
        "added_ungrouped": added,
        "removed_ungrouped": removed_ungrouped,
        "moved_ungrouped": moved,
        "catalog_total": len(catalog_names),
        "groups_untouched": True,
    }
    return doc, stats


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print("%s - %s" % (self.address_string(), fmt % args))

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: object) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send(code, raw, "application/json; charset=utf-8")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            html = (STATIC_DIR / "index.html").read_bytes()
            self._send(200, html, "text/html; charset=utf-8")
            return
        if path == "/api/data":
            self._json(200, ensure_data())
            return
        if path == "/api/reset":
            # 危险：用 aliases.json 整表覆盖编辑稿
            doc = build_initial_doc()
            write_data(doc)
            self._json(200, doc)
            return
        if path == "/api/sync-catalog":
            # 安全：刷新品类表，只把新食材补进未分组；保留所有别名组
            try:
                doc, stats = sync_editor_with_catalog()
            except Exception as e:
                self._json(500, {"error": str(e)})
                return
            self._json(200, {"data": doc, "stats": stats})
            return
        if path == "/api/avoid":
            try:
                mm = load_major_minor()
                editor = ensure_data()
                canons_by = {
                    cat: canons_for_category(editor, cat)
                    for cat in (editor.get("categories") or {}).keys()
                }
            except Exception as e:
                self._json(500, {"error": str(e)})
                return
            self._json(
                200,
                {
                    "avoidVocab": mm.get("avoidVocab") or list(AVOID_VOCAB),
                    "avoidMembers": mm.get("avoidMembers") or {},
                    "canonsByCategory": canons_by,
                    "path": str(MAJOR_MINOR_PATH),
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/avoid":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as e:
            self._json(400, {"error": str(e)})
            return
        if not isinstance(body, dict):
            self._json(400, {"error": "need JSON object"})
            return
        avoid_members = body.get("avoidMembers")
        try:
            mm = load_major_minor()
            ensure_avoid_fields(mm)
            allowed = vocab_ids(mm.get("avoidVocab") or [])
            err = _validate_avoid_members(avoid_members, allowed)
            if err:
                self._json(400, {"error": err})
                return
            # 只更新 members，不改 avoidVocab
            mm["avoidMembers"] = {
                i: list((avoid_members or {}).get(i) or []) for i in allowed
            }
            write_major_minor(mm)
        except Exception as e:
            self._json(500, {"error": str(e)})
            return
        self._json(
            200,
            {
                "ok": True,
                "avoidMembers": mm["avoidMembers"],
                "avoidVocab": mm.get("avoidVocab"),
                "path": str(MAJOR_MINOR_PATH),
            },
        )

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        parsed = urlparse(self.path)
        if path != "/api/avoid/vocab":
            self._json(404, {"error": "not found"})
            return
        qs = parse_qs(parsed.query or "")
        ids = qs.get("id") or []
        code = (ids[0] if ids else "").strip()
        if not code:
            self._json(400, {"error": "id required"})
            return
        try:
            mm = load_major_minor()
            ensure_avoid_fields(mm)
            vocab, members = remove_avoid_group(
                mm.get("avoidVocab") or [], mm.get("avoidMembers") or {}, code
            )
            mm["avoidVocab"] = vocab
            mm["avoidMembers"] = members
            write_major_minor(mm)
        except KeyError:
            self._json(404, {"error": f"unknown avoid code: {code}"})
            return
        except Exception as e:
            self._json(500, {"error": str(e)})
            return
        self._json(
            200,
            {
                "ok": True,
                "avoidVocab": vocab,
                "avoidMembers": members,
                "path": str(MAJOR_MINOR_PATH),
            },
        )

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        parsed = urlparse(self.path)
        if path == "/api/avoid/vocab":
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length)
            try:
                body = json.loads(raw.decode("utf-8")) if raw else {}
            except json.JSONDecodeError as e:
                self._json(400, {"error": str(e)})
                return
            if not isinstance(body, dict):
                self._json(400, {"error": "need JSON object"})
                return
            try:
                mm = load_major_minor()
                ensure_avoid_fields(mm)
                vocab, members, nid = add_avoid_group(
                    mm.get("avoidVocab") or [],
                    mm.get("avoidMembers") or {},
                    body.get("label") or "",
                )
                mm["avoidVocab"] = vocab
                mm["avoidMembers"] = members
                write_major_minor(mm)
            except ValueError as e:
                self._json(400, {"error": str(e)})
                return
            except Exception as e:
                self._json(500, {"error": str(e)})
                return
            self._json(
                200,
                {
                    "ok": True,
                    "id": nid,
                    "avoidVocab": vocab,
                    "avoidMembers": members,
                    "path": str(MAJOR_MINOR_PATH),
                },
            )
            return
        if path == "/api/avoid/bootstrap":
            force = "force=1" in (parsed.query or "") or "force=true" in (
                parsed.query or ""
            )
            try:
                mm = load_major_minor()
                ensure_avoid_fields(mm)
                members = mm.get("avoidMembers") or {}
                allowed = vocab_ids(mm.get("avoidVocab") or [])
                if not force and not _members_all_empty(members, allowed):
                    self._json(
                        409,
                        {
                            "error": "avoidMembers not empty; pass ?force=1 to overwrite",
                            "avoidMembers": members,
                        },
                    )
                    return
                aliases = _load_json(ALIASES_PATH)
                if isinstance(aliases.get("_meta"), dict):
                    aliases = {k: v for k, v in aliases.items() if k != "_meta"}
                builtin = _load_list_json(BUILTIN_PATH)
                vocab = mm.get("avoidVocab") or list(AVOID_VOCAB)
                filled = bootstrap_from_builtin(builtin, aliases, vocab=vocab)
                mm["avoidMembers"] = filled
                write_major_minor(mm)
            except Exception as e:
                self._json(500, {"error": str(e)})
                return
            self._json(200, {"ok": True, "avoidMembers": filled, "forced": force})
            return
        if path == "/api/avoid/export":
            try:
                mm = load_major_minor()
                ensure_avoid_fields(mm)
                aliases = _load_json(ALIASES_PATH)
                if isinstance(aliases.get("_meta"), dict):
                    aliases = {k: v for k, v in aliases.items() if k != "_meta"}
                builtin = _load_list_json(BUILTIN_PATH)
                new_list, report = export_avoid_tags(
                    builtin,
                    mm.get("avoidMembers") or {},
                    aliases,
                    vocab=mm.get("avoidVocab") or list(AVOID_VOCAB),
                )
                BUILTIN_PATH.write_text(
                    json.dumps(new_list, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
            except Exception as e:
                self._json(500, {"error": str(e)})
                return
            self._json(
                200,
                {"ok": True, "report": report, "path": str(BUILTIN_PATH)},
            )
            return
        if path != "/api/data":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            doc = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as e:
            self._json(400, {"error": str(e)})
            return
        if not isinstance(doc, dict) or "categories" not in doc:
            self._json(400, {"error": "need {categories:...}"})
            return
        write_data(doc)
        # 同步写回品类表，finish_review 会 prefer 保留
        try:
            apply_editor_categories_to_by_cat(doc)
        except Exception as e:
            self._json(500, {"error": f"saved editor but by-category failed: {e}"})
            return
        self._json(200, {"ok": True, "path": str(DATA_PATH)})


def main() -> None:
    ensure_data()
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    import sys

    print(f"alias editor 监听 {HOST}:{PORT}", flush=True)
    print(f"  本机 → http://127.0.0.1:{PORT}/", flush=True)
    for ip in _lan_ips():
        print(f"  局域网 → http://{ip}:{PORT}/", flush=True)
    print(f"data → {DATA_PATH}", flush=True)
    print("Ctrl+C 结束", flush=True)
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
