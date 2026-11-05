# 买菜做什么 (cookthis)

微信小程序 + 云开发。

按切片验收时：**只做该切片列出的准备**；后面切片是在前面基础上**增量**补东西。

### 建议点验顺序（勿被引导挡住）

| 顺序 | 范围 | 说明 |
|------|------|------|
| 1 | Slice 1 | 登录 + 食材确认 |
| 2 | Slice 2 | 场景 + 家常推荐（**本阶段不必做完 onboarding**） |
| 3 | Slice 3 | 换一批 / 不行 / 去买菜 / 方案卡食材摘要 / 分类清单 / 菜谱弹层 / engage |
| 4 | Slice 4 | 进场确认 + 手动记饮食 |
| 5 | Slice 5 | 「我的」画像 + 非常规方案 + 埋点骨架 |
| 6 | Slice 6 | **onboarding 引导**、成员忌口/新鲜度软降权、广告位等 |
| 7 | Slice 7 | 同方案内去重（§3.0.7）+ 多方案重复上限（§3.0.6）+ 方案卡食材摘要最多 5 名 |
| 8 | Slice 8 | 已选方案历史 + 点选已吃（`plan_ate`）+ 进场确认排除 |
| 9 | Slice 9 | 成员 CRUD + 大/小/老 + 当次访客 + 用餐人软分（§3.0.8） |
| 10 | Slice 10 | **跳过引导后的画像常驻提醒**（推荐顶栏 / 「我的」缺口 / 无忌口·暂无偏好） |
| 11 | Slice 11 | **购物清单别名展示 + 推荐别名匹配**（当地主名/副名；确认别名能命中通用名主料） |
| 12 | Slice 12 | **用户建议反馈**（首页入口 / 无数字红点 / 列表顶提交 / 运营回复 / 订阅落地） |
| 13 | Slice 13 | **菜场规模与食材列表档位**（预生成分档名单 / 首页半屏 / 确认页切换刷新） |
| 14 | Slice 14 | **方案分享**（推荐卡 / 食材页 / 已选自产 → 只读落地 / 保存到已选） |
| — | 语音 | 前端已下线，暂不点验 |

新用户进首页只会**弹一次**「去设置 / 先逛逛」；选「先逛逛」或引导页「暂时跳过」即可继续测 Slice 1～4。完整引导放到 **Slice 6** 再验。跳过/轻量跳过后的**弱提醒与快捷补全**放到 **Slice 10** 再验。

---

## 公共准备（所有切片共用，做一次即可）

1. 用**微信开发者工具**打开本仓库**根目录**（含 `project.config.json` 的目录）。
2. **开通云开发**并创建环境；在 `project.config.json` 填真实小程序 `appid`；在 `miniprogram/app.js` 的 `wx.cloud.init` 里填 `env`（取消注释并换成你的环境 ID）。
3. 本地单测（可选随时跑）：仓库根目录 `npm test`。
4. 仓库脚本（别名同步、云库导入、下厨房清洗等）说明见 **[`scripts/README.md`](scripts/README.md)**。catalog 本地文件字段（食材/菜谱/别名/热度/分档）见 **[`docs/superpowers/specs/2026-11-05-catalog数据字典.md`](docs/superpowers/specs/2026-11-05-catalog数据字典.md)**；云库食材/菜谱语义见 [`docs/superpowers/specs/2026-10-02-详细设计-主数据与菜谱.md`](docs/superpowers/specs/2026-10-02-详细设计-主数据与菜谱.md)。

云函数若内置了 `_shared` 副本，上传时只打包**各自函数目录**即可。改纯逻辑后请同步：

