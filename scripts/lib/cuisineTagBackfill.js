'use strict'

const fs = require('fs')
const path = require('path')

const CUISINE_DIR_TO_CODE = {
  川菜: 'sichuan',
  粤菜: 'cantonese',
  鲁菜: 'shandong',
  苏菜: 'jiangsu',
  浙菜: 'zhejiang',
  闽菜: 'fujian',
  湘菜: 'hunan',
  徽菜: 'anhui',
  东北菜: 'northeast',
  西北菜: 'northwest',
  本帮菜: 'shanghai',
  京菜: 'beijing',
  豫菜: 'henan',
  云南菜: 'yunnan',
  贵州菜: 'guizhou',
  内蒙菜: 'inner_mongolia',
  新疆菜: 'xinjiang',
  湖北菜: 'hubei',
  江西菜: 'jiangxi'
}

const SKIP_DIRS = new Set(['火锅', '烧烤', '其他'])

const SUMMARY_FILES = [
  '荤菜_清洗.json',
  '素菜_清洗.json',
  '汤羹_清洗.json',
  '主食_清洗.json',
  '荤菜.json',
  '素菜.json',
  '汤羹.json',
  '主食.json'
]

/** 菜名弱规则：高把握常识 / 招牌菜名片段 */
const NAME_RULES = [
  [
    /宫保|宫爆|麻婆|水煮鱼|水煮肉|回锅肉|鱼香|夫妻肺片|蒜泥白肉|毛血旺|辣子鸡|酸菜鱼|冷吃|燃面|二荆条|钵钵鸡|口水鸡|担担面|钟水饺|樟茶鸭|干煸牛肉/,
    'sichuan'
  ],
  [
    /白切鸡|煲仔|叉烧|豉汁|烧鹅|乳鸽|虾饺|肠粉|啫啫|广式|广府|文昌鸡|白灼|南乳|普宁豆酱|豆豉鲮鱼|靓汤|避风塘|干炒牛河|菠萝咕咾|盐焗鸡/,
    'cantonese'
  ],
  [/剁椒|口味虾|口味蟹|腊味合蒸|永州血鸭|红菜薹/, 'hunan'],
  [/东坡肉|西湖醋鱼|龙井虾仁|叫花鸡|宋嫂鱼羹/, 'zhejiang'],
  [/松鼠鳜鱼|狮子头|大煮干丝|盐水鸭|软兜|拆烩|文思豆腐/, 'jiangsu'],
  [/佛跳墙|荔枝肉|海蛎煎|沙茶面|肉燕|姜母鸭/, 'fujian'],
  [/臭鳜鱼|毛豆腐|符离集/, 'anhui'],
  [
    /锅包肉|地三鲜|杀猪菜|溜肉段|白菜炖粉条|粉条豆腐|铁锅.*榛蘑|榛蘑|红肠|酸菜白肉|东北乱炖|猪肉炖粉条|得莫利|锅塌豆腐/,
    'northeast'
  ],
  [
    /羊肉泡馍|手抓羊肉|凉皮|酿皮|肉夹馍|油泼面|羊肉泡|莜面|岐山臊子|裤带面/,
    'northwest'
  ],
  [/草头圈子|油爆虾|腌笃鲜|本帮|虾子大乌参|八宝辣酱/, 'shanghai'],
  [/北京烤鸭|炸酱面|京酱肉丝|老北京|涮羊肉|卤煮|炒肝|铜锅涮/, 'beijing'],
  [/过桥米线|汽锅鸡|气锅鸡|宣威火腿/, 'yunnan'],
  [/酸汤鱼|折耳根|丝娃娃|凯里酸汤/, 'guizhou'],
  [/手抓饭|大盘鸡|烤包子|馕坑肉|椒麻鸡/, 'xinjiang'],
  [/热干面|武昌鱼|排骨藕汤|面窝|鮰鱼/, 'hubei'],
  [/瓦罐汤|藜蒿炒腊肉|余干辣椒/, 'jiangxi'],
  [/胡辣汤|道口烧鸡|烩面|黄河鲤|桶子鸡/, 'henan'],
  [/九转大肠|葱烧海参|德州扒鸡|把子肉|油旋/, 'shandong'],
  [/烤全羊|手把肉|手扒肉/, 'inner_mongolia']
]

function normalizeDishName(name) {
  let s = String(name || '').trim()
  if (!s) return ''
  s = s.replace(/（[^）]*）|\([^)]*\)|【[^】]*】|\[[^\]]*\]/g, '')
  s = s.replace(/约?\d+(\.\d+)?\s*(g|G|kg|KG|克|斤|两|毫升|ml|ML|人份|份|个|只|条|盘)?/g, '')
  s = s.replace(/[·•\-—_/\\|,.，。、:：;；!！?？'"“”‘’]/g, '')
  s = s.replace(/\s+/g, '')
  return s
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
      prev = tmp
    }
  }
  return dp[n]
}

function collectNamesFromJson(data, into) {
  if (Array.isArray(data)) {
    for (const x of data) {
      if (typeof x === 'string' && x.trim()) into.add(x.trim())
      else if (x && typeof x === 'object' && typeof x.name === 'string') into.add(x.name.trim())
    }
    return
  }
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (typeof k === 'string' && k.trim() && !/^\d+$/.test(k)) into.add(k.trim())
      collectNamesFromJson(v, into)
    }
  }
}

