# 别名分组编辑器

本地网页维护别名分组，数据写在 `data/catalog/aliases-editor.json`（不直接改 `aliases.json`）。

## 启动

```bash
python3 tools/alias-editor/server.py
```

本机打开 http://127.0.0.1:8765/  
同一局域网其它设备打开启动日志里的 `http://<本机IP>:8765/`（服务已监听 `0.0.0.0`）。若连不上，检查本机防火墙是否放行 8765。

首次启动若尚无 `aliases-editor.json`，会用 `aliases.json` + `ingredients-all-by-category.json` 初始化。不在分类表里的名字进「未分类」。

## 操作

- 左侧切换品类；分组在上，「未分组」在下
- 拖动芯片：换组 / 拖到未分组；点芯片（非通用名）设为通用名
- 右键分组：整组移到其他品类；右键未分组芯片：移到其他品类的未分组（移完仍留在当前品类）
- 「＋ 新建分组」：空组，拖入第一个食材作为通用名
- 「解散」：组内全部回到未分组
- 每次改动自动保存，并写回 `ingredients-all-by-category.json`（人工挪品类会保留，`finish_review` / 同步全量不再冲掉）
- 「同步全量」：按最新 `ingredients-all.json` 刷新品类表，把**新名字**补进各分类「未分组」；**已有别名组不动**；已挪过的品类归属会先写回再刷新
- 「重置初始化」：用当前 `aliases.json` **整表覆盖**编辑稿（会丢掉网页上的拖拽结果，慎用）

## 忌口 Tab

- 数据：`ingredients-major-minor.json` 的 `avoidVocab` / `avoidMembers`（词表以文件为准；代码六码仅空文件种子）
- 「+ 忌口组」：只填中文名，自动分配 `id`（`gN`）；chip 上 × 确认后整组删除（含成员）
- 保存成员时**不**把词表打回硬编码六码；小程序「我的」偏好词表暂不动
- 「从 builtin 灌入」：按**当前**词表 ids 反填（忽略词表外如 lamb）；不重置自定义 vocab
- 「导出到 builtin」：按底稿全量重算 avoidTags（别名表面名一并打标）；不写云库
- 导入云库仍走现有 ingredients 导入脚本
- 「同步全量」在忌口态同样可用：补池内新名，不自动进忌口组

## 导回 aliases.json（供云函数 / 小程序）

确认编辑稿后：

```bash
python3 scripts/export-aliases-from-editor.py
node scripts/sync-alias-runtime-data.js
```

- 源稿：`data/catalog/aliases-editor.json`
- 规范表：`data/catalog/aliases.json`
- **部署云函数 `recommend` 时带上的是**：`cloudfunctions/recommend/data/aliases.json`（由上面 sync 从规范表拷贝；`_shared` / 小程序也会同步）
