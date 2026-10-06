# 做什么菜 (cookthis)

微信小程序 + 云开发。

## 上手

1. 用**微信开发者工具**打开本仓库**根目录**（含 `project.config.json` 的目录）。
2. 在开发者工具中**开通云开发**并创建环境；将环境 ID 填入 `miniprogram/app.js` 中 `wx.cloud.init` 的 `env` 字段（取消注释并替换 `your-env-id`）。云开发需使用真实小程序 AppID（在 `project.config.json` 中配置 `appid`）。
3. 在开发者工具中右键 **上传并部署** 云函数：`cloudfunctions/auth`、`cloudfunctions/ingredients`（云端安装依赖）。两函数均内置 `_shared` 副本（`auth/nickname.js`、`ingredients/confirmList.js`），上传时只需打包各自函数目录，不必依赖云端解析 `../_shared`。改算法时请同步：`_shared/nickname.js` ↔ `auth/nickname.js`；`_shared/confirmList.js` ↔ `ingredients/confirmList.js`。
4. 在云开发控制台创建数据库集合：`users`、`user_identities`、`ingredients`；权限建议：**仅管理端可写**，业务读写由云函数完成。`user_identities` 建议建复合唯一索引：`provider` + `providerUserId`。
5. 食材导入：在 Task 4 提供脚本后，于仓库根目录执行 `node scripts/import-ingredients.js`。
6. 食材导入（可选，云库有数据时 `ingredients.list` 可走库）：在仓库根目录执行 `node scripts/import-ingredients.js`（需已配置云开发 CLI/环境）。
7. 纯函数单测：在仓库根目录执行 `npm test`（运行 `cloudfunctions/_shared/*.test.js`）。

## 本切片验收清单（Slice 1）

**自动化（CI / 本地）：**

- [ ] 仓库根目录 `npm test` 全部 PASS（昵称短码、`buildConfirmList` 分层逻辑）。

**需人工：微信开发者工具 + 已部署云函数（见上文「上手」1～4 步）**

云开发与 `auth` / `ingredients` 部署、AppID / 环境 ID、数据库集合与权限无法在本仓库脚本里代替，请在真机或模拟器里按下列顺序点验：

1. [ ] **编译启动** → 小程序自动调用登录，无阻塞性报错。
2. [ ] **「我的」** → 展示默认昵称 **`大厨` + 4 位大写字母数字**（非微信资料拉取）。
3. [ ] **首页「今天菜场有什么」** → 进入 **食材确认页**：时令项默认全选；四季常见计入汇总、主列表不铺开；无调味项、无拍照入口。
4. [ ] **确认** → 本地 Storage 存在键 **`cookthis_last_selected`**，值为 `{ selected, methodsUsed }` 结构。

**本切片明确不做（见 `docs/superpowers/plans/2026-10-06-骨架登录与食材确认.md`）：** 场景表单、推荐、进场确认、饮食记录、完整画像引导。