function buildDianpingIndex(outputRoot) {
  const index = new Map()
  if (!outputRoot || !fs.existsSync(outputRoot)) return index
  for (const cityEnt of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    if (!cityEnt.isDirectory()) continue
    const cityDir = path.join(outputRoot, cityEnt.name)
    for (const cuiEnt of fs.readdirSync(cityDir, { withFileTypes: true })) {
      if (!cuiEnt.isDirectory()) continue
      const cui = cuiEnt.name
      if (SKIP_DIRS.has(cui)) continue
      const code = CUISINE_DIR_TO_CODE[cui]
      if (!code) continue
      const cuiDir = path.join(cityDir, cui)
      const names = new Set()
      for (const fname of SUMMARY_FILES) {
        const p = path.join(cuiDir, fname)
        if (!fs.existsSync(p)) continue
        try {
          collectNamesFromJson(JSON.parse(fs.readFileSync(p, 'utf8')), names)
        } catch (_) {
          /* skip */
        }
      }
      for (const name of names) {
        const key = normalizeDishName(name)
        if (key.length < 2) continue
        if (!index.has(key)) index.set(key, new Set())
        index.get(key).add(code)
      }
    }
  }
  return index
}

function matchExact(index, norm) {
  if (!norm || !index.has(norm)) return []
  return [...index.get(norm)]
}

function matchSimilar(index, norm) {
  if (!norm || norm.length < 3) return []
  const hits = new Set()
  for (const [key, codes] of index.entries()) {
    if (key.length < 3) continue
    let ok = false
    if (key.includes(norm) || norm.includes(key)) {
      if (Math.min(key.length, norm.length) >= 3) ok = true
    } else if (
      Math.abs(key.length - norm.length) <= 1 &&
      Math.min(key.length, norm.length) >= 4 &&
      levenshtein(key, norm) <= 1
    ) {
      ok = true
    }
    if (ok) for (const c of codes) hits.add(c)
  }
  return [...hits]
}

function matchRules(rawName) {
  const s = String(rawName || '')
  const hits = []
  for (const [re, code] of NAME_RULES) {
    if (re.test(s)) hits.push(code)
  }
  return [...new Set(hits)]
}

/** 空气炸锅 / 烧烤烤制 / 卤菜 → 通用（优先于点评与地方系规则） */
function matchCommonStyle(rawName) {
  const s = String(rawName || '')
  if (!s) return []
  // 保留少数经典名菜
  if (/北京烤鸭|烧鹅|脆皮烤乳鸽|叫花鸡|卤煮/.test(s)) return []
  if (/烤麸/.test(s)) return []
  if (/空气炸锅|烤箱|烧烤|烤串|炭烤|新奥尔良烤/.test(s)) return ['home_style']
  if (
    /烤肉|烤羊|烤牛|烤猪|烤鸡|烤鸭|烤鱼|烤排|烤翅|烤腿|烤肋|烤生蚝|烤豆腐|烤茄子|烤虾|烤鹌鹑|盐烤|慢烤|香烤|脆皮烤|无油烤|蒜香烤|焦香.*烤/.test(
      s
    )
  ) {
    return ['home_style']
  }
  if (/卤(?!煮)/.test(s)) return ['home_style']
  return []
}

function uniq(arr) {
  const out = []
  const seen = new Set()
  for (const x of arr) {
    if (!x || seen.has(x)) continue
    seen.add(x)
    out.push(x)
  }
  return out
}

function suggestCuisineTags(recipeName, index) {
  let tags = matchCommonStyle(recipeName)
  if (tags.length) return { tags: uniq(tags), source: 'common' }
  const norm = normalizeDishName(recipeName)
  tags = matchExact(index, norm)
  if (tags.length) return { tags: uniq(tags), source: 'exact' }
  tags = matchSimilar(index, norm)
  if (tags.length) return { tags: uniq(tags), source: 'similar' }
  tags = matchRules(recipeName)
  if (tags.length) return { tags: uniq(tags), source: 'rule' }
  return { tags: [], source: 'none' }
}

function backfillRecipes(recipes, index) {
  const stats = {
    exact: 0,
    similar: 0,
    rule: 0,
    common: 0,
    none: 0,
    clearedHome: 0
  }
  const next = recipes.map((r) => {
    const prev = Array.isArray(r.cuisineTags) ? r.cuisineTags : []
    if (prev.includes('home_style')) stats.clearedHome += 1
    const { tags, source } = suggestCuisineTags(r.name, index)
    stats[source] += 1
    const row = Object.assign({}, r, { cuisineTags: tags })
    return row
  })
  return { recipes: next, stats }
}

module.exports = {
  CUISINE_DIR_TO_CODE,
  SKIP_DIRS,
  normalizeDishName,
  levenshtein,
  buildDianpingIndex,
  matchExact,
  matchSimilar,
  matchRules,
  matchCommonStyle,
  suggestCuisineTags,
  backfillRecipes
}
