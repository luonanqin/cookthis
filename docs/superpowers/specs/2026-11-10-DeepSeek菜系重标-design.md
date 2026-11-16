# DeepSeek 菜系重标

| 项 | 内容 |
|----|------|
| 日期 | 2026-11-10 |
| 状态 | 已确认 |
| 范围 | 用 DeepSeek 对 `recipes-builtin` 中**未标注**与**通用**菜重判 `cuisineTags` |

## 目标

对现有自动/人工里仍为 `[]` 或仅/含 `home_style` 的菜，调用 DeepSeek `deepseek-chat` 尽量给出合理菜系；已有明确地方系的菜不动。

## 规则

1. **候选集**：`cuisineTags` 为空，或规范化后为 `['home_style']` / 含 `home_style`。  
2. **不动**：已有地方系且不含「仅通用」语义的菜（规范化后只有地方系）。  
3. **模型输出**：尽量标注；可多标地方系；空气炸锅 / 烧烤烤制 / 卤菜 → `home_style`；跨很多系也 → `home_style`；实在无依据才 `[]`（提示词要求少用空）。  
4. **本地再归一**：只保留 19 地方系 + `home_style`；含通用或地方系 >5 → 仅 `home_style`（与编辑器一致）。  
5. **API**：`https://api.deepseek.com`，`model: deepseek-chat`，密钥 `DEEPSEEK_API_KEY`。  
6. **安全**：默认 dry-run；`--apply` 写回；支持 `--limit`、`--batch`、断点续跑。

## 非范围

- 不改推荐逻辑 / 词表  
- 不自动导出 for-import / 导云库  

## 验收

- dry-run 打印变更摘要且不改文件  
- `--apply` 后未标注+通用被更新；原地方系菜 tags 不变  
- 非法 code 被丢弃；>5 地方系收成通用  
