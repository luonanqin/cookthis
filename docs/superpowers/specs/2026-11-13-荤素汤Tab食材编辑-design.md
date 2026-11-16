# 荤素汤 Tab 食材增删改

## 目标

在 alias-editor「荤素汤」tab 上，对单道菜的主料与调味做增删改；点菜名开弹层，弹层内保存即写盘。新食材名写入别名编辑稿「未分类」未分组。

## 非目标

- 不在此弹层改菜名、难度、菜系、城市、`meatVeg`
- 不自动根据食材推断/改写 `meatVeg`（卡片上荤/素/汤按钮与草稿流程不变）
- 不自动同步 `recipes-for-import.json` / `dish-ingredients.txt`（继续用现有「导出 for-import」）
- 不强制主料与调味互斥
- 不要求新名字先出现在 `ingredients-all.json`

## 交互

1. 卡片上菜名可点；荤/素/汤按钮行为不变（进 `mvDraft`，顶栏「确认修改」批量写 `meatVeg`）。
2. 弹层标题为菜名；两栏：**主料**、**调味**。
3. 每项：可编辑文本、可删除；栏末「+」追加空行或新 chip。
4. 输入时对 `ingredients-all`（及别名编辑稿已有名，若易取得）做前缀/包含联想；允许提交新名字。
5. 「保存」调用 API 立刻写盘并关闭；「取消」关闭且不请求。
6. 保存成功后刷新该菜在当前 grid 上的主料/调味展示；若弹层打开期间另有荤素汤草稿，互不影响。

## 数据与 API

### 写盘目标

- `data/catalog/recipes-builtin.json`：该 `id` 的 `mainIngredients`、`seasonings`
- 别名编辑稿（现有 editor 工作稿，与 `/api/data` 同源）：若出现**编辑稿中尚不存在**的名字，追加到 `categories["未分类"].ungrouped`（去重、排序）；不改已有别名组、不猜测其它品类

### 规范化（服务端为准）

- trim；丢弃空串
- 各列表内去重并保持相对顺序（先出现者保留）
- 允许 `mainIngredients` / `seasonings` 为空数组
- 同一名字可同时出现在主料与调味

### 建议端点

`PUT /api/recipe-meat-veg/ingredients`

请求：

```json
{
  "id": "rcp_…",
  "mainIngredients": ["…"],
  "seasonings": ["…"]
}
```

响应（200）：

```json
{
  "ok": true,
  "recipe": {
    "id": "…",
    "name": "…",
    "mainIngredients": [],
    "seasonings": [],
    "meatVeg": "meat|veg|soup"
  },
  "aliasAdded": ["新名字…"],
  "byMeatVeg": { "meat": [], "veg": [], "soup": [] },
  "counts": { "meat": 0, "veg": 0, "soup": 0 }
}
```

错误：缺 `id` → 400；菜谱不存在 → 404；JSON 非法 → 400。`meatVeg` 不在本请求中修改；响应里带回当前值便于 UI 刷新。

纯逻辑放在 `recipe_meat_veg.py`（或紧邻小模块）：应用食材更新、收集需进未分类的新名；server 负责读写 recipes + aliases 编辑稿。

## 前端要点

- 联想数据：弹层打开时若尚无缓存，拉取已有全量名列表（可复用 `/api/data` 里 ingredients / ungrouped / groups 已出现的名字并集，或单独轻量列表）；本地 filter，不必每键击打服务端。
- 保存中禁用按钮，失败用现有 `setStatus(..., 'err')`，弹层保持打开。
- 样式沿用现有 dialog / chip / diff-card 变量，主料与调味视觉区分与卡片上 `diff-mains` / `diff-seas` 一致。

## 测试

- 单元：规范化（空串、去重保序）；主料/调味可并存同名；更新命中/缺失 id；新名写入未分类 ungrouped 且不重复、不碰已有 group。
- 手工：开荤素汤 tab → 点菜名 → 改主料/调味（含联想与新名）→ 保存 → 卡片文案更新；别名 tab「未分类」未分组出现新名；顶栏荤素汤草稿仍可独立确认。

## 删除菜谱（同 Tab）

- 卡片上「删除」按钮；二次确认后立刻从 `recipes-builtin.json` 按 id 硬删并刷新列表。
- 若该 id 在荤素汤分类草稿中，一并清除。
- **不**自动改 for-import / dish-ingredients（顶栏「导出 for-import」）。
- API：`DELETE /api/recipe-meat-veg?id=…` → `{ ok, removed, byMeatVeg, counts }`。

## 实现边界

仅改 `tools/alias-editor/`（`index.html`、`server.py`、`recipe_meat_veg.py`、对应 tests）。不改小程序运行时推荐逻辑。
