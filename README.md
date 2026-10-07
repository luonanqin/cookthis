# 做什么菜 (cookthis)

微信小程序 + 云开发。

按切片验收时：**只做该切片列出的准备**；后面切片是在前面基础上**增量**补东西。

---

## 公共准备（所有切片共用，做一次即可）

1. 用**微信开发者工具**打开本仓库**根目录**（含 `project.config.json` 的目录）。
2. **开通云开发**并创建环境；在 `project.config.json` 填真实小程序 `appid`；在 `miniprogram/app.js` 的 `wx.cloud.init` 里填 `env`（取消注释并换成你的环境 ID）。
3. 本地单测（可选随时跑）：仓库根目录 `npm test`。

云函数若内置了 `_shared` 副本，上传时只打包**各自函数目录**即可。改纯逻辑后请同步：

| `_shared` 源文件 | 云函数内副本 |
|------------------|--------------|
| `nickname.js` | `auth/nickname.js` |
| `confirmList.js` | `ingredients/confirmList.js` |
| `homePlans.js` | `recommend/homePlans.js` |
| `shoppingList.js` | 小程序 `miniprogram/utils/shoppingList.js`（清单页本地聚合，非云函数） |

---

## Slice 1 准备（登录 + 食材确认）

在「公共准备」之后，为跑通 Slice 1 还需要：

1. **上传并部署**云函数：`cloudfunctions/auth`、`cloudfunctions/ingredients`（云端安装依赖）。
2. **建集合**：`users`、`user_identities`、`ingredients`。权限建议：仅管理端可写，业务读写走云函数。`user_identities` 建议复合唯一索引：`provider` + `providerUserId`。
3. **导入食材**：对集合 `ingredients` 导入 `data/ingredients-for-import.json`（**JSON Lines**，每行一条且带 `_id`）。**不要**导入 `ingredients-builtin.json`（数组格式会失败）。需要重生成时：`node scripts/import-ingredients.js`。

做完以上即可对照下方「Slice 1 验收清单」点验。**此阶段不需要** `recommend`、`recipes`、`recommendations`。

---

## Slice 2 准备（场景 + 家常推荐）

假定 **Slice 1 准备已完成**。在此基础上**再补**：

1. **上传并部署**云函数：`cloudfunctions/recommend`（云端安装依赖）。
2. **再建集合**：`recipes`、`recommendations`（权限同上）。
3. **导入菜谱**：对集合 `recipes` 导入 `data/recipes-for-import.json`（JSON Lines；含业务字段 `id`）。**不要**导入 `recipes-builtin.json`。需要重生成时：`node scripts/import-recipes.js`。若控制台要求文档 `_id`，可设为与 `id` 相同。

节日列表已打进小程序（`miniprogram/data/holidays.json`），**不必**再导入云库。

做完以上即可对照下方「Slice 2 验收清单」点验。

---

## Slice 3 准备（换一批 / 采纳 / 清单 / engage）

假定 **Slice 2 准备已完成**。本切片**无新集合**；上传/重新部署云函数 `recommend` 即可（含 swap/reject/accept/engage）。用户字段 `rejectDownranks` 由 reject 自动写入，无需手工建。

做完即可对照下方「Slice 3 验收清单」。开发者工具人工点验**暂缓**，以 `npm test` 为主。

---

## 本切片验收清单（Slice 1）

**状态：已验收 · 2026-10-07**（自动化 + 开发者工具人工点验通过）

**自动化（CI / 本地）：**

- [x] 仓库根目录 `npm test` 全部 PASS（昵称短码、`buildConfirmList` 分层逻辑）。

**需人工：** 完成上文「公共准备」+「Slice 1 准备」后，在模拟器 / 真机点验：

1. [x] **编译启动** → 小程序自动调用登录，无阻塞性报错。
2. [x] **「我的」** → 展示默认昵称 **`大厨` + 4 位大写字母数字**（非微信资料拉取）。
3. [x] **首页「今天菜场有什么」** → 进入 **食材确认页**：时令项默认全选；四季常见计入汇总、主列表不铺开；无调味项、无拍照入口。
4. [x] **确认** → 本地 Storage 存在键 **`cookthis_last_selected`**（含 `selected` / `methodsUsed`；Slice 2 起还会带上 `scene`）。

**本切片范围（已交付）：** 骨架、登录、静态食材确认。

---

## 本切片验收清单（Slice 2）

**状态：待验收**（清单留空供人工勾选）

**自动化（CI / 本地）：**

- [ ] 仓库根目录 `npm test` 全部 PASS（含 `suggestComboByPeople`、`buildHomePlans`、`filterHolidays` 及 Slice 1 用例）。

**需人工：** 完成上文「公共准备」+「Slice 1 准备」+「Slice 2 准备」后点验：

1. [ ] **确认页场景区** → 可选 **日常 / 家庭聚会 / 朋友聚会 / 节日聚会**；日常人数与荤素汤搭配预填；非日常输入人数后自动填搭配，可选当次忌口（如 pork）；节日展示近 30 天节日并必选一项。
2. [ ] **日常几顿** → 可选午/晚等快捷；**非日常** 默认 1 顿、无午晚分顿选项。
3. [ ] **确认并推荐** → 调用 `recommend.create` 成功；Storage 键 **`cookthis_last_recommend`** 含 `requestId` 与 `plans`；云库 **`recommendations`** 有对应文档（含 `scene`、`selectedIngredients`、`plans`）。
4. [ ] **推荐页** → 展示 1～3 套家常方案，每套各顿 label + 菜名；无换一批/可以/清单入口；空方案有提示并可返回改场景。
5. [ ] **忌口** → 日常用画像 `familyAvoids`、聚会用当次 `partyAvoids`（不写回画像）；含忌口的菜谱被排除。

**本切片范围（已交付）：** 场景表单、`recommend.create` 家常方案、推荐页展示。**未做：** 换一批 / 可以 / 购买清单 / 非常规方案 / engage。

---

## 本切片验收清单（Slice 3）

**状态：自动化已通过 · 人工点验暂缓**（2026-10-07）

**自动化（CI / 本地）：**

- [x] 仓库根目录 `npm test` 全部 PASS（含 `buildShoppingList`、`buildHomePlans` 降权用例及前序切片）。

**需人工（暂缓）：** 完成「公共准备」+ Slice 1～3 准备后，在模拟器 / 真机点验：

1. [ ] **换一批** → 调用 `recommend.swap`，方案刷新；不写长期降权。
2. [ ] **不行** → 可选原因半屏；`reject` 后方案刷新；`users.rejectDownranks` 写入菜谱 id。
3. [ ] **可以** → `accept` 成功；**不**写 `meal_logs`；跳转购买清单且 `accepted=true`；日常可写回人数/搭配默认。
4. [ ] **查看购买清单** → 不调 accept；主料未持有优先、已有主料次之、调味靠后；勾选已买本地持久。
5. [ ] **engage** → 推荐页可见累计 ≥30s 写一次 `engagedAt`。

**本切片范围（已交付）：** swap / reject / accept / engage、购买清单页、软降权。**未做：** 进场确认、饮食记录、非常规方案、埋点全表、广告。