| `_shared` 源文件 | 云函数内副本 |
|------------------|--------------|
| `nickname.js` | `auth/nickname.js` |
| `confirmList.js` | `ingredients/confirmList.js` |
| `homePlans.js` | `recommend/homePlans.js` |
| `members.js` | `recommend/members.js`、`profile/members.js`；小程序 `miniprogram/utils/members.js`（大/小/老、访客展开、§3.0.8） |
| `freshness.js` | `recommend/freshness.js`（主料新鲜度分档，供 homePlans 引用） |
| `profileLite.js` | 小程序 `miniprogram/utils/profileLite.js`（日常轻量补全是否弹） |
| `profileGaps.js` | 小程序 `miniprogram/utils/profileGaps.js`（忌口/成员/城市/菜系缺口；推荐顶栏只盯忌口） |
| `shoppingList.js` | 小程序 `miniprogram/utils/shoppingList.js`（清单页本地聚合）；`share/shoppingList.js`（供 `planShare` 聚合完整用料；无 bought） |
| `planIngredientSummary.js` | 小程序 `miniprogram/utils/planIngredientSummary.js`（方案卡食材摘要） |
| `recipeSheet.js` | 小程序 `miniprogram/utils/recipeSheet.js`（清单页菜谱弹层） |
| `shoppingChecks.js` | 小程序 `miniprogram/utils/shoppingChecks.js`（清单勾选 key / 清理） |
| `confirmCandidates.js` | `meals/confirmCandidates.js` |
| `removeMealLog.js` | `meals/removeMealLog.js`（§4.2 删除归属校验） |
| `listAccepted.js` | `recommend/listAccepted.js`（自产 + `received_plans` 合并；含 `source` / `badge`） |
| `planAte.js` | `meals/planAte.js` |
| `unconventionalPlans.js` | `recommend/unconventionalPlans.js` |
| `feedbackLogic.js` | `feedback/feedbackLogic.js`（校验 / sortKey / shapeFeedback） |
| `marketScale.js` | `profile/marketScale.js`；小程序 `miniprogram/utils/marketScale.js`（档位文案 / 半屏门禁 / 历史截断） |
| `confirmListFromScale.js` | `ingredients/confirmListFromScale.js`（预生成 by-scale → seasonal/yearRound） |
| `planShare.js` | `share/planShare.js`；小程序 `miniprogram/utils/planShare.js`（快照构建 / 分享卡 title；小程序侧仅 title） |

部署 `recommend`（含 `listAccepted`）前，请在云开发控制台为集合 `recommendations` 创建复合索引：`uid`、`accepted`、`acceptedAt`（与 `orderBy acceptedAt desc` 分页查询一致）。

---

## Slice 1 准备（登录 + 食材确认）

在「公共准备」之后，为跑通 Slice 1 还需要：

1. **上传并部署**云函数：`cloudfunctions/auth`、`cloudfunctions/ingredients`（云端安装依赖）。
2. **建集合**：`users`、`user_identities`、`ingredients`。权限建议：仅管理端可写，业务读写走云函数。`user_identities` 建议复合唯一索引：`provider` + `providerUserId`。
3. **导入食材**：对集合 `ingredients` 导入 `data/catalog/ingredients-for-import.json`（**JSON Lines**，每行一条且带 `_id`）。**不要**导入 `ingredients-builtin.json`（数组格式会失败）。需要重生成时：`node scripts/import-ingredients.js`。若集合里已有数据（含上次导入到一半失败留下的文档），先清空集合或选冲突覆盖，否则会报 `E11000 duplicate key`。忌口标签随食材文档的 `avoidTags` 一并导入；改过 `avoidVocab` 后另跑 `node scripts/sync-avoid-options.js`，并**重新部署**云函数 `profile`（sanitize 白名单），小程序侧才会显示新忌口组。

做完以上即可对照下方「Slice 1 验收清单」点验。**此阶段不需要** `recommend`、`recipes`、`recommendations`。

---

## Slice 2 准备（场景 + 家常推荐）

假定 **Slice 1 准备已完成**。在此基础上**再补**：

1. **上传并部署**云函数：`cloudfunctions/recommend`（云端安装依赖）。
2. **再建集合**：`recipes`、`recommendations`（权限同上）。
3. **导入菜谱**：对集合 `recipes` 导入 `data/catalog/recipes-for-import.json`（JSON Lines；含业务字段 `id`）。**不要**导入 `recipes-builtin.json`。需要重生成时：`node scripts/import-recipes.js`。若控制台要求文档 `_id`，可设为与 `id` 相同。

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
3. **重导菜谱**（若已导入旧版）：用更新后的 `data/catalog/recipes-for-import.json`（含火锅/面/饺种子菜）。

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

