'use strict'
/**
 * 扩充内置食材/菜谱：全国四季常见 + 多城特色，便于切换城市验推荐。
 * 城市名与微信 region picker 一致（带「市」），每城 ≥5 条地方主料以免 fallback 全国。
 * 用法：node scripts/expand-city-catalog.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ING_PATH = path.join(ROOT, 'data', 'catalog', 'ingredients-builtin.json')
const RCP_PATH = path.join(ROOT, 'data', 'catalog', 'recipes-builtin.json')
const NOW = '2026-10-09T00:00:00.000Z'
const { PACKS } = require('./city-packs-all-provinces.js')

function ing(partial) {
  const row = {
    cities: [],
    kind: 'main',
    onConfirmPage: false,
    sort: 50,
    avoidTags: [],
    source: 'builtin',
    updatedAt: NOW,
    ...partial
  }
  if (row.kind === 'main' && !row.availability) {
    throw new Error('main needs availability: ' + row.id)
  }
  if (row.kind === 'seasoning') {
    delete row.availability
    delete row.onConfirmPage
    row.category = row.category || 'seasoning'
  }
  return row
}

function rcp(partial) {
  return {
    seasonings: ['盐', '酱油'],
    tasteTags: ['normal'],
    dishForms: ['stir_fry'],
    stapleForms: ['rice'],
    cities: [],
    minutes: 25,
    servings: 2,
    enabled: true,
    ...partial
  }
}

/** 全国新增四季常见 + 调味 */
const NATIONAL_INGS = [
  ing({ id: 'ing_scallion', name: '葱', category: 'seasoning', kind: 'seasoning', sort: 3 }),
  ing({ id: 'ing_ginger', name: '姜', category: 'seasoning', kind: 'seasoning', sort: 4 }),
  ing({ id: 'ing_garlic', name: '蒜', category: 'seasoning', kind: 'seasoning', sort: 5 }),
  ing({ id: 'ing_vinegar', name: '醋', category: 'seasoning', kind: 'seasoning', sort: 6 }),
  ing({ id: 'ing_sugar', name: '糖', category: 'seasoning', kind: 'seasoning', sort: 7 }),
  ing({ id: 'ing_cooking_wine', name: '料酒', category: 'seasoning', kind: 'seasoning', sort: 8 }),
  ing({ id: 'ing_sesame_oil', name: '香油', category: 'seasoning', kind: 'seasoning', sort: 9 }),
  ing({ id: 'ing_douban', name: '豆瓣酱', category: 'seasoning', kind: 'seasoning', sort: 10 }),
  ing({ id: 'ing_pixian', name: '郫县豆瓣', category: 'seasoning', kind: 'seasoning', sort: 11 }),
  ing({ id: 'ing_peppercorn', name: '花椒', category: 'seasoning', kind: 'seasoning', sort: 12 }),
  ing({ id: 'ing_dried_chili', name: '干辣椒', category: 'seasoning', kind: 'seasoning', sort: 13 }),
  ing({ id: 'ing_oyster', name: '蚝油', category: 'seasoning', kind: 'seasoning', sort: 14 }),
  ing({ id: 'ing_starch', name: '淀粉', category: 'seasoning', kind: 'seasoning', sort: 15 }),
  ing({ id: 'ing_sichuan_pepper_oil', name: '红油', category: 'seasoning', kind: 'seasoning', sort: 16 }),

  ing({ id: 'ing_napa', name: '大白菜', category: 'leaf', availability: 'year_round', sort: 3 }),
  ing({ id: 'ing_lettuce_stem', name: '莴笋', category: 'leaf', availability: 'year_round', sort: 5 }),
  ing({ id: 'ing_broccoli', name: '西兰花', category: 'leaf', availability: 'year_round', sort: 6 }),
  ing({ id: 'ing_pumpkin', name: '南瓜', category: 'fruit_veg', availability: 'year_round', sort: 5 }),
  ing({ id: 'ing_loofah', name: '丝瓜', category: 'fruit_veg', availability: 'year_round', sort: 6 }),
  ing({ id: 'ing_wood_ear', name: '木耳', category: 'mushroom', availability: 'year_round', sort: 3 }),
  ing({ id: 'ing_enoki_extra', name: '杏鲍菇', category: 'mushroom', availability: 'year_round', sort: 4 }),
  ing({ id: 'ing_vermicelli', name: '粉丝', category: 'staple', availability: 'year_round', sort: 1 }),
  ing({ id: 'ing_wide_noodle', name: '宽粉', category: 'staple', availability: 'year_round', sort: 2 }),
  ing({ id: 'ing_dried_noodle', name: '挂面', category: 'staple', availability: 'year_round', sort: 3 }),
  ing({ id: 'ing_dumpling_skin', name: '饺子皮', category: 'staple', availability: 'year_round', sort: 4 }),
  ing({ id: 'ing_rice_noodle', name: '米粉', category: 'staple', availability: 'year_round', sort: 5 }),
  ing({ id: 'ing_tofu_skin', name: '腐竹', category: 'tofu', availability: 'year_round', sort: 3 }),
  ing({ id: 'ing_soft_tofu', name: '嫩豆腐', category: 'tofu', availability: 'year_round', sort: 4 }),
  ing({ id: 'ing_ribs', name: '排骨', category: 'meat', availability: 'year_round', sort: 5, avoidTags: ['pork'] }),
  ing({ id: 'ing_streaky', name: '五花肉', category: 'meat', availability: 'year_round', sort: 6, avoidTags: ['pork'] }),
  ing({ id: 'ing_chicken_wing', name: '鸡翅', category: 'meat', availability: 'year_round', sort: 7 }),
  ing({ id: 'ing_beef_tendon', name: '牛腩', category: 'meat', availability: 'year_round', sort: 8 }),
  ing({ id: 'ing_bass', name: '鲈鱼', category: 'seafood', availability: 'year_round', sort: 5, avoidTags: ['seafood'] }),
  ing({ id: 'ing_grass_carp', name: '草鱼', category: 'seafood', availability: 'year_round', sort: 6, avoidTags: ['seafood'] }),
  ing({ id: 'ing_tofu_pudding', name: '豆芽', category: 'bean', availability: 'year_round', sort: 3 }),
  ing({ id: 'ing_long_bean', name: '豆角', category: 'bean', availability: 'year_round', sort: 4 }),
  ing({ id: 'ing_corn', name: '玉米', category: 'fruit_veg', availability: 'year_round', sort: 7 }),
  ing({ id: 'ing_winter_melon_keep', name: '山药', category: 'root', availability: 'year_round', sort: 5 }),
  ing({ id: 'ing_chinese_yam_leaf', name: '蒜苗', category: 'leaf', availability: 'year_round', sort: 7 })
]

