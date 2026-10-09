# 买菜做什么 (cookthis)

微信小程序 + 云开发。

按切片验收时：**只做该切片列出的准备**；后面切片是在前面基础上**增量**补东西。

### 建议点验顺序（勿被引导挡住）

| 顺序 | 范围 | 说明 |
|------|------|------|
| 1 | Slice 1 | 登录 + 食材确认 |
| 2 | Slice 2 | 场景 + 家常推荐（**本阶段不必做完 onboarding**） |
| 3 | Slice 3 | 换一批 / 不行 / 就他了 / 方案卡食材摘要 / 分类清单 / 菜谱弹层 / engage |
| 4 | Slice 4 | 进场确认 + 手动记饮食 |
| 5 | Slice 5 | 「我的」画像 + 非常规方案 + 埋点骨架 |
| 6 | Slice 6 | **onboarding 引导**、成员忌口/新鲜度软降权、广告位等 |
| 7 | Slice 7 | 同方案内去重（§3.0.7）+ 多方案重复上限（§3.0.6）+ 方案卡食材摘要最多 5 名 |
| — | 语音 | 前端已下线，暂不点验 |

新用户进首页只会**弹一次**「去设置 / 先逛逛」；选「先逛逛」或引导页「暂时跳过」即可继续测 Slice 1～4。完整引导放到 **Slice 6** 再验。

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
| `freshness.js` | `recommend/freshness.js`（主料新鲜度分档，供 homePlans 引用） |
| `profileLite.js` | 小程序 `miniprogram/utils/profileLite.js`（日常轻量补全是否弹） |
| `shoppingList.js` | 小程序 `miniprogram/utils/shoppingList.js`（清单页本地聚合，非云函数） |
| `planIngredientSummary.js` | 小程序 `miniprogram/utils/planIngredientSummary.js`（方案卡食材摘要） |
| `recipeSheet.js` | 小程序 `miniprogram/utils/recipeSheet.js`（清单页菜谱弹层） |
| `shoppingChecks.js` | 小程序 `miniprogram/utils/shoppingChecks.js`（清单勾选 key / 清理） |
| `confirmCandidates.js` | `meals/confirmCandidates.js` |
| `removeMealLog.js` | `meals/removeMealLog.js`（§4.2 删除归属校验） |
| `listAccepted.js` | `recommend/listAccepted.js` |
| `planAte.js` | `meals/planAte.js` |
| `unconventionalPlans.js` | `recommend/unconventionalPlans.js` |

部署 `recommend`（含 `listAccepted`）前，请在云开发控制台为集合 `recommendations` 创建复合索引：`uid`、`accepted`、`acceptedAt`（与 `orderBy acceptedAt desc` 分页查询一致）。

---

## Slice 1 准备（登录 + 食材确认）

在「公共准备」之后，为跑通 Slice 1 还需要：

1. **上传并部署**云函数：`cloudfunctions/auth`、`cloudfunctions/ingredients`（云端安装依赖）。
2. **建集合**：`users`、`user_identities`、`ingredients`。权限建议：仅管理端可写，业务读写走云函数。`user_identities` 建议复合唯一索引：`provider` + `providerUserId`。
3. **导入食材**：对集合 `ingredients` 导入 `data/ingredients-for-import.json`（**JSON Lines**，每行一条且带 `_id`）。**不要**导入 `ingredients-builtin.json`（数组格式会失败）。需要重生成时：`node scripts/import-ingredients.js`。若集合里已有数据（含上次导入到一半失败留下的文档），先清空集合或选冲突覆盖，否则会报 `E11000 duplicate key`。

做完以上即可对照下方「Slice 1 验收清单」点验。**此阶段不需要** `recommend`、`recipes`、`recommendations`。

---

## Slice 2 准备（场景 + 家常推荐）

假定 **Slice 1 准备已完成**。在此基础上**再补**：

1. **上传并部署**云函数：`cloudfunctions/recommend`（云端安装依赖）。
2. **再建集合**：`recipes`、`recommendations`（权限同上）。
3. **导入菜谱**：对集合 `recipes` 导入 `data/recipes-for-import.json`（JSON Lines；含业务字段 `id`）。**不要**导入 `recipes-builtin.json`。需要重生成时：`node scripts/import-recipes.js`。若控制台要求文档 `_id`，可设为与 `id` 相同。

节日列表已打进小程序（`miniprogram/data/holidays.js`），**不必**再导入云库。

做完以上即可对照下方「Slice 2 验收清单」点验。

若提前点验 onboarding「完成」：需**上传并部署**云函数 `profile`（含 `completeOnboarding` / `skipOnboarding`）；可选建集合 `members`。否则会报 `UNKNOWN_ACTION`。

---

## Slice 3 准备（换一批 / 采纳 / 清单 / engage）

