#!/usr/bin/env python3
"""标完 pending 后一次跑完：写入标记 → 清洗 → 城货架与全量 → 别名表。

  .venv/bin/python finish_review.py

子脚本仍可单独调用（测试、只洗一城、只刷新 pending、只刷品类、只刷别名）。
`build_ingredient_catalog.py` 在写出 `ingredients-all.json` 后会同步刷新
`ingredients-all-by-category.json`；也可单独跑 `ingredients_by_category.py`。
`build_aliases.py` 依据 alias-info + ingredients-all 同义 − reject 重写 aliases.json。
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = (
    "apply_pending_marks.py",
    "clean_city_products.py",
    "build_ingredient_catalog.py",
    "build_aliases.py",
)


def main() -> None:
    py = sys.executable
    for name in STEPS:
        print(f"\n=== {name} ===")
        result = subprocess.run([py, str(HERE / name)], check=False)
        if result.returncode != 0:
            raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