## Slice 8 准备（已选方案 / 点选已吃）

假定 **Slice 3～4 准备已完成**（能「去买菜」、有 `meal_logs`；建议也已部署最新 `recommend` / `meals`）。再补：

1. **云开发控制台**：集合 `recommendations` 建复合索引 `uid` + `accepted` + `acceptedAt`（见上方公共准备说明）；缺索引时列表分页会报错或无法上拉。
2. **重新部署**云函数：`recommend`（含 `listAccepted.js`）、`meals`（含 `planAte.js` / `removeMealLog.js`）。
3. 小程序重新编译（含 `pages/acceptedPlans`、「我的」入口）。
4. 本地：`npm test`（含 `listAccepted` / `planAte` / `plan_ate` 进场确认回归）。

无新集合。做完即可对照下方「Slice 8 验收清单」。

---

## Slice 9 准备（成员 / 大中小老 / 访客 / 用餐人软分）

假定 **Slice 5～6 准备已完成**（有 `profile`、`members` 集合；能跑推荐）。再补：

1. **同步** `_shared/members.js` → `recommend/members.js`、`profile/members.js`、`miniprogram/utils/members.js`；并同步改过的 `homePlans.js` → `recommend/homePlans.js`。
2. **重新部署**云函数：`profile`（成员 CRUD 回写 `defaultPeopleCount`；`get` 带 `householdCounts`）、`recommend`（`expandMealDiners` + §3.0.8 软分；日常 accept **只写回 combo**）。
3. 小程序重新编译（「我的」成员列表、确认页日常三档步进、引导五档年龄）。
4. 本地：`npm test`（含 `members`、`homePlans` diner 用例）。

无新集合（沿用 `members`）。做完即可对照下方「Slice 9 验收清单」。

计划：[`docs/superpowers/plans/2026-10-10-成员大中小老与用餐人软分.md`](docs/superpowers/plans/2026-10-10-成员大中小老与用餐人软分.md)。

---

## Slice 10 准备（跳过引导与画像提醒）

假定 **Slice 5～6 准备已完成**（有 `profile` / `auth`；能出推荐；「我的」可改忌口）。再补：

1. **同步** `_shared/profileGaps.js` → `miniprogram/utils/profileGaps.js`（改源后两边保持一致）。
2. **重新部署**云函数：`profile`（`confirmFamilyAvoidsNone` / `confirmCuisineNoPreference`；`saveProfileLite` 空忌口不写表态）、`auth`（登录带回 `familyAvoidsNone` / `*ConfirmedAt`）。
3. 小程序重新编译（`profile-lite-form` 组件；推荐顶栏；「我的」提醒块）。
4. 本地：`npm test`（含 `computeProfileGaps`）。

无新集合。用户文档新增字段由云函数读写即可。做完即可对照下方「Slice 10 验收清单」。

计划：[`docs/superpowers/plans/2026-10-19-跳过引导与画像提醒.md`](docs/superpowers/plans/2026-10-19-跳过引导与画像提醒.md)。  
设计：[`docs/superpowers/specs/2026-10-19-跳过引导与画像提醒-design.md`](docs/superpowers/specs/2026-10-19-跳过引导与画像提醒-design.md)。

---

## Slice 11 准备（购物清单别名展示与推荐别名匹配）

假定 **Slice 2～3 准备已完成**（能出推荐、「去买菜」进清单；小程序已编译）。再补：

1. **重新部署**云函数 `recommend`（须含 `data/aliases.json`、`aliasMatch.js`、已 vendored 的 `homePlans.js` / `unconventionalPlans.js`）。改 `_shared/aliasMatch.js` 或 plans 后记得同步到 `cloudfunctions/recommend/` 与小程序 `miniprogram/utils/aliasMatch.js`。
2. 若改了别名编辑稿或城货架：见 [`scripts/README.md`](scripts/README.md)（`export-aliases-from-editor.py` → `sync-alias-runtime-data.js`），再部署 / 重编译。
3. 本地：`npm test`（含 `aliasMatch` / `homePlans` / `unconventionalPlans`）。

