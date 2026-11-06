#!/usr/bin/env bash
# 久事体育订场：固定坐标点击（adb）
# 用法：
#   1. 手机 USB 调试已开，adb devices 能看到设备
#   2. 手动打开久事体育，停在「要点场馆入口」的上一页
#   3. ./tap-court.sh
#      ./tap-court.sh 12:00:00    # 等到该时刻再开始（可选）
set -euo pipefail

UDID="${UDID:-RFCR925KDKB}"
ADB=(adb -s "$UDID")
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHOT_DIR="${SHOT_DIR:-$SCRIPT_DIR/shots}"
if [[ -x "$SCRIPT_DIR/.venv/bin/python" ]]; then
  PYTHON=("$SCRIPT_DIR/.venv/bin/python")
else
  PYTHON=(python3)
fi

# 左滑参数（可改）——日期条；太快/太早滑，App 常不吃手势
SWIPE_Y="${SWIPE_Y:-1350}"
SWIPE_FROM_X="${SWIPE_FROM_X:-1000}"
SWIPE_DIST="${SWIPE_DIST:-850}"
SWIPE_MS="${SWIPE_MS:-450}"          # 略慢，更容易被当成拖动

# 加载等待
INITIAL_WAIT="${INITIAL_WAIT:-0.8}"
SETTLE_AFTER_LOAD="${SETTLE_AFTER_LOAD:-0.6}"  # 判定加载完后再歇一会再滑
PIXEL_INTERVAL="${PIXEL_INTERVAL:-0.1}"
PIXEL_TIMEOUT="${PIXEL_TIMEOUT:-8}"
PIXEL_FX="${PIXEL_FX:-0.5}"
PIXEL_FY="${PIXEL_FY:-0.42}"

# 第 5 步「我要订场」按钮：灰不可点 → 变色可点
BTN_X="${BTN_X:-956}"
BTN_Y="${BTN_Y:-2059}"
BTN_TIMEOUT="${BTN_TIMEOUT:-5}"
BTN_DELTA="${BTN_DELTA:-50}"

tap() {
  local x=$1 y=$2
  echo "[tap] $x $y"
  "${ADB[@]}" shell input tap "$x" "$y"
}

shot() {
  local tag=$1
  mkdir -p "$SHOT_DIR"
  local out="$SHOT_DIR/${tag}-$(date +%Y%m%d-%H%M%S).png"
  "${ADB[@]}" exec-out screencap -p > "$out"
  echo "[shot] $out"
}

wait_loading_by_pixel() {
  echo "[wait] loading: sleep ${INITIAL_WAIT}s then poll center pixel"
  sleep "$INITIAL_WAIT"
  # 白底也会 already_bright，不等于日期条可滑；后面再 settle
  "${PYTHON[@]}" "$SCRIPT_DIR/wait_pixel.py" "$UDID" \
    --timeout "$PIXEL_TIMEOUT" \
    --interval "$PIXEL_INTERVAL" \
    --fx "$PIXEL_FX" \
    --fy "$PIXEL_FY" \
    || true
  echo "[wait] settle ${SETTLE_AFTER_LOAD}s before swipe"
  sleep "$SETTLE_AFTER_LOAD"
}

# 等订场按钮像素变色（相对选场地后的灰色基线）
wait_book_button_ready() {
  echo "[wait] book button @$BTN_X,$BTN_Y color change (delta>=$BTN_DELTA)"
  "${PYTHON[@]}" "$SCRIPT_DIR/wait_pixel.py" "$UDID" \
    --timeout "$BTN_TIMEOUT" \
    --interval "$PIXEL_INTERVAL" \
    --x "$BTN_X" \
    --y "$BTN_Y" \
    --delta "$BTN_DELTA" \
    --no-bright \
    --red-ready \
    || true
}

swipe_left() {
  local y=$SWIPE_Y from=$SWIPE_FROM_X
  local to=$((from - SWIPE_DIST))
  if (( to < 0 )); then to=0; fi
  echo "[swipe] left y=$y ${from}->${to} (dist=$SWIPE_DIST ms=$SWIPE_MS)"
  "${ADB[@]}" shell input swipe "$from" "$y" "$to" "$y" "$SWIPE_MS"
}

wait_until() {
  local target=$1
  echo "[wait] until $target …"
  while true; do
    local now
    now=$(date +%H:%M:%S)
    if [[ "$now" > "$target" || "$now" == "$target" ]]; then
      break
    fi
    sleep 0.05
  done
  echo "[wait] go ($now)"
}

if ! "${ADB[@]}" get-state >/dev/null 2>&1; then
  echo "设备 $UDID 未连接，先检查: adb devices" >&2
  exit 1
fi

if [[ "${1:-}" =~ ^[0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
  wait_until "$1"
fi

# 计时从真正开抢动作开始（不含 wait_until 倒计时）
T0=$("${PYTHON[@]}" -c 'import time; print(time.perf_counter())')
finish() {
  local code=$?
  local elapsed
  elapsed=$("${PYTHON[@]}" -c "import time; print(f'{time.perf_counter() - float('$T0'):.3f}')")
  echo "=== total ${elapsed}s ==="
  exit "$code"
}
trap finish EXIT

echo "=== start ==="

# 1. 场馆入口 → 0.8s → 每 100ms 比中心像素 → 再滑再点
tap 900 1200
wait_loading_by_pixel

# 2. 左滑日期条（慢滑一次）
swipe_left
sleep 0.1

# 3. 选择日期
tap 980 1350
sleep 0.4

# 4. 选择场地
# 实际场地: 
# tap 690 1730 # app
tap 550 1740 # 微信小程序
# 测试场地:
# tap 690 1948 # app
# tap 340 1960 # 微信小程序
sleep 0.15

# 5. 等「我要订场」按钮变色可点，再点
wait_book_button_ready
tap "$BTN_X" "$BTN_Y"
sleep 0.4
# echo "=== paused after step 5（已点订场，未进支付确认后流程）==="
# exit 0

# 6. 选择订场人
tap 143 780
# sleep 0.8

# 7. 选择协议
tap 67 1951
sleep 0.1

# 8. 支付
tap 800 2100
# sleep 0.3

echo "=== done ==="
