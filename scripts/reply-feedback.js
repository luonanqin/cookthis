#!/usr/bin/env node
'use strict'
/**
 * 运营回复用户反馈（调用云函数 feedback.action=reply）
 *
 * 用法：
 *   FEEDBACK_ADMIN_KEY=xxx node scripts/reply-feedback.js <feedbackId> <回复正文>
 *
 * 推荐（当前仓库无现成 callFunction CLI 封装）：在云开发控制台 → 云函数 feedback → 测试，传入：
 *   {
 *     "action": "reply",
 *     "id": "<feedbackId>",
 *     "replyText": "感谢反馈，我们已记录。",
 *     "adminKey": "<FEEDBACK_ADMIN_KEY>",
 *     "repliedBy": "ops"
 *   }
 *
 * 前置：
 *   - 云函数已部署，并配置环境变量 FEEDBACK_ADMIN_KEY、FEEDBACK_SUBSCRIBE_TMPL_ID
 *   - 集合 feedbacks 已创建；索引 uid+sortKey、uid+createdAt
 *   - reply 分支在 resolveUid 之前，可无用户 OPENID（管理端/控制台触发）
 *
 * 本脚本不直接调云；打印控制台 JSON 供复制。若后续接入官方 callFunction，在此补齐即可。
 */

const id = process.argv[2]
const replyText = process.argv.slice(3).join(' ').trim()
const adminKey = process.env.FEEDBACK_ADMIN_KEY || ''

if (!id || !replyText) {
  console.error('Usage: FEEDBACK_ADMIN_KEY=xxx node scripts/reply-feedback.js <feedbackId> <回复正文>')
  console.error('Prefer: 云开发控制台测试 feedback，传入下方 JSON。')
  process.exit(1)
}

const payload = {
  action: 'reply',
  id,
  replyText,
  adminKey: adminKey || '<FEEDBACK_ADMIN_KEY>',
  repliedBy: 'ops'
}

console.log('Prefer: 云开发控制台测试 feedback.reply，或在此接入官方 callFunction。')
console.log('Console test JSON:')
console.log(JSON.stringify(payload, null, 2))
console.log('Args:', process.argv.slice(2))
