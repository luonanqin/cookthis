# 忌口 avoidTags 人工编辑（扩 alias-editor）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `tools/alias-editor` 增加「忌口」Tab：按品类拖拽通用名进/出固定忌口组，即时写入 `ingredients-major-minor.json` 的 `avoidMembers`；一键导出重算 `ingredients-builtin.json` 的 `avoidTags`（别名组表面名一并打标）。

**Architecture:** 与别名编辑共用同一本地 HTTP 服务。忌口真源 = major-minor 顶层 `avoidVocab` + `avoidMembers`；**不**投影进现有 `categories[].groups[].children`（留给 implies 后置，避免与「猪肉」大类 children 互相覆盖）。通用名池来自当前品类下 `aliases-editor.json` 各组 `canon` + 未分组名（自身当 canon）。导出：对 builtin **全量重算** avoidTags。

**Tech Stack:** Python 3（`server.py` + 可测纯函数）；静态 `index.html`；pytest。

**Spec:** `docs/superpowers/specs/2026-10-30-忌口avoidTags人工编辑-design.md`

## 实现拍板（设计可微调处）

| 项 | 本计划选定 |
|----|------------|
| 投影到 `groups[].children` | **不做**；`avoidMembers` 为忌口唯一真源 |
| 忌口词表 | 与「我的」一致 6 码：`pork` / `seafood` / `offal` / `coriander` / `peanut` / `dairy`（**不含** `lamb`/`other`） |
| 首次底稿 | 若无 `avoidMembers`：用 builtin 现有 tag **反向灌入** 6 码（忽略 `lamb` 等词外表）；再人工改 |
| 「从 all 同步」 | 忌口 Tab 复用别名侧已有「同步全量」`/api/sync-catalog`（补池内新名，不自动进组） |

## Global Constraints

- 展示名仍是小类（五花）；只改 `avoidTags`。  
- 一名可多 code。  
- 拖拽成功即写盘 major-minor。  
- 导出不写云库。  
- 不做 implies、不增删词表、不做 `other`。

## File Structure

```
tools/alias-editor/
  server.py                 # + major-minor / export / bootstrap APIs
  avoid_tags.py             # 新建：纯函数（池、成员、导出）
  index.html                # Tab + 忌口 UI
  README.md                 # 补忌口说明
  tests/
    test_avoid_tags.py
data/catalog/
  ingredients-major-minor.json   # + avoidVocab / avoidMembers
  ingredients-builtin.json       # 仅导出时改
```

---

### Task 1: `avoid_tags.py` 纯函数 + 单测

**Files:**
- Create: `tools/alias-editor/avoid_tags.py`
- Create: `tools/alias-editor/tests/test_avoid_tags.py`

**Interfaces:**
- `AVOID_VOCAB = [{"id":"pork","label":"猪肉类"}, …]`（6 项，label 与 mine.js 一致）
- `ensure_avoid_fields(major_minor: dict) -> dict`：若缺则写入空 `avoidVocab`/`avoidMembers`
- `canons_for_category(editor_doc, category: str) -> list[str]`：该品类 groups 的 canon + ungrouped（去重保序）
- `add_member(avoid_members, code, name) ->` 幂等 append
- `remove_member(avoid_members, code, name) ->`
- `bootstrap_from_builtin(builtin_list, aliases: dict) -> dict[str, list[str]]`：  
  对每个 builtin 条目的每个 tag∈六码，把 **canonical 名**（`aliases` 反查或自身）加入对应 list（去重）
- `export_avoid_tags(builtin_list, avoid_members, aliases) -> (new_list, report)`  
  报告：`{ updated, cleared, missingInBuiltin: string[] }`

导出算法（写死）：

```text
1. 建 surface→codes：对每个 code、每个 canon N：
     S = {N} ∪ set(aliases.get(N) or [])
     对 s in S: map[s].add(code)
2. 对 builtin 每条 name:
     codes = sorted(map.get(name) or [])
     若与原 avoidTags 不同 → updated++；若原有非空现为空 → cleared++
     写 avoidTags = codes
3. missingInBuiltin = avoidMembers 里所有 canon 在 builtin 任何 name/别名表面都未命中者
```

- [ ] **Step 1: 写失败单测**