无新集合。做完即可对照下方「Slice 11 验收清单」。

计划：[`docs/superpowers/plans/2026-10-20-购物清单别名展示与推荐别名匹配.md`](docs/superpowers/plans/2026-10-20-购物清单别名展示与推荐别名匹配.md)。  
设计：[`docs/superpowers/specs/2026-10-20-购物清单别名展示与推荐别名匹配-design.md`](docs/superpowers/specs/2026-10-20-购物清单别名展示与推荐别名匹配-design.md)。

---

## Slice 12 准备（用户建议反馈）

假定 **公共准备已完成**（能登录进首页即可；不依赖推荐链路）。再补：

1. **上传并部署**云函数：`cloudfunctions/feedback`（云端安装依赖；含 vendored `feedbackLogic.js`）。改 `_shared/feedbackLogic.js` 后记得同步到 `cloudfunctions/feedback/`。
2. **再建集合**：`feedbacks`（权限同上，业务读写走云函数）。
3. **索引**（控制台按报错补齐亦可；**全部为普通索引，不要勾唯一**——同一用户可有多条反馈，`sortKey` / `createdAt` 亦可并列）：

   | 索引 | 字段 | 唯一？ | 用途 |
   |------|------|--------|------|
   | 复合 | `uid` ASC + `sortKey` DESC | **否** | `listMine`：`where({ uid }).orderBy('sortKey','desc')` |
   | 复合 | `uid` ASC + `createdAt` DESC | **否** | `create` 频控：同 uid 最近一条 `createdAt` |
   | 复合 | `uid` ASC + `unreadForUser` ASC | **否** | `hasUnread` / 列表旁未读探测：`where({ uid, unreadForUser: true }).limit(1)` |

4. **环境变量**（云函数 `feedback`）：`FEEDBACK_ADMIN_KEY`（运营 reply 鉴权）；`FEEDBACK_SUBSCRIBE_TMPL_ID`（与小程序 `miniprogram/utils/subscribe.js` 内模板 ID **相同**）。未配模板时站内提交/列表/回复仍可用，仅订阅推送不发。
5. **订阅消息**（可选手测推送时）：公众平台申请模板；开通云调用 `subscribeMessage.send`；模板 `page` 固定为 `pages/index/index?openFeedback=1`；云函数 `reply` 里 `thing1` / `thing2` 等字段名与控制台模板关键词对齐。
6. 运营回复：云开发控制台调用 `feedback`（`action: reply`，带 `adminKey` / `feedbackId` / `reply`），或参考 `scripts/reply-feedback.js` 打印的入参。
7. 本地：`npm test`（含 `feedbackLogic`）。

做完即可对照下方「Slice 12 验收清单」。

计划：[`docs/superpowers/plans/2026-10-27-用户建议反馈.md`](docs/superpowers/plans/2026-10-27-用户建议反馈.md)。  
设计：[`docs/superpowers/specs/2026-10-27-用户建议反馈-design.md`](docs/superpowers/specs/2026-10-27-用户建议反馈-design.md)。  
技术方案：[`docs/superpowers/specs/2026-10-27-用户建议反馈-技术方案.md`](docs/superpowers/specs/2026-10-27-用户建议反馈-技术方案.md)。

---

## Slice 13 准备（菜场规模与食材列表档位）

假定 **Slice 1～2 准备已完成**（能登录、能进确认页出名单；建议「我的」已设城市，否则无城文件会退回旧 confirmList）。再补：

1. **构建产物**（改货架/热度后重跑）：  
   - `python3 scripts/build-ingredient-popularity.py` → `data/catalog/ingredient-popularity.json`  
   - `python3 scripts/build-city-ingredients-by-scale.py` → 各城 `data/catalog/cities/*/ingredients-by-scale.json`  
   - `node scripts/sync-city-scale-to-cloud.js` → 拷入 `cloudfunctions/ingredients/data/cities/` 并 vendor `confirmListFromScale.js`  
   说明见 [`scripts/README.md`](scripts/README.md)。