假定 **Slice 2 准备已完成**。本切片**无新集合**；上传/重新部署云函数 `recommend` 即可（含 swap/reject/accept/engage）。用户字段 `rejectDownranks` 由 reject 自动写入，无需手工建。方案卡摘要与清单菜谱弹层为小程序本地逻辑，改 `_shared` 后记得同步到 `miniprogram/utils/`。

做完即可对照下方「Slice 3 验收清单」。

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

## Slice 6 准备（onboarding / 软降权 / 广告位）

假定 **Slice 5 准备已完成**。再补：

1. **重新部署**云函数：`auth`、`profile`、`recommend`、`meals`（及已有 `analytics`）。
2. 集合 `members`（若未建）；`events` 继续收埋点。
3. 广告：`miniprogram/utils/ads.js` 的 `ADS_ENABLED`（未开通前保持 `false`）+ 可选 `shoppingNative` unitId；日常清单 1 条、非日常最多 2 条。

做完即可对照下方「Slice 6 验收清单」。

---

## Slice 7 准备（同方案去重 / 多方案上限 / 摘要截断）

假定 **Slice 6 准备已完成**（至少已有可跑的 `recommend` + 菜谱库）。再补：

1. **重新部署**云函数 `recommend`（须含同步后的 `homePlans.js` + `freshness.js`；本地改 `_shared` 后先 `cp` 到 `recommend/`）。
2. 小程序侧：若改过 `planIngredientSummary.js`，确认已同步到 `miniprogram/utils/planIngredientSummary.js` 后重新编译。
3. 本地：`npm test`（含 `homePlans` §3.0.6 / §3.0.7、`planIngredientSummary` 最多 5 名）。

无新集合。做完即可对照下方「Slice 7 验收清单」。

---

## 语音（当前已下线）

因微信同声传译插件使用受限、会导致编译失败，**前端语音入口与 `app.json` 插件声明已临时移除**（确认页 / 记一下仅保留手动输入）。  
纯函数 `parseFoodNames`、云函数 `meals.addVoice` 仍保留，待插件可用后再接回 UI。

---

## 本切片验收清单（Slice 1）

**状态：已验收 · 2026-10-07**

**自动化：**

- [x] `npm test` PASS（昵称、`buildConfirmList`）。

**需人工：**「公共准备」+「Slice 1 准备」后：

1. [x] 编译启动 → 自动登录无阻塞报错。
2. [x] 「我的」→ 默认昵称 `大厨` + 4 位大写字母数字。
3. [x] 「今天菜场有什么」→ 食材确认页：时令默认全选；四季常见计入汇总、主列表不铺开；无调味/拍照。
4. [x] 确认 → Storage `cookthis_last_selected`（含 `selected` / `methodsUsed`）。

**本切片只验这些。** 若弹出家庭设置：选「先逛逛」即可。

---

## 本切片验收清单（Slice 2）

**状态：已验收 · 2026-10-08**

**自动化：**

- [x] `npm test` PASS（含 `suggestComboByPeople`、`buildHomePlans`、`filterHolidays`）。

**需人工：** 完成 Slice 1～2 准备后（**不必完成 onboarding**）：

1. [x] 场景区：日常 / 家庭 / 朋友 / 节日；日常人数与搭配预填；非日常人数后自动搭配 + 当次忌口；节日近 30 天必选。
2. [x] 日常几顿快捷；非日常默认 1 顿。
3. [x] 确认并推荐 → `recommend.create`；Storage `cookthis_last_recommend`（`requestId`/`plans`）；云库 `recommendations` 有文档。
4. [x] 推荐页展示 1～3 套家常（顿 label + 菜名）；空方案可返回改场景。
5. [x] 忌口：日常用 `familyAvoids`（可在「我的」先设）、聚会用当次 `partyAvoids`。

**本切片不验：** 换一批/就他了/方案卡食材摘要/清单与菜谱弹层、进场确认、onboarding 四步、非常规方案。  
（推荐页上若已有换一批、「就他了」、食材摘要等，属 Slice 3，此处可忽略不测。）

---

## 本切片验收清单（Slice 3）

**状态：已验收 · 2026-10-08**

**自动化：**

- [x] `npm test` PASS（含 `buildShoppingList`、`buildPlanIngredientSummary`、`buildRecipeSheet`、降权用例）。

**需人工：** Slice 1～3 准备后：

1. [x] 换一批 → `swap`，方案刷新；不写长期降权。
2. [x] 不行 → 可选原因；`reject` + `users.rejectDownranks`。
3. [x] 方案卡右下角一行食材摘要（如 `食材：猪肉、豆腐等2种`）；**无**完整清单、**无**「查看购买清单」入口。
4. [x] 多方案时各自右侧「就他了」→ `accept` 带该 `planIndex`；**不**写 `meal_logs`；进清单 `accepted=true`（换另一方案再点，清单应对应该方案）。
5. [x] 清单页：按分类分组、每行 2 个勾选；无已有/主料/调味标签；勾选本地持久——返回后再进**同一方案**勾选仍在；点「换一批」后勾选清空。
6. [x] 清单底部「看菜谱」→ 半屏弹层（菜→右列食材，主料前调味后；无顿次标签）；弹层不遮「返回」；遮罩/关闭退出后勾选不变；同页再开恢复滚动，离开页面后重置。
7. [x] engage：推荐页可见 ≥30s 写 `engagedAt`。

