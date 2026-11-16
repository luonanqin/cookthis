# 美团录屏停稳抽帧 + 批 OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从美团录屏视频抽出「停稳 >0.2s」的全屏帧（帧不去重），再批 OCR，仅对清洗后菜名去重，产出菜名列表。

**Architecture:** 纯函数层负责静止检测与去重；`extract_still_frames.py` 读视频写 JPG；`ocr_video_frames.py` 复用 `ocr_products` 对帧目录批识别并写 `ocr_raw.jsonl` + `dishes.txt`。不改现有回车抓屏流水线。

**Tech Stack:** Python 3、OpenCV（读视频/帧差）、Pillow、现有 RapidOCR（`ocr_products.py`）、pytest。

## Global Constraints

- 停稳判定：连续静止 **> 0.2s**（默认 `min_still_s=0.2`）
- 帧级 **不做** 内容去重；同一段持续静止只存 **1** 张（进入停稳瞬间）；再滑再停再存
- OCR 结果去重在全部帧识别之后；保序
- 代码放在 `tools/meituan-automator/`；产出默认在 `screenshots_inbox/_from_video/`（已在 `.gitignore`）
- 不自动写入 `recipes-builtin`；本版不做实时截屏 / Appium 滑动
- 除非用户明确要求，**不要 git commit**

---

## File Structure

| 文件 | 职责 |
|------|------|
| `tools/meituan-automator/still_frames.py` | 静止检测纯逻辑：`frame_diff`、`iter_still_capture_indices` |
| `tools/meituan-automator/extract_still_frames.py` | CLI：视频 → `frame_XXXX.jpg` |
| `tools/meituan-automator/ocr_video_frames.py` | CLI：帧目录 → `ocr_raw.jsonl` + `dishes.txt` |
| `tools/meituan-automator/tests/test_still_frames.py` | 静止检测单测（合成帧序列） |
| `tools/meituan-automator/tests/test_ocr_video_dedupe.py` | 跨帧菜名保序去重单测 |
| `tools/meituan-automator/requirements.txt` | 增加 `opencv-python-headless` |
| `tools/meituan-automator/README.md` | 补充录屏抽帧 + 批 OCR 用法 |
| `docs/superpowers/specs/2026-11-06-meituan-video-still-ocr-design.md` | 状态改为已确认/实现中 |

---

### Task 1: 静止检测纯逻辑 + 单测

**Files:**
- Create: `tools/meituan-automator/still_frames.py`
- Create: `tools/meituan-automator/tests/test_still_frames.py`
- Modify: `tools/meituan-automator/requirements.txt`（追加 `opencv-python-headless>=4.8.0`）

**Interfaces:**
- Produces:
  - `frame_mean_abs_diff(prev_gray_small, curr_gray_small) -> float`
  - `downsample_gray(bgr_or_gray, width: int = 160) -> ndarray`（灰度、缩宽，高按比例）
  - `iter_still_capture_indices(*, diffs: list[float], fps: float, min_still_s: float = 0.2, diff_threshold: float = 2.5) -> list[int]`  
    输入为相邻帧差分序列（长度 = 帧数−1）；返回应保存的**帧下标**（0-based）。规则：当连续「diff < threshold」的时长 **>** `min_still_s` 时，在该静止段**首次满足时长**的那一帧索引处记一次 capture；该段内不再重复；出现 diff ≥ threshold 结束该段。

- [ ] **Step 1: 写失败单测**

```python
# tools/meituan-automator/tests/test_still_frames.py
from still_frames import iter_still_capture_indices


def test_capture_after_min_still_exceeded():
    # fps=10 → 0.2s = 2 帧间隔；需要连续 >2 个低 diff 才采
    # diffs 长度 10：帧 0..10
    # 动(高) 静 静 静 动 静 静 静 动 动
    high, low = 10.0, 0.5
    diffs = [high, low, low, low, high, low, low, low, high, high]
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=10.0, min_still_s=0.2, diff_threshold=2.5
    )
    # 第一段静止：diffs[1], [2], [3] 低 → 在累计 >0.2s 时采（第 3 个低 diff 对应进入帧 index 3）
    # 第二段：diffs[5],[6],[7] → 采 index 7
    assert idxs == [3, 7]


def test_exact_point_two_seconds_not_enough_need_greater():
    # 恰好 0.2s（2 个间隔 @10fps）不算；要 >0.2s
    high, low = 10.0, 0.5
    diffs = [high, low, low, high]  # 仅 0.2s 静止
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=10.0, min_still_s=0.2, diff_threshold=2.5
    )
    assert idxs == []


def test_long_still_only_one_capture():
    low = 0.5
    diffs = [low] * 20
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=10.0, min_still_s=0.2, diff_threshold=2.5
    )
    assert idxs == [2]  # 第 3 个低 diff 后首次满足 >0.2s，帧 index=2
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd tools/meituan-automator && .venv/bin/python -m pytest tests/test_still_frames.py -v`  
（若无 venv：`python3 -m pytest …`）  
Expected: FAIL（`still_frames` 未找到或函数未实现）

