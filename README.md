# 做什么菜 (cookthis)

微信小程序 + 云开发。

## 上手

1. 用**微信开发者工具**打开本仓库**根目录**（含 `project.config.json` 的目录）。
2. 在开发者工具中**开通云开发**并创建环境；将环境 ID 填入 `miniprogram/app.js` 中 `wx.cloud.init` 的 `env` 字段（取消注释并替换 `your-env-id`）。云开发需使用真实小程序 AppID（在 `project.config.json` 中配置 `appid`）。
3. 在开发者工具中右键 **上传并部署** 云函数：`cloudfunctions/auth`、`cloudfunctions/ingredients`、`cloudfunctions/recommend`（云端安装依赖）。各函数均内置 `_shared` 副本（`auth/nickname.js`、`ingredients/confirmList.js`、`recommend/homePlans.js`），上传时只需打包各自函数目录，不必依赖云端解析 `../_shared`。改算法时请同步：`_shared/nickname.js` ↔ `auth/nickname.js`；`_shared/confirmList.js` ↔ `ingredients/confirmList.js`；`_shared/homePlans.js` ↔ `recommend/homePlans.js`。
4. 在云开发控制台创建数据库集合：`users`、`user_identities`、`ingredients`、`recipes`、`recommendations`；权限建议：**仅管理端可写**，业务读写由云函数完成。`user_identities` 建议建复合唯一索引：`provider` + `providerUserId`。
5. 食材导入：云库对 `ingredients` 导入 `data/ingredients-for-import.json`（扩展名是 `.json`，但内容是 **每行一条** 的 JSON Lines，带 `_id`）。不要导入 `ingredients-builtin.json`（数组格式会失败）。可用 `node scripts/import-ingredients.js` 重新生成导入文件。
6. 菜谱导入：云库对 `recipes` 导入 `data/recipes-for-import.json`（JSON Lines；字段含业务主键 `id`）。不要导入 `recipes-builtin.json`（数组格式会失败）。可用 `node scripts/import-recipes.js` 校验并重新生成导入文件；导入后如控制台要求文档 `_id`，可将其设为与 `id` 相同。
7. 纯函数单测：在仓库根目录执行 `npm test`（运行 `cloudfunctions/_shared/*.test.js`）。

## 本切片验收清单（Slice 1）

**状态：已验收 · 2026-10-07**（自动化 + 开发者工具人工点验通过）

**自动化（CI / 本地）：**

- [x] 仓库根目录 `npm test` 全部 PASS（昵称短码、`buildConfirmList` 分层逻辑）。

**需人工：微信开发者工具 + 已部署云函数（见上文「上手」1～4 步）**

1. [x] **编译启动** → 小程序自动调用登录，无阻塞性报错。
2. [x] **「我的」** → 展示默认昵称 **`大厨` + 4 位大写字母数字**（非微信资料拉取）。
3. [x] **首页「今天菜场有什么」** → 进入 **食材确认页**：时令项默认全选；四季常见计入汇总、主列表不铺开；无调味项、无拍照入口。
4. [x] **确认** → 本地 Storage 存在键 **`cookthis_last_selected`**，值为 `{ selected, methodsUsed }` 结构。

**本切片范围（已交付）：** 骨架、登录、静态食材确认。

## 本切片验收清单（Slice 2）

**状态：待验收**（清单留空供人工勾选）

**自动化（CI / 本地）：**

- [ ] 仓库根目录 `npm test` 全部 PASS（含 `suggestComboByPeople`、`buildHomePlans`、`filterHolidays` 及 Slice 1 用例）。

**需人工：微信开发者工具 + 已部署云函数与数据（见「上手」1～6 步，含 `recommend`、菜谱导入）**

1. [ ] **确认页场景区** → 可选 **日常 / 家庭聚会 / 朋友聚会 / 节日聚会**；日常人数与荤素汤搭配预填；非日常输入人数后自动填搭配，可选当次忌口（如 pork）；节日展示近 30 天节日并必选一项。
2. [ ] **日常几顿** → 可选午/晚等快捷；**非日常** 默认 1 顿、无午晚分顿选项。
3. [ ] **确认并推荐** → 调用 `recommend.create` 成功；Storage 键 **`cookthis_last_recommend`** 含 `requestId` 与 `plans`；云库 **`recommendations`** 有对应文档（含 `scene`、`selectedIngredients`、`plans`）。
4. [ ] **推荐页** → 展示 1～3 套家常方案，每套各顿 label + 菜名；无换一批/可以/清单入口；空方案有提示并可返回改场景。
5. [ ] **忌口** → 日常用画像 `familyAvoids`、聚会用当次 `partyAvoids`（不写回画像）；含忌口的菜谱被排除。

**本切片范围（已交付）：** 场景表单、`recommend.create` 家常方案、推荐页展示。**未做：** 换一批 / 可以 / 购买清单 / 非常规方案 / engage。
