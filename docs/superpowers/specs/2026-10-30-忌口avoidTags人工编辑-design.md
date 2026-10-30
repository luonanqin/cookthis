# 忌口 avoidTags 人工编辑（扩 alias-editor）

日期：2026-10-30  
状态：已实现（见 plans/2026-10-30-忌口avoidTags人工编辑.md）  
实现计划：[`../plans/2026-10-30-忌口avoidTags人工编辑.md`](../plans/2026-10-30-忌口avoidTags人工编辑.md)  
相关：画像详设 §2.3 忌口词表；`ingredients-builtin.json` 的 `avoidTags`；`ingredients-major-minor.json`；`tools/alias-editor`

## 目标

- 人工维护「通用名 → 一个或多个忌口大类 code」，供推荐硬排除。  
- 菜谱/清单**展示小类名**（五花仍显示五花，不改成猪肉）。  
- **本期不做** implies（勾选猪肉当有五花）。

## 决策摘要

| 项 | 决定 |
|----|------|
| 形态 | 扩现有 `tools/alias-editor`（方案 B）：Tab「别名」+ Tab「忌口」 |
| 忌口底稿 | `data/catalog/ingredients-major-minor.json`；勾选/拖拽**即时写盘** |
| 食材名源 | 「从 all 同步」用 `ingredients-all.json` 补新名（已有归属不冲） |
| 池内名字 | 当前 category 下别名分组的**通用名**（读 `aliases-editor.json` / `aliases.json`） |
| 忌口组 | 画像固定词表 code：`pork` / `seafood` / `offal` / `coriander` / `peanut` / `dairy`（与「我的」一致；不含 `other`） |
| 导出 | 按钮写回 `ingredients-builtin.json` 的 `avoidTags`；不直接写云库 |

## 1. 忌口 Tab 交互

```
[品类 category 导航]     （如肉类、水产…；与别名侧 / by-category 对齐）
        ↓
[通用名池]               该品类下各别名组的 canon 芯片，可拖
        ↓ 选中某一忌口组
[忌口组区域]             展示该 code 下已收入的通用名；可拖入 / 拖出
```

规则：

1. 先选 **category** → 刷新通用名池。  
2. 再选 **忌口组**（chip 或侧栏）→ 右侧/下方区域只显示该组已有成员。  
3. 池 → 组：加入该忌口 code；组 → 池（或拖出组外）：从该 code 移除。  
4. 同一通用名可属于多个忌口组（先加入 pork，再切 seafood 再拖入）。  
5. 每次拖拽成功立即 `PUT` 保存 major-minor 底稿。

## 2. 底稿怎么记

在 `ingredients-major-minor.json` 增加（或写满）与忌口编辑相关的结构，**不破坏**现有 `categories[].groups[].children`（仍可供确认页/implies 后用）。

推荐并列字段（实现时可微调键名，产品语义如下）：

```jsonc
{
  "avoidVocab": [
    { "id": "pork", "label": "猪肉类" },
    { "id": "seafood", "label": "海鲜" }
    // …
  ],
  "avoidMembers": {
    "pork": ["猪肉", "五花肉", "排骨"],
    "seafood": ["带鱼", "虾"]
  }
}
```

- `avoidMembers[code]` = 通用名列表（有序可稳）。  
- 「从 all 同步」：把 all 里新出现、且能归到某 category 的名，确保出现在别名侧未分组/新组逻辑之外——忌口 Tab 只关心：同步后通用名池能看到新 canon；**不**自动塞进任何 `avoidMembers`。  
- 若某 canon 尚无别名组：池中仍可显示该名（自身当 canon），避免新名无法标注。

可选：保存时把 `avoidMembers` 投影进对应 `group.id === code` 的 `children`（仅当 group 已存在），便于一份文件两用；**投影不得改展示名**，且多标签名可出现在多个 group。若与现有 children 冲突，以 `avoidMembers` 为忌口真源，投影策略在实现计划里写死一种。

## 3. 导出 → builtin

按钮「导出到 builtin」：

1. 读 `avoidMembers` + 别名表。  
2. 对每个 code、每个通用名 N：  
   - 令集合 S = `{N} ∪ aliases[N]`（无别名则仅 N）。  
   - 对 S 中每个表面名，在 `ingredients-builtin.json` 找 `name` 命中的条目，把该 `code` **并入** `avoidTags`（去重）。  
3. 以底稿为忌口真源——导出时对 builtin **所有条目**重算：  
   - 若名（或其所在别名组的 canon）落在某 `avoidMembers` → `avoidTags` = 对应 code 列表；  
   - 否则 → `avoidTags: []`（避免留下过时标签）。  
   导出报告：更新条数、builtin 无条目而底稿有名的名单（需补入库）。

4. 云库：沿用现有 ingredients 导入/同步；本工具不写云。

## 4. 与别名 Tab 共存

- 默认 Tab：别名（现有行为不变）。  
- 忌口 Tab 只读别名稿的「品类 → 组 → 通用名」；**不在忌口 Tab 改别名结构**。  
- 服务：同 `server.py` 增 API（如 `GET/PUT major-minor`、`POST sync-all-names`、`POST export-avoid-tags`）。

## 5. 非目标

- implies 可用集、确认页只展示大类的运行时逻辑  
- 忌口组增删改词表（词表跟小程序「我的」固定列表；改词表须改代码+本文）  
- `other` + `avoidNote`  
- 自动从菜名推断忌口  

## 6. 成功标准

- 选肉类 → 见猪肉相关通用名；选猪肉类忌口组 → 可拖入五花；保存后刷新仍在。  
- 同一名可进猪肉类+内脏等两组。  
- 导出后 builtin 中五花/排骨等 `avoidTags` 含 `pork`；展示 `name` 仍为五花。  
- 推荐硬排除：家庭勾 pork 后，主料为五花且已标 tag 的菜被丢掉（数据导入云库后验）。

## 文档锚点

- 本设计  
- `doc/需求概述.md` 忌口 / 大小类后置项  
- 画像 §2.3  
- `tools/alias-editor/README.md`（实现后补忌口 Tab 说明）  
