'use strict'
const fs = require('fs')
const path = require('path')

const RULES = [
  { code: 'sichuan', re: /麻婆|水煮|回锅|鱼香|宫保|夫妻肺片|担担|川式|四川/ },
  { code: 'hunan', re: /湘|剁椒|口味虾|农家小炒|辣椒炒肉/ },
  { code: 'cantonese', re: /白切|煲仔|清蒸|粤式|广式|叉烧|虾饺/ },
  { code: 'shanghai', re: /红烧肉|本帮|糖醋小排|油焖|上海/ },
  { code: 'northeast', re: /锅包肉|地三鲜|东北|杀猪菜/ },
  { code: 'northwest', re: /羊肉泡馍|凉皮|揪面|西北/ },
  { code: 'xinjiang', re: /大盘鸡|手抓饭|新疆|烤包子/ },
  { code: 'beijing', re: /炸酱|京酱|北京|涮羊肉/ },
  { code: 'yunnan', re: /汽锅|过桥|云南|宣威/ },
  { code: 'guizhou', re: /酸汤|折耳根|贵州|凯里/ },
  { code: 'jiangsu', re: /松鼠鳜鱼|盐水鸭|淮扬|江苏/ },
  { code: 'zhejiang', re: /东坡|西湖|龙井|浙江/ },
  { code: 'shandong', re: /九转大肠|葱烧|鲁菜|山东/ },
  { code: 'fujian', re: /佛跳墙|荔枝肉|闽|福建/ },
  { code: 'anhui', re: /臭鳜鱼|毛豆腐|徽菜|安徽/ },
  { code: 'henan', re: /胡辣汤|豫|河南/ },
  { code: 'hubei', re: /武昌鱼|热干面|湖北|武汉/ },
  { code: 'jiangxi', re: /瓦罐|江西|南昌/ },
  { code: 'inner_mongolia', re: /手把肉|内蒙|呼市/ },
]

function tagName(name) {
  const tags = []
  for (const r of RULES) {
    if (r.re.test(name || '')) tags.push(r.code)
  }
  if (!tags.length) tags.push('home_style')
  return tags
}

function isJsonl(text) {
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('[')) return false
  const first = trimmed.split(/\n/)[0]
  try {
    JSON.parse(first)
    return true
  } catch {
    return false
  }
}

function patchFile(file, jsonl) {
  const p = path.join(__dirname, '..', 'data', file)
  const raw = fs.readFileSync(p, 'utf8')
  const useJsonl = jsonl !== undefined ? jsonl : isJsonl(raw)

  if (useJsonl) {
    const lines = raw.trim().split(/\n/)
    const out = lines.map((line) => {
      const o = JSON.parse(line)
      o.cuisineTags = tagName(o.name)
      return JSON.stringify(o)
    })
    fs.writeFileSync(p, out.join('\n') + '\n')
  } else {
    const arr = JSON.parse(raw)
    for (const o of arr) o.cuisineTags = tagName(o.name)
    fs.writeFileSync(p, JSON.stringify(arr, null, 2) + '\n')
  }
}

patchFile('recipes-builtin.json', false)
patchFile('recipes-for-import.json', true)
console.log('tagged recipes-builtin + recipes-for-import')