2. **上传并部署**云函数：`ingredients`（须含各城 by-scale）、`profile`（`setMarketScale`）、`auth`（login 回包 marketScale*）。改 `_shared/marketScale.js` / `confirmListFromScale.js` 后记得同步到函数目录与小程序 utils。
3. **小程序**：`app.json` 已声明 `getLocation`；公众平台开通定位与隐私协议文案后，**真机**才能测首页首次半屏 / 1km 重定位。开发者工具可 mock `getLocation`。
4. 本地：`npm test`（含 `marketScale` / `confirmListFromScale`）；可选 `pytest scripts/tests/test_ingredient_popularity.py scripts/tests/test_city_ingredients_by_scale.py`。

无新集合（字段写在 `users`）。做完即可对照下方「Slice 13 验收清单」。

计划：[`docs/superpowers/plans/2026-10-14-菜场规模与食材列表档位.md`](docs/superpowers/plans/2026-10-14-菜场规模与食材列表档位.md)。  
设计：[`docs/superpowers/specs/2026-10-14-菜场规模与食材列表档位-design.md`](docs/superpowers/specs/2026-10-14-菜场规模与食材列表档位-design.md)。

---

## Slice 14 准备（方案分享）

假定 **Slice 2～3、Slice 8 准备已完成**（能出推荐、「去买菜」进清单、「已选方案」列表可用）。再补：

1. **上传并部署**云函数：`cloudfunctions/share`（云端安装依赖；包内须含 vendored `planShare.js` + `shoppingList.js`）。改 `_shared/planShare.js` / `listAccepted.js` 后记得同步到 `share/`、`recommend/` 与小程序 `utils/planShare.js`（title）。
2. **重新部署**云函数：`recommend`（`listAccepted` 合并 `received_plans`）。
3. **再建集合**：`plan_shares`、`received_plans`（权限同上，业务读写走云函数）。
4. **复合索引**（控制台按报错补齐亦可）：
   - `plan_shares`：`createdBy + sourceRequestId + sourcePlanIndex + sourceSwapCount`（复用）；`shareId`（`get` / `save`）
   - `received_plans`：`ownerUid + shareId`（幂等）；列表 `ownerUid + savedAt DESC`
5. 本地：`npm test`（含 `planShare` / `listAccepted`）。分享面板需**真机**或开发者工具预览号互测。

做完即可对照下方「Slice 14 验收清单」。

计划：[`docs/superpowers/plans/2026-10-28-方案分享.md`](docs/superpowers/plans/2026-10-28-方案分享.md)。  
设计：[`docs/superpowers/specs/2026-10-28-方案分享-design.md`](docs/superpowers/specs/2026-10-28-方案分享-design.md)。  
需求：[`docs/superpowers/specs/2026-10-24-方案分享-requirements.md`](docs/superpowers/specs/2026-10-24-方案分享-requirements.md)。

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

**本切片不验：** 换一批/去买菜/方案卡食材摘要/清单与菜谱弹层、进场确认、onboarding 四步、非常规方案。  
（推荐页上若已有换一批、「去买菜」、食材摘要等，属 Slice 3，此处可忽略不测。）

---

## 本切片验收清单（Slice 3）

**状态：已验收 · 2026-10-08**

**自动化：**

- [x] `npm test` PASS（含 `buildShoppingList`、`buildPlanIngredientSummary`、`buildRecipeSheet`、降权用例）。

**需人工：** Slice 1～3 准备后：

1. [x] 换一批 → `swap`，方案刷新；不写长期降权。
2. [x] 不行 → 可选原因；`reject` + `users.rejectDownranks`。
3. [x] 方案卡右下角一行食材摘要（如 `食材：猪肉、豆腐等2种`）；**无**完整清单、**无**「查看购买清单」入口。
4. [x] 多方案时各自右侧「去买菜」→ `accept` 带该 `planIndex`；**不**写 `meal_logs`；进清单 `accepted=true`（换另一方案再点，清单应对应该方案）。
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

1. [x] **Onboarding**：新用户可走完六步（家庭成员→日常搭配→家庭忌口→城市→菜系→菜式；成员页内多卡、控件样式与「我的」一致）并 `onboardingDone`；也可「暂时跳过」；「我的」可重新打开引导（重走前先清空）。**需部署含 `members[]` 的 `profile`。**
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

