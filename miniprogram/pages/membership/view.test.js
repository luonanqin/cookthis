'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  BENEFITS,
  NOTICE_ITEMS,
  highlightBenefitId,
  ORDER_CANCELLED_TOAST,
  PAY_UNAVAILABLE,
  POLL_MAX,
  applyStatus,
  decorateOffers,
  decorateOrders,
  formatRemain,
  isIosPlatform,
  orderErrorToast,
  payFailToast,
  pendingOtherSkuCopy,
  shouldContinuePoll,
  statusHeadline,
  tickOrderRemains,
  usageText
} = require('./view.js')

describe('membership view copy', () => {
  it('lists stage-1 benefit comparison rows without ad-free claims', () => {
    assert.deepEqual(
      BENEFITS.map((b) => b.dim),
      ['换菜次数', '推荐菜数量', '餐数上限', '视频广告']
    )
    assert.deepEqual(
      BENEFITS.map((b) => b.id),
      ['swap', 'dishes', 'meals', 'reward']
    )
    assert.ok(BENEFITS.every((b) => b.member && b.free))
    assert.equal(BENEFITS[0].member, '不限')
    assert.equal(BENEFITS[0].free, '每日 3 次')
    assert.equal(BENEFITS[1].free, '每次 12 道')
    assert.equal(BENEFITS[2].member, '10餐')
    assert.equal(BENEFITS[2].free, '6餐')
    assert.equal(BENEFITS[3].member, '免看')
    assert.equal(BENEFITS[3].free, '解锁限制')
    const mealsAt = BENEFITS.findIndex((b) => b.id === 'meals')
    const rewardAt = BENEFITS.findIndex((b) => b.id === 'reward')
    assert.ok(mealsAt < rewardAt)
    assert.equal(rewardAt, BENEFITS.length - 1)
    const blob = JSON.stringify(BENEFITS)
    assert.equal(blob.includes('已免广告'), false)
    assert.equal(blob.includes('清单广告'), false)
    assert.equal(highlightBenefitId('daily_meal_custom'), 'meals')
    assert.equal(highlightBenefitId('swap_cap'), '')
    assert.equal(highlightBenefitId(''), '')
  })

  it('has purchase-notice items for renew / grant / first-buy / stack / refund', () => {
    assert.equal(NOTICE_ITEMS.length, 5)
    const blob = NOTICE_ITEMS.join('\n')
    assert.match(blob, /不自动续费/)
    assert.match(blob, /刷新会员状态/)
    assert.match(blob, /联系客服/)
    assert.match(blob, /首购/)
    assert.match(blob, /叠加/)
    assert.match(blob, /不退/)
    assert.equal(blob.includes('换菜功能激励'), false)
    assert.equal(blob.includes('10 万'), false)
    assert.equal(blob.includes('已免广告'), false)
  })
})

describe('iOS WeChat version gate', () => {
  it('requires WeChat ≥ 8.0.68 on iOS and allows Android', () => {
    const { canUseVirtualPayOnClient, IOS_MIN_WECHAT } = require('./view.js')
    assert.deepEqual(IOS_MIN_WECHAT, [8, 0, 68])
    assert.equal(canUseVirtualPayOnClient({ platform: 'android', version: '7.0.0' }).ok, true)
    assert.equal(canUseVirtualPayOnClient({ platform: 'ios', version: '8.0.68' }).ok, true)
    assert.equal(canUseVirtualPayOnClient({ platform: 'ios', version: '8.0.67' }).ok, false)
    assert.equal(canUseVirtualPayOnClient({ platform: 'ios', version: '8.1.0' }).ok, true)
    assert.match(
      canUseVirtualPayOnClient({ platform: 'ios', version: '8.0.0' }).message,
      /微信更新/
    )
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
    assert.equal(next.selectedSkuLabel, '季卡')
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

  it('decorates payable orders with countdown labels', () => {
    const next = applyStatus(
      {
        isMember: false,
        offers,
        orders: [
          {
            orderId: 'o1',
            sku: 'month',
            title: '月卡',
            labelYuan: '0.99',
            status: 'created',
            canPay: true,
            canCancel: true,
            remainMs: 125000
          },
          {
            orderId: 'o2',
            sku: 'quarter',
            title: '季卡',
            labelYuan: '16.6',
            status: 'paid',
            canPay: false,
            canCancel: false,
            remainMs: 0,
            paidAt: '2026-11-18T15:20:00.000Z'
          }
        ],
        serverNow: 1_000_000
      },
      'month',
      false,
      1_000_000
    )
    assert.equal(next.orders.length, 2)
    assert.equal(next.orders[0].remainLabel, '2:05')
    assert.equal(next.orders[0].statusLabel, '待支付')
    assert.equal(next.orders[1].statusLabel, '')
    assert.equal(next.orders[1].remainLabel, '')
    assert.match(next.orders[1].timeLabel, /^2026-11-18 \d{2}:\d{2}$/)
  })
})

describe('order countdown + pending copy', () => {
  it('formats remain and ticks down locally', () => {
    assert.equal(formatRemain(125000), '2:05')
    assert.equal(formatRemain(0), '0:00')
    const rows = decorateOrders([
      { orderId: 'a', status: 'created', canPay: true, remainMs: 61000 }
    ])
    assert.equal(rows[0].remainLabel, '1:01')
    const ticked = tickOrderRemains(rows, 1000, 1000 + 2000)
    assert.equal(ticked[0].remainMsLocal, 59000)
    assert.equal(ticked[0].remainLabel, '0:59')
    assert.equal(ticked[0].canPay, true)
  })

  it('explains replacing a pending other-sku order', () => {
    assert.match(
      pendingOtherSkuCopy({ title: '月卡', labelYuan: '0.99', sku: 'month' }, 'quarter'),
      /待支付的月卡（¥0\.99）.+下单季卡/
    )
  })
})

describe('pay unavailable + poll', () => {
  it('maps PAY_NOT_CONFIGURED to the friendly pay message without blanket iOS block', () => {
    assert.equal(isIosPlatform('ios'), true)
    assert.equal(isIosPlatform('android'), false)
    assert.equal(PAY_UNAVAILABLE, '当前环境暂无法支付')
    assert.equal(ORDER_CANCELLED_TOAST, '订单已取消，请重新下单')
    assert.equal(orderErrorToast({ error: 'PAY_NOT_CONFIGURED' }, 'android'), PAY_UNAVAILABLE)
    assert.equal(orderErrorToast({ error: 'NO_SESSION_KEY' }, 'devtools'), PAY_UNAVAILABLE)
    assert.equal(orderErrorToast({ error: 'BAD_SKU' }, 'android'), '套餐无效')
    assert.equal(orderErrorToast({ error: 'ORDER_EXPIRED' }, 'android'), ORDER_CANCELLED_TOAST)
    assert.equal(orderErrorToast({ error: 'ORDER_BUSY' }, 'android'), '请稍后再试')
    assert.equal(
      orderErrorToast({ error: 'FIRST_PURCHASE_USED' }, 'android'),
      '首购优惠已用过，请按页价购买'
    )
    assert.equal(orderErrorToast({}, 'ios'), '下单失败')
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