/** 城市特色：每城 ≥5 条主料 */
const CITY_INGS = []
function addCityIngs(city, rows) {
  for (const row of rows) {
    CITY_INGS.push(
      ing({
        ...row,
        cities: [city],
        availability: row.availability || 'seasonal',
        onConfirmPage: row.onConfirmPage !== false,
        sort: row.sort || 10
      })
    )
  }
}

addCityIngs('北京市', [
  { id: 'ing_bj_sesame_paste', name: '芝麻酱', category: 'seasoning', kind: 'seasoning', sort: 20 },
  { id: 'ing_bj_sweet_sauce', name: '甜面酱', category: 'seasoning', kind: 'seasoning', sort: 21 },
  { id: 'ing_bj_wheat_noodle', name: '手擀面', category: 'staple', availability: 'year_round', onConfirmPage: false, sort: 10 },
  { id: 'ing_bj_cucumber_long', name: '旱黄瓜', category: 'fruit_veg', sort: 1 },
  { id: 'ing_bj_mutton_roll', name: '羊肉卷', category: 'meat', sort: 1, avoidTags: ['lamb'] },
  { id: 'ing_bj_beijing_cabbage', name: '北京心菜', category: 'leaf', sort: 2 },
  { id: 'ing_bj_haw', name: '山楂', category: 'fruit_veg', sort: 3 },
  { id: 'ing_bj_chestnut', name: '板栗', category: 'root', sort: 4 },
  { id: 'ing_bj_duck_blood', name: '鸭血', category: 'meat', sort: 5 }
])

