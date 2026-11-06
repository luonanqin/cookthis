#!/usr/bin/env python3
"""等某个像素相对基线变色。

整段轮询在手机里跑：本地 screencap，只回传结果行。

用法:
  # 相对坐标（加载弹层）
  wait_pixel.py <udid> --fx 0.5 --fy 0.42

  # 绝对坐标（订场按钮）
  wait_pixel.py <udid> --x 956 --y 2059 --no-bright
"""

from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("udid")
    ap.add_argument("--timeout", type=float, default=8.0)
    ap.add_argument("--interval", type=float, default=0.1)
    ap.add_argument("--fx", type=float, default=None)
    ap.add_argument("--fy", type=float, default=None)
    ap.add_argument("--x", type=int, default=None, help="绝对像素 x")
    ap.add_argument("--y", type=int, default=None, help="绝对像素 y")
    ap.add_argument("--delta", type=int, default=80)
    ap.add_argument("--bright", type=int, default=180)
    ap.add_argument(
        "--no-bright",
        action="store_true",
        help="只用色差判断，不用亮度提前结束",
    )
    ap.add_argument(
        "--red-ready",
        action="store_true",
        help="订场按钮：已是偏红（可点）则立刻 READY，不必等再变色",
    )
    args = ap.parse_args()

    use_abs = args.x is not None and args.y is not None
    if use_abs:
        fx1000, fy1000 = 0, 0
        abs_x, abs_y = args.x, args.y
    else:
        fx = args.fx if args.fx is not None else 0.5
        fy = args.fy if args.fy is not None else 0.42
        fx1000, fy1000 = int(fx * 1000), int(fy * 1000)
        abs_x, abs_y = -1, -1

    timeout_ms = max(1, int(args.timeout * 1000))
    interval_us = max(20, int(args.interval * 1000)) * 1000
    use_bright = 0 if args.no_bright else 1
    red_ready = 1 if args.red_ready else 0

    ondevice = f"""
CAP=/data/local/tmp/jiushi_cap.raw
DELTA={args.delta}
BRIGHT={args.bright}
USE_BRIGHT={use_bright}
RED_READY={red_ready}
TIMEOUT_MS={timeout_ms}
INTERVAL_US={interval_us}
FX1000={fx1000}
FY1000={fy1000}
ABS_X={abs_x}
ABS_Y={abs_y}

read_rgb() {{
  screencap "$CAP" || return 1
  W=$(od -An -tu4 -N4 -j0 "$CAP" | tr -d ' \\n')
  H=$(od -An -tu4 -N4 -j4 "$CAP" | tr -d ' \\n')
  if [ "$ABS_X" -ge 0 ]; then
    X=$ABS_X
    Y=$ABS_Y
  else
    X=$((W * FX1000 / 1000))
    Y=$((H * FY1000 / 1000))
  fi
  [ "$X" -ge "$W" ] && X=$((W - 1))
  [ "$Y" -ge "$H" ] && Y=$((H - 1))
  [ "$X" -lt 0 ] && X=0
  [ "$Y" -lt 0 ] && Y=0
  OFF=$((12 + (Y * W + X) * 4))
  set -- $(od -An -tu1 -N3 -j$OFF "$CAP")
  R=$1; G=$2; B=$3
  LUM=$(( (R + G + B) / 3 ))
  echo "$W $H $X $Y $R $G $B $LUM"
}}

is_red_btn() {{
  # 可点红按钮：R 明显大于 G/B
  R=$1; G=$2; B=$3
  [ "$R" -ge 180 ] && [ "$R" -gt $((G + 40)) ] && [ "$R" -gt $((B + 40)) ]
}}

HAS_MS=1
date +%s%3N >/dev/null 2>&1 || HAS_MS=0
now_ms() {{
  if [ "$HAS_MS" = 1 ]; then date +%s%3N
  else echo $(( $(date +%s) * 1000 ))
  fi
}}

START=$(now_ms)
LINE=$(read_rgb) || {{ echo "ERR grab_failed"; exit 2; }}
set -- $LINE
W=$1; H=$2; X=$3; Y=$4; R0=$5; G0=$6; B0=$7; L0=$8
echo "BASE ${{W}}x${{H}} @${{X}},${{Y}} rgb=$R0,$G0,$B0 lum=$L0"

if [ "$RED_READY" = 1 ] && is_red_btn "$R0" "$G0" "$B0"; then
  echo "READY already_red rgb=$R0,$G0,$B0"
  exit 0
fi

if [ "$USE_BRIGHT" = 1 ] && [ "$L0" -ge "$BRIGHT" ]; then
  echo "READY already_bright"
  exit 0
fi

N=0
while true; do
  NOW=$(now_ms)
  ELAPSED=$((NOW - START))
  if [ "$ELAPSED" -ge "$TIMEOUT_MS" ]; then
    echo "TIMEOUT polls=$N elapsed_ms=$ELAPSED"
    exit 1
  fi
  usleep $INTERVAL_US 2>/dev/null || sleep 0.1
  N=$((N + 1))
  LINE=$(read_rgb) || continue
  set -- $LINE
  R=$5; G=$6; B=$7; L=$8
  DR=$((R - R0)); DG=$((G - G0)); DB=$((B - B0))
  [ "$DR" -lt 0 ] && DR=$((-DR))
  [ "$DG" -lt 0 ] && DG=$((-DG))
  [ "$DB" -lt 0 ] && DB=$((-DB))
  D=$((DR + DG + DB))
  if [ "$D" -ge "$DELTA" ]; then
    NOW=$(now_ms)
    ELAPSED=$((NOW - START))
    echo "READY rgb=$R,$G,$B lum=$L delta=$D polls=$N elapsed_ms=$ELAPSED"
    exit 0
  fi
  if [ "$RED_READY" = 1 ] && is_red_btn "$R" "$G" "$B"; then
    NOW=$(now_ms)
    ELAPSED=$((NOW - START))
    echo "READY already_red rgb=$R,$G,$B polls=$N elapsed_ms=$ELAPSED"
    exit 0
  fi
  if [ "$USE_BRIGHT" = 1 ] && [ "$L" -ge "$BRIGHT" ]; then
    NOW=$(now_ms)
    ELAPSED=$((NOW - START))
    echo "READY rgb=$R,$G,$B lum=$L bright polls=$N elapsed_ms=$ELAPSED"
    exit 0
  fi
done
"""
    p = subprocess.run(
        ["adb", "-s", args.udid, "shell", "sh", "-c", ondevice],
        capture_output=True,
        text=True,
    )
    out = (p.stdout or "").replace("\r", "").strip()
    err = (p.stderr or "").replace("\r", "").strip()
    if out:
        for line in out.splitlines():
            print(f"[pixel] {line}", flush=True)
    if err:
        print(err, file=sys.stderr, flush=True)
    if p.returncode == 0 and "READY" in out:
        return 0
    if "TIMEOUT" in out:
        return 1
    return p.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())
