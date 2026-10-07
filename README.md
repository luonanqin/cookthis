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
| `confirmCandidates.js` | `meals/confirmCandidates.js` |
| `unconventionalPlans.js` | `recommend/unconventionalPlans.js` |

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

## Slice 4 准备（进场确认 + 饮食记录）

假定 **Slice 3 准备已完成**。在此基础上**再补**：

1. **上传并部署**云函数：`cloudfunctions/meals`；并**重新部署** `recommend`（消费近 7 日 `meal_logs` 同菜名硬排除）。
2. **再建集合**：`meal_logs`（权限同上，业务读写走云函数）。

做完即可对照下方「Slice 4 验收清单」。人工点验**暂缓**，以 `npm test` 为主。

---

## Slice 5 准备（画像 + 非常规 + 埋点骨架）

假定 **Slice 4 准备已完成**。在此基础上**再补**：

1. **上传并部署**云函数：`profile`、`analytics`；并**重新部署** `recommend`（接入非常规方案）与 `auth`（登录返回 `dishFormPrefs`）。
2. **再建集合**：`events`；可选 `members`（成员 CRUD 用）。
3. **重导菜谱**（若已导入旧版）：用更新后的 `data/recipes-for-import.json`（含火锅/面/饺种子菜）。

做完即可对照下方「Slice 5 验收清单」。人工点验**暂缓**，以 `npm test` 为主。

---

## MVP 缺口补齐（除语音）准备

假定 **Slice 5 准备已完成**。再补：

1. **重新部署**云函数：`auth`、`profile`、`recommend`、`meals`（及已有 `analytics`）。
2. 集合 `members`（若未建）；`events` 继续收埋点。
3. 广告：`miniprogram/utils/ads.js` 的 `ADS_ENABLED`（未开通前保持 `false`）+ 可选 `shoppingNative` unitId。
4. **语音**：在微信公众平台 → 小程序 → 设置 → 第三方设置 → 插件管理，添加 **微信同声传译**（`WechatSI` / provider `wx069ba97219f66d99`）。本地已在 `app.json` 声明插件与录音权限。重新部署云函数 `meals`（含 `addVoice`）。

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

---

## 本切片验收清单（Slice 4）

**状态：自动化已通过 · 人工点验暂缓**（2026-10-07）

**自动化（CI / 本地）：**

- [x] 仓库根目录 `npm test` 全部 PASS（含 `buildConfirmCandidates`、近 7 日菜名硬排除及前序切片）。

**需人工（暂缓）：** 完成「公共准备」+ Slice 1～4 准备后点验：

1. [ ] **进场确认** → 有采纳/≥30s 停留锚点且候选非空时弹半屏；默认不选；确认写 `meal_logs`（source=confirm）；跳过不写。
2. [ ] **无锚点 / 候选空** → 不弹层，直达食材确认页。
3. [ ] **记一下** → 手动写入 `meal_logs`（source=manual）；列表展示近期。
4. [ ] **推荐新鲜度** → 近 7 日已记录同菜名不再进家常方案。
5. [ ] **采纳仍不写** `meal_logs`。

**本切片范围（已交付）：** 进场确认、手动记录、列表、推荐同菜名硬排除。**未做：** 语音/拍照记录、完整画像、非常规方案、埋点全表。

---

## 本切片验收清单（Slice 5）

**状态：自动化已通过 · 人工点验暂缓**（2026-10-07）

**自动化（CI / 本地）：**

- [x] 仓库根目录 `npm test` 全部 PASS（含 `buildUnconventionalPlan` / `mergePlansWithUnconventional` 及前序切片）。

**需人工（暂缓）：** 完成「公共准备」+ Slice 1～5 准备后点验：

1. [ ] **我的** → 可改家庭忌口、火锅/面/饺偏好、默认人数并保存。
2. [ ] **非常规** → 偏好设为「喜欢」且食材够时，推荐至多 1 套 `hotpot`/`noodle`/`dumpling`。
3. [ ] **埋点骨架** → 点「今天菜场有什么」入队 `market_entry`；可批量写入 `events`。

**本切片范围（已交付）：** 家庭画像编辑、非常规方案引擎、埋点 trackBatch 骨架。**未做：** 完整 onboarding 引导、语音记录、埋点全表业务事件、广告。

---

## 验收清单（MVP 缺口 · 除语音）

**状态：自动化已通过 · 人工点验暂缓**

**自动化：**

- [x] `npm test` PASS（含成员忌口 / 主料新鲜度软降权用例）。

**需人工（暂缓）：**

1. [ ] 新用户进 **onboarding** 四步并 `onboardingDone`。
2. [ ] 成员忌口 / 近期主料重叠会改变推荐排序（软降权，不硬删）。
3. [ ] 关键路径写入 `events`（如 `market_entry`、`recommend_accept`、`meal_log_manual`）。
4. [ ] 购买清单：`ADS_ENABLED=true` 并配置 unitId 后，日常 1 条 / 非日常最多 2 条原生广告。

---

## 验收清单（语音补菜 · 语音记饮食）

**状态：自动化已通过 · 人工点验暂缓**

**自动化：**

- [x] `npm test` PASS（含 `parseFoodNames`）。

**需人工（暂缓）：** 先在公众平台添加 WechatSI 插件。

1. [ ] **确认页 · 语音** → 说出库内食材名 → 确认半屏 → 勾选进汇总；`methodsUsed` 可含 `voice`。
2. [ ] **记一下 · 语音记** → 说出菜名 → 确认后写入 `meal_logs`（`source=voice`）。
3. [ ] 插件未开通 / 拒录音时 toast，手动入口仍可用。

**未做（仍延后）：** 拍照、激励视频换一批、封面广告。
