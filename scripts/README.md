# scripts 使用说明

仓库根目录执行（除非另行注明）。按用途分组，方便查找。

---

## 菜场规模（热度 + 分城分档名单）

| 脚本 | 作用 |
|------|------|
| `build-ingredient-popularity.py` | 从下厨房清洗结果等构建全国 `data/catalog/ingredient-popularity.json` |
| `build-city-ingredients-by-scale.py` | 按城货架 + 热度生成 `data/catalog/cities/{城}/ingredients-by-scale.json`（小/中/大 ⊆ 关系） |
| `sync-city-scale-to-cloud.js` | 把各城 `ingredients-by-scale.json` 拷入 `cloudfunctions/ingredients/data/cities/`，并 vendor `confirmListFromScale.js` |

**重建分档名单（改货架或热度后）：**

```bash
python3 scripts/build-ingredient-popularity.py
python3 scripts/build-city-ingredients-by-scale.py
node scripts/sync-city-scale-to-cloud.js
# → 微信开发者工具重新上传部署云函数 ingredients
```

单测：`python3 -m pytest scripts/tests/test_ingredient_popularity.py scripts/tests/test_city_ingredients_by_scale.py -v`

设计见 `docs/superpowers/specs/2026-10-14-菜场规模与食材列表档位-design.md`；实现计划见 `docs/superpowers/plans/2026-10-14-菜场规模与食材列表档位.md`。

---

## 别名（编辑器 → 云函数）

| 脚本 | 作用 |
|------|------|
| `export-aliases-from-editor.py` | 把 `data/catalog/aliases-editor.json` 压成 `data/catalog/aliases.json` |
| `sync-alias-runtime-data.js` | 把 `aliases.json` 同步到云函数 / 小程序，并生成各城货架名序 |

**日常更新别名（分组改完后）：**

```bash
python3 scripts/export-aliases-from-editor.py
node scripts/sync-alias-runtime-data.js
```

然后在微信开发者工具**重新上传部署**云函数 `recommend`。

| 文件 | 角色 |
|------|------|
| `data/catalog/aliases-editor.json` | 网页分组编辑稿（`tools/alias-editor`） |
| `data/catalog/aliases.json` | 规范表：通用名 → 别名[] |
| `cloudfunctions/recommend/data/aliases.json` | **实际上随 recommend 部署的文件**（sync 拷贝） |
| `cloudfunctions/_shared/data/aliases.json` | 共享副本 |
| `miniprogram/data/aliases.json` + `aliases.js` | 小程序运行时 |
| `miniprogram/data/city-shelves/*` + `city-shelves.js` | 各城货架名序（sync 从 `data/catalog/cities/*/ingredients.json` 生成） |

编辑器说明见 [`tools/alias-editor/README.md`](../tools/alias-editor/README.md)。

---

## 云库导入（食材 / 菜谱）

| 脚本 | 作用 |
|------|------|
| `import-ingredients.js` | 校验 `ingredients-builtin.json` → 写出 JSONL 导入文件 |
| `import-recipes.js` | 校验 `recipes-builtin.json` → 写出 JSONL 导入文件 |

```bash
node scripts/import-ingredients.js
# → data/catalog/ingredients-for-import.json（另写 .jsonl 副本）

node scripts/import-recipes.js
# → data/catalog/recipes-for-import.json
```

云开发控制台导入时选 **`*-for-import.json`（JSON Lines）**，不要选 `*-builtin.json`（数组会报错）。

---

## 运营反馈

| 脚本 | 作用 |
|------|------|
| `reply-feedback.js` | 打印云函数 `feedback.action=reply` 的测试 JSON（不直接调云） |

```bash
FEEDBACK_ADMIN_KEY=xxx node scripts/reply-feedback.js <feedbackId> <回复正文>
```

更常用：云开发控制台 → 云函数 `feedback` → 测试，粘贴脚本打印的 JSON。

---

## 速查命令

```bash
# 菜场规模数据进云函数
python3 scripts/build-ingredient-popularity.py && \
  python3 scripts/build-city-ingredients-by-scale.py && \
  node scripts/sync-city-scale-to-cloud.js
# → 部署 ingredients

# 别名上线
python3 scripts/export-aliases-from-editor.py && node scripts/sync-alias-runtime-data.js
# → 部署 recommend

# 云库导入文件
node scripts/import-ingredients.js
node scripts/import-recipes.js
```
