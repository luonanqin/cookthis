'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildConfirmCandidates } = require('./confirmCandidates.js')

function rec(partial) {
  return Object.assign(
    {
      _id: 'doc1',
      requestId: 'req1',
      plans: [
        {
          planIndex: 0,
          meals: [
            {
              dishes: [{ name: '红烧茄子' }, { name: '紫菜蛋花汤' }]
            }
          ]
        },
        {
          planIndex: 1,
          meals: [{ dishes: [{ name: '土豆烧肉' }] }]
        }
      ]
    },
    partial
  )
}

describe('buildConfirmCandidates', () => {
  it('returns show:false when no accepted or engaged recommendations', () => {
    const out = buildConfirmCandidates({
      recommendations: [rec({})],
      mealLogs: []
    })
    assert.equal(out.show, false)
    assert.deepEqual(out.dishNames, [])
  })

  it('builds candidates from accepted plan and subtracts logs since anchor', () => {
    const acceptedAt = new Date('2026-10-03T10:00:00.000Z')
    const out = buildConfirmCandidates({
      recommendations: [
        rec({
          acceptedAt,
          acceptedPlanIndex: 0
        })
      ],
      mealLogs: [
        {
          dishNames: ['红烧茄子'],
          createdAt: new Date('2026-10-03T12:00:00.000Z')
        }
      ]
    })
    assert.equal(out.show, true)
    assert.deepEqual(out.dishNames, ['紫菜蛋花汤'])
    assert.equal(out.requestId, 'req1')
    assert.equal(out.recommendationId, 'doc1')
  })

  it('uses engagedPlanIndex when only engaged', () => {
    const engagedAt = new Date('2026-10-04T08:00:00.000Z')
    const out = buildConfirmCandidates({
      recommendations: [
        rec({
          engagedAt,
          engagedPlanIndex: 1
        })
      ],
      mealLogs: []
    })
    assert.equal(out.show, true)
    assert.deepEqual(out.dishNames, ['土豆烧肉'])
  })

  it('picks later anchor among multiple recommendations', () => {
    const out = buildConfirmCandidates({
      recommendations: [
        rec({
          _id: 'old',
          requestId: 'req_old',
          acceptedAt: new Date('2026-10-01T10:00:00.000Z'),
          acceptedPlanIndex: 0
        }),
        rec({
          _id: 'new',
          requestId: 'req_new',
          engagedAt: new Date('2026-10-05T10:00:00.000Z'),
          engagedPlanIndex: 1
        })
      ],
      mealLogs: []
    })
    assert.equal(out.requestId, 'req_new')
    assert.deepEqual(out.dishNames, ['土豆烧肉'])
  })

  it('returns show:false when all dishes already logged', () => {
    const acceptedAt = new Date('2026-10-03T10:00:00.000Z')
    const out = buildConfirmCandidates({
      recommendations: [
        rec({ acceptedAt, acceptedPlanIndex: 0 })
      ],
      mealLogs: [
        {
          dishNames: ['红烧茄子', '紫菜蛋花汤'],
          createdAt: new Date('2026-10-03T11:00:00.000Z')
        }
      ]
    })
    assert.equal(out.show, false)
    assert.deepEqual(out.dishNames, [])
  })

  it('prefers acceptedPlanIndex when same-doc acceptedAt >= engagedAt', () => {
    const t = new Date('2026-10-03T10:00:00.000Z')
    const out = buildConfirmCandidates({
      recommendations: [
        rec({
          acceptedAt: t,
          engagedAt: t,
          acceptedPlanIndex: 0,
          engagedPlanIndex: 1
        })
      ],
      mealLogs: []
    })
    assert.deepEqual(out.dishNames, ['红烧茄子', '紫菜蛋花汤'])
  })
})