## 本切片验收清单（Slice 8）

**状态：待点验**（需索引 + 重新部署 `recommend` / `meals`）

**自动化：**

- [ ] `npm test` PASS（含 `listAccepted`、`planAte`、`planRemoveMealLog`、进场确认 `plan_ate` 排除回归）。

**需人工：** Slice 8 准备后：

1. [ ] **已选菜品入口**：首页「已选菜品」；先「去买菜」至少 1 次 → 列表可见该条（时间 / 场景摘要 / 菜名 chip）。
2. [ ] **点选已吃**：点一道菜打勾 →「已吃记录」出现对应 `plan_ate`；再点取消 → 记录消失；**无**单独提交按钮。
3. [ ] **与其它来源**：若菜已由进场确认 / 手记写入，chip 可显示已勾；再点取消若无 `plan_ate` 行 → 提示去「已吃记录」删除，勾选恢复。
4. [ ] **进场确认**：方案内菜全部点选已吃后，再进「今天菜场」→ 不弹进场确认（或候选不含已点菜）；与既有 `entryConfirmHandled` 收口一致。
5. [ ] **首次提示**：第一次进已选方案有悬浮气泡；关闭后再进只留顶栏小字「点选标记已吃，再点取消」。
6. [ ] **分页**：造 8+ 次采纳 → 首屏 7 条，上拉出现第 8 条及以后。

**本切片不验：** onboarding、广告、语音、方案卡上「再进购买清单」。

---

## 本切片验收清单（Slice 9）

**状态：已验收 · 2026-10-10**

**自动化：**

- [x] `npm test` PASS（含 `members` 年龄/大中小老/访客展开、`dinerSoftPenalty` +40/+15/+10、`homePlans` 用餐人忌口软降权）。

**需人工：** Slice 9 准备后：

1. [x] **「我的偏好」成员 CRUD**：列表可见称呼 / 年龄段 / 口味 / 忌口摘要；顶栏或列表上 `共 N 人 · x大 y小 z老`；可添加、编辑、删除；**无**独立「日常默认人数」编辑；无「已选/已吃」入口（已选在首页）。
2. [x] **人数唯一来源**：增删成员后 `defaultPeopleCount` 与成员数一致；确认页日常初始人数与摘要跟成员列表走（不是旧的固定人数 picker）。
3. [x] **确认页日常三档**：展示大/小/老（与搭配同款三格）；调高 = 当次访客（`members` **不增行**）；调低先减访客再 omit；**不**随档自动改荤素汤。
4. [x] **非日常三档 `partyCounts`**：初始全 0、**不预填档案**；总人数 ≥1 后按总人数推荐搭配（总人数变才刷新建议）；**本场忌口**硬排除仍可用；`partyCounts` 不落库。
5. [x] **推荐软分（§3.0.8）**：日常 = 成员+访客；非日常 = **仅**本场档位默认展开（档案孩子忌口不进亲戚局）；忌口 +40 / 小老辣重口 +15 / 口味冲突 +10；家庭或本场忌口硬排除不变。
6. [x] **引导年龄段**：本人可选五档含 `5–15（小）`、`41–59`、`60+（老）`；日常默认步只展示人数摘要，不编人数。
7. [x] **采纳写回**：日常「去买菜」可写回搭配；**不会**把访客 / `partyCounts` 写入成员表。

**本切片不验：** 学龄前推荐、成员忌口占比配额、广告、语音。

---

## 本切片验收清单（Slice 10）

**状态：已验收 · 2026-10-28**

**自动化：**

- [x] `npm test` PASS（含 `computeProfileGaps`：跳过轻量仍开忌口缺口；`familyAvoidsNone` / 菜系 ConfirmedAt 关闭对应缺口；`recommendBanner === familyAvoidsOpen`）。

**需人工：** Slice 10 准备后：

