'use strict'
function suggestComboByPeople(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1) return null
  if (num === 1) return { meat: 1, veg: 1, soup: 0 }
  if (num === 2) return { meat: 1, veg: 1, soup: 1 }
  if (num === 3) return { meat: 1, veg: 2, soup: 1 }
  if (num <= 6) return { meat: 2, veg: 2, soup: 1 }
  return { meat: 2, veg: 3, soup: 1 }
}
module.exports = { suggestComboByPeople }