```python
# tools/alias-editor/tests/test_avoid_tags.py
from avoid_tags import (
    canons_for_category,
    add_member,
    remove_member,
    export_avoid_tags,
    bootstrap_from_builtin,
    AVOID_VOCAB,
)

def test_vocab_six():
    assert [x["id"] for x in AVOID_VOCAB] == [
        "pork", "seafood", "offal", "coriander", "peanut", "dairy"
    ]

def test_canons_for_category():
    editor = {
        "categories": {
            "肉类": {
                "groups": [
                    {"id": "g1", "canon": "猪肉", "aliases": ["精肉"]},
                    {"id": "g2", "canon": "五花肉", "aliases": []},
                ],
                "ungrouped": ["里脊"],
            }
        }
    }
    assert canons_for_category(editor, "肉类") == ["猪肉", "五花肉", "里脊"]

def test_add_remove_member():
    m = {}
    add_member(m, "pork", "五花肉")
    add_member(m, "pork", "五花肉")
    assert m["pork"] == ["五花肉"]
    remove_member(m, "pork", "五花肉")
    assert m["pork"] == []

def test_export_tags_alias_surfaces_and_full_recompute():
    aliases = {"猪肉": ["精肉"]}
    avoid_members = {"pork": ["猪肉"], "seafood": []}
    builtin = [
        {"name": "猪肉", "avoidTags": ["lamb"]},
        {"name": "精肉", "avoidTags": []},
        {"name": "带鱼", "avoidTags": ["seafood"]},
    ]
    out, report = export_avoid_tags(builtin, avoid_members, aliases)
    by = {x["name"]: x["avoidTags"] for x in out}
    assert by["猪肉"] == ["pork"]
    assert by["精肉"] == ["pork"]
    assert by["带鱼"] == []  # 全量重算：底稿无 seafood 成员则清空
    assert "带鱼" not in (report.get("missingInBuiltin") or [])

def test_bootstrap_from_builtin():
    aliases = {"鸡爪": ["鸡脚"]}
    builtin = [
        {"name": "五花肉", "avoidTags": ["pork"]},
        {"name": "鸡脚", "avoidTags": ["pork"]},
        {"name": "带鱼", "avoidTags": ["seafood", "lamb"]},
    ]
    m = bootstrap_from_builtin(builtin, aliases)
    assert "五花肉" in m["pork"]
    assert "鸡爪" in m["pork"]  # 表面名归到 canon
    assert "带鱼" in m["seafood"]
    assert "lamb" not in m
```

- [ ] **Step 2: 跑测 FAIL**

```bash
cd tools/alias-editor && python3 -m pytest tests/test_avoid_tags.py -v
```

- [ ] **Step 3: 实现 `avoid_tags.py`**

`canonical_of(surface, aliases)`：若 surface 是某键或出现在某键的 list 中 → 返回该键，否则 surface。

`bootstrap`：对 builtin 每条，对 tag in avoidTags ∩ 六码，`add_member(..., canonical_of(name))`。

- [ ] **Step 4: PASS + Commit**

```bash
git add tools/alias-editor/avoid_tags.py tools/alias-editor/tests/test_avoid_tags.py
git commit -m "$(cat <<'EOF'
feat: add avoid_tags helpers for editor export and pool

EOF
)"
```

---

### Task 2: server API（major-minor / export / bootstrap）

**Files:**
- Modify: `tools/alias-editor/server.py`

**Paths:**

| Method | Path | 行为 |
|--------|------|------|
| GET | `/api/avoid` | 读 major-minor，`ensure_avoid_fields`；附带 `canonsByCategory` 可选或前端自算 |
| PUT | `/api/avoid` | body `{ avoidMembers }`（及可选整份）；校验 code∈六码；写回 major-minor 文件；保留原 `categories`/`aliasMap`/version |
| POST | `/api/avoid/bootstrap` | 若 `avoidMembers` 全空或 `?force=1`：用 builtin+aliases 灌入后保存；返回 members |
| POST | `/api/avoid/export` | 读 avoidMembers + aliases.json（或 editor 导出逻辑用 aliases.json）+ builtin；写 builtin；返回 report |

路径常量：

```python
MAJOR_MINOR_PATH = CATALOG / "ingredients-major-minor.json"
BUILTIN_PATH = CATALOG / "ingredients-builtin.json"
```

写 major-minor：`json.dumps(..., ensure_ascii=False, indent=2)`；**不得**丢掉现有 `categories`。

PUT 校验：

```python
allowed = {x["id"] for x in AVOID_VOCAB}
for code, names in avoid_members.items():
    if code not in allowed: return 400
    if not isinstance(names, list): return 400
```

- [ ] **Step 1: 实现 GET/PUT/bootstrap/export**
- [ ] **Step 2: 手动 curl 冒烟**

```bash
python3 tools/alias-editor/server.py
# 另一终端：
curl -s http://127.0.0.1:8765/api/avoid | head
curl -s -X POST http://127.0.0.1:8765/api/avoid/bootstrap
```

- [ ] **Step 3: Commit**

```bash
git add tools/alias-editor/server.py
git commit -m "$(cat <<'EOF'
feat: alias-editor APIs for avoidMembers and builtin export

EOF
)"
```

---

### Task 3: 前端忌口 Tab UI

**Files:**
- Modify: `tools/alias-editor/index.html`

**UI 结构：**

