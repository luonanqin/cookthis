# 下厨房菜谱灌入 recipes-builtin

日期：2026-11-04  
状态：已定稿（对话确认方案 1 + 合并策略 C）

## 目标

1. 用 `review-titles-over-6.txt` 把 `xiachufang-category-results.cleaned.json` 里的菜名换成清洗名，并用 `dish-ingredients.txt` 补全 `ingredients`。  
2. 按菜名合并进 `recipes-builtin.json`（同名覆盖字段；无同名则追加；旧菜保留）。  
3. 再跑 `import-recipes.js` 生成云库 JSONL。

## 规则

### cleaned JSON

- 映射：`原菜名 → 清洗菜名`（over-6 末列；同原名多行一致）。  
- 命中则改 `title`；若清洗名在 dish-ingredients，用其完整用料**替换**该 recipe 的 `ingredients`。  
- 同一清洗菜名挂在多个条目食材下时，**每条**都写同一份完整用料。  
- 未命中映射或无食材行：保留原样。  
- **长名过滤**：菜名 >6 字且不在 `review-titles-over-6.txt`（原菜名∪清洗菜名）→ 从 cleaned 删除；空条目食材键去掉。  
- 本期不改 `xiachufang-search-results.cleaned.json`。

### recipes-builtin

- 源：`dish-ingredients.txt`（菜名 / 顿号食材 / 口味）。  
- 主料 vs 调料：名 ∈ by-category「调味」或 builtin `kind=seasoning` → seasonings，其余 → mainIngredients。  
- 食材经 `aliases` 归一到通用名；归一后仍不在 ingredients-builtin 名表 → 该菜跳过并记报告。  
- 同名去重：保留 **主料+调料条数更多** 的一条；并列保留先出现。  
- 与旧 builtin 合并（策略 C）：同名用新记录覆盖可变字段（保留旧 `id` 若存在）；新名追加新 `id`。  
- `tasteTags`：清淡→`light`；重口味→`heavy`（菜名含「辣」再加 `spicy`）；正常→`normal`。  
- `meatVeg` / `dishForms` / `stapleForms`：菜名关键词启发式；缺省 `stir_fry` + 按主料是否荤类判 meat/veg。  
- 缺省：`cities=[]`，`minutes`/`servings` 默认，`enabled=true`，`cuisineTags=["home_style"]`。

## 脚本

`scripts/merge-xiachufang-dishes-into-recipes.js`（核心逻辑在 `scripts/lib/`），单测 `scripts/tests/`。
