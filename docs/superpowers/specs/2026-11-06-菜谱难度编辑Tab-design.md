# 菜谱难度编辑 Tab（扩 alias-editor）

| 项 | 内容 |
|----|------|
| 日期 | 2026-11-06 |
| 状态 | 待实现 |
| 相关 | [`2026-11-05-做饭能力与菜品难度-design.md`](./2026-11-05-做饭能力与菜品难度-design.md)；城菜 Tab；catalog 字典 §3.1 `difficulty` |
| 位置 | `tools/alias-editor` 第四 Tab「难度」 |

## 目标

在本地别名编辑器中人工调整 `recipes-builtin.json` 的 `difficulty`（`easy` \| `home` \| `advanced`），交互接近忌口/城菜：左栏分档浏览，右侧改档，**确认后写盘**；导入云库仍走「导出 for-import」。

## 决策摘要

| 项 | 决定 |
|----|------|
| 形态 | `alias-editor` 第四 Tab「难度」（方案 A） |
| 左栏 | 三档固定：轻松上手 / 家常水平 / 进阶一点（`easy` / `home` / `advanced`），按**已落盘** difficulty 分桶 + 计数 |
| 右侧 | 当前档菜品；**三列网格**；每格：菜名、主料、三档可点按钮 |
| 高亮 | 草稿档（若有）否则落盘档 |
| 写盘时机 | 点选三档**只进草稿**；顶栏「确认修改」一次性写入 builtin |
| 脏切换 | 有草稿时切左栏或切到其他 Tab → 弹窗：保存并切换 / 放弃并切换 / 取消 |
| 草稿存储 | 仅浏览器内存；刷新丢草稿 |
| for-import | 另按钮「导出 for-import」（复用城菜同款跑 `import-recipes.js`）；有草稿时先拦 |
| 缺 `difficulty` | 左栏按 `home` 展示；确认改档时写入显式字段 |

## 1. 交互

```
顶栏 Tab：别名 | 忌口 | 城菜 | 难度
顶栏按钮（难度态）：[确认修改]  [导出 for-import]

[轻松上手 N]     右侧三列网格：
[家常水平 N]       ┌ 菜名          ┐ ┌ … ┐ ┌ … ┐
[进阶一点 N]       │ 主料1、主料2   │ │    │ │    │
                   │ [轻松][家常][进阶] │ …    …
                   └────────────────┘
```

规则：

1. 左栏只按落盘 `difficulty` 分桶；确认成功后列表与计数一起刷新。  
2. 草稿中把某菜从 A 改到 B：在确认前，该菜仍出现在左栏 A 的列表里，但其三档按钮高亮 B（表示待改）。  
3. 「确认修改」无草稿时禁用或点了无操作。  
4. 窄屏网格可降为两列/一列；宽屏默认三列。

弹窗文案（可微调）：「有未保存的难度修改，是否保存？」— 保存并切换 / 放弃并切换 / 取消。

## 2. 数据与 API

真源：`data/catalog/recipes-builtin.json`。

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/recipe-difficulty` | GET | `{ byDifficulty: { easy, home, advanced }, counts }`；每项 `{ id, name, mainIngredients, difficulty }` |
| `/api/recipe-difficulty` | PUT | body `{ changes: { [id]: "easy"\|"home"\|"advanced" } }`；校验 id 存在与枚举；写回 builtin；返回与 GET 同形 |
| `/api/recipe-difficulty/export-import` | POST | 与城菜相同：调用 `scripts/import-recipes.js` 生成 `recipes-for-import.json` |

实现文件：

- `tools/alias-editor/recipe_difficulty.py` — 分组、校验、批量写盘  
- `tools/alias-editor/server.py` — 挂路由  
- `tools/alias-editor/index.html` — Tab + UI  
- `tools/alias-editor/tests/test_recipe_difficulty.py` — 分组与批量更新  
- `tools/alias-editor/README.md` — 难度 Tab 说明  

## 3. 与推荐/导入的关系

- 推荐读云库 `recipes.difficulty`；本 Tab 只改本地 builtin。  
- 人工确认后导出 for-import，再按现有流程导入云库（同城菜）。  
- `backfill-recipe-difficulty.js` **不**覆盖已有 `difficulty`；本 Tab 写入后不会被 backfill 冲掉。

## 4. 非目标

- 小程序 / 云函数在线改难度  
- 拖拽换档、搜索过滤（可后置）  
- 确认时自动导入云库  
- 草稿持久化到 localStorage  
- 改 `minutes` / `dishForms` 或重跑推断

## 5. 验收

1. 打开难度 Tab，三档计数与 builtin 一致。  
2. 点选多道改档 → 确认前刷新页面草稿丢失；确认后 builtin 已更新、左栏菜搬家。  
3. 有草稿切左栏 / 切 Tab → 弹窗三选生效。  
4. 导出 for-import 后 JSONL 中对应菜 `difficulty` 与 builtin 一致。  
5. 别名 / 忌口 / 城菜行为不被回归破坏。