```
header: [别名|忌口] Tab；忌口态显示「从 builtin 灌入」「导出到 builtin」；共用「同步全量」
忌口布局：
  nav: 品类（同别名，读 aliases-editor categories 键）
  中栏: 忌口组 chip（六码 label）
  主区上: 通用名池（当前品类 canons，已在当前组的可弱化样式）
  主区下: 当前忌口组已选成员（可拖出）
```

**交互：**

1. `mode = 'alias' | 'avoid'`；默认 `alias`（现有 DOM/逻辑包在 alias 容器，避免互毁）。  
2. 切忌口：`GET /api/avoid` + 已有 `data`（aliases-editor）算池。  
3. 选 category → 渲染池。  
4. 选 avoid code → 渲染该组成员。  
5. 池 chip `dragstart` → 拖到组区 `drop` → `add_member` → 立即 `PUT /api/avoid`。  
6. 组内 chip 拖回池或点「×」→ `remove_member` → PUT。  
7. 多标签：同一名可在 pork 组内，再切 seafood 从池再拖入。  
8. 「从 builtin 灌入」→ `POST bootstrap`（若已有成员，confirm「将合并/覆盖？」——本计划：**有成员时 confirm，确认后 force 覆盖六码列表**）。  
9. 「导出到 builtin」→ `POST export` → alert report（updated / missing 列表前 20）。

样式：复用现有 chip/grab；组区用虚线 drop 高亮。

- [ ] **Step 1: Tab 切换不破坏别名保存**
- [ ] **Step 2: 拖拽加入/移除 + 即时 PUT**
- [ ] **Step 3: 手测**（肉类→猪肉类→拖五花→刷新仍在；再拖入内脏）
- [ ] **Step 4: Commit**

```bash
git add tools/alias-editor/index.html
git commit -m "$(cat <<'EOF'
feat: avoid-tags tab with drag assign in alias-editor

EOF
)"
```

---

### Task 4: 底稿落盘与导出验证

**Files:**
- Modify: `data/catalog/ingredients-major-minor.json`（经 bootstrap/编辑产生 `avoidVocab`/`avoidMembers`；可在 bootstrap 后 commit 一份初始底稿）
- Possibly: `data/catalog/ingredients-builtin.json`（仅在用户明确导出并审过 report 后提交）

- [ ] **Step 1: 跑 bootstrap，检查 pork 含五花/排骨等**
- [ ] **Step 2: 导出到临时副本 diff，确认 `lamb` 会被清空（预期）；缺 builtin 的名进 missing**
- [ ] **Step 3: 若团队同意，commit major-minor 底稿；builtin 导出可另 commit**

```bash
git add data/catalog/ingredients-major-minor.json
git commit -m "$(cat <<'EOF'
data: seed avoidVocab/avoidMembers on major-minor draft

EOF
)"
```

---

### Task 5: README + 设计状态

**Files:**
- Modify: `tools/alias-editor/README.md`
- Modify: `docs/superpowers/specs/2026-10-30-忌口avoidTags人工编辑-design.md`

README 增补：

```markdown
## 忌口 Tab

- 数据：`ingredients-major-minor.json` 的 `avoidVocab` / `avoidMembers`
- 「从 builtin 灌入」：按现有 avoidTags 反填（忽略词表外如 lamb）
- 「导出到 builtin」：按底稿全量重算 avoidTags（别名表面名一并打标）；不写云库
- 导入云库仍走现有 ingredients 导入脚本
```

设计状态 → `已实现（见 plans/2026-10-30-忌口avoidTags人工编辑.md）`。

- [ ] **Step 1–2: 文档 + Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: document avoid-tags tab and mark design implemented

EOF
)"
```

---

## Self-Review

| 设计条款 | Task |
|----------|------|
| 扩 alias-editor Tab | T3 |
| 底稿 major-minor avoidMembers | T1–T2 / T4 |
| 池 = 品类 canon（editor） | T1 `canons_for_category` + T3 |
| 六码词表 | T1 AVOID_VOCAB |
| 拖拽即时写盘 | T2 PUT + T3 |
| 一名多组 | T3 |
| 同步 all 补新名 | 复用 sync-catalog |
| 导出 builtin 全量重算 + 别名表面 | T1 export + T2 |
| 不投影 children | 拍板 |
| 非目标 implies/other | 全局 |

**注意：** 首次全量导出会清掉 builtin 里的 `lamb` 等非六码标签；若需保留 lamb，须另开需求扩词表（本期不做）。

---

## 给执行 agent

1. 先 T1 纯函数，再 API，再 UI。  
2. PUT 忌口时**禁止**重写整个 major-minor 时丢掉 `categories`。  
3. 别名 Tab 默认行为回归：拖别名、同步全量、自动保存仍可用。  
4. 导出前看 report 的 `missingInBuiltin`，缺的要先补 builtin 条目再导。  
5. 不要在本工具写云开发数据库。