- [ ] **Step 3: 实现 `still_frames.py`**

```python
"""录屏帧静止检测：差分 + 停稳捕获下标。"""
from __future__ import annotations

import numpy as np


def downsample_gray(frame, width: int = 160):
    import cv2

    if frame.ndim == 3:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    else:
        gray = frame
    h, w = gray.shape[:2]
    if w <= 0 or h <= 0:
        raise ValueError("empty frame")
    nh = max(1, int(round(h * (width / w))))
    return cv2.resize(gray, (width, nh), interpolation=cv2.INTER_AREA)


def frame_mean_abs_diff(prev_small, curr_small) -> float:
    a = prev_small.astype(np.float32)
    b = curr_small.astype(np.float32)
    return float(np.mean(np.abs(a - b)))


def iter_still_capture_indices(
    *,
    diffs: list[float],
    fps: float,
    min_still_s: float = 0.2,
    diff_threshold: float = 2.5,
) -> list[int]:
    if fps <= 0:
        raise ValueError("fps must be positive")
    out: list[int] = []
    run = 0
    captured_this_run = False
    for i, d in enumerate(diffs):
        if d < diff_threshold:
            run += 1
            # run 个间隔 → 时长 run/fps；帧下标 = i+1（diff[i] 连接 frame i 与 i+1，静止段末端帧为 i+1）
            # 与单测约定对齐：diffs[k] 为帧 k→k+1；连续低 diff 的帧下标用「当前右端帧」i+1
            duration = run / fps
            if duration > min_still_s and not captured_this_run:
                out.append(i + 1)
                captured_this_run = True
        else:
            run = 0
            captured_this_run = False
    return out
```

**注意：** 实现时必须让单测断言的下标语义一致。若 Step 4 失败，只改 `iter_still_capture_indices` 的下标计算或微调单测注释，使「> min_still_s 首次满足时采右端帧」语义清晰且两处一致。推荐语义（写进函数 docstring）：

- `diffs[i]` = 帧 `i` 与帧 `i+1` 的差  
- 连续低差从 `diffs[s]…diffs[s+run-1]`，时长 `run/fps`  
- 首次 `run/fps > min_still_s` 时，捕获帧下标 **`s + run`**（即 `i+1`，当 `i` 为当前 diff 下标）

按此语义重算单测期望：

- fps=10，min_still=0.2 → 需 `run >= 3`（3/10=0.3>0.2）  
- `diffs=[H,L,L,L,H,L,L,L,H,H]` → 第一段 L 在 index 1,2,3 → run 到 3 时 i=3，捕获 `4`？  
  若右端帧为 i+1：捕获 4 与 8。

**校正单测期望为与 docstring 一致后再实现**，避免模糊：

```python
assert idxs == [4, 8]   # run=3 时 i=3 → frame 4；第二段 i=7 → frame 8
# exact 0.2s: diffs=[H,L,L,H] → run max 2 → 2/10=0.2 不 > → []
# long still: 20 个 L → 首次 run=3 时 i=2 → frame 3 → idxs == [3]
```

把 Step 1 的断言改成上面这组后再写实现。

- [ ] **Step 4: 跑测通过**

Run: `cd tools/meituan-automator && .venv/bin/pip install -q opencv-python-headless && .venv/bin/python -m pytest tests/test_still_frames.py -v`  
Expected: PASS

---

### Task 2: `extract_still_frames.py` CLI

**Files:**
- Create: `tools/meituan-automator/extract_still_frames.py`

**Interfaces:**
- Consumes: `downsample_gray`, `frame_mean_abs_diff`, `iter_still_capture_indices` from `still_frames`
- Produces: 目录下 `frame_0001.jpg`, `frame_0002.jpg`, …（1-based 四位编号）；打印捕获数量与输出路径

- [ ] **Step 1: 实现 CLI**

