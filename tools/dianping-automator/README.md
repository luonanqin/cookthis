# 大众点评 UI 自动化（验证用）

控件记录见 [LOCATORS.md](./LOCATORS.md)。

## 环境

- Appium 服务：`appium`（默认 `http://127.0.0.1:4723`）
- 手机已连上 adb：`adb devices` 可见设备（默认无线，见 `config.py` 的 `UDID`）
- 无线：`adb connect 192.168.31.21:5555`；信号不好把 `UDID = UDID_USB` 即可切回有线
- 本目录使用独立 venv（勿往系统 Python 硬装包）

```bash
cd tools/dianping-automator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## P1 冒烟：搜菜系进第一家店

流程：首页 → 搜「川菜」→ 点第一家 `shop_item_shop_view` → 等到「打卡」→ 截图。

```bash
source .venv/bin/activate
# 改搜索词：编辑 smoke_search_shop.py 里的 SEARCH_CUISINE
python smoke_search_shop.py
```

截图：`screenshots/p1_shop_川菜.png`

---

## P2 冒烟：列表读菜系 → 进店找菜单

**不必事先停在列表页。** 首页或已在搜索结果列表都可以：

- 已在列表：直接读第一家店名/菜系原文 → 进店 → 滚找菜单  
- 在首页：自动搜「川菜」再走上面流程  

```bash
# 首次需系统已装 tesseract（brew install tesseract），venv 内：
# pip install -r requirements.txt
python smoke_p2_menu.py
```

列表第三行若无障碍文案，会对区域 OCR；裁剪图见 `screenshots/debug_third_line_ocr.png`。  
截图：`screenshots/p2_menu_川菜.png`

---

## P3 冒烟：整表下滑按分区读菜名

停在**菜单页**或首页/列表均可。  
进菜单后滑到顶部，再一路向下：按右侧分区标题归入荤/素/汤/主；**主食采完或滑到底**就结束（不点左侧栏）。

```bash
python smoke_p3_dishes.py
```

结果：`screenshots/p3_dishes_sample.json`。

---

## P4 冒烟：翻列表凑满 N 家（默认 2）

首页或搜索列表均可。按店名去重，无菜单跳过，已有 JSON 跳过；成功写入：

`output/{城市}/{店铺菜系}/{店名}.json`

```bash
# 目标家数：改 smoke_p4_shops.py 里 TARGET_SUCCESS（冒烟默认 2）
python smoke_p4_shops.py
```

---

## 正式全流程（P0）

配置在 [`config.py`](./config.py)：31 城 × 19 菜系 × 每系成功 **10** 家。  
请停在**首页**，断开 Inspector。已有 `output/.../店名.json` 会跳过，可中断后续跑。

```bash
python run_matrix.py
```

列表滑到底仍凑不满 10 家则进入下一菜系。目录：`output/{城市}/{标准菜系|其他}/{店名}.json`（不再用 OCR 脏串当目录名）。

若历史目录较乱，可再整理一次：

```bash
python reorganize_output.py
```

各菜系下把店铺菜名汇总成四个文件（可重复执行，覆盖写入）：

```bash
python aggregate_dishes.py
```

生成：`output/{城市}/{菜系}/荤菜.json` 等（暂不清洗，含各店原样拼接）。

从荤菜/素菜汇总里抽出「词表内单一食材」（如猴头菇、土豆丝→土豆、排骨、鸡翅；带配料/手法的不要）：

```bash
python extract_veg_ingredients.py
```

生成：`output/{城市}/{菜系}/素菜_食材.json`、`荤菜_食材.json`（可重复执行）。清洗时会把这些纯食材从 `*_清洗.json` 里去掉。

从 `*_清洗.json` 菜名里最长匹配识别食材，写成 `菜名|食材1+食材2`：

```bash
python annotate_dish_ingredients.py
```

生成：`output/{城市}/{菜系}/荤菜_食材标注.json`（及素菜/汤羹/主食同名后缀，可重复执行）。

中断后续跑：在 `config.py` 设 `RESUME_CITY` / `RESUME_CUISINE`（例如 `"上海"` / `"京菜"`），再执行同上命令。已写入的店会跳过。跑通后把两项改回 `None`。

若出现滑动验证：优先在手机上手动滑完；超过 `CAPTCHA_WAIT_MAX_S` 或单店超过 `SHOP_HANG_TIMEOUT_S` 无响应时，会 **adb 杀掉点评 → 重建会话 → 重开 App**，并从当前城/菜系续跑（`AUTO_RECOVER`）。Appium 服务本身需保持运行。
---

## 多城市美食截图

流程：`上海首页` → 杭州美食截图 → 成都美食截图 → 北京美食截图 → 回上海首页结束（共 3 张图）。

跑之前：

1. 手机停在 **首页**（你说会先回到首页）
2. **关掉 Appium Inspector 的 Session**
3. 终端保持 `appium` 运行中

```bash
source .venv/bin/activate
python smoke_city_food.py
```

截图输出：

- `screenshots/food_杭州.png`
- `screenshots/food_成都.png`
- `screenshots/food_北京.png`
