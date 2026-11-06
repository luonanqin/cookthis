'use strict'

const { COOK_SKILL_VALUES, PROBE_DISHES, deriveCookSkill } = require('./cookSkill.js')

const RETAKE_LINK_TESTED = '已测 · 可重测'
const RETAKE_LINK_UNTESTED = '测一下做饭水平'
const RETAKE_TOAST = '已根据选择优化推荐'
const TRACK_SUBMIT = 'cook_skill_retake_submit'
const TRACK_CANCEL = 'cook_skill_retake_cancel'

const PROBE_GROUP_META = [
  { id: 'easy', title: '轻松上手' },
  { id: 'home', title: '家常水平' },
  { id: 'advanced', title: '进阶一点' }
]

function retakeLinkLabel(cookSkill) {
  return COOK_SKILL_VALUES.includes(cookSkill) ? RETAKE_LINK_TESTED : RETAKE_LINK_UNTESTED
}

/** 与引导页同一批 15 道，只露出菜名，不带档位结论文案。 */
function buildProbeGroups() {
  return PROBE_GROUP_META.map((group) => ({
    id: group.id,
    title: group.title,
    dishes: PROBE_DISHES.filter((dish) => dish.group === group.id).map((dish) => ({
      id: dish.id,
      name: dish.name
    }))
  }))
}

function probeCountsFromChecked(checked) {
  const counts = { easy: 0, home: 0, advanced: 0 }
  const on = checked && typeof checked === 'object' ? checked : {}
  PROBE_DISHES.forEach((dish) => {
    if (on[dish.id]) counts[dish.group] += 1
  })
  return counts
}

/** @returns {string[]} */
function dishIdsFromChecked(checked) {
  const on = checked && typeof checked === 'object' ? checked : {}
  return PROBE_DISHES.map((d) => d.id).filter((id) => on[id])
}

/** @returns {Record<string, boolean>} */
function probeCheckedFromDishIds(ids) {
  const checked = {}
  if (!Array.isArray(ids)) return checked
  const allow = new Set(PROBE_DISHES.map((d) => d.id))
  ids.forEach((id) => {
    if (typeof id === 'string' && allow.has(id)) checked[id] = true
  })
  return checked
}

/**
 * submit 才打 saveCookSkillProbe，档位由服务端根据 counts/dishIds 推导。
 * cancel / back 不发请求，已有档保留。
 * @param {string} kind 'submit' | 'cancel' | 'back'
 * @param {Record<string, boolean>|null|undefined} checked
 */
function retakeCloudCall(kind, checked) {
  if (kind === 'submit') {
    const counts = probeCountsFromChecked(checked)
    const dishIds = dishIdsFromChecked(checked)
    if (counts.easy + counts.home + counts.advanced < 1) {
      return {
        track: TRACK_SUBMIT,
        toast: null,
        payload: null,
        trackProps: {},
        error: 'EMPTY_PROBE'
      }
    }
    return {
      track: TRACK_SUBMIT,
      toast: RETAKE_TOAST,
      payload: {
        action: 'saveCookSkillProbe',
        counts,
        dishIds
      },
      trackProps: {
        cookSkill: deriveCookSkill(counts),
        counts
      }
    }
  }
  return {
    track: TRACK_CANCEL,
    toast: null,
    payload: null,
    trackProps: {}
  }
}

module.exports = {
  RETAKE_LINK_TESTED,
  RETAKE_LINK_UNTESTED,
  RETAKE_TOAST,
  TRACK_SUBMIT,
  TRACK_CANCEL,
  retakeLinkLabel,
  buildProbeGroups,
  probeCountsFromChecked,
  dishIdsFromChecked,
  probeCheckedFromDishIds,
  retakeCloudCall
}