**本切片不验：** 进场确认弹层、手动记饮食页、onboarding、广告。

---

## 本切片验收清单（Slice 4）

**状态：主体已验收 · 2026-10-08；§4.2 删除待点验**（需重新部署 `meals`）

**自动化：**

- [x] `npm test` PASS（含 `buildConfirmCandidates`、`planRemoveMealLog`）。

**需人工：** Slice 1～4 准备后（需重新部署云函数 `meals`）：

1. [x] 进场确认：只看最新采纳/≥30s 锚点；已处理或候选空则不弹（**不**回退旧会话）；默认不选；确认写 `meal_logs` 并标 `entryConfirmHandled`；跳过不写菜但同样标已处理。
2. [x] 无可用锚点 / 候选空 → 不弹，直达确认页（候选空时服务端也会标已处理）。
3. [x] 「记一下」手动写入（manual）+ 列表。
4. [x] 近 7 日同菜名不再进家常方案。
5. [x] 采纳仍不写 `meal_logs`。
6. [ ] **删除已吃（§4.2）**：列表行内「删除」→ 二次确认「删掉这条已吃记录？」→ `meals.remove` 后列表刷新；删后该菜不再进近 7 日硬排除 / 新鲜度。

**本切片不验：** onboarding、非常规、广告、语音。

---

## 本切片验收清单（Slice 5）

**状态：已验收 · 2026-10-08**

**自动化：**

- [x] `npm test` PASS（含非常规方案用例）。

**需人工：** Slice 1～5 准备后：

1. [x] 「我的」改家庭忌口 / 火锅·面·饺偏好 / 默认人数并保存。
2. [x] 偏好「喜欢」且食材够时，推荐至多 1 套非常规（`hotpot`/`noodle`/`dumpling`）。
3. [x] 埋点：`market_entry` 等可写入 `events`（骨架即可）。

**本切片不验：** 完整 onboarding 四步（放到 Slice 6）、广告开关真投、语音。

---

## 本切片验收清单（Slice 6）

**状态：已验收 · 2026-10-09**

**自动化：**

- [x] `npm test` PASS（含成员忌口 / 主料新鲜度软降权 / `shouldShowProfileLite`）。

**需人工：**

1. [x] **Onboarding**：新用户可走完四步（忌口→品类→本人→日常默认）并 `onboardingDone`；也可「暂时跳过」后仍能进首页主流程；「我的」可重新打开引导。
2. [x] **日常轻量补全**：先逛逛且 `familyAvoids` 为空 → 日常确认后弹层；保存写忌口（可选爱吃）再出方案；跳过仍出方案且下次不弹；非日常 / 已有忌口不弹。
3. [x] 成员忌口 / 近期主料重叠 → 推荐软降权（不硬删）。
4. [x] 关键路径埋点进 `events`（如 `recommend_accept`、`meal_log_manual`）。
5. [x] 广告：仅当 `ADS_ENABLED=true` 且配置 unitId 时清单展示；否则不渲染。

---

## 本切片验收清单（Slice 7）

**状态：已验收 · 2026-10-09**

**自动化：**

- [x] `npm test` PASS（含同方案内去重 helpers / 行为用例、多方案 overlap 上限、食材摘要最多展示 5 名）。

**需人工：** Slice 7 准备后：

1. [x] **同方案内去重（§3.0.7）**：聚餐等大 combo（多荤多素）→ 同一方案卡内**无两道同名菜**（不同 `recipeId` 同显示名也不行）。
2. [x] **近义 / 主料全同**：若菜谱库有成对「土豆烧牛肉 / 土豆炖牛肉」或主料集合完全相同的菜 → 同套至多出一道；仅共用土豆等配菜、主料集合不同的（如土豆烧牛肉 + 醋溜土豆丝）仍可同套。
3. [x] **多方案重复上限（§3.0.6）**：同屏 2～3 套家常方案两两比较——合计 ≥8 道时相同菜 ≤2；5～7 道 ≤1；少于 5 道则相同菜 =0。候选极少时可只出 1 套，不因上限变成空结果。
4. [x] **换一批**：仍能换出与当前屏不同的菜；排除当前菜后重跑，不明显回退到「大半桌重复」。
5. [x] **方案卡食材摘要**：右下角一行最多列出 **5 个**主料名，「等 n 种」的 n 仍为去重后总数（例：`食材：草鱼、鸡肉、…等9种`）。

**本切片不验：** onboarding、进场确认、广告、语音。

---

## 验收清单（语音）

**状态：前端已下线 · 暂不点验**

- [x] `parseFoodNames` 单测仍 PASS；UI / 插件声明已移除。

**仍延后：** 语音 UI 复开、拍照、激励视频换一批、封面广告。
