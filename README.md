# 做什么菜 (cookthis)

微信小程序 + 云开发。

## 上手

1. 用**微信开发者工具**打开本仓库**根目录**（含 `project.config.json` 的目录）。
2. 在开发者工具中**开通云开发**并创建环境；将环境 ID 填入 `miniprogram/app.js` 中 `wx.cloud.init` 的 `env` 字段（取消注释并替换 `your-env-id`）。云开发需使用真实小程序 AppID（在 `project.config.json` 中配置 `appid`）。
3. 在开发者工具中右键 **上传并部署** 云函数：`cloudfunctions/auth`、`cloudfunctions/ingredients`（云端安装依赖）。两函数均内置 `_shared` 副本（`auth/nickname.js`、`ingredients/confirmList.js`），上传时只需打包各自函数目录，不必依赖云端解析 `../_shared`。改算法时请同步：`_shared/nickname.js` ↔ `auth/nickname.js`；`_shared/confirmList.js` ↔ `ingredients/confirmList.js`。
4. 在云开发控制台创建数据库集合：`users`、`user_identities`、`ingredients`；权限建议：**仅管理端可写**，业务读写由云函数完成。`user_identities` 建议建复合唯一索引：`provider` + `providerUserId`。
5. 食材导入：在 Task 4 提供脚本后，于仓库根目录执行 `node scripts/import-ingredients.js`。
6. 纯函数单测：在仓库根目录执行 `npm test`（运行 `cloudfunctions/_shared/*.test.js`）。