```python
#!/usr/bin/env python3
"""从录屏抽出停稳帧（默认连续静止 >0.2s；帧内容不去重）。"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2

from still_frames import (
    downsample_gray,
    frame_mean_abs_diff,
    iter_still_capture_indices,
)

DEFAULT_ROOT = Path(__file__).resolve().parent / "screenshots_inbox" / "_from_video"


def extract_still_frames(
    video: Path,
    out_dir: Path,
    *,
    min_still_s: float = 0.2,
    diff_threshold: float = 2.5,
    sample_width: int = 160,
) -> list[Path]:
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频：{video}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 1e-6:
        fps = 30.0
    prev_small = None
    diffs: list[float] = []
    frames_bgr: list = []  # 内存可能大；改为只存路径策略见下
    # 实现时不要把所有帧留在内存：第一遍只算 diffs + 用临时索引；
    # 更稳：一遍流式记录 (frame_index, small) diffs，同时把每一帧写到
    # out_dir / _all / 不现实。
    # 采用两遍：第一遍算 diffs 与 fps；第二遍按 capture indices 再读并写 JPG。
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = downsample_gray(frame, sample_width)
        if prev_small is not None:
            diffs.append(frame_mean_abs_diff(prev_small, small))
        prev_small = small
    cap.release()
    idxs = iter_still_capture_indices(
        diffs=diffs, fps=fps, min_still_s=min_still_s, diff_threshold=diff_threshold
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    if not idxs:
        return written
    cap = cv2.VideoCapture(str(video))
    want = set(idxs)
    i = 0
    n = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i in want:
            n += 1
            path = out_dir / f"frame_{n:04d}.jpg"
            cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            written.append(path)
        i += 1
    cap.release()
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description="录屏停稳抽帧（>0.2s，帧不去重）")
    ap.add_argument("video", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--min-still", type=float, default=0.2)
    ap.add_argument("--diff-threshold", type=float, default=2.5)
    args = ap.parse_args()
    video = args.video.expanduser().resolve()
    out = args.out or (DEFAULT_ROOT / video.stem)
    paths = extract_still_frames(
        video, out, min_still_s=args.min_still, diff_threshold=args.diff_threshold
    )
    print(f"fps 判定完成 → 写出 {len(paths)} 帧到 {out}")


if __name__ == "__main__":
    main()
```

（实现文件时按上面逻辑整理 import/格式；两遍读视频避免占满内存。）

- [ ] **Step 2: 冒烟（无视频可跳过写文件，用短合成视频）**

```bash
cd tools/meituan-automator
.venv/bin/python - <<'PY'
import cv2, numpy as np
from pathlib import Path
p = Path('_tmp_smoke.mp4')
w,h,fps=320,240,10
fourcc=cv2.VideoWriter_fourcc(*'mp4v')
vw=cv2.VideoWriter(str(p),fourcc,fps,(w,h))
# 5 动 + 5 静 + 5 动 + 5 静
for phase, color in [(5,(0,0,255)),(5,(0,255,0)),(5,(255,0,0)),(5,(0,255,0))]:
    for i in range(phase):
        # 动：每帧变色；静：同色
        if phase==5 and color==(0,0,255):
            img=np.full((h,w,3), (i*40)%255, np.uint8)
        elif phase==5 and color==(255,0,0):
            img=np.full((h,w,3), ((i*40)+80)%255, np.uint8)
        else:
            img=np.zeros((h,w,3), np.uint8); img[:]=color
        vw.write(img)
vw.release()
print(p.resolve())
PY
.venv/bin/python extract_still_frames.py _tmp_smoke.mp4 --out /tmp/still_smoke
ls /tmp/still_smoke
```

Expected: 至少 1–2 张 `frame_*.jpg`（对应两段静）。

---

### Task 3: 跨帧去重 + `ocr_video_frames.py`

**Files:**
- Create: `tools/meituan-automator/tests/test_ocr_video_dedupe.py`
- Create: `tools/meituan-automator/ocr_video_frames.py`

**Interfaces:**
- Consumes: `ocr_image`, `extract_product_names`, `clean_product_name`, `build_record`, `append_jsonl`, `resolve_ocr_engine`, `OCR_ENGINES` from `ocr_products`
- Produces:
  - `dedupe_preserve_order(names: list[str]) -> list[str]`
  - 输出 `ocr_raw.jsonl`（每帧一条 `build_record`）与 `dishes.txt`（全局 after 保序去重，一行一个）

- [ ] **Step 1: 去重单测**