1. [x] **先逛逛 + 跳过轻量**：忌口空 → 日常确认弹轻量层 → 跳过 → 仍能出方案；进推荐页见顶栏「补一下家庭忌口…」；**无关闭按钮**。
2. [x] **顶栏保存忌口**：点顶栏 → 勾忌口（如猪肉）→「保存并刷新方案」→ `recommend.create` 刷新列表；顶栏消失。
3. [x] **顶栏「我家无忌口」**：另起未表态账号/清忌口字段后 → 顶栏点无忌口 → 顶栏消失；`familyAvoids` 可仍为空且能出方案。（点验说明：无城市时仍须补城市才能确认出方案，视为合理顺带引导；城市占位文案已改为「点此选择城市匹配当地食材」。）
4. [x] **「我的」常驻提醒**：缺口列表不可关；点进对应编辑；「无忌口」「暂无偏好」能消对应项；取消 sheet **不**消提醒。
5. [x] **空方案仍见顶栏**：忌口未表态且推荐空态时，顶栏仍在，可点开快捷补全。
6. [x] **确认页轻量回归**：抽组件后，日常空忌口仍可弹层；保存写出方案；跳过写出方案且**不算**忌口已表态（再进推荐仍见顶栏）。

**本切片不验：** 完整 onboarding 四步文案微调、广告、语音、可关闭「N 天后再提醒」。

---

## 本切片验收清单（Slice 11）

**状态：已验收 · 2026-10-29**

**自动化：**

- [x] `npm test` PASS（含 `aliasMatch` / `homePlans` / `unconventionalPlans`）。

**需人工：** Slice 11 准备后：

1. [x] **推荐别名匹配**：确认页选「鸡脚」（或其它已入表别名）→ 能出主料为「鸡爪」的菜（如红烧鸡爪）；未部署最新 `recommend` 则本项无效。
2. [x] **清单有城**：「我的」城市设为重庆（或其它有货架数据的城）→ 去买菜后勾选格主名为当地叫法、同行灰色副名至多 1 个。
3. [x] **清单无城**：清空城市 → 主名=通用名、副名=别名表该组首项（无别名则无灰字）。
4. [x] **换城丢勾选**：勾选若干项 → 「我的」换城再进同一方案清单 → **勾选清空**（展示文案随新城变即可）。
5. [x] **范围不变**：「看菜谱」弹层 / 方案卡食材 tip **仍为通用名**，不做别名重映射。

**本切片不验：** 确认页搜索别名 UI、看菜谱弹层别名展示、换城保留勾选、广告、语音。

**部署提醒：** 手测推荐匹配前务必上传云函数 `recommend`（含 `data/aliases.json`、`aliasMatch.js`、vendored plans）。

---

## 本切片验收清单（Slice 12）

**状态：站内已验收 · 2026-10-29**（**订阅消息推送 / 点击落地待补验**）

**自动化：**

- [x] `npm test` PASS（含 `feedbackLogic`）。

**需人工：** Slice 12 准备后：

1. [x] **入口**：首页 `link-row` 第三项「建议反馈」；无未读时**无红点**；与「我的偏好」上的**缺口数字角标**并存、互不干扰。
2. [x] **提交**：进列表 → 顶部矮输入区选类型 + 正文 ≤100 字 →（可授权订阅）→「感谢您的反馈」弹窗 → 新卡片置顶。
3. [x] **运营回复（站内）**：控制台 `reply` → 列表可见回复；未授权/未配模板时站内仍可见。
4. [ ] **订阅消息（待补验）**：配好 `FEEDBACK_SUBSCRIBE_TMPL_ID` + 模板后：提交时授权 → 运营 `reply` → 收到订阅消息 → 点击进**首页**再自动进列表（`?openFeedback=1`）。
5. [x] **未读红点**：有未读回复时首页「建议反馈」旁**小圆点、无数字**；列表未读优先（重拉后）；点卡片 / 展开 → 该条红点灭、**列表不立刻重排**。
6. [x] **分页与缓存**：滚动加载更多；7 天内再进用本地缓存；运营 reply 后 `feedbackListEpoch` 失效须重拉。
7. [x] **频控与拒订**：60s 内连提两条 → 第二条被拒；拒绝订阅授权仍可成功提交。

