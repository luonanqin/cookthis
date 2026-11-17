'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  BENEFITS,
  NOTICE_ITEMS,
  PAY_UNAVAILABLE,
  POLL_MAX,
  applyStatus,
  decorateOffers,
  isIosPlatform,
  orderErrorToast,
  payFailToast,
  shouldContinuePoll,
  statusHeadline,
  usageText
} = require('./view.js')

describe('membership view copy', () => {
  it('lists stage-1 benefits without ad-free claims', () => {
    const titles = BENEFITS.map((b) => b.title)
    assert.deepEqual(titles, ['换菜不限次', '日常菜数放宽', '免换菜激励预告'])
    const blob = JSON.stringify(BENEFITS)
    assert.equal(blob.includes('已免广告'), false)
    assert.equal(blob.includes('清单广告'), false)
  })

  it('has five purchase-notice items covering design §6', () => {
    assert.equal(NOTICE_ITEMS.length, 5)
    const blob = NOTICE_ITEMS.join('\n')
    assert.match(blob, /不自动续费/)
    assert.match(blob, /刷新会员状态/)
    assert.match(blob, /首购/)
    assert.match(blob, /换菜功能激励/)
    assert.match(blob, /不退/)
    assert.equal(blob.includes('已免广告'), false)
  })
})

describe('statusHeadline / usageText', () => {
  it('shows 未开通 and daily cap for non-members', () => {
    const s = { isMember: false, swap: { used: 2, limit: 3 } }
    assert.equal(statusHeadline(s), '未开通')
    assert.equal(usageText(s), '每日 3 次 · 今日已用 2')
  })

  it('shows active headline and unlimited swap for members', () => {
    const s = {
      isMember: true,
      expiresLabel: '2027-01-18',
      swap: { used: 4, limit: null }
    }
    assert.equal(statusHeadline(s), '会员生效中 · 2027-01-18 到期')
    assert.equal(usageText(s), '换菜不限次（今日已换 4）')
  })
})

describe('decorateOffers / applyStatus', () => {
  const offers = [
    {
      sku: 'month',
      listFen: 660,
      payFen: 99,
      isFirstPurchase: true,
      labelYuan: '0.99',
      listYuan: '6.6'
    },
    {
      sku: 'quarter',
      listFen: 1660,
      payFen: 1660,
      isFirstPurchase: false,
      labelYuan: '16.6',
      listYuan: '16.6'
    }
  ]

  it('strikes list price only on first-purchase offers', () => {
    const rows = decorateOffers(offers)
    assert.equal(rows[0].title, '月卡')
    assert.equal(rows[0].showList, true)
    assert.equal(rows[1].showList, false)
    assert.equal(rows[1].title, '季卡')
  })

  it('maps getStatus payload without granting membership locally', () => {
    const next = applyStatus(
      {
        isMember: false,
        tier: null,
        expiresLabel: null,
        swap: { used: 1, limit: 3 },
        offers
      },
      'year',
      false
    )
    assert.equal(next.isMember, false)
    assert.equal(next.selectedSku, 'month')
    assert.equal(next.statusText, '未开通')
    assert.equal(next.buyExpanded, true)
    assert.equal(next.tierLabel, '')
  })

  it('keeps selected sku when still offered and folds buy for members', () => {
    const next = applyStatus(
      {
        isMember: true,
        tier: 'quarter',
        expiresLabel: '2027-02-19',
        swap: { used: 0, limit: null },
        offers
      },
      'quarter',
      false
    )
    assert.equal(next.isMember, true)
    assert.equal(next.selectedSku, 'quarter')
    assert.equal(next.tierLabel, '季卡')
    assert.equal(next.expiresLabel, '2027-02-19')
    assert.equal(next.buyExpanded, false)
    assert.equal(next.ctaLabel, '续费/再买')
  })

  it('keeps member buy panel expanded after the user unfolds', () => {
    const next = applyStatus(
      {
        isMember: true,
        tier: 'quarter',
        expiresLabel: '2027-02-19',
        swap: { used: 0, limit: null },
        offers
      },
      'quarter',
      true
    )
    assert.equal(next.buyExpanded, true)
  })
})

describe('pay unavailable + poll', () => {
  it('maps iOS and PAY_NOT_CONFIGURED to the friendly pay message', () => {
    assert.equal(isIosPlatform('ios'), true)
    assert.equal(isIosPlatform('android'), false)
    assert.equal(PAY_UNAVAILABLE, '当前环境暂无法支付')
    assert.equal(orderErrorToast({ error: 'PAY_NOT_CONFIGURED' }, 'android'), PAY_UNAVAILABLE)
    assert.equal(orderErrorToast({ error: 'NO_SESSION_KEY' }, 'devtools'), PAY_UNAVAILABLE)
    assert.equal(orderErrorToast({ error: 'BAD_SKU' }, 'android'), 'BAD_SKU')
    assert.equal(orderErrorToast({}, 'ios'), PAY_UNAVAILABLE)
    assert.equal(orderErrorToast(null, 'android'), '下单失败')
    assert.equal(payFailToast({ errCode: -2 }, false), '支付未完成')
    assert.equal(payFailToast({ errCode: -1 }, true), PAY_UNAVAILABLE)
  })

  it('polls refresh at most 3 times and stops once member', () => {
    assert.equal(POLL_MAX, 3)
    assert.equal(shouldContinuePoll(1, false), true)
    assert.equal(shouldContinuePoll(2, false), true)
    assert.equal(shouldContinuePoll(3, false), false)
    assert.equal(shouldContinuePoll(1, true), false)
  })
})
