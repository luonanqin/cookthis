'use strict'

/**
 * 订阅消息模板 ID（与云函数 FEEDBACK_SUBSCRIBE_TMPL_ID 对齐）。
 * 未配置时为空字符串：跳过 requestSubscribeMessage，create 带 subscribeReady:false。
 */
const FEEDBACK_SUBSCRIBE_TMPL_ID = ''

module.exports = { FEEDBACK_SUBSCRIBE_TMPL_ID }
