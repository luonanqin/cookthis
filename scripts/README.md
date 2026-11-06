# scripts 使用说明

仓库根目录执行（除非另行注明）。按用途分组，方便查找。

**catalog 文件字段说明**（食材/菜谱/别名/热度/分档等）：  
[`docs/superpowers/specs/2026-11-05-catalog数据字典.md`](../docs/superpowers/specs/2026-11-05-catalog数据字典.md)

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

## 忌口（词表 + 食材 avoidTags）

忌口**分组底稿**在 `tools/alias-editor` 忌口 Tab，落盘到 `ingredients-major-minor.json`；食材上的标签写在 `ingredients-builtin.json` 的 `avoidTags`；小程序勾选列表与云函数 sanitize 白名单由脚本从底稿同步。

| 脚本 / 工具 | 作用 |
|-------------|------|
| `tools/alias-editor`（忌口 Tab） | 增删忌口组、点选通用名进组；即时写 `avoidVocab` / `avoidMembers` |
| 编辑器「导出到 builtin」 | 按底稿全量重算 `ingredients-builtin.json` 的 `avoidTags`（别名表面名一并打标） |
| `sync-avoid-options.js` | 从 `avoidVocab` 写 `miniprogram/utils/avoidOptions.js`，并改 `cloudfunctions/profile` 的 `AVOID_CODES` |
| `import-ingredients.js` | 校验 builtin → 写出云库导入 JSONL（含 `avoidTags`） |

**改词表或组成员后上线：**

```bash
# 1) 网页忌口 Tab 改完 → 点「导出到 builtin」（勿只改 major-minor 忘导出）
# 2) 同步偏好词表（UI + profile 白名单）
node scripts/sync-avoid-options.js
# 3) 生成云库导入文件
node scripts/import-ingredients.js
```

然后：

1. 云开发 → 数据库 → 集合 `ingredients` → 导入 `data/catalog/ingredients-for-import.json`（冲突选覆盖或先清空；**不要**选 `ingredients-builtin.json`）
2. **重新上传部署**云函数 `profile`（否则新 code 保存会被滤掉）
3. 重新编译预览小程序（「我的」/ 引导 / 确认页 / 轻量层读 `avoidOptions.js`）

| 文件 | 角色 |
|------|------|
| `data/catalog/ingredients-major-minor.json` | 忌口真源：`avoidVocab` + `avoidMembers` |
| `data/catalog/ingredients-builtin.json` | 食材主数据；`avoidTags` 由编辑器导出写入 |
| `miniprogram/utils/avoidOptions.js` | 小程序忌口勾选项（sync 生成） |
| `cloudfunctions/profile/index.js` → `AVOID_CODES` | 保存 `familyAvoids` / 成员 `avoids` 时白名单（sync 改写） |
| `data/catalog/ingredients-for-import.json` | 云库导入用 JSON Lines |

设计见 `docs/superpowers/specs/2026-10-31-忌口组增删-design.md`、`docs/superpowers/specs/2026-10-30-忌口avoidTags人工编辑-design.md`。

---

## 全量食材 → builtin（补缺失名）

`import-ingredients.js` **只读** `ingredients-builtin.json`。全量名若只写在 `ingredients-all*.json` / 别名编辑器里，不会出现在云库导入文件。用本脚本把缺失名追加进 builtin：

| 脚本 | 作用 |
|------|------|
| `sync-builtin-from-all-catalog.js` | 对照 all / by-category / aliases-editor，把 builtin 里没有的名称补进去 |

**对照规则：**

- 补行品类以 `ingredients-all-by-category.json` 为准；编辑器表面名（canon / ungrouped）若不在 by-category，仍按编辑器品类补入并告警
- `ingredients-all.json` 与 by-category 名称集合不一致时告警（不阻断）
- **不改**已有 builtin 行（含分城 `cities` 条目）；仅追加 `cities: []` 的新行
- `调味` → `kind: seasoning`；其余 → `kind: main` + `availability: year_round`

```bash
node scripts/sync-builtin-from-all-catalog.js --dry-run   # 只看将补多少
node scripts/sync-builtin-from-all-catalog.js             # 写回 ingredients-builtin.json
node scripts/import-ingredients.js                        # 再生成云库 JSONL
```

