'use strict'

/** DB `meal_logs.source` stays English; UI shows Chinese. */
const SOURCE_LABELS = {
  manual: '手动记录',
  photo: '拍照',
  voice: '语音',
  confirm: '买前确认',
  plan_ate: '已选方案'
}

function mealLogSourceLabel(source) {
  const key = source == null ? '' : String(source)
  return SOURCE_LABELS[key] || '其他'
}

module.exports = {
  SOURCE_LABELS,
  mealLogSourceLabel
}