```python
# tools/meituan-automator/tests/test_ocr_video_dedupe.py
from ocr_video_frames import dedupe_preserve_order


def test_dedupe_preserve_order():
    assert dedupe_preserve_order(["青椒肉丝", "鱼香肉丝", "青椒肉丝", "米饭"]) == [
        "青椒肉丝",
        "鱼香肉丝",
        "米饭",
    ]


def test_dedupe_skips_empty():
    assert dedupe_preserve_order(["", "A", "", "A", "B"]) == ["A", "B"]
```

- [ ] **Step 2: 跑测确认失败** → 再实现

```python
def dedupe_preserve_order(names: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        t = (n or "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out
```

- [ ] **Step 3: 实现 `ocr_video_frames.py` main**

```python
#!/usr/bin/env python3
"""对抽帧目录批 OCR，写 ocr_raw.jsonl + 去重后 dishes.txt。"""
from __future__ import annotations

import argparse
from pathlib import Path

from ocr_products import (
    OCR_ENGINES,
    append_jsonl,
    build_record,
    clean_product_name,
    extract_product_names,
    ocr_image,
    resolve_ocr_engine,
)

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def dedupe_preserve_order(names: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        t = (n or "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="抽帧目录批 OCR → dishes.txt")
    ap.add_argument("frames_dir", type=Path)
    ap.add_argument("--ocr", choices=OCR_ENGINES, default=None)
    ap.add_argument("--scale", type=int, default=2)
    args = ap.parse_args()
    frames_dir = args.frames_dir.expanduser().resolve()
    engine = resolve_ocr_engine(args.ocr)
    paths = sorted(
        p for p in frames_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXT and p.name.startswith("frame_")
    )
    raw_jsonl = frames_dir / "ocr_raw.jsonl"
    dishes_txt = frames_dir / "dishes.txt"
    if raw_jsonl.exists():
        raw_jsonl.unlink()
    all_after: list[str] = []
    print(f"OCR 引擎：{engine}；共 {len(paths)} 帧")
    for path in paths:
        print(f"=== {path.name} ===")
        try:
            raw = ocr_image(path, scale=args.scale, engine=engine)
            before = extract_product_names(raw)
            rec = build_record(path, before)
        except Exception as e:
            print(f"失败：{e}")
            continue
        append_jsonl(raw_jsonl, rec)
        all_after.extend(rec["after"])
        print(f"  after: {rec['after']}")
    dishes = dedupe_preserve_order(all_after)
    dishes_txt.write_text("\n".join(dishes) + ("\n" if dishes else ""), encoding="utf-8")
    print(f"去重后 {len(dishes)} 个菜名 → {dishes_txt}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 跑去重单测**

Run: `cd tools/meituan-automator && .venv/bin/python -m pytest tests/test_ocr_video_dedupe.py tests/test_still_frames.py -v`  
Expected: 全部 PASS

---

### Task 4: README + spec 状态

**Files:**
- Modify: `tools/meituan-automator/README.md`（在「半自动截图采集」后新增一节）
- Modify: `docs/superpowers/specs/2026-11-06-meituan-video-still-ocr-design.md`（状态 → 已确认并实现）

- [ ] **Step 1: README 增加用法**

```markdown
## 录屏停稳抽帧 + 批 OCR

手机美团滑菜单时录屏（滑—停—滑—停）。事后：

```bash
cd tools/meituan-automator
.venv/bin/pip install -r requirements.txt
.venv/bin/python extract_still_frames.py /path/to/record.mp4
# 默认写出 screenshots_inbox/_from_video/{视频名}/frame_XXXX.jpg
# 停稳阈值默认 >0.2s；帧内容不去重

.venv/bin/python ocr_video_frames.py screenshots_inbox/_from_video/{视频名}
# → 同目录 ocr_raw.jsonl（每帧）+ dishes.txt（清洗后保序去重）
```

可选：`extract_still_frames.py --min-still 0.2 --diff-threshold 2.5 --out DIR`
```

- [ ] **Step 2: 更新 design 状态行为「已确认并实现」**

- [ ] **Step 3: 全量相关测试再跑一遍**

Run: `cd tools/meituan-automator && .venv/bin/python -m pytest tests/test_still_frames.py tests/test_ocr_video_dedupe.py -v`  
Expected: PASS

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| 停稳 >0.2s | Task 1–2 |
| 帧不去重；一段静只 1 张 | Task 1 |
| 全部抽完再 OCR | Task 2 → 3 分离 |
| OCR 后去重 | Task 3 |
| 复用 RapidOCR / meituan-automator | Task 3 |
| README | Task 4 |
| 不写 recipes-builtin / 不做实时 | 全局约束，无任务违背 |