**本切片不验：** 独立写作页 / 详情页、「我的」入口、推荐「不行」链路、广告、语音。

**部署提醒：** 手测前务必上传 `feedback`；reply 推送前对齐 `FEEDBACK_SUBSCRIBE_TMPL_ID` 与模板关键词字段名。

---

## 本切片验收清单（Slice 13）

**状态：已验收 · 2026-10-29**

**自动化：**

- [x] `npm test` PASS（含 `marketScale` / `confirmListFromScale`）。
- [x] （可选）`pytest` 热度 / 分城分档脚本单测 PASS；抽查某城 `small ⊆ medium ⊆ large`（按通用名集合）。

**需人工：** Slice 13 准备后（城市建议设为已有 by-scale 的城，如北京）：

1. [x] **无定位 / 拒权**：不弹规模半屏；进确认页按**中档**名单；入口文案为「默认中菜场 · 切换」（从未选手动档时）。
2. [x] **有定位 · 首次**：进场确认（若有）关闭后**再**出规模半屏（不叠弹）；遮罩点不关；选小/中/大或「默认中菜场」→ 进确认页，名单长度随档变化。
3. [x] **确认页切换**：点「… · 切换」→ 半屏高亮当前 effective；`default_medium` 时中档卡 + 底栏默认态；改档后时令+四季立刻刷新；新旧交集勾选保留，新进时令默认勾、新进四季按忌口默认逻辑。
4. [x] **chip 展示**：有当地名时显示 `displayName`，勾选/推荐仍用通用名。
5. [x] **会话一次**：同会话再次「今天菜场」不重复弹首页半屏；中途切走未选完再回，应能再弹（不因 `onHide` 误锁）。
6. [x] **文案区分**：从未点过「中菜场」的系统默认 →「默认中菜场」；用户点过「中菜场」→「中菜场」。

**本切片不验：** 「我的」内改规模、implies 小类包、无 by-scale 城的旧名单细节、广告、语音。

**部署提醒：** 三者同发；`ingredients` 包内须含同步后的 `data/cities/*/ingredients-by-scale.json`。定位半屏须真机 + 隐私协议。

---

## 本切片验收清单（Slice 14）

**状态：待点验**（需部署 `share` + 重发 `recommend`；建 `plan_shares` / `received_plans` 与索引；真机互测分享）

**自动化：**

- [ ] `npm test` PASS（含 `planShare` / `listAccepted`）。

**需人工：** Slice 14 准备后（建议两微信号：分享人 A / 接收人 B）：

1. [ ] **推荐卡分享**：方案卡旁「分享」→ 微信面板；B 打开落地页见**菜名 + 完整用料**（无步骤、无已买勾选）；未登录 / 无 users 文档也可预览。
2. [ ] **保存幂等**：B「保存到我的」→「已选方案」出现「分享」角标；再保存不双份；按钮变为「已保存到已选方案」。
3. [ ] **快照不可变**：A 换一批或改确认勾选后再分享**同卡槽** → 新批次应拿**新** `shareId`（`swapCount` 进复用键）；**已发出**的旧卡片内容不变。
4. [ ] **收到项锁定**：B 的「分享」条目可点进落地页；**无**分享钮、**无**已吃勾选、**无**去买菜。自产条目仍可分享 + 已吃。
5. [ ] **另两入口**：食材页「分享方案」、已选自产条目「分享」→ 同样落地；路径固定 `/pages/sharedPlan/sharedPlan?shareId=`。
6. [ ] **失效态**：伪造 / 删除快照后打开 → 「分享已失效或不存在」。

**本切片不验：** 社区广场 / Feed / 排行榜、分享封面自定义、快照过期、广告、语音。

**部署提醒：** `share` 与 `recommend`（listAccepted）同发；索引务必含 `plan_shares.shareId` 与带 `sourceSwapCount` 的复用复合索引。

---

## 验收清单（语音）

**状态：前端已下线 · 暂不点验**

- [x] `parseFoodNames` 单测仍 PASS；UI / 插件声明已移除。

**仍延后：** 语音 UI 复开、拍照、激励视频换一批、封面广告。
