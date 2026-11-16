# 下厨房搜索页采集 — 落盘服务

与 Chrome 扩展目录分开，避免 `__pycache__` 导致扩展无法加载。

```bash
python3 tools/xiachufang-search-tabs-save/save-server.py
```

写入：`data/recipes/xiachufang/search-tabs/search-tab-results.json` + `search-tab-progress.json`  
端口：`127.0.0.1:18766`
