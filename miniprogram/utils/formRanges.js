/** Shared picker ranges for people / combo counts. */

function range(from, to) {
  const out = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}

const PEOPLE_RANGE = range(1, 12)
const COMBO_RANGE = range(0, 5)

function indexOfValue(list, value, fallbackIndex) {
  const i = list.indexOf(value)
  return i >= 0 ? i : fallbackIndex
}

module.exports = {
  PEOPLE_RANGE,
  COMBO_RANGE,
  indexOfValue
}
