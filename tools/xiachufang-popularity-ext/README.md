# 下厨房食材采集（Chrome 扩展）

词表来自 `data/catalog/ingredients-all.json`（按名去重）；每项 `categories` 取自 `ingredients-all-by-category.json`（肉类/内脏/火锅…）。在 [下厨房移动站](https://mbdbj.xiachufang.com/) 对每个食材：

- 统计**当前结果页**全部可见菜谱的「做过」人数合计（不点「加载更多」），并给**每道菜**记各自的做过人数 `recipes[].count`
- 记下这些菜谱名；去掉括号及括号内文字后，用全量词表**最长匹配**抽出食材（仅属于「未映射」的调味不参与）
- 已写入进度的食材不再重复搜

## 安装

1. Chrome 打开 `chrome://extensions` → 开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选本目录
3. 打开 https://mbdbj.xiachufang.com/ ，点扩展图标 → **开始**

改代码后版本在 `manifest.json`（当前 **1.4.3**）。重新加载扩展后核对版本号。

**性能（1.4.3）**：结果按食材单条存 `xcfR:*`，页面内内存缓存；采集中每 5 条落盘**不阻塞**下一步。避免整包 `xcfDone` 越写越慢。

**反爬**：读完列表后在结果页 **滚动两次**，再 **`location.href` 直跳** https://mbdbj.xiachufang.com/ ；不点菜谱详情、不用后退/#goback。

**重抓某一条**：popup 输入食材名 → **重抓此食材**。会清掉该条进度、只跑这一项，完成后导出到 `result/`（合并旧文件）并暂停。整表正在跑时需先暂停。

第一次「开始」若发现旧进度（没有 `resultKind`），会清空再按新规则采集。

## 结果保存（写入仓库 `result/`，合并不覆盖）

Chrome 扩展**不能**直接写项目目录，因此用本地小服务落盘：

```bash
python3 tools/xiachufang-popularity-ext/save-server.py
```

- 写入 `tools/xiachufang-popularity-ext/result/` 下固定文件名
- **与已有 JSON 按食材名合并**（本次有的键更新，没有的旧数据保留），避免内存里只有几十条时把磁盘冲掉
- 每次同时在 `result/archive/` 留一份带时间戳的副本
- 若服务未开：退回到浏览器「下载」目录的 `xiachufang-popularity-ext/result/*-时间戳.json`，且 **uniquify 永不覆盖**

popup 顶部「保存」会显示是否已连上服务。

## 结果文件

`xiachufang-ingredient-progress.json` 只记录搜过的食材名：

```json
{ "version": 3, "updatedAt": "…", "searched": ["番茄", "鸡蛋"] }
```

另外四份是 JSON。每个食材只出现一次；菜谱名和抽出的食材在同一个对象里。导出为紧凑格式：`category`/`search` **每个菜谱一行**，`keyword-absent` **每个食材一行**。

```json
{
  "updatedAt": "…",
  "items": {
    "番茄": {
      "categories": ["菜叶"],
      "count": 1200,
      "recipes": [
        {"title": "番茄炒蛋", "count": 800, "ingredients": ["番茄", "鸡蛋"]}
      ]
    }
  }
}
```

| 文件 | 内容 |
|------|------|
| `xiachufang-category-results.json` | 分类页，结构如上 |
| `xiachufang-search-results.json` | 落在 `/search/` 的结果，结构同上，与分类页分开 |
| `xiachufang-no-results.json` | 当前页没有菜谱的食材：`{ "食材": { "categories": [] } }` |
| `xiachufang-keyword-absent.json` | 有菜谱，但菜名（去括号后）都不包含搜索词。只记食材、类别和页面类型；菜谱仍在上面两份结果里 |

## 节奏

- 单步约 1.5–3.5s；食材间约 3–8s；每 5 个有效结果再歇 12–22s
- 无结果不休息，立刻下一项
- 暂停 / 完成 / 「再导出结果」立即下载
- 验证码暂停；卡住回首页重试最多 3 次

## 更新词表

仓库根目录（名来自 all，分类来自 by-category；`extractLexicon` 不含「调味」）：

```bash
python3 -c "
import json
from pathlib import Path
all_doc = json.loads(Path('data/catalog/ingredients-all.json').read_text(encoding='utf-8'))
by = json.loads(Path('data/catalog/ingredients-all-by-category.json').read_text(encoding='utf-8'))
names = set()
for arr in all_doc.get('categories', {}).values():
    names.update(arr or [])
name_cat = {}
for cat, arr in by.get('categories', {}).items():
    for n in arr or []:
        if n and n not in name_cat:
            name_cat[n] = cat
items, lexicon = [], []
for name in sorted(names):
    cat = name_cat.get(name, '调味')
    items.append({'name': name, 'categories': [cat]})
    if cat != '调味':
        lexicon.append(name)
lexicon.sort(key=len, reverse=True)
out = {
  'version': 3,
  'source': 'data/catalog/ingredients-all.json',
  'categorySource': 'data/catalog/ingredients-all-by-category.json',
  'total': len(items),
  'extractNote': 'extractLexicon 不含「调味」分类',
  'items': items,
  'extractLexicon': lexicon,
}
Path('tools/xiachufang-popularity-ext/data/ingredients.json').write_text(
    json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(len(items), len(lexicon))
"
```

然后在 `chrome://extensions` 重新加载本扩展。

**不必删 progress**：`searched` 里已有且仍在 all 中的会跳过；只补 all 里新增、尚未搜过的。不在 all 里的旧关键字应从结果里删掉（并同步清理 progress）。
