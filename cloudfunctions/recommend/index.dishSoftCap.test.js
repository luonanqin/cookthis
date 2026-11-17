'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const indexJs = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')

function handleCreateSource() {
  const start = indexJs.indexOf('async function handleCreate')
  const end = indexJs.indexOf('async function handleSwapOrReject')
  assert.ok(start >= 0 && end > start)
  return indexJs.slice(start, end)
}

function handleSwapSource() {
  const start = indexJs.indexOf('async function handleSwapOrReject')
  const end = indexJs.indexOf('async function handleAccept')
  assert.ok(start >= 0 && end > start)
  return indexJs.slice(start, end)
}

function handleAcceptSource() {
  const start = indexJs.indexOf('async function handleAccept')
  const end = indexJs.indexOf('async function handleGet')
  assert.ok(start >= 0 && end > start)
  return indexJs.slice(start, end)
}

describe('recommend daily dish soft cap wiring', () => {
  it('vendors dishSoftCap and reads isMemberActive', () => {
    assert.ok(fs.existsSync(path.join(dir, 'dishSoftCap.js')), 'dishSoftCap.js')
    assert.match(indexJs, /require\('\.\/dishSoftCap\.js'\)/)
    assert.match(indexJs, /applyDailyDishSoftLock/)
    assert.match(indexJs, /isMemberActive/)
  })

  it('applies the lock per plan so two cards do not share one cap of 12', () => {
    assert.match(indexJs, /function applyDailyDishSoftLockPerPlan/)
    assert.match(indexJs, /applyDailyDishSoftLock\(\[plan\]/)
  })

  it('handleCreate loads membership and attaches dishSoftCap after persist', () => {
    const src = handleCreateSource()
    assert.match(src, /loadMembership/)
    assert.match(src, /isMemberActive\(membership/)
    assert.match(src, /mealType:\s*scene\.mealType/)
    const emptyAt = src.indexOf('if (!plans.length)')
    const addAt = src.indexOf("collection('recommendations').add")
    const lockAt = src.indexOf('applyDailyDishSoftLockPerPlan')
    const returnAt = src.lastIndexOf('return {')
    assert.ok(emptyAt >= 0 && addAt > emptyAt, 'empty return stays before persist')
    assert.ok(lockAt > addAt, 'soft-lock the response after persist, not the stored plans')
    assert.ok(returnAt > lockAt)
    assert.match(src.slice(lockAt), /dishSoftCap/)
  })

  it('handleSwapOrReject re-marks softLocked on rebuild success without resetting the cap', () => {
    const src = handleSwapSource()
    const emptyAt = src.indexOf('if (!plans.length)')
    const updateAt = src.indexOf("collection('recommendations').doc")
    const lockAt = src.indexOf('applyDailyDishSoftLockPerPlan')
    assert.ok(emptyAt >= 0)
    assert.ok(lockAt > emptyAt, 'do not lock the noNewPlans path')
    assert.ok(lockAt > updateAt, 're-mark flags on the success response')
    assert.match(src.slice(lockAt), /dishSoftCap/)
    assert.match(src.slice(lockAt), /isMemberActive\(membership/)
    assert.doesNotMatch(src, /dishSoftCap:\s*null[\s\S]*applyDailyDishSoftLockPerPlan/)
  })

  it('handleAccept stamps response plans after persist so the client snap keeps softLocked', () => {
    const src = handleAcceptSource()
    assert.match(src, /loadMembership/)
    assert.match(src, /isMemberActive\(membership/)
    const updateAt = src.indexOf("collection('recommendations').doc")
    const lockAt = src.indexOf('applyDailyDishSoftLockPerPlan')
    const returnAt = src.lastIndexOf('return {')
    assert.ok(updateAt >= 0, 'persist the accepted flag')
    assert.ok(lockAt > updateAt, 'soft-lock the response after persist, not the stored plans')
    assert.ok(returnAt > lockAt)
    const returned = src.slice(lockAt)
    assert.match(returned, /plans:\s*locked\.plans/)
    assert.match(returned, /dishSoftCap:\s*locked\.dishSoftCap/)
    assert.match(src, /mealType:\s*scene\.mealType/)
    assert.doesNotMatch(src.slice(updateAt, lockAt), /softLocked/)
  })
})