addCityIngs('上海市', [
  { id: 'ing_sh_hairy_crab', name: '大闸蟹', category: 'seafood', sort: 1, avoidTags: ['seafood'] },
  { id: 'ing_sh_shepherd', name: '草头', category: 'leaf', sort: 1 },
  { id: 'ing_sh_wild_rice', name: '茭白', category: 'fruit_veg', sort: 2 },
  { id: 'ing_sh_river_shrimp', name: '河虾', category: 'seafood', sort: 2, avoidTags: ['seafood'] },
  { id: 'ing_sh_oil_gluten', name: '油面筋', category: 'tofu', sort: 3, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_sh_bamboo', name: '冬笋', category: 'root', sort: 3 },
  { id: 'ing_sh_qingcai', name: '上海青', category: 'leaf', sort: 4 },
  { id: 'ing_sh_sweet_osmanthus', name: '糖藕', category: 'root', sort: 5, availability: 'year_round', onConfirmPage: false }
])

addCityIngs('广州市', [
  { id: 'ing_gz_choi_sum', name: '菜心尖', category: 'leaf', sort: 1 },
  { id: 'ing_gz_bitter', name: '凉瓜', category: 'fruit_veg', sort: 1 },
  { id: 'ing_gz_watercress', name: '西洋菜', category: 'leaf', sort: 2 },
  { id: 'ing_gz_choy_sum2', name: '通菜', category: 'leaf', sort: 3 },
  { id: 'ing_gz_dace', name: '鲮鱼', category: 'seafood', sort: 1, avoidTags: ['seafood'] },
  { id: 'ing_gz_geoduck', name: '象拔蚌', category: 'seafood', sort: 2, avoidTags: ['seafood'] },
  { id: 'ing_gz_chenpi', name: '陈皮', category: 'seasoning', kind: 'seasoning', sort: 22 },
  { id: 'ing_gz_lap_cheong', name: '腊肠', category: 'meat', sort: 4, availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
  { id: 'ing_gz_taro', name: '荔浦芋', category: 'root', sort: 5 }
])

addCityIngs('成都市', [
  { id: 'ing_cd_pea_sprout', name: '豌豆尖', category: 'leaf', sort: 1 },
  { id: 'ing_cd_lotus_root_tip', name: '藕尖', category: 'root', sort: 1 },
  { id: 'ing_cd_rabbit', name: '兔肉', category: 'meat', sort: 1 },
  { id: 'ing_cd_intestines', name: '肥肠', category: 'meat', sort: 2, avoidTags: ['pork'] },
  { id: 'ing_cd_blood', name: '猪血', category: 'meat', sort: 3, avoidTags: ['pork'] },
  { id: 'ing_cd_bamboo_pith', name: '竹荪', category: 'mushroom', sort: 2 },
  { id: 'ing_cd_celtuce', name: '儿菜', category: 'leaf', sort: 3 },
  { id: 'ing_cd_shuijiao_leaf', name: '折耳根', category: 'leaf', sort: 4 }
])

addCityIngs('重庆市', [
  { id: 'ing_cq_tripe', name: '毛肚', category: 'meat', sort: 1 },
  { id: 'ing_cq_duck_intestine', name: '鸭肠', category: 'meat', sort: 2 },
  { id: 'ing_cq_luncheon', name: '午餐肉', category: 'meat', sort: 3, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_cq_konjac', name: '魔芋', category: 'root', sort: 1 },
  { id: 'ing_cq_pea', name: '鲜豌豆', category: 'bean', sort: 2 },
  { id: 'ing_cq_lotus_stem', name: '莲藕节', category: 'root', sort: 3 },
  { id: 'ing_cq_pepper', name: '青花椒', category: 'seasoning', kind: 'seasoning', sort: 23 },
  { id: 'ing_cq_blood_tofu', name: '血旺', category: 'meat', sort: 4, avoidTags: ['pork'] }
])

addCityIngs('西安市', [
  { id: 'ing_xa_biang', name: '裤带面', category: 'staple', availability: 'year_round', onConfirmPage: false, sort: 1 },
  { id: 'ing_xa_liangpi', name: '凉皮', category: 'staple', availability: 'year_round', onConfirmPage: false, sort: 2 },
  { id: 'ing_xa_roujiamo_bun', name: '白吉馍', category: 'staple', availability: 'year_round', onConfirmPage: false, sort: 3 },
  { id: 'ing_xa_lamb', name: '羊肉片', category: 'meat', sort: 1, avoidTags: ['lamb'] },
  { id: 'ing_xa_beef_paomo', name: '泡馍料', category: 'staple', availability: 'year_round', onConfirmPage: false, sort: 4 },
  { id: 'ing_xa_persimmon', name: '火晶柿子', category: 'fruit_veg', sort: 2 },
  { id: 'ing_xa_pomegranate', name: '临潼石榴', category: 'fruit_veg', sort: 3 },
  { id: 'ing_xa_garlic_sprout', name: '蒜苔', category: 'leaf', sort: 4 }
])

addCityIngs('杭州市', [
  { id: 'ing_hz_dongpo_meat', name: '酱肉', category: 'meat', sort: 1, availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
  { id: 'ing_hz_lotus_root', name: '西湖藕', category: 'root', sort: 1 },
  { id: 'ing_hz_water_shield', name: '莼菜', category: 'leaf', sort: 2 },
  { id: 'ing_hz_bamboo_shoot', name: '春笋', category: 'root', sort: 2 },
  { id: 'ing_hz_longjing_shrimp', name: '河虾仁', category: 'seafood', sort: 1, avoidTags: ['seafood'] },
  { id: 'ing_hz_soybean', name: '老豆腐', category: 'tofu', sort: 3, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_hz_vetch', name: '苜蓿', category: 'leaf', sort: 4 },
  { id: 'ing_hz_waxberry', name: '杨梅', category: 'fruit_veg', sort: 5 }
])

addCityIngs('武汉市', [
  { id: 'ing_wh_duck_neck', name: '鸭脖', category: 'meat', sort: 1, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_wh_lotus_root', name: '洪山菜薹', category: 'leaf', sort: 1 },
  { id: 'ing_wh_crayfish', name: '小龙虾', category: 'seafood', sort: 1, avoidTags: ['seafood'] },
  { id: 'ing_wh_fish_cake', name: '鱼糕', category: 'seafood', sort: 2, avoidTags: ['seafood'] },
  { id: 'ing_wh_glutinous', name: '糯米', category: 'staple', availability: 'year_round', onConfirmPage: false, sort: 1 },
  { id: 'ing_wh_bean_skin', name: '豆皮', category: 'tofu', sort: 3, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_wh_wuchang', name: '武昌鱼', category: 'seafood', sort: 3, avoidTags: ['seafood'] },
  { id: 'ing_wh_lotus_seed', name: '莲藕粉', category: 'root', sort: 4, availability: 'year_round', onConfirmPage: false }
])

addCityIngs('长沙市', [
  { id: 'ing_cs_stinky', name: '臭豆腐坯', category: 'tofu', sort: 1, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_cs_chili', name: '朝天椒', category: 'fruit_veg', sort: 1 },
  { id: 'ing_cs_lotus', name: '湘莲', category: 'root', sort: 2 },
  { id: 'ing_cs_cured_meat', name: '腊肉', category: 'meat', sort: 1, availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
  { id: 'ing_cs_fish_head', name: '胖头鱼头', category: 'seafood', sort: 2, avoidTags: ['seafood'] },
  { id: 'ing_cs_dried_tofu', name: '湘式豆干', category: 'tofu', sort: 3 },
  { id: 'ing_cs_bamboo', name: '烟笋', category: 'root', sort: 3 },
  { id: 'ing_cs_pepper', name: '剁椒', category: 'seasoning', kind: 'seasoning', sort: 24 }
])

addCityIngs('南京市', [
  { id: 'ing_nj_salted_duck', name: '盐水鸭', category: 'meat', sort: 1, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_nj_dried_duck', name: '板鸭', category: 'meat', sort: 2, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_nj_shepherd', name: '荠菜', category: 'leaf', sort: 1 },
  { id: 'ing_nj_river_fish', name: '刀鱼', category: 'seafood', sort: 1, avoidTags: ['seafood'] },
  { id: 'ing_nj_tofu', name: '桂花鸭', category: 'meat', sort: 3, availability: 'year_round', onConfirmPage: false },
  { id: 'ing_nj_lotus', name: '菱角', category: 'fruit_veg', sort: 2 },
  { id: 'ing_nj_reed', name: '芦蒿', category: 'leaf', sort: 3 },
  { id: 'ing_nj_crab_spawn', name: '蟹黄', category: 'seafood', sort: 4, avoidTags: ['seafood'] }
])

/** 全国菜谱扩充 */
const NATIONAL_RCPS = [
  rcp({ id: 'rcp_mapo_tofu', name: '麻婆豆腐', mainIngredients: ['北豆腐', '猪肉'], seasonings: ['盐', '酱油', '豆瓣酱', '花椒'], meatVeg: 'meat', tasteTags: ['spicy', 'heavy'], dishForms: ['braise'], minutes: 30 }),
  rcp({ id: 'rcp_egg_plant_garlic', name: '鱼香茄子', mainIngredients: ['茄子'], seasonings: ['盐', '酱油', '糖', '醋', '蒜'], meatVeg: 'veg', tasteTags: ['spicy'], dishForms: ['braise'], minutes: 25 }),
  rcp({ id: 'rcp_tomato_egg_soup2', name: '紫菜蛋花汤', mainIngredients: ['鸡蛋'], seasonings: ['盐', '香油'], meatVeg: 'soup', dishForms: ['soup'], minutes: 10 }),
  rcp({ id: 'rcp_garlic_broccoli', name: '蒜蓉西兰花', mainIngredients: ['西兰花'], seasonings: ['盐', '蒜', '蚝油'], meatVeg: 'veg', minutes: 15 }),
  rcp({ id: 'rcp_wood_ear_egg', name: '木耳炒蛋', mainIngredients: ['木耳', '鸡蛋'], meatVeg: 'veg', minutes: 15 }),
  rcp({ id: 'rcp_potato_silk', name: '酸辣土豆丝', mainIngredients: ['土豆'], seasonings: ['盐', '醋', '干辣椒'], meatVeg: 'veg', tasteTags: ['spicy', 'light'], minutes: 15 }),
  rcp({ id: 'rcp_cabbage_vermicelli', name: '白菜炖粉条', mainIngredients: ['大白菜', '粉丝', '猪肉'], meatVeg: 'meat', dishForms: ['braise'], minutes: 40 }),
  rcp({ id: 'rcp_ribs_potato', name: '排骨炖土豆', mainIngredients: ['排骨', '土豆'], meatVeg: 'meat', dishForms: ['braise'], minutes: 50, servings: 3 }),
  rcp({ id: 'rcp_cola_wings', name: '可乐鸡翅', mainIngredients: ['鸡翅'], seasonings: ['盐', '酱油', '料酒'], meatVeg: 'meat', dishForms: ['braise'], minutes: 35 }),
  rcp({ id: 'rcp_steamed_bass', name: '清蒸鲈鱼', mainIngredients: ['鲈鱼'], seasonings: ['盐', '葱', '姜', '料酒'], meatVeg: 'meat', tasteTags: ['light'], dishForms: ['steam'], minutes: 25 }),
  rcp({ id: 'rcp_braised_beef', name: '红烧牛腩', mainIngredients: ['牛腩', '土豆'], meatVeg: 'meat', dishForms: ['braise'], minutes: 90, servings: 3 }),
  rcp({ id: 'rcp_tofu_fish', name: '豆腐鱼汤', mainIngredients: ['草鱼', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'], minutes: 35 }),
  rcp({ id: 'rcp_stir_bean', name: '干煸豆角', mainIngredients: ['豆角', '猪肉'], seasonings: ['盐', '酱油', '干辣椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 20 }),
  rcp({ id: 'rcp_pumpkin_porridge', name: '蒜蓉南瓜', mainIngredients: ['南瓜'], seasonings: ['盐', '蒜'], meatVeg: 'veg', tasteTags: ['light'], minutes: 20 }),
  rcp({ id: 'rcp_loofah_egg', name: '丝瓜炒蛋', mainIngredients: ['丝瓜', '鸡蛋'], meatVeg: 'veg', minutes: 15 }),
  rcp({ id: 'rcp_lettuce_oyster', name: '蚝油生菜', mainIngredients: ['生菜'], seasonings: ['盐', '蚝油', '蒜'], meatVeg: 'veg', tasteTags: ['light'], minutes: 10 }),
  rcp({ id: 'rcp_mushroom_veg', name: '香菇青菜', mainIngredients: ['香菇', '小白菜'], meatVeg: 'veg', minutes: 15 }),
  rcp({ id: 'rcp_corn_ribs_soup', name: '玉米排骨汤', mainIngredients: ['玉米', '排骨'], meatVeg: 'soup', dishForms: ['soup'], minutes: 60, servings: 3 }),
  rcp({ id: 'rcp_yam_ribs', name: '山药排骨汤', mainIngredients: ['山药', '排骨'], meatVeg: 'soup', dishForms: ['soup'], minutes: 50 }),
  rcp({ id: 'rcp_garlic_sprout_pork', name: '蒜苗炒肉', mainIngredients: ['蒜苗', '猪肉'], meatVeg: 'meat', minutes: 20 }),
  rcp({ id: 'rcp_dried_tofu_celery', name: '芹菜香干', mainIngredients: ['芹菜', '豆干'], meatVeg: 'veg', minutes: 15 }),
  rcp({ id: 'rcp_bean_sprout_meat', name: '豆芽炒肉', mainIngredients: ['豆芽', '猪肉'], meatVeg: 'meat', minutes: 15 }),
  rcp({ id: 'rcp_eggplant_potato_pepper', name: '地三鲜', mainIngredients: ['茄子', '土豆', '青椒'], meatVeg: 'veg', dishForms: ['stir_fry'], minutes: 25 }),
  rcp({ id: 'rcp_sweet_sour_ribs', name: '糖醋排骨', mainIngredients: ['排骨'], seasonings: ['盐', '糖', '醋', '酱油'], meatVeg: 'meat', dishForms: ['braise'], minutes: 45 }),
  rcp({ id: 'rcp_kungpao_chicken', name: '宫保鸡丁', mainIngredients: ['鸡肉'], seasonings: ['盐', '酱油', '糖', '醋', '干辣椒', '花椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 25 }),
  rcp({ id: 'rcp_fish_flavored_pork', name: '鱼香肉丝', mainIngredients: ['猪肉', '木耳', '胡萝卜'], seasonings: ['盐', '酱油', '糖', '醋', '蒜'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 25 }),
  rcp({ id: 'rcp_twice_cooked', name: '回锅肉', mainIngredients: ['五花肉', '青椒'], seasonings: ['盐', '豆瓣酱'], meatVeg: 'meat', tasteTags: ['spicy', 'heavy'], minutes: 30 }),
  rcp({ id: 'rcp_hot_sour_soup', name: '酸辣汤', mainIngredients: ['北豆腐', '木耳', '鸡蛋'], seasonings: ['盐', '醋', '胡椒'], meatVeg: 'soup', dishForms: ['soup'], tasteTags: ['spicy'], minutes: 20 }),
  rcp({ id: 'rcp_napa_pork', name: '醋溜白菜', mainIngredients: ['大白菜'], seasonings: ['盐', '醋', '干辣椒'], meatVeg: 'veg', minutes: 15 }),
  rcp({ id: 'rcp_tomato_beef', name: '番茄牛腩', mainIngredients: ['牛腩', '番茄'], meatVeg: 'meat', dishForms: ['braise'], minutes: 80, servings: 3 }),
  rcp({ id: 'rcp_noodle_zhajiang', name: '炸酱面', mainIngredients: ['挂面', '猪肉'], seasonings: ['盐', '酱油'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], minutes: 30 }),
  rcp({ id: 'rcp_noodle_egg_tomato2', name: '葱油拌面', mainIngredients: ['挂面'], seasonings: ['盐', '酱油', '葱', '香油'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['light'], minutes: 15 }),
  rcp({ id: 'rcp_dumpling_chive', name: '白菜猪肉饺', mainIngredients: ['饺子皮', '猪肉', '大白菜'], meatVeg: 'staple', dishForms: ['dumpling'], stapleForms: ['dumpling'], minutes: 45 }),
  rcp({ id: 'rcp_hotpot_spicy', name: '红汤锅底', mainIngredients: ['小白菜'], seasonings: ['豆瓣酱', '花椒', '干辣椒'], meatVeg: 'soup', dishForms: ['hotpot'], tasteTags: ['spicy'], minutes: 20 }),
  rcp({ id: 'rcp_hotpot_beef', name: '涮肥牛', mainIngredients: ['牛肉'], meatVeg: 'meat', dishForms: ['hotpot'], minutes: 10 }),
  rcp({ id: 'rcp_lettuce_stem_stir', name: '清炒莴笋', mainIngredients: ['莴笋'], meatVeg: 'veg', tasteTags: ['light'], minutes: 12 }),
  rcp({ id: 'rcp_abalone_mushroom', name: '炒杏鲍菇', mainIngredients: ['杏鲍菇'], seasonings: ['盐', '蚝油'], meatVeg: 'veg', minutes: 12 }),
  rcp({ id: 'rcp_tofu_skin_soup', name: '腐竹排骨汤', mainIngredients: ['腐竹', '排骨'], meatVeg: 'soup', dishForms: ['soup'], minutes: 55 }),
  rcp({ id: 'rcp_soft_tofu_fish', name: '嫩豆腐蒸蛋', mainIngredients: ['嫩豆腐', '鸡蛋'], seasonings: ['盐', '香油'], meatVeg: 'veg', tasteTags: ['light'], dishForms: ['steam'], minutes: 20 }),
  rcp({ id: 'rcp_wide_noodle_stew', name: '宽粉烧肉', mainIngredients: ['宽粉', '猪肉'], meatVeg: 'meat', dishForms: ['braise'], minutes: 40 })
]

function cityRcps(city, list) {
  return list.map((x) => rcp({ ...x, cities: [city] }))
}

const CITY_RCPS = [
  ...cityRcps('北京市', [
    { id: 'rcp_bj_zhajiang', name: '京酱肉丝', mainIngredients: ['猪肉', '旱黄瓜'], seasonings: ['盐', '甜面酱'], meatVeg: 'meat', minutes: 25 },
    { id: 'rcp_bj_hotpot_mutton', name: '铜锅涮肉', mainIngredients: ['羊肉卷', '大白菜'], meatVeg: 'meat', dishForms: ['hotpot'], minutes: 20 },
    { id: 'rcp_bj_noodles', name: '打卤面', mainIngredients: ['手擀面', '鸡蛋'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], minutes: 30 },
    { id: 'rcp_bj_duck_blood', name: '鸭血粉丝汤', mainIngredients: ['鸭血', '粉丝'], meatVeg: 'soup', dishForms: ['soup'], minutes: 25 },
    { id: 'rcp_bj_chestnut_chicken', name: '板栗烧鸡', mainIngredients: ['板栗', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'], minutes: 50 },
    { id: 'rcp_bj_cabbage', name: '醋溜心菜', mainIngredients: ['北京心菜'], seasonings: ['盐', '醋'], meatVeg: 'veg', minutes: 12 },
    { id: 'rcp_bj_sesame_spinach', name: '芝麻酱菠菜', mainIngredients: ['菠菜'], seasonings: ['盐', '芝麻酱'], meatVeg: 'veg', tasteTags: ['light'], minutes: 10 }
  ]),
  ...cityRcps('上海市', [
    { id: 'rcp_sh_hongshao', name: '上海红烧肉', mainIngredients: ['五花肉'], seasonings: ['盐', '酱油', '糖', '料酒'], meatVeg: 'meat', dishForms: ['braise'], tasteTags: ['heavy'], minutes: 60 },
    { id: 'rcp_sh_shepherd', name: '草头圈子', mainIngredients: ['草头', '五花肉'], meatVeg: 'meat', minutes: 25 },
    { id: 'rcp_sh_jiaobai', name: '油焖茭白', mainIngredients: ['茭白'], meatVeg: 'veg', minutes: 20 },
    { id: 'rcp_sh_shrimp', name: '油爆河虾', mainIngredients: ['河虾'], seasonings: ['盐', '料酒', '葱', '姜'], meatVeg: 'meat', minutes: 20 },
    { id: 'rcp_sh_crab', name: '清蒸大闸蟹', mainIngredients: ['大闸蟹'], seasonings: ['醋', '姜'], meatVeg: 'meat', tasteTags: ['light'], dishForms: ['steam'], minutes: 25 },
    { id: 'rcp_sh_bamboo_pork', name: '冬笋炒肉', mainIngredients: ['冬笋', '猪肉'], meatVeg: 'meat', minutes: 20 },
    { id: 'rcp_sh_qingcai', name: '清炒上海青', mainIngredients: ['上海青'], meatVeg: 'veg', tasteTags: ['light'], minutes: 10 },
    { id: 'rcp_sh_gluten', name: '油面筋塞肉', mainIngredients: ['油面筋', '猪肉'], meatVeg: 'meat', dishForms: ['braise'], minutes: 35 }
  ]),
  ...cityRcps('广州市', [
    { id: 'rcp_gz_white_cut', name: '白切鸡', mainIngredients: ['鸡肉'], seasonings: ['盐', '姜', '葱', '香油'], meatVeg: 'meat', tasteTags: ['light'], dishForms: ['steam'], minutes: 40 },
    { id: 'rcp_gz_bitter', name: '凉瓜炒蛋', mainIngredients: ['凉瓜', '鸡蛋'], meatVeg: 'veg', minutes: 15 },
    { id: 'rcp_gz_watercress', name: '西洋菜排骨汤', mainIngredients: ['西洋菜', '排骨'], meatVeg: 'soup', dishForms: ['soup'], minutes: 60 },
    { id: 'rcp_gz_choi', name: '白灼菜心', mainIngredients: ['菜心尖'], seasonings: ['盐', '蚝油'], meatVeg: 'veg', tasteTags: ['light'], minutes: 10 },
    { id: 'rcp_gz_dace', name: '豆豉鲮鱼油麦菜', mainIngredients: ['鲮鱼', '生菜'], seasonings: ['盐', '蒜'], meatVeg: 'meat', minutes: 20 },
    { id: 'rcp_gz_lap', name: '腊肠炒饭配菜', mainIngredients: ['腊肠', '鸡蛋'], meatVeg: 'meat', minutes: 20 },
    { id: 'rcp_gz_tongcai', name: '蒜蓉通菜', mainIngredients: ['通菜'], seasonings: ['盐', '蒜'], meatVeg: 'veg', minutes: 10 }
  ]),
  ...cityRcps('成都市', [
    { id: 'rcp_cd_mapo', name: '成都麻婆豆腐', mainIngredients: ['北豆腐', '猪肉'], seasonings: ['盐', '郫县豆瓣', '花椒'], meatVeg: 'meat', tasteTags: ['spicy'], dishForms: ['braise'], minutes: 25 },
    { id: 'rcp_cd_shui', name: '水煮肉片', mainIngredients: ['猪肉', '生菜'], seasonings: ['盐', '郫县豆瓣', '干辣椒', '花椒'], meatVeg: 'meat', tasteTags: ['spicy', 'heavy'], minutes: 30 },
    { id: 'rcp_cd_pea', name: '清炒豌豆尖', mainIngredients: ['豌豆尖'], seasonings: ['盐', '蒜'], meatVeg: 'veg', tasteTags: ['light'], minutes: 8 },
    { id: 'rcp_cd_rabbit', name: '冷吃兔', mainIngredients: ['兔肉'], seasonings: ['盐', '花椒', '干辣椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 50 },
    { id: 'rcp_cd_intestines', name: '九转肥肠', mainIngredients: ['肥肠'], seasonings: ['盐', '郫县豆瓣', '花椒'], meatVeg: 'meat', tasteTags: ['spicy', 'heavy'], minutes: 60 },
    { id: 'rcp_cd_blood', name: '毛血旺风味', mainIngredients: ['猪血', '黄豆芽'.replace('黄豆芽', '豆芽')], seasonings: ['盐', '郫县豆瓣', '花椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 35 },
    { id: 'rcp_cd_zheergen', name: '折耳根炒腊肉', mainIngredients: ['折耳根', '五花肉'], seasonings: ['盐', '干辣椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 20 },
    { id: 'rcp_cd_ercai', name: '儿菜炒肉', mainIngredients: ['儿菜', '猪肉'], meatVeg: 'meat', minutes: 20 }
  ]),
  ...cityRcps('重庆市', [
    { id: 'rcp_cq_hotpot', name: '重庆火锅', mainIngredients: ['毛肚', '鸭肠'], seasonings: ['豆瓣酱', '青花椒', '干辣椒'], meatVeg: 'meat', dishForms: ['hotpot'], tasteTags: ['spicy'], minutes: 30 },
    { id: 'rcp_cq_blood', name: '毛血旺', mainIngredients: ['血旺', '黄豆芽'.replace('黄豆芽', '豆芽')], seasonings: ['盐', '豆瓣酱', '青花椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 35 },
    { id: 'rcp_cq_konjac', name: '魔芋烧鸭', mainIngredients: ['魔芋', '鸭肉'], meatVeg: 'meat', dishForms: ['braise'], minutes: 40 },
    { id: 'rcp_cq_pea', name: '豌豆肥肠', mainIngredients: ['鲜豌豆', '肥肠'.replace('肥肠', '猪肉')], seasonings: ['盐', '豆瓣酱'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 45 },
    { id: 'rcp_cq_lunch', name: '火锅午餐肉', mainIngredients: ['午餐肉'], meatVeg: 'meat', dishForms: ['hotpot'], minutes: 5 },
    { id: 'rcp_cq_lotus', name: '莲藕排骨汤渝味', mainIngredients: ['莲藕节', '排骨'], meatVeg: 'soup', dishForms: ['soup'], minutes: 55 }
  ]),
  ...cityRcps('西安市', [
    { id: 'rcp_xa_biang', name: '油泼裤带面', mainIngredients: ['裤带面'], seasonings: ['盐', '酱油', '蒜', '干辣椒'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy'], minutes: 25 },
    { id: 'rcp_xa_liangpi', name: '陕西凉皮', mainIngredients: ['凉皮'], seasonings: ['盐', '醋', '蒜', '辣椒油'.replace('辣椒油', '红油')], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy', 'light'], minutes: 15 },
    { id: 'rcp_xa_paomo', name: '羊肉泡馍', mainIngredients: ['泡馍料', '羊肉片'], seasonings: ['盐', '葱', '姜'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], minutes: 40 },
    { id: 'rcp_xa_roujiamo', name: '肉夹馍配菜', mainIngredients: ['白吉馍', '五花肉'], seasonings: ['盐', '酱油'], meatVeg: 'meat', minutes: 35 },
    { id: 'rcp_xa_garlic', name: '蒜苔炒肉西安', mainIngredients: ['蒜苔', '猪肉'], meatVeg: 'meat', minutes: 18 },
    { id: 'rcp_xa_lamb_skewer_home', name: '葱爆羊肉片', mainIngredients: ['羊肉片', '葱'], seasonings: ['盐', '花椒'], meatVeg: 'meat', minutes: 15 }
  ]),
  ...cityRcps('杭州市', [
    { id: 'rcp_hz_dongpo', name: '东坡肉', mainIngredients: ['五花肉'], seasonings: ['盐', '酱油', '糖', '料酒'], meatVeg: 'meat', dishForms: ['braise'], tasteTags: ['heavy'], minutes: 90, servings: 3 },
    { id: 'rcp_hz_west_lake', name: '西湖醋鱼风味', mainIngredients: ['草鱼'], seasonings: ['盐', '醋', '糖', '姜'], meatVeg: 'meat', tasteTags: ['light'], minutes: 30 },
    { id: 'rcp_hz_longjing', name: '龙井虾仁', mainIngredients: ['河虾仁'], seasonings: ['盐', '料酒', '淀粉'], meatVeg: 'meat', tasteTags: ['light'], minutes: 20 },
    { id: 'rcp_hz_lotus', name: '糖藕', mainIngredients: ['西湖藕'], seasonings: ['糖'], meatVeg: 'veg', tasteTags: ['light'], dishForms: ['braise'], minutes: 40 },
    { id: 'rcp_hz_chun', name: '莼菜汤', mainIngredients: ['莼菜', '鸡蛋'], meatVeg: 'soup', dishForms: ['soup'], tasteTags: ['light'], minutes: 15 },
    { id: 'rcp_hz_bamboo', name: '油焖春笋', mainIngredients: ['春笋'], meatVeg: 'veg', minutes: 25 },
    { id: 'rcp_hz_tofu', name: '杭豆腐', mainIngredients: ['老豆腐'], seasonings: ['盐', '酱油', '糖'], meatVeg: 'veg', dishForms: ['braise'], minutes: 20 }
  ]),
  ...cityRcps('武汉市', [
    { id: 'rcp_wh_crayfish', name: '香辣小龙虾', mainIngredients: ['小龙虾'], seasonings: ['盐', '豆瓣酱', '干辣椒', '花椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 35 },
    { id: 'rcp_wh_caitai', name: '腊味菜薹', mainIngredients: ['洪山菜薹', '五花肉'], meatVeg: 'meat', minutes: 20 },
    { id: 'rcp_wh_fish', name: '清蒸武昌鱼', mainIngredients: ['武昌鱼'], seasonings: ['盐', '葱', '姜', '料酒'], meatVeg: 'meat', tasteTags: ['light'], dishForms: ['steam'], minutes: 30 },
    { id: 'rcp_wh_doupi', name: '蛋皮豆皮', mainIngredients: ['豆皮', '鸡蛋', '猪肉'], meatVeg: 'meat', minutes: 30 },
    { id: 'rcp_wh_duck_neck', name: '卤鸭脖家常', mainIngredients: ['鸭脖'], seasonings: ['盐', '花椒', '干辣椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 50 },
    { id: 'rcp_wh_fish_cake', name: '鱼糕汤', mainIngredients: ['鱼糕'], meatVeg: 'soup', dishForms: ['soup'], minutes: 20 }
  ]),
  ...cityRcps('长沙市', [
    { id: 'rcp_cs_stinky', name: '臭豆腐炒肉', mainIngredients: ['臭豆腐坯', '猪肉'], seasonings: ['盐', '剁椒'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 20 },
    { id: 'rcp_cs_fish_head', name: '剁椒鱼头', mainIngredients: ['胖头鱼头'], seasonings: ['盐', '剁椒', '蒜'], meatVeg: 'meat', tasteTags: ['spicy'], dishForms: ['steam'], minutes: 35 },
    { id: 'rcp_cs_cured', name: '腊肉炒烟笋', mainIngredients: ['腊肉', '烟笋'], meatVeg: 'meat', tasteTags: ['spicy'], minutes: 25 },
    { id: 'rcp_cs_dry_tofu', name: '香干炒朝天椒', mainIngredients: ['湘式豆干', '朝天椒'], seasonings: ['盐', '蒜'], meatVeg: 'veg', tasteTags: ['spicy'], minutes: 12 },
    { id: 'rcp_cs_lotus', name: '湘莲排骨汤', mainIngredients: ['湘莲', '排骨'], meatVeg: 'soup', dishForms: ['soup'], minutes: 55 },
    { id: 'rcp_cs_chili_egg', name: '擂辣椒皮蛋风味蛋', mainIngredients: ['鸡蛋', '朝天椒'], seasonings: ['盐', '蒜'], meatVeg: 'veg', tasteTags: ['spicy'], minutes: 15 }
  ]),
  ...cityRcps('南京市', [
    { id: 'rcp_nj_salted_duck', name: '金陵盐水鸭拼盘', mainIngredients: ['盐水鸭'], seasonings: ['盐'], meatVeg: 'meat', tasteTags: ['light'], minutes: 10 },
    { id: 'rcp_nj_shepherd', name: '荠菜豆腐羹', mainIngredients: ['荠菜', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'], tasteTags: ['light'], minutes: 20 },
    { id: 'rcp_nj_reed', name: '芦蒿炒香干', mainIngredients: ['芦蒿', '豆干'], meatVeg: 'veg', minutes: 12 },
    { id: 'rcp_nj_fish', name: '清蒸刀鱼', mainIngredients: ['刀鱼'], seasonings: ['盐', '葱', '姜', '料酒'], meatVeg: 'meat', tasteTags: ['light'], dishForms: ['steam'], minutes: 25 },
    { id: 'rcp_nj_ling', name: '清炒菱角', mainIngredients: ['菱角'], meatVeg: 'veg', minutes: 15 },
    { id: 'rcp_nj_duck', name: '板鸭煮笋干风味', mainIngredients: ['板鸭', '春笋'.replace('春笋', '莲藕')], meatVeg: 'meat', dishForms: ['braise'], minutes: 40 }
  ])
]

// Fix awkward replaces - clean up recipes that used .replace hacks
function fixRcp(r) {
  const map = {
    rcp_cd_blood: { mainIngredients: ['猪血', '豆芽'] },
    rcp_cq_blood: { mainIngredients: ['血旺', '豆芽'] },
    rcp_cq_pea: { mainIngredients: ['鲜豌豆', '猪肉'] },
    rcp_xa_liangpi: { seasonings: ['盐', '醋', '蒜', '红油'] },
    rcp_nj_duck: { mainIngredients: ['板鸭', '莲藕'] }
  }
  if (map[r.id]) return { ...r, ...map[r.id] }
  return r
}

function mergeById(existing, extra) {
  const map = new Map()
  for (const row of existing) map.set(row.id, row)
  for (const row of extra) {
    if (map.has(row.id)) continue
    map.set(row.id, row)
  }
  return [...map.values()]
}

function main() {
  const oldIng = JSON.parse(fs.readFileSync(ING_PATH, 'utf8'))
  const oldRcp = JSON.parse(fs.readFileSync(RCP_PATH, 'utf8'))

  // Fix lamb avoid tag inconsistency: use lamb if we used it; existing uses nothing for 羊肉 - keep 羊肉 as is with avoidTags lamb for new; also add lamb to 羊肉 existing? don't mutate old heavily.

  // Seasoning rows wrongly got availability stripped in ing() - good.
  // 芝麻酱 etc are seasoning with cities - OK

  // Add 胡椒 as seasoning for 酸辣汤
  const moreSeasoning = [
    ing({ id: 'ing_white_pepper', name: '胡椒', category: 'seasoning', kind: 'seasoning', sort: 17 })
  ]

  // 重庆市 pea recipe needs 肥肠 - add shared or use 猪肉 - fixed above
  // 成都肥肠 is city ingredient - OK for 九转肥肠

  // 南京 春笋 is Hangzhou-only - fixed to 莲藕

  // 西安 葱 as main? 葱 is seasoning - for 葱爆羊肉片 mainIngredients 羊肉片+葱 - seasonings can include 葱; better use 洋葱 as national or keep 葱 in mainIngredients - matching needs ingredient name in selected. Seasonings aren't in selectedNames typically. So 葱 must be selectable OR use 洋葱.
  // Fix: 葱爆用 洋葱
  const cityRcpsFixed = CITY_RCPS.map(fixRcp).map((r) => {
    if (r.id === 'rcp_xa_lamb_skewer_home') {
      return { ...r, mainIngredients: ['羊肉片', '洋葱'] }
    }
    return r
  })

  // 重庆市 豌豆肥肠 - 肥肠 is 成都市 only. Fixed to 猪肉.
  // Add 肥肠 to 重庆 as well for authenticity
  CITY_INGS.push(
    ing({
      id: 'ing_cq_intestines',
      name: '肥肠',
      category: 'meat',
      cities: ['重庆市'],
      availability: 'seasonal',
      onConfirmPage: true,
      sort: 5,
      avoidTags: ['pork'],
      source: 'builtin',
      updatedAt: NOW
    })
  )
  // But 肥肠 name duplicate across cities - SAME name different ids - matching by name is OK, visibility is city-filtered. Duplicate names in DB might be OK for city-specific. Actually both 成都 and 重庆 have 肥肠 - for Chengdu recipe OK. Chongqing pea recipe use 肥肠 now:
  const cityRcps2 = cityRcpsFixed.map((r) =>
    r.id === 'rcp_cq_pea' ? { ...r, mainIngredients: ['鲜豌豆', '肥肠'] } : r
  )

  const packIngs = []
  const packRcps = []
  for (const pack of PACKS) {
    let i = 0
    for (const row of pack.ings) {
      i += 1
      const id = `ing_${pack.code}_${i}`
      packIngs.push(
        ing({
          id,
          name: row.name,
          category: row.category,
          cities: [pack.city],
          kind: row.kind || 'main',
          availability: row.kind === 'seasoning' ? undefined : row.availability || 'seasonal',
          onConfirmPage:
            row.kind === 'seasoning' ? undefined : row.onConfirmPage !== false,
          sort: row.sort || i,
          avoidTags: row.avoidTags || []
        })
      )
    }
    let j = 0
    for (const row of pack.rcps) {
      j += 1
      packRcps.push(
        rcp({
          id: `rcp_${pack.code}_${j}`,
          name: row.name,
          mainIngredients: row.mains,
          seasonings: row.seasonings || ['盐', '酱油'],
          meatVeg: row.meatVeg || 'meat',
          tasteTags: row.tasteTags || ['normal'],
          dishForms: row.dishForms || ['stir_fry'],
          stapleForms: row.stapleForms || ['rice'],
          cities: [pack.city],
          minutes: row.minutes || 25
        })
      )
    }
  }

  const newIng = mergeById(oldIng, [
    ...NATIONAL_INGS,
    ...moreSeasoning,
    ...CITY_INGS,
    ...packIngs
  ])
  const newRcp = mergeById(oldRcp, [
    ...NATIONAL_RCPS,
    ...cityRcps2,
    ...packRcps
  ].map(fixRcp))

  // Validate recipe mains ⊆ ingredient names
  const names = new Set(newIng.map((x) => x.name))
  const missing = []
  for (const r of newRcp) {
    for (const m of r.mainIngredients) {
      if (!names.has(m)) missing.push(`${r.id}: ${m}`)
    }
  }
  if (missing.length) {
    console.error('Missing ingredient names:\n' + missing.slice(0, 40).join('\n'))
    if (missing.length > 40) console.error('... and', missing.length - 40, 'more')
    process.exit(1)
  }

  // All city specialty counts
  const cities = new Set()
  for (const x of newIng) {
    for (const c of x.cities || []) cities.add(c)
  }
  for (const c of [...cities].sort((a, b) => a.localeCompare(b, 'zh'))) {
    const n = newIng.filter((x) => x.kind === 'main' && (x.cities || []).includes(c)).length
    if (n < 3) {
      console.error('Need ≥3 city mains for', c, 'got', n)
      process.exit(1)
    }
  }
  console.log('Cities with local mains:', cities.size)

  fs.writeFileSync(ING_PATH, JSON.stringify(newIng, null, 2) + '\n')
  fs.writeFileSync(RCP_PATH, JSON.stringify(newRcp, null, 2) + '\n')
  console.log('Wrote', newIng.length, 'ingredients,', newRcp.length, 'recipes')
}

main()
