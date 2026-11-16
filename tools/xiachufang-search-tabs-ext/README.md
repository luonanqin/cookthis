# 下厨房搜索页批量采集（Chrome 扩展）

手动打开多个 [www 搜索页](https://www.xiachufang.com/search/?keyword=猪腱&cat=1001)，一点触发：读取**当前窗口**所有搜索标签页的菜名、「做过」人数，以及卡片上的食材摘要（带 `…` 时丢掉紧挨省略号的残缺项）。

与 `xiachufang-popularity-ext` **相互独立**：不写入、不合并它的 `xiachufang-*-results.json`。

## 落盘（两个固定文件，持续累积）

目录：`data/recipes/xiachufang/search-tabs/`

| 文件 | 作用 |
|------|------|
| `search-tab-results.json` | 按搜索词持续记录菜名 + 做过人数；同关键词再次采集则**覆盖该键** |
| `search-tab-progress.json` | 已查过的关键字列表（`searched`） |

## 安装

1. Chrome → `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序** → 选本目录  
2. 另开终端：

```bash
# 落盘服务在扩展目录外，避免生成 __pycache__ 导致 Chrome 无法加载扩展
python3 tools/xiachufang-search-tabs-save/save-server.py
```

默认 `http://127.0.0.1:18766`（与 popularity 的 18765 分开）。改代码后请**重新加载扩展**；若 save-server 已在跑，请用上面新路径重启。

## 用法

1. 手动打开约 10 个 `https://www.xiachufang.com/search/?keyword=…` 标签页（同一窗口）  
2. 点扩展 → **采集本窗口全部搜索页** → 立刻 merge 进上述两个文件  
3. 改关键词 / 刷新后再点一次，继续往同一份结果里累加  
4. **同一关键字**出现在多个标签页、或与历史结果合并时：按**菜名去重**（保留做过人数更高的一条）

只采集**当前已加载**列表，不点「加载更多」。遇验证码页会跳过并在 popup 报错。

## 结果格式

`search-tab-results.json`：

```json
{
  "updatedAt": "…",
  "items": {
    "猪腱": {
      "url": "https://www.xiachufang.com/search/?keyword=猪腱&cat=1001",
      "scrapedAt": "…",
      "recipes": [
        {"title":"红烧猪腱","count":1234,"ingredients":["猪腱","姜","盐"]}
      ]
    }
  }
}
```

`search-tab-progress.json`：

```json
{
  "updatedAt": "…",
  "searched": ["猪腱", "五花肉"]
}
```