单测：`node --test scripts/tests/sync-builtin-from-all-catalog.test.js`

---

## 下厨房菜谱 → recipes-builtin

把清洗菜名 / 用料灌进下厨房 cleaned 结果，并合并进 `recipes-builtin.json`（策略 C：同名覆盖，旧菜保留；写入前按菜名去重，保留食材更多的一条）。

| 脚本 | 作用 |
|------|------|
| `merge-xiachufang-dishes-into-recipes.js` | 改写 `xiachufang-category-results.cleaned.json` + 合并 `recipes-builtin.json` |

**输入：** `review-titles-over-6.txt`、`dish-ingredients.txt`、现有 `recipes-builtin.json` / `ingredients-builtin.json` / `aliases.json` / `ingredients-all-by-category.json`

```bash
node scripts/merge-xiachufang-dishes-into-recipes.js
node scripts/import-recipes.js
# → 云库集合 recipes 导入 recipes-for-import.json
```

单测：`node --test scripts/tests/merge-xiachufang-dishes.test.js`  
设计见 `docs/superpowers/specs/2026-11-04-下厨房菜谱灌入builtin-design.md`。

---

## 菜谱 difficulty 回填

| 脚本 | 作用 |
|------|------|
| `backfill-recipe-difficulty.js` | 给 `recipes-builtin.json` 补 `difficulty`（默认 dry-run） |

```bash
node scripts/backfill-recipe-difficulty.js                                    # 只看报告
node scripts/backfill-recipe-difficulty.js --apply-probe-names --apply-inferred # 空白写入（不覆盖已有）
node scripts/import-recipes.js                                                # 再生成 for-import
```

`--apply-probe-names`：探针菜名精确匹配优先；`--apply-inferred`：其余空白用与运行时相同的 `inferDifficulty`。人工改过的档不会被再次覆盖。

导入云库后，若 beginner 推荐拉池报缺索引：集合 `recipes` 建**普通**复合索引 `cities` ASC + `difficulty` ASC（勿勾唯一）。详见设计 §4.1 / 根目录 `README.md`「Slice 15 准备」。

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

食材导入会带上当前 builtin 里的 `avoidTags`；**只改忌口**时仍须先走上一节「导出到 builtin + sync-avoid-options」，再跑本脚本导入。

若新增的是全量/编辑器里的新名、尚未进 builtin：先跑上一节 `sync-builtin-from-all-catalog.js`，再 `import-ingredients.js`。

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

## 固定维护数据：何时跑哪条线

| 你改了什么 | 跑什么 | 再部署 / 导入 |
|------------|--------|----------------|
| 别名分组（alias-editor「别名」Tab） | `export-aliases-from-editor.py` → `sync-alias-runtime-data.js` | 部署 `recommend` |
| 忌口组或组成员（「忌口」Tab） | 编辑器「导出到 builtin」→ `sync-avoid-options.js` → `import-ingredients.js` | 导入 `ingredients`；部署 `profile`；编译小程序 |
| 城市货架 / 热度 → 菜场分档 | `build-ingredient-popularity.py` → `build-city-ingredients-by-scale.py` → `sync-city-scale-to-cloud.js` | 部署 `ingredients` |
| 仅菜谱 builtin | `import-recipes.js` | 导入 `recipes` |
| 下厨房清洗菜+用料灌入 builtin | `merge-xiachufang-dishes-into-recipes.js` → `import-recipes.js` | 导入 `recipes` |
| 仅食材非忌口字段（名/品类等）已写进 builtin | `import-ingredients.js` | 导入 `ingredients`（若词表也变了，仍要 `sync-avoid-options`） |
| 全量/编辑器有新名，builtin 还缺 | `sync-builtin-from-all-catalog.js` → `import-ingredients.js` | 导入 `ingredients` |

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

# 忌口词表 + 食材标签上线（导出 builtin 在网页完成后再跑）
node scripts/sync-avoid-options.js && node scripts/import-ingredients.js
# → 导入 ingredients；部署 profile；编译小程序

# 全量名补进 builtin 后再生成云库导入文件
node scripts/sync-builtin-from-all-catalog.js
node scripts/import-ingredients.js
node scripts/import-recipes.js
```
