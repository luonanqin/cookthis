# 做什么菜 (cookthis)

微信小程序 + 云开发。

## 上手

1. 用**微信开发者工具**打开本仓库**根目录**（含 `project.config.json` 的目录）。
2. 在开发者工具中**开通云开发**并创建环境；将环境 ID 填入 `miniprogram/app.js` 中 `wx.cloud.init` 的 `env` 字段（取消注释并替换 `your-env-id`）。云开发需使用真实小程序 AppID（在 `project.config.json` 中配置 `appid`）。
3. 在开发者工具中右键 **上传并部署** 云函数：`cloudfunctions/auth`、`cloudfunctions/ingredients`（云端安装依赖）。两函数均内置 `_shared` 副本（`auth/nickname.js`、`ingredients/confirmList.js`），上传时只需打包各自函数目录，不必依赖云端解析 `../_shared`。改算法时请同步：`_shared/nickname.js` ↔ `auth/nickname.js`；`_shared/confirmList.js` ↔ `ingredients/confirmList.js`。
4. 在云开发控制台创建数据库集合：`users`、`user_identities`、`ingredients`；权限建议：**仅管理端可写**，业务读写由云函数完成。`user_identities` 建议建复合唯一索引：`provider` + `providerUserId`。
5. 食材导入：云库对 `ingredients` 导入 `data/ingredients-for-import.json`（扩展名是 `.json`，但内容是 **每行一条** 的 JSON Lines，带 `_id`）。不要导入 `ingredients-builtin.json`（数组格式会失败）。可用 `node scripts/import-ingredients.js` 重新生成导入文件。
6. 纯函数单测：在仓库根目录执行 `npm test`（运行 `cloudfunctions/_shared/*.test.js`）。

## 本切片验收清单（Slice 1）

**状态：已验收 · 2026-10-07**（自动化 + 开发者工具人工点验通过）

**自动化（CI / 本地）：**

- [x] 仓库根目录 `npm test` 全部 PASS（昵称短码、`buildConfirmList` 分层逻辑）。

**需人工：微信开发者工具 + 已部署云函数（见上文「上手」1～4 步）**

1. [x] **编译启动** → 小程序自动调用登录，无阻塞性报错。
2. [x] **「我的」** → 展示默认昵称 **`大厨` + 4 位大写字母数字**（非微信资料拉取）。
3. [x] **首页「今天菜场有什么」** → 进入 **食材确认页**：时令项默认全选；四季常见计入汇总、主列表不铺开；无调味项、无拍照入口。
4. [x] **确认** → 本地 Storage 存在键 **`cookthis_last_selected`**，值为 `{ selected, methodsUsed }` 结构。

**本切片范围（已交付）：** 骨架、登录、静态食材确认。场景 / 推荐见 Slice 2 计划。
