'use strict'
/**
 * 各省（含直辖市）前三城市地方食材/菜谱包。
 * 已有：北京/上海/重庆/广州/成都/西安/杭州/武汉/长沙/南京 — 本文件只列其余。
 * 城市名带「市」，对齐微信 region picker。
 */

/** @typedef {{ name: string, category: string, availability?: string, onConfirmPage?: boolean, avoidTags?: string[], kind?: string, sort?: number }} IngSpec */
/** @typedef {{ name: string, mains: string[], meatVeg?: string, seasonings?: string[], tasteTags?: string[], dishForms?: string[], stapleForms?: string[], minutes?: number }} RcpSpec */

/**
 * @type {{ city: string, code: string, ings: IngSpec[], rcps: RcpSpec[] }[]}
 */
const PACKS = [
  // —— 直辖市补齐 ——
  {
    city: '天津市',
    code: 'tj',
    ings: [
      { name: '狗不理馅料', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '耳朵眼炸糕面', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '天津大白菜', category: 'leaf' },
      { name: '银鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '紫蟹', category: 'seafood', avoidTags: ['seafood'] },
      { name: '麻花面剂', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '天津炖两样', mains: ['猪肉', '天津大白菜'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '银鱼炒蛋', mains: ['银鱼', '鸡蛋'], meatVeg: 'meat' },
      { name: '白菜炖粉条津味', mains: ['天津大白菜', '粉丝'], meatVeg: 'veg', dishForms: ['braise'] },
      { name: '紫蟹粥配菜', mains: ['紫蟹'], meatVeg: 'meat', tasteTags: ['light'] }
    ]
  },

  // —— 河北 ——
  {
    city: '石家庄市',
    code: 'sjz',
    ings: [
      { name: '金凤扒鸡', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '正定牛肉', category: 'meat' },
      { name: '雪花梨', category: 'fruit_veg' },
      { name: '藁城宫面', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '河北大葱', category: 'leaf' }
    ],
    rcps: [
      { name: '正定扒肘子风味', mains: ['五花肉'], meatVeg: 'meat', dishForms: ['braise'], tasteTags: ['heavy'] },
      { name: '宫面打卤', mains: ['藁城宫面', '鸡蛋'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '葱烧豆腐石门', mains: ['河北大葱', '北豆腐'], meatVeg: 'veg' },
      { name: '牛肉炖土豆冀味', mains: ['正定牛肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '唐山市',
    code: 'ts',
    ings: [
      { name: '唐山麻糖料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '河豚鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '对虾唐山', category: 'seafood', avoidTags: ['seafood'] },
      { name: '乐亭大蟹', category: 'seafood', avoidTags: ['seafood'] },
      { name: '迁西板栗', category: 'root' }
    ],
    rcps: [
      { name: '唐山海鲜炖白菜', mains: ['对虾唐山', '大白菜'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '板栗烧肉冀东', mains: ['迁西板栗', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '清蒸河豚家常', mains: ['河豚鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '大蟹炒蛋', mains: ['乐亭大蟹', '鸡蛋'], meatVeg: 'meat' }
    ]
  },
  {
    city: '保定市',
    code: 'bd',
    ings: [
      { name: '驴肉', category: 'meat' },
      { name: '白运章包子馅', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '满城草莓', category: 'fruit_veg' },
      { name: '阜平蘑菇', category: 'mushroom' },
      { name: '保定春不老', category: 'leaf' }
    ],
    rcps: [
      { name: '驴肉火烧配菜', mains: ['驴肉'], meatVeg: 'meat' },
      { name: '蘑菇炖鸡保定', mains: ['阜平蘑菇', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '春不老炒肉', mains: ['保定春不老', '猪肉'], meatVeg: 'meat' },
      { name: '白菜豆腐保定熬', mains: ['大白菜', '北豆腐'], meatVeg: 'veg', dishForms: ['braise'] }
    ]
  },

  // —— 山西 ——
  {
    city: '太原市',
    code: 'ty',
    ings: [
      { name: '刀削面剂', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '老陈醋', category: 'seasoning', kind: 'seasoning' },
      { name: '莜面', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '山西土豆', category: 'root' },
      { name: '羊杂', category: 'meat', avoidTags: ['lamb'] }
    ],
    rcps: [
      { name: '太原刀削面', mains: ['刀削面剂', '猪肉'], seasonings: ['盐', '酱油', '老陈醋'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '过油肉', mains: ['猪肉'], seasonings: ['盐', '酱油', '老陈醋'], meatVeg: 'meat' },
      { name: '莜面烤佬佬', mains: ['莜面'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '醋溜土豆丝晋味', mains: ['山西土豆'], seasonings: ['盐', '老陈醋'], meatVeg: 'veg' }
    ]
  },
  {
    city: '大同市',
    code: 'dt',
    ings: [
      { name: '黄花菜', category: 'leaf' },
      { name: '大同凉粉', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '羊羔肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '浑源黄芪菜', category: 'leaf' },
      { name: '大同胡萝卜', category: 'root' }
    ],
    rcps: [
      { name: '黄花菜炒蛋', mains: ['黄花菜', '鸡蛋'], meatVeg: 'veg' },
      { name: '羊羔肉炖萝卜', mains: ['羊羔肉', '大同胡萝卜'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '大同凉粉拌', mains: ['大同凉粉'], seasonings: ['盐', '醋', '蒜'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '黄芪炖鸡', mains: ['浑源黄芪菜', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '运城市',
    code: 'yc',
    ings: [
      { name: '运城苹果', category: 'fruit_veg' },
      { name: '闻喜煮饼料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '黄河鲤鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '芮城麻片料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '运城大葱', category: 'leaf' }
    ],
    rcps: [
      { name: '糖醋黄河鲤', mains: ['黄河鲤鱼'], seasonings: ['盐', '糖', '醋'], meatVeg: 'meat' },
      { name: '葱爆羊肉运城', mains: ['羊肉', '运城大葱'], meatVeg: 'meat' },
      { name: '苹果肉片汤', mains: ['运城苹果', '猪肉'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '素炒运城土豆', mains: ['土豆'], meatVeg: 'veg' }
    ]
  },

  // —— 内蒙古 ——
  {
    city: '呼和浩特市',
    code: 'hhht',
    ings: [
      { name: '手把肉羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '奶豆腐', category: 'tofu' },
      { name: '莜面窝窝', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '沙葱', category: 'leaf' },
      { name: '牛骨髓', category: 'meat' }
    ],
    rcps: [
      { name: '手把肉', mains: ['手把肉羊肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '奶豆腐汤', mains: ['奶豆腐'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '沙葱炒羊肉', mains: ['沙葱', '羊肉'], meatVeg: 'meat' },
      { name: '莜面窝窝浇汤', mains: ['莜面窝窝', '羊肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] }
    ]
  },
  {
    city: '包头市',
    code: 'bt',
    ings: [
      { name: '包头羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '黄河鲤', category: 'seafood', avoidTags: ['seafood'] },
      { name: '鹿茸菇包头', category: 'mushroom' },
      { name: '甜菜叶', category: 'leaf' },
      { name: '草原牛肉干料', category: 'meat', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '包头涮羊肉', mains: ['包头羊肉', '大白菜'], meatVeg: 'meat', dishForms: ['hotpot'] },
      { name: '清蒸黄河鲤', mains: ['黄河鲤'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '鹿茸菇炒肉', mains: ['鹿茸菇包头', '猪肉'], meatVeg: 'meat' },
      { name: '甜菜叶汤', mains: ['甜菜叶'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },
  {
    city: '鄂尔多斯市',
    code: 'ords',
    ings: [
      { name: '鄂尔多斯羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '阿尔巴斯绒山羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '沙棘', category: 'fruit_veg' },
      { name: '地椒', category: 'seasoning', kind: 'seasoning' },
      { name: '糜米', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '地椒羊肉', mains: ['鄂尔多斯羊肉'], seasonings: ['盐', '地椒'], meatVeg: 'meat' },
      { name: '糜米羊肉粥配', mains: ['糜米', '阿尔巴斯绒山羊肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '沙棘排骨', mains: ['沙棘', '排骨'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '羊肉土豆鄂尔多斯', mains: ['鄂尔多斯羊肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 辽宁 ——
  {
    city: '沈阳市',
    code: 'sy',
    ings: [
      { name: '沈阳鸡架', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '酸菜', category: 'leaf', availability: 'year_round', onConfirmPage: false },
      { name: '黏豆包馅', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '辽参', category: 'seafood', avoidTags: ['seafood'] },
      { name: '籽粒玉米辽', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '酸菜白肉', mains: ['酸菜', '五花肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '鸡架炖土豆', mains: ['沈阳鸡架', '土豆'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '葱烧辽参', mains: ['辽参'], seasonings: ['盐', '葱', '蚝油'], meatVeg: 'meat' },
      { name: '玉米排骨沈阳', mains: ['籽粒玉米辽', '排骨'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },
  {
    city: '大连市',
    code: 'dl',
    ings: [
      { name: '海胆', category: 'seafood', avoidTags: ['seafood'] },
      { name: '鲍鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '海蛎子', category: 'seafood', avoidTags: ['seafood'] },
      { name: '蚬子', category: 'seafood', avoidTags: ['seafood'] },
      { name: '大连樱桃', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '蒜蓉粉丝蒸扇贝风味', mains: ['海蛎子', '粉丝'], seasonings: ['盐', '蒜'], meatVeg: 'meat', dishForms: ['steam'] },
      { name: '葱烧海参鲍', mains: ['鲍鱼'], seasonings: ['盐', '葱', '蚝油'], meatVeg: 'meat' },
      { name: '蚬子炖蛋', mains: ['蚬子', '鸡蛋'], meatVeg: 'meat' },
      { name: '清蒸海胆蛋', mains: ['海胆', '鸡蛋'], meatVeg: 'meat', tasteTags: ['light'] }
    ]
  },
  {
    city: '鞍山市',
    code: 'as',
    ings: [
      { name: '南果梨', category: 'fruit_veg' },
      { name: '海城馅饼馅', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '鞍山牛庄饼', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '柞蚕蛹', category: 'meat' },
      { name: '汤岗子蘑菇', category: 'mushroom' }
    ],
    rcps: [
      { name: '蘑菇炖小鸡鞍山', mains: ['汤岗子蘑菇', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '蚕蛹炒青椒', mains: ['柞蚕蛹', '青椒'], meatVeg: 'meat' },
      { name: '猪肉炖粉条鞍山', mains: ['猪肉', '粉丝'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '白菜豆腐鞍山熬', mains: ['大白菜', '北豆腐'], meatVeg: 'veg' }
    ]
  },

  // —— 吉林 ——
  {
    city: '长春市',
    code: 'cc',
    ings: [
      { name: '锅包肉浆', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '酸菜白肉料', category: 'leaf', availability: 'year_round', onConfirmPage: false },
      { name: '鹿肉', category: 'meat' },
      { name: '东北榛蘑', category: 'mushroom' },
      { name: '黏玉米', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '长春锅包肉', mains: ['猪肉'], seasonings: ['盐', '糖', '醋', '酱油'], meatVeg: 'meat' },
      { name: '榛蘑炖鸡', mains: ['东北榛蘑', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '鹿肉炖土豆', mains: ['鹿肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '黏玉米排骨汤', mains: ['黏玉米', '排骨'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },
  {
    city: '吉林市',
    code: 'jl',
    ings: [
      { name: '松花蛋', category: 'egg_dairy', availability: 'year_round', onConfirmPage: false },
      { name: '白鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '乌拉草芽', category: 'leaf' },
      { name: '雾凇下江鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '吉林大豆', category: 'bean' }
    ],
    rcps: [
      { name: '清蒸白鱼', mains: ['白鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '皮蛋豆腐吉林', mains: ['松花蛋', '北豆腐'], meatVeg: 'veg' },
      { name: '江鱼豆腐汤', mains: ['雾凇下江鱼', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '大豆炖排骨', mains: ['吉林大豆', '排骨'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '四平市',
    code: 'sp',
    ings: [
      { name: '四平李连贵熏肉', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '梨树大米配菜', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '双辽羊草蘑菇', category: 'mushroom' },
      { name: '四平辣椒', category: 'fruit_veg' },
      { name: '伊通杂粮', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '熏肉炒白菜', mains: ['四平李连贵熏肉', '大白菜'], meatVeg: 'meat' },
      { name: '蘑菇炒肉四平', mains: ['双辽羊草蘑菇', '猪肉'], meatVeg: 'meat' },
      { name: '辣椒炒肉四平', mains: ['四平辣椒', '猪肉'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '豆腐炖白菜四平', mains: ['北豆腐', '大白菜'], meatVeg: 'veg', dishForms: ['braise'] }
    ]
  },

  // —— 黑龙江 ——
  {
    city: '哈尔滨市',
    code: 'hrb',
    ings: [
      { name: '红肠', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '东北酸菜哈', category: 'leaf', availability: 'year_round', onConfirmPage: false },
      { name: '大列巴配菜', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '飞龙鸟肉', category: 'meat' },
      { name: '松仁', category: 'root' }
    ],
    rcps: [
      { name: '红肠炖酸菜', mains: ['红肠', '东北酸菜哈'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '地三鲜哈尔滨', mains: ['茄子', '土豆', '青椒'], meatVeg: 'veg' },
      { name: '松仁玉米', mains: ['松仁', '玉米'], meatVeg: 'veg' },
      { name: '锅包肉哈尔滨', mains: ['猪肉'], seasonings: ['盐', '糖', '醋'], meatVeg: 'meat' }
    ]
  },
  {
    city: '齐齐哈尔市',
    code: 'qqhr',
    ings: [
      { name: '齐齐哈尔烤肉肉', category: 'meat' },
      { name: '克东腐乳菜', category: 'tofu', availability: 'year_round', onConfirmPage: false },
      { name: '扎龙鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '富裕老酸奶配', category: 'egg_dairy', availability: 'year_round', onConfirmPage: false },
      { name: '荞麦面齐', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '齐市烤肉家常', mains: ['齐齐哈尔烤肉肉', '洋葱'], meatVeg: 'meat' },
      { name: '清蒸扎龙鱼', mains: ['扎龙鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '荞麦面浇肉酱', mains: ['荞麦面齐', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '豆腐乳炒青菜', mains: ['克东腐乳菜', '小白菜'], meatVeg: 'veg' }
    ]
  },
  {
    city: '大庆市',
    code: 'dq',
    ings: [
      { name: '大庆萨尔图羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '连环湖鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '大庆小米', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '杜尔伯特蘑菇', category: 'mushroom' },
      { name: '肇源大米配', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '羊肉炖粉条大庆', mains: ['大庆萨尔图羊肉', '粉丝'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '连环湖鱼汤', mains: ['连环湖鱼', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '蘑菇酱炖土豆', mains: ['杜尔伯特蘑菇', '土豆'], meatVeg: 'veg', dishForms: ['braise'] },
      { name: '小米蒸肉', mains: ['大庆小米', '猪肉'], meatVeg: 'meat', dishForms: ['steam'] }
    ]
  },

  // —— 江苏（南京已有）——
  {
    city: '苏州市',
    code: 'sz',
    ings: [
      { name: '太湖三白银鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '碧螺春虾仁', category: 'seafood', avoidTags: ['seafood'] },
      { name: '阳澄湖蟹', category: 'seafood', avoidTags: ['seafood'] },
      { name: '苏州青团料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '太湖莼菜苏', category: 'leaf' }
    ],
    rcps: [
      { name: '清蒸阳澄湖蟹', mains: ['阳澄湖蟹'], seasonings: ['醋', '姜'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '碧螺虾仁', mains: ['碧螺春虾仁'], meatVeg: 'meat', tasteTags: ['light'] },
      { name: '银鱼炒蛋苏州', mains: ['太湖三白银鱼', '鸡蛋'], meatVeg: 'meat' },
      { name: '莼菜塘鱼羹', mains: ['太湖莼菜苏', '草鱼'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },
  {
    city: '无锡市',
    code: 'wx',
    ings: [
      { name: '无锡排骨酱', category: 'seasoning', kind: 'seasoning' },
      { name: '太湖白鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '水蜜桃', category: 'fruit_veg' },
      { name: '宜兴笋', category: 'root' },
      { name: '无锡油面筋', category: 'tofu', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '无锡酱排骨', mains: ['排骨'], seasonings: ['盐', '酱油', '糖', '无锡排骨酱'], meatVeg: 'meat', dishForms: ['braise'], tasteTags: ['heavy'] },
      { name: '白鱼汤', mains: ['太湖白鱼'], meatVeg: 'soup', dishForms: ['soup'], tasteTags: ['light'] },
      { name: '油面筋塞肉无锡', mains: ['无锡油面筋', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '笋炒肉片无锡', mains: ['宜兴笋', '猪肉'], meatVeg: 'meat' }
    ]
  },
  {
    city: '常州市',
    code: 'cz',
    ings: [
      { name: '常州萝卜干', category: 'root', availability: 'year_round', onConfirmPage: false },
      { name: '天目湖鱼头', category: 'seafood', avoidTags: ['seafood'] },
      { name: '溧阳白茶笋', category: 'root' },
      { name: '常州大麻糕料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '焦溪猪蹄', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] }
    ],
    rcps: [
      { name: '天目湖鱼头汤', mains: ['天目湖鱼头', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '萝卜干炒肉丁', mains: ['常州萝卜干', '猪肉'], meatVeg: 'meat' },
      { name: '笋干烧肉常州', mains: ['溧阳白茶笋', '五花肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '青菜豆腐常州', mains: ['小白菜', '北豆腐'], meatVeg: 'veg' }
    ]
  },

  // —— 浙江（杭州已有）——
  {
    city: '宁波市',
    code: 'nb',
    ings: [
      { name: '宁波汤圆馅', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '黄鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '泥螺', category: 'seafood', avoidTags: ['seafood'] },
      { name: '奉化水蜜桃', category: 'fruit_veg' },
      { name: '慈溪杨梅', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '宁式烤菜黄鱼', mains: ['黄鱼'], seasonings: ['盐', '酱油', '糖'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '雪菜黄鱼汤', mains: ['黄鱼', '大白菜'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '泥螺豆腐', mains: ['泥螺', '北豆腐'], meatVeg: 'meat' },
      { name: '清蒸黄鱼宁波', mains: ['黄鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] }
    ]
  },
  {
    city: '温州市',
    code: 'wz',
    ings: [
      { name: '温州鱼丸', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '灯盏糕料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '苍南紫菜', category: 'leaf' },
      { name: '温州鸭舌', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '永嘉麦饼馅', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] }
    ],
    rcps: [
      { name: '鱼丸汤', mains: ['温州鱼丸'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '紫菜蛋汤温州', mains: ['苍南紫菜', '鸡蛋'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '鸭舌拼盘家常', mains: ['温州鸭舌'], meatVeg: 'meat' },
      { name: '猪肉炒年糕温', mains: ['猪肉'], meatVeg: 'meat' }
    ]
  },
  {
    city: '嘉兴市',
    code: 'jx',
    ings: [
      { name: '嘉兴粽子馅', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '南湖菱', category: 'fruit_veg' },
      { name: '嘉兴大闸蟹', category: 'seafood', avoidTags: ['seafood'] },
      { name: '桐乡香芋', category: 'root' },
      { name: '平湖糟蛋', category: 'egg_dairy', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '鲜肉粽配菜', mains: ['嘉兴粽子馅'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '清蒸嘉兴蟹', mains: ['嘉兴大闸蟹'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '南湖菱炒肉', mains: ['南湖菱', '猪肉'], meatVeg: 'meat' },
      { name: '香芋烧肉', mains: ['桐乡香芋', '五花肉'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 安徽 ——
  {
    city: '合肥市',
    code: 'hf',
    ings: [
      { name: '合肥龙虾', category: 'seafood', avoidTags: ['seafood'] },
      { name: '老母鸡合肥', category: 'meat' },
      { name: '巢湖银鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '肥西老母鸡汤料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '庐江米饺皮', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '合肥蒜香龙虾', mains: ['合肥龙虾'], seasonings: ['盐', '蒜', '干辣椒'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '老母鸡汤', mains: ['老母鸡合肥'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '银鱼炒蛋合肥', mains: ['巢湖银鱼', '鸡蛋'], meatVeg: 'meat' },
      { name: '白菜烧肉合肥', mains: ['大白菜', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '芜湖市',
    code: 'whu',
    ings: [
      { name: '鸠江小海鲜', category: 'seafood', avoidTags: ['seafood'] },
      { name: '芜湖虾籽', category: 'seafood', avoidTags: ['seafood'] },
      { name: '南陵大米配', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '湾沚芹菜', category: 'leaf' },
      { name: '无为板鸭皖', category: 'meat', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '虾籽面浇头', mains: ['芜湖虾籽', '挂面'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '芹菜炒香干芜湖', mains: ['湾沚芹菜', '豆干'], meatVeg: 'veg' },
      { name: '板鸭炖笋', mains: ['无为板鸭皖', '莲藕'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '小海鲜豆腐煲', mains: ['鸠江小海鲜', '北豆腐'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '蚌埠市',
    code: 'bb',
    ings: [
      { name: '怀远石榴', category: 'fruit_veg' },
      { name: '固镇花生', category: 'bean' },
      { name: '淮河鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '五河螃蟹', category: 'seafood', avoidTags: ['seafood'] },
      { name: '蚌埠烧饼料', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '淮河鱼汤', mains: ['淮河鱼', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '清蒸五河蟹', mains: ['五河螃蟹'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '花生米拌黄瓜', mains: ['固镇花生', '黄瓜'], meatVeg: 'veg' },
      { name: '猪肉炖粉条蚌埠', mains: ['猪肉', '粉丝'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 福建 ——
  {
    city: '福州市',
    code: 'fz',
    ings: [
      { name: '佛跳墙料', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '荔枝肉浆', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '福州鱼丸', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '海带结闽', category: 'leaf', availability: 'year_round', onConfirmPage: false },
      { name: '茉莉花茶香虾', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '荔枝肉', mains: ['猪肉'], seasonings: ['盐', '糖', '醋'], meatVeg: 'meat' },
      { name: '福州鱼丸汤', mains: ['福州鱼丸'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '海带排骨汤闽', mains: ['海带结闽', '排骨'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '虾仁炒蛋福州', mains: ['茉莉花茶香虾', '鸡蛋'], meatVeg: 'meat' }
    ]
  },
  {
    city: '厦门市',
    code: 'xm',
    ings: [
      { name: '沙茶酱', category: 'seasoning', kind: 'seasoning' },
      { name: '厦门海蛎煎料', category: 'seafood', avoidTags: ['seafood'] },
      { name: '土笋冻料', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '同安封肉料', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '文昌鱼厦', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '沙茶面浇头', mains: ['猪肉'], seasonings: ['盐', '沙茶酱'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '海蛎煎', mains: ['厦门海蛎煎料', '鸡蛋'], meatVeg: 'meat' },
      { name: '清蒸文昌鱼', mains: ['文昌鱼厦'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '番茄炒蛋厦', mains: ['番茄', '鸡蛋'], meatVeg: 'veg' }
    ]
  },
  {
    city: '泉州市',
    code: 'qz',
    ings: [
      { name: '姜母鸭料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '泉州面线', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '崇武鱼卷', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '安溪茶叶蛋料', category: 'egg_dairy', availability: 'year_round', onConfirmPage: false },
      { name: '永春芦柑', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '姜母鸭', mains: ['鸭肉'], seasonings: ['盐', '姜', '料酒'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '面线糊浇头', mains: ['泉州面线', '虾仁'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '鱼卷汤', mains: ['崇武鱼卷'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '芥蓝炒肉泉州', mains: ['猪肉', '西兰花'], meatVeg: 'meat' }
    ]
  },

  // —— 江西 ——
  {
    city: '南昌市',
    code: 'nc',
    ings: [
      { name: '瓦罐汤料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '南昌米粉', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '藜蒿', category: 'leaf' },
      { name: '鄱阳湖鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '进贤莲藕', category: 'root' }
    ],
    rcps: [
      { name: '藜蒿炒腊肉赣', mains: ['藜蒿', '五花肉'], meatVeg: 'meat' },
      { name: '南昌拌粉浇头', mains: ['南昌米粉', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '瓦罐鸡汤', mains: ['鸡肉'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '清蒸鄱阳鱼', mains: ['鄱阳湖鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] }
    ]
  },
  {
    city: '赣州市',
    code: 'gzju',
    ings: [
      { name: '赣南脐橙', category: 'fruit_veg' },
      { name: '客家酿豆腐料', category: 'tofu', availability: 'year_round', onConfirmPage: false },
      { name: '寻乌蜜桔', category: 'fruit_veg' },
      { name: '安远蘑菇', category: 'mushroom' },
      { name: '赣县小炒鱼料', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '客家酿豆腐', mains: ['北豆腐', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '小炒鱼赣州', mains: ['草鱼'], seasonings: ['盐', '干辣椒'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '蘑菇炒肉赣南', mains: ['安远蘑菇', '猪肉'], meatVeg: 'meat' },
      { name: '橙香排骨', mains: ['赣南脐橙', '排骨'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '九江市',
    code: 'jj',
    ings: [
      { name: '庐山石耳', category: 'mushroom' },
      { name: '九江茶饼料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '鄱阳湖蟹九江', category: 'seafood', avoidTags: ['seafood'] },
      { name: '修水宁红配菜', category: 'leaf' },
      { name: '都昌豆参', category: 'tofu', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '石耳炖鸡', mains: ['庐山石耳', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '清蒸湖蟹九江', mains: ['鄱阳湖蟹九江'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '豆参烧肉', mains: ['都昌豆参', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '青菜豆腐九江', mains: ['小白菜', '北豆腐'], meatVeg: 'veg' }
    ]
  },

  // —— 山东 ——
  {
    city: '济南市',
    code: 'jn',
    ings: [
      { name: '把子肉料', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '甜沫料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '章丘大葱', category: 'leaf' },
      { name: '黄河鲤济', category: 'seafood', avoidTags: ['seafood'] },
      { name: '平阴玫瑰配', category: 'leaf' }
    ],
    rcps: [
      { name: '糖醋黄河鲤济南', mains: ['黄河鲤济'], seasonings: ['盐', '糖', '醋'], meatVeg: 'meat' },
      { name: '葱烧海参济', mains: ['章丘大葱', '香菇'], meatVeg: 'veg' },
      { name: '把子肉家常', mains: ['五花肉'], meatVeg: 'meat', dishForms: ['braise'], tasteTags: ['heavy'] },
      { name: '豆腐箱济南风味', mains: ['北豆腐', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '青岛市',
    code: 'qd',
    ings: [
      { name: '青岛海鲜拼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '蛤蜊', category: 'seafood', avoidTags: ['seafood'] },
      { name: '鲅鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '崂山菇', category: 'mushroom' },
      { name: '大王白菜青', category: 'leaf' }
    ],
    rcps: [
      { name: '蛤蜊蒸蛋', mains: ['蛤蜊', '鸡蛋'], meatVeg: 'meat', dishForms: ['steam'] },
      { name: '鲅鱼水饺馅炒', mains: ['鲅鱼'], meatVeg: 'meat' },
      { name: '崂山菇炒肉', mains: ['崂山菇', '猪肉'], meatVeg: 'meat' },
      { name: '海鲜豆腐汤青岛', mains: ['青岛海鲜拼', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },
  {
    city: '烟台市',
    code: 'yt',
    ings: [
      { name: '烟台苹果', category: 'fruit_veg' },
      { name: '海参烟台', category: 'seafood', avoidTags: ['seafood'] },
      { name: '大樱桃烟台', category: 'fruit_veg' },
      { name: '蓬莱面条鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '龙口粉丝烟', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '葱烧海参烟台', mains: ['海参烟台'], seasonings: ['盐', '葱', '蚝油'], meatVeg: 'meat' },
      { name: '粉丝蒸海参烟台', mains: ['龙口粉丝烟', '海参烟台'], meatVeg: 'meat', dishForms: ['steam'] },
      { name: '面条鱼炒蛋', mains: ['蓬莱面条鱼', '鸡蛋'], meatVeg: 'meat' },
      { name: '苹果肉片烟台', mains: ['烟台苹果', '猪肉'], meatVeg: 'meat' }
    ]
  },

  // —— 河南 ——
  {
    city: '郑州市',
    code: 'zz',
    ings: [
      { name: '烩面剂', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '胡辣汤料', category: 'seasoning', kind: 'seasoning' },
      { name: '道口烧鸡', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '黄河鲤郑', category: 'seafood', avoidTags: ['seafood'] },
      { name: '新郑大枣', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '郑州烩面浇头', mains: ['烩面剂', '羊肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '胡辣汤配菜', mains: ['北豆腐'], seasonings: ['盐', '胡辣汤料'], meatVeg: 'soup', dishForms: ['soup'], tasteTags: ['spicy'] },
      { name: '糖醋鲤鱼郑州', mains: ['黄河鲤郑'], seasonings: ['盐', '糖', '醋'], meatVeg: 'meat' },
      { name: '大枣炖鸡', mains: ['新郑大枣', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '洛阳市',
    code: 'ly',
    ings: [
      { name: '洛阳水席料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '牡丹花瓣配', category: 'leaf' },
      { name: '孟津梨', category: 'fruit_veg' },
      { name: '偃师银条', category: 'root' },
      { name: '洛阳燕菜料', category: 'root', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '洛阳牡丹燕菜风味', mains: ['洛阳燕菜料', '白萝卜'], meatVeg: 'veg', dishForms: ['soup'] },
      { name: '银条炒肉', mains: ['偃师银条', '猪肉'], meatVeg: 'meat' },
      { name: '连汤肉片洛阳', mains: ['猪肉'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '白菜炖粉条洛阳', mains: ['大白菜', '粉丝'], meatVeg: 'veg', dishForms: ['braise'] }
    ]
  },
  {
    city: '南阳市',
    code: 'ny',
    ings: [
      { name: '南阳黄牛', category: 'meat' },
      { name: '新野蔬菜', category: 'leaf' },
      { name: '西峡香菇宛', category: 'mushroom' },
      { name: '桐柏玉兰片', category: 'root' },
      { name: '邓州面', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '黄牛肉炖萝卜', mains: ['南阳黄牛', '白萝卜'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '西峡香菇炒肉', mains: ['西峡香菇宛', '猪肉'], meatVeg: 'meat' },
      { name: '玉兰片炒肉', mains: ['桐柏玉兰片', '猪肉'], meatVeg: 'meat' },
      { name: '邓州面浇肉酱', mains: ['邓州面', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] }
    ]
  },

  // —— 湖北（武汉已有）——
  {
    city: '宜昌市',
    code: 'yich',
    ings: [
      { name: '清江鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '秭归脐橙', category: 'fruit_veg' },
      { name: '宜昌蜜桔', category: 'fruit_veg' },
      { name: '三峡香菇', category: 'mushroom' },
      { name: '昭君白柚配', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '清江鱼火锅', mains: ['清江鱼'], seasonings: ['盐', '豆瓣酱'], meatVeg: 'meat', dishForms: ['hotpot'], tasteTags: ['spicy'] },
      { name: '香菇炖鸡宜昌', mains: ['三峡香菇', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '橙香排骨宜昌', mains: ['秭归脐橙', '排骨'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '清炒时蔬宜昌', mains: ['小白菜'], meatVeg: 'veg', tasteTags: ['light'] }
    ]
  },
  {
    city: '襄阳市',
    code: 'xy',
    ings: [
      { name: '襄阳牛肉面剂', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '襄阳黄酒配', category: 'seasoning', kind: 'seasoning' },
      { name: '宜城板鸭襄', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '老河口梨', category: 'fruit_veg' },
      { name: '谷城茶', category: 'leaf' }
    ],
    rcps: [
      { name: '襄阳牛肉面浇头', mains: ['襄阳牛肉面剂', '牛肉'], seasonings: ['盐', '襄阳黄酒配'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '板鸭炒蒜苗襄', mains: ['宜城板鸭襄', '蒜苗'], meatVeg: 'meat' },
      { name: '牛肉炖土豆襄阳', mains: ['牛肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '白菜猪肉襄阳', mains: ['大白菜', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '荆州市',
    code: 'jz',
    ings: [
      { name: '荆州鱼糕荆', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '洪湖莲藕荆', category: 'root' },
      { name: '洪湖野鸭', category: 'meat' },
      { name: '公安牛肉', category: 'meat' },
      { name: '长江鮰鱼', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '荆州鱼糕汤', mains: ['荆州鱼糕荆'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '洪湖藕汤', mains: ['洪湖莲藕荆', '排骨'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '清蒸鮰鱼', mains: ['长江鮰鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '野鸭炖土豆', mains: ['洪湖野鸭', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 湖南（长沙已有）——
  {
    city: '株洲市',
    code: 'zzh',
    ings: [
      { name: '炎陵黄桃', category: 'fruit_veg' },
      { name: '醴陵辣椒', category: 'fruit_veg' },
      { name: '攸县香干株', category: 'tofu' },
      { name: '茶陵蒜', category: 'seasoning', kind: 'seasoning' },
      { name: '株洲槟榔芋', category: 'root' }
    ],
    rcps: [
      { name: '香干炒肉株洲', mains: ['攸县香干株', '猪肉'], seasonings: ['盐', '茶陵蒜'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '辣椒炒肉株洲', mains: ['醴陵辣椒', '猪肉'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '槟榔芋烧肉', mains: ['株洲槟榔芋', '五花肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '蒜蓉空心菜株', mains: ['小白菜'], seasonings: ['盐', '茶陵蒜'], meatVeg: 'veg' }
    ]
  },
  {
    city: '岳阳市',
    code: 'yy',
    ings: [
      { name: '洞庭鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '君山银针配', category: 'leaf' },
      { name: '岳阳巴陵鱼头', category: 'seafood', avoidTags: ['seafood'] },
      { name: '临湘竹笋', category: 'root' },
      { name: '平江酱干', category: 'tofu', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '剁椒鱼头岳阳', mains: ['岳阳巴陵鱼头'], seasonings: ['盐', '剁椒', '蒜'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['spicy'] },
      { name: '洞庭鱼火锅', mains: ['洞庭鱼'], seasonings: ['盐', '豆瓣酱'], meatVeg: 'meat', dishForms: ['hotpot'], tasteTags: ['spicy'] },
      { name: '竹笋炒肉岳阳', mains: ['临湘竹笋', '猪肉'], meatVeg: 'meat' },
      { name: '酱干炒芹菜', mains: ['平江酱干', '芹菜'], meatVeg: 'veg' }
    ]
  },
  {
    city: '衡阳市',
    code: 'hy',
    ings: [
      { name: '衡阳鱼粉料', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '祁东黄花菜衡', category: 'leaf' },
      { name: '常宁茶油菜', category: 'leaf' },
      { name: '耒阳坛子肉料', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '南岳豆腐', category: 'tofu' }
    ],
    rcps: [
      { name: '衡阳鱼粉浇头', mains: ['米粉', '草鱼'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '黄花菜炒蛋衡', mains: ['祁东黄花菜衡', '鸡蛋'], meatVeg: 'veg' },
      { name: '坛子肉家常衡', mains: ['五花肉'], meatVeg: 'meat', dishForms: ['braise'], tasteTags: ['heavy'] },
      { name: '南岳豆腐煲', mains: ['南岳豆腐', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 广东（广州已有）——
  {
    city: '深圳市',
    code: 'szh',
    ings: [
      { name: '深圳海胆', category: 'seafood', avoidTags: ['seafood'] },
      { name: '沙井蚝', category: 'seafood', avoidTags: ['seafood'] },
      { name: '光明乳鸽', category: 'meat' },
      { name: '南澳紫菜深', category: 'leaf' },
      { name: '荔枝深圳', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '蒜蓉蒸生蚝深', mains: ['沙井蚝'], seasonings: ['盐', '蒜'], meatVeg: 'meat', dishForms: ['steam'] },
      { name: '乳鸽煲', mains: ['光明乳鸽'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '紫菜蛋汤深圳', mains: ['南澳紫菜深', '鸡蛋'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '白灼时蔬深', mains: ['菜心'], seasonings: ['盐', '蚝油'], meatVeg: 'veg', tasteTags: ['light'] }
    ]
  },
  {
    city: '东莞市',
    code: 'dg',
    ings: [
      { name: '东莞腊肠莞', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '厚街鱼丸', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '桥头莲藕莞', category: 'root' },
      { name: '麻涌香蕉配', category: 'fruit_veg' },
      { name: '清溪豆腐莞', category: 'tofu' }
    ],
    rcps: [
      { name: '腊肠煲仔菜', mains: ['东莞腊肠莞', '鸡蛋'], meatVeg: 'meat' },
      { name: '鱼丸汤东莞', mains: ['厚街鱼丸'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '莲藕排骨莞', mains: ['桥头莲藕莞', '排骨'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '豆腐煮鱼莞', mains: ['清溪豆腐莞', '草鱼'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '佛山市',
    code: 'fs',
    ings: [
      { name: '佛山熏蹄', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '顺德双皮奶配', category: 'egg_dairy', availability: 'year_round', onConfirmPage: false },
      { name: '均安蒸猪料', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '陈村粉', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '南海鲈鱼佛', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '顺德鱼生风味清蒸', mains: ['南海鲈鱼佛'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '陈村粉捞', mains: ['陈村粉', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '熏蹄拼盘家常', mains: ['佛山熏蹄'], meatVeg: 'meat' },
      { name: '生菜鱼片汤佛', mains: ['生菜', '草鱼'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },

  // —— 广西 ——
  {
    city: '南宁市',
    code: 'nn',
    ings: [
      { name: '老友粉料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '酸嘢料', category: 'fruit_veg', availability: 'year_round', onConfirmPage: false },
      { name: '邕江鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '横县茉莉配', category: 'leaf' },
      { name: '柠檬鸭料', category: 'meat', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '老友猪肉粉浇', mains: ['老友粉料', '猪肉'], seasonings: ['盐', '干辣椒'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy'] },
      { name: '柠檬鸭', mains: ['鸭肉'], seasonings: ['盐', '醋'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '邕江鱼汤', mains: ['邕江鱼', '北豆腐'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '蒜蓉空心菜邕', mains: ['小白菜'], seasonings: ['盐', '蒜'], meatVeg: 'veg' }
    ]
  },
  {
    city: '柳州市',
    code: 'lz',
    ings: [
      { name: '螺蛳粉螺', category: 'seafood', availability: 'year_round', onConfirmPage: false, avoidTags: ['seafood'] },
      { name: '柳州云笋', category: 'root' },
      { name: '融安金桔', category: 'fruit_veg' },
      { name: '酸笋柳', category: 'root', availability: 'year_round', onConfirmPage: false },
      { name: '柳州豆腐圆', category: 'tofu', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '螺蛳粉浇头', mains: ['米粉', '猪肉'], seasonings: ['盐', '酸笋柳'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy'] },
      { name: '酸笋炒肉柳', mains: ['酸笋柳', '猪肉'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '豆腐圆汤', mains: ['柳州豆腐圆'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '云笋炒肉', mains: ['柳州云笋', '猪肉'], meatVeg: 'meat' }
    ]
  },
  {
    city: '桂林市',
    code: 'gl',
    ings: [
      { name: '桂林米粉', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '荔浦芋桂林', category: 'root' },
      { name: '永福罗汉果配', category: 'fruit_veg' },
      { name: '阳朔啤酒鱼料', category: 'seafood', avoidTags: ['seafood'] },
      { name: '桂林腐乳菜', category: 'tofu', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '桂林米粉浇头', mains: ['桂林米粉', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '啤酒鱼阳朔风', mains: ['阳朔啤酒鱼料'], seasonings: ['盐', '干辣椒'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '荔浦芋扣肉风', mains: ['荔浦芋桂林', '五花肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '腐乳空心菜桂', mains: ['桂林腐乳菜', '小白菜'], meatVeg: 'veg' }
    ]
  },

  // —— 海南 ——
  {
    city: '海口市',
    code: 'hk',
    ings: [
      { name: '文昌鸡海', category: 'meat' },
      { name: '海南粉', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '椰子', category: 'fruit_veg' },
      { name: '清补凉料', category: 'bean', availability: 'year_round', onConfirmPage: false },
      { name: '和乐蟹', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '文昌鸡白切', mains: ['文昌鸡海'], seasonings: ['盐', '姜', '蒜'], meatVeg: 'meat', tasteTags: ['light'] },
      { name: '海南粉浇头', mains: ['海南粉', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '椰子鸡汤', mains: ['椰子', '鸡肉'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '清蒸和乐蟹', mains: ['和乐蟹'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] }
    ]
  },
  {
    city: '三亚市',
    code: 'syh',
    ings: [
      { name: '三亚海鲜拼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '芒果三亚', category: 'fruit_veg' },
      { name: '菠萝三亚', category: 'fruit_veg' },
      { name: '海棠湾龙虾', category: 'seafood', avoidTags: ['seafood'] },
      { name: '崖州龙眼', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '清蒸三亚海鲜', mains: ['三亚海鲜拼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '蒜蓉龙虾三亚', mains: ['海棠湾龙虾'], seasonings: ['盐', '蒜'], meatVeg: 'meat' },
      { name: '菠萝咕咾肉风', mains: ['菠萝三亚', '猪肉'], seasonings: ['盐', '糖', '醋'], meatVeg: 'meat' },
      { name: '芒果虾仁', mains: ['芒果三亚', '虾仁'], meatVeg: 'meat', tasteTags: ['light'] }
    ]
  },
  {
    city: '儋州市',
    code: 'dz',
    ings: [
      { name: '儋州狗肉料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '那大狗肉汤料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '洋浦海鲜', category: 'seafood', avoidTags: ['seafood'] },
      { name: '儋州粽子馅', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '兰洋温泉鸡', category: 'meat' }
    ],
    rcps: [
      { name: '温泉鸡煲', mains: ['兰洋温泉鸡'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '海鲜豆腐儋州', mains: ['洋浦海鲜', '北豆腐'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '猪肉炖粉条儋', mains: ['猪肉', '粉丝'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '清炒时蔬儋州', mains: ['小白菜'], meatVeg: 'veg', tasteTags: ['light'] }
    ]
  },

  // —— 四川（成都已有）——
  {
    city: '绵阳市',
    code: 'my',
    ings: [
      { name: '绵阳米粉', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '平武木耳绵', category: 'mushroom' },
      { name: '江油肥肠绵', category: 'meat', avoidTags: ['pork'] },
      { name: '安州肥肠血旺', category: 'meat', avoidTags: ['pork'] },
      { name: '梓潼片粉', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '绵阳米粉浇头', mains: ['绵阳米粉', '猪肉'], seasonings: ['盐', '豆瓣酱'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy'] },
      { name: '肥肠血旺绵阳', mains: ['安州肥肠血旺', '豆芽'], seasonings: ['盐', '花椒'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '木耳炒肉绵阳', mains: ['平武木耳绵', '猪肉'], meatVeg: 'meat' },
      { name: '回锅肉绵阳', mains: ['五花肉', '青椒'], seasonings: ['盐', '豆瓣酱'], meatVeg: 'meat', tasteTags: ['spicy'] }
    ]
  },
  {
    city: '宜宾市',
    code: 'yb',
    ings: [
      { name: '宜宾燃面料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '芽菜宜宾', category: 'leaf', availability: 'year_round', onConfirmPage: false },
      { name: '筠连红茶配', category: 'leaf' },
      { name: '南溪豆腐干宜', category: 'tofu', availability: 'year_round', onConfirmPage: false },
      { name: '屏山烤全羊料', category: 'meat', avoidTags: ['lamb'] }
    ],
    rcps: [
      { name: '宜宾燃面浇头', mains: ['宜宾燃面料', '芽菜宜宾'], seasonings: ['盐', '红油'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy'] },
      { name: '芽菜扣肉', mains: ['芽菜宜宾', '五花肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '豆腐干炒肉宜', mains: ['南溪豆腐干宜', '猪肉'], meatVeg: 'meat' },
      { name: '羊肉汤锅宜宾', mains: ['屏山烤全羊料', '白萝卜'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },
  {
    city: '南充市',
    code: 'nanch',
    ings: [
      { name: '南充冬菜', category: 'leaf', availability: 'year_round', onConfirmPage: false },
      { name: '营山羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '阆中保宁醋', category: 'seasoning', kind: 'seasoning' },
      { name: '西充柚子', category: 'fruit_veg' },
      { name: '嘉陵江鱼', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '冬菜肉丝', mains: ['南充冬菜', '猪肉'], meatVeg: 'meat' },
      { name: '营山羊肉汤', mains: ['营山羊肉', '白萝卜'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '醋溜白菜南充', mains: ['大白菜'], seasonings: ['盐', '阆中保宁醋'], meatVeg: 'veg' },
      { name: '清江鱼南充蒸', mains: ['嘉陵江鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] }
    ]
  },

  // —— 贵州 ——
  {
    city: '贵阳市',
    code: 'gy',
    ings: [
      { name: '丝娃娃菜', category: 'leaf' },
      { name: '贵阳肠旺', category: 'meat', avoidTags: ['pork'] },
      { name: '酸汤鱼料黔', category: 'seafood', avoidTags: ['seafood'] },
      { name: '折耳根筑', category: 'leaf' },
      { name: '豆腐圆子黔', category: 'tofu', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '贵阳肠旺面浇', mains: ['挂面', '贵阳肠旺'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy'] },
      { name: '酸汤鱼', mains: ['草鱼'], seasonings: ['盐', '醋', '番茄'], meatVeg: 'meat', dishForms: ['hotpot'], tasteTags: ['spicy'] },
      { name: '折耳根炒腊肉筑', mains: ['折耳根筑', '五花肉'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '丝娃娃蘸水', mains: ['丝娃娃菜'], seasonings: ['盐', '蒜', '干辣椒'], meatVeg: 'veg', tasteTags: ['spicy'] }
    ]
  },
  {
    city: '遵义市',
    code: 'zy',
    ings: [
      { name: '遵义羊肉粉料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '虾子朝天椒遵', category: 'fruit_veg' },
      { name: '赤水笋', category: 'root' },
      { name: '习水牛肉', category: 'meat' },
      { name: '豆花面料遵', category: 'tofu', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '遵义羊肉粉浇', mains: ['遵义羊肉粉料', '羊肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '辣子鸡遵义', mains: ['鸡肉', '虾子朝天椒遵'], seasonings: ['盐', '花椒'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '赤水笋炒肉', mains: ['赤水笋', '猪肉'], meatVeg: 'meat' },
      { name: '牛肉豆花遵', mains: ['习水牛肉', '北豆腐'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '六盘水市',
    code: 'lps',
    ings: [
      { name: '盘州火腿', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '水城羊肉粉料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '六枝螃蟹', category: 'seafood', avoidTags: ['seafood'] },
      { name: '凉都折耳根', category: 'leaf' },
      { name: '盘县辣子鸡料', category: 'meat', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '水城羊肉粉浇', mains: ['水城羊肉粉料', '羊肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '火腿炒折耳根', mains: ['盘州火腿', '凉都折耳根'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '辣子鸡凉都', mains: ['鸡肉'], seasonings: ['盐', '干辣椒', '花椒'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '土豆烧牛肉水城', mains: ['牛肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 云南 ——
  {
    city: '昆明市',
    code: 'km',
    ings: [
      { name: '气锅鸡料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '宣威火腿昆', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '过桥米线', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '滇池鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '野生菌什锦', category: 'mushroom' }
    ],
    rcps: [
      { name: '气锅鸡', mains: ['鸡肉'], meatVeg: 'soup', dishForms: ['soup'], tasteTags: ['light'] },
      { name: '过桥米线浇头', mains: ['过桥米线', '鸡肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '火腿月牙骨汤风', mains: ['宣威火腿昆', '排骨'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '野生菌火锅', mains: ['野生菌什锦'], meatVeg: 'veg', dishForms: ['hotpot'] }
    ]
  },
  {
    city: '曲靖市',
    code: 'qj',
    ings: [
      { name: '宣威火腿曲', category: 'meat', availability: 'year_round', onConfirmPage: false, avoidTags: ['pork'] },
      { name: '曲靖蒸饵丝', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '沾益辣子鸡料', category: 'meat', availability: 'year_round', onConfirmPage: false },
      { name: '罗平小黄姜', category: 'seasoning', kind: 'seasoning' },
      { name: '会泽软米', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '蒸饵丝浇头', mains: ['曲靖蒸饵丝', '宣威火腿曲'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '沾益辣子鸡', mains: ['鸡肉'], seasonings: ['盐', '干辣椒', '罗平小黄姜'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '火腿炒青菜曲', mains: ['宣威火腿曲', '小白菜'], meatVeg: 'meat' },
      { name: '土豆丝曲靖', mains: ['土豆'], seasonings: ['盐', '醋'], meatVeg: 'veg' }
    ]
  },
  {
    city: '玉溪市',
    code: 'yx',
    ings: [
      { name: '抚仙湖鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '玉溪米线', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '峨山豆腐', category: 'tofu' },
      { name: '澄江藕粉玉', category: 'root', availability: 'year_round', onConfirmPage: false },
      { name: '元江芒果玉', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '清蒸抚仙湖鱼', mains: ['抚仙湖鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '玉溪米线浇头', mains: ['玉溪米线', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '峨山豆腐汤', mains: ['峨山豆腐'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '芒果虾仁玉溪', mains: ['元江芒果玉', '虾仁'], meatVeg: 'meat', tasteTags: ['light'] }
    ]
  },

  // —— 西藏 ——
  {
    city: '拉萨市',
    code: 'ls',
    ings: [
      { name: '牦牛肉', category: 'meat' },
      { name: '青稞面', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '酥油', category: 'seasoning', kind: 'seasoning' },
      { name: '藏香猪', category: 'meat', avoidTags: ['pork'] },
      { name: '高原萝卜', category: 'root' }
    ],
    rcps: [
      { name: '牦牛汤', mains: ['牦牛肉', '高原萝卜'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '青稞面片', mains: ['青稞面', '牦牛肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '藏香猪肉炖土豆', mains: ['藏香猪', '土豆'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '酥油炒白菜', mains: ['大白菜'], seasonings: ['盐', '酥油'], meatVeg: 'veg' }
    ]
  },
  {
    city: '日喀则市',
    code: 'rkz',
    ings: [
      { name: '日喀则牦牛', category: 'meat' },
      { name: '江孜大蒜', category: 'seasoning', kind: 'seasoning' },
      { name: '白朗土豆', category: 'root' },
      { name: '亚东鲑鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '青稞日喀则', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '牦牛肉炒土豆日', mains: ['日喀则牦牛', '白朗土豆'], meatVeg: 'meat' },
      { name: '清蒸亚东鲑鱼', mains: ['亚东鲑鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '青稞粥配肉', mains: ['青稞日喀则', '日喀则牦牛'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '蒜蓉土豆丝日', mains: ['白朗土豆'], seasonings: ['盐', '江孜大蒜'], meatVeg: 'veg' }
    ]
  },
  {
    city: '昌都市',
    code: 'cdz',
    ings: [
      { name: '昌都牦牛', category: 'meat' },
      { name: '澜沧江鱼昌', category: 'seafood', avoidTags: ['seafood'] },
      { name: '昌都青椒', category: 'fruit_veg' },
      { name: '左贡花椒', category: 'seasoning', kind: 'seasoning' },
      { name: '芒康盐井盐配', category: 'seasoning', kind: 'seasoning' }
    ],
    rcps: [
      { name: '牦牛火锅昌都', mains: ['昌都牦牛', '大白菜'], seasonings: ['盐', '左贡花椒'], meatVeg: 'meat', dishForms: ['hotpot'] },
      { name: '清蒸澜沧江鱼', mains: ['澜沧江鱼昌'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '青椒炒肉昌都', mains: ['昌都青椒', '猪肉'], meatVeg: 'meat' },
      { name: '土豆炖牛肉昌', mains: ['牛肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 陕西（西安已有）——
  {
    city: '宝鸡市',
    code: 'bjq',
    ings: [
      { name: '岐山臊子面剂', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '岐山醋', category: 'seasoning', kind: 'seasoning' },
      { name: '凤翔豆腐', category: 'tofu' },
      { name: '陇县牛奶配', category: 'egg_dairy', availability: 'year_round', onConfirmPage: false },
      { name: '眉县猕猴桃', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '岐山臊子面浇', mains: ['岐山臊子面剂', '猪肉'], seasonings: ['盐', '岐山醋'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '醋溜白菜宝鸡', mains: ['大白菜'], seasonings: ['盐', '岐山醋'], meatVeg: 'veg' },
      { name: '凤翔豆腐煲', mains: ['凤翔豆腐', '猪肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '蒜苔炒肉宝鸡', mains: ['蒜苗', '猪肉'], meatVeg: 'meat' }
    ]
  },
  {
    city: '咸阳市',
    code: 'xyang',
    ings: [
      { name: '礼泉苹果', category: 'fruit_veg' },
      { name: '三原蓼花糖料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '兴平拉面剂', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '乾县锅盔料', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '泾阳茯茶配', category: 'leaf' }
    ],
    rcps: [
      { name: '兴平油泼面浇', mains: ['兴平拉面剂'], seasonings: ['盐', '蒜', '干辣椒'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'], tasteTags: ['spicy'] },
      { name: '苹果炖排骨咸', mains: ['礼泉苹果', '排骨'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '猪肉炖粉条咸阳', mains: ['猪肉', '粉丝'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '西红柿炒蛋咸', mains: ['番茄', '鸡蛋'], meatVeg: 'veg' }
    ]
  },
  {
    city: '渭南市',
    code: 'wn',
    ings: [
      { name: '大荔冬枣', category: 'fruit_veg' },
      { name: '富平柿饼配', category: 'fruit_veg', availability: 'year_round', onConfirmPage: false },
      { name: '蒲城烤羊肉料', category: 'meat', avoidTags: ['lamb'] },
      { name: '合阳面条', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '韩城花椒渭', category: 'seasoning', kind: 'seasoning' }
    ],
    rcps: [
      { name: '蒲城烤羊肉家常', mains: ['蒲城烤羊肉料', '洋葱'], seasonings: ['盐', '韩城花椒渭'], meatVeg: 'meat' },
      { name: '合阳面浇肉', mains: ['合阳面条', '猪肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '冬枣排骨汤', mains: ['大荔冬枣', '排骨'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '花椒土豆丝渭', mains: ['土豆'], seasonings: ['盐', '韩城花椒渭', '醋'], meatVeg: 'veg' }
    ]
  },

  // —— 甘肃 ——
  {
    city: '兰州市',
    code: 'lzh',
    ings: [
      { name: '兰州拉面剂', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '白萝卜兰', category: 'root' },
      { name: '甘肃牛肉面牛', category: 'meat' },
      { name: '百合兰州', category: 'root' },
      { name: '苦水玫瑰配', category: 'leaf' }
    ],
    rcps: [
      { name: '兰州牛肉面浇', mains: ['兰州拉面剂', '甘肃牛肉面牛'], seasonings: ['盐', '香油'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '百合炖鸡', mains: ['百合兰州', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '萝卜炖牛腩兰', mains: ['白萝卜兰', '牛腩'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '蒜苗炒肉兰州', mains: ['蒜苗', '猪肉'], meatVeg: 'meat' }
    ]
  },
  {
    city: '天水市',
    code: 'tsui',
    ings: [
      { name: '天水麻辣烫料', category: 'seasoning', kind: 'seasoning' },
      { name: '花牛苹果', category: 'fruit_veg' },
      { name: '甘谷辣椒', category: 'fruit_veg' },
      { name: '武山韭菜', category: 'leaf' },
      { name: '秦安桃', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '天水麻辣烫家常', mains: ['北豆腐', '金针菇', '猪肉'], seasonings: ['盐', '天水麻辣烫料'], meatVeg: 'meat', dishForms: ['hotpot'], tasteTags: ['spicy'] },
      { name: '辣椒炒肉天水', mains: ['甘谷辣椒', '猪肉'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '韭菜炒蛋天水', mains: ['武山韭菜', '鸡蛋'], meatVeg: 'veg' },
      { name: '苹果炖排骨天', mains: ['花牛苹果', '排骨'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '酒泉市',
    code: 'jq',
    ings: [
      { name: '肃州羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '敦煌葡萄', category: 'fruit_veg' },
      { name: '瓜州蜜瓜', category: 'fruit_veg' },
      { name: '玉门蘑菇', category: 'mushroom' },
      { name: '锁阳', category: 'root' }
    ],
    rcps: [
      { name: '肃州手抓羊肉', mains: ['肃州羊肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '蘑菇炖羊肉酒', mains: ['玉门蘑菇', '肃州羊肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '葡萄肉片', mains: ['敦煌葡萄', '猪肉'], meatVeg: 'meat' },
      { name: '土豆烧牛肉酒泉', mains: ['牛肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 青海 ——
  {
    city: '西宁市',
    code: 'xn',
    ings: [
      { name: '西宁牦牛', category: 'meat' },
      { name: '酿皮西宁', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '手抓羊肉青', category: 'meat', avoidTags: ['lamb'] },
      { name: '湟鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '枸杞青', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '西宁手抓羊肉', mains: ['手抓羊肉青'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '酿皮凉拌', mains: ['酿皮西宁'], seasonings: ['盐', '醋', '蒜', '红油'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '牦牛土豆煲', mains: ['西宁牦牛', '土豆'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '枸杞排骨汤宁', mains: ['枸杞青', '排骨'], meatVeg: 'soup', dishForms: ['soup'] }
    ]
  },
  {
    city: '海东市',
    code: 'hd',
    ings: [
      { name: '互助青稞酒配', category: 'seasoning', kind: 'seasoning' },
      { name: '乐都紫皮蒜', category: 'seasoning', kind: 'seasoning' },
      { name: '循化线辣椒', category: 'fruit_veg' },
      { name: '民和韭菜', category: 'leaf' },
      { name: '化隆拉面剂', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '化隆牛肉面浇', mains: ['化隆拉面剂', '牛肉'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '线辣椒炒肉海东', mains: ['循化线辣椒', '猪肉'], seasonings: ['盐', '乐都紫皮蒜'], meatVeg: 'meat', tasteTags: ['spicy'] },
      { name: '韭菜炒蛋海东', mains: ['民和韭菜', '鸡蛋'], meatVeg: 'veg' },
      { name: '土豆烧牛肉海东', mains: ['牛肉', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '格尔木市',
    code: 'gem',
    ings: [
      { name: '格尔木枸杞', category: 'fruit_veg' },
      { name: '昆仑山牦牛', category: 'meat' },
      { name: '柴达木枸杞菜', category: 'leaf' },
      { name: '盐湖卤虫配', category: 'seafood', avoidTags: ['seafood'] },
      { name: '高原白菜格', category: 'leaf' }
    ],
    rcps: [
      { name: '牦牛火锅格尔木', mains: ['昆仑山牦牛', '高原白菜格'], meatVeg: 'meat', dishForms: ['hotpot'] },
      { name: '枸杞炖排骨格', mains: ['格尔木枸杞', '排骨'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '白菜炖豆腐格', mains: ['高原白菜格', '北豆腐'], meatVeg: 'veg', dishForms: ['braise'] },
      { name: '土豆炒肉片格', mains: ['土豆', '猪肉'], meatVeg: 'meat' }
    ]
  },

  // —— 宁夏 ——
  {
    city: '银川市',
    code: 'ycn',
    ings: [
      { name: '宁夏羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '枸杞宁', category: 'fruit_veg' },
      { name: '手抓羊肉宁', category: 'meat', avoidTags: ['lamb'] },
      { name: '贺兰山东麓葡萄', category: 'fruit_veg' },
      { name: '中卫硒砂瓜', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '银川手抓羊肉', mains: ['手抓羊肉宁'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '枸杞炖羊肉', mains: ['枸杞宁', '宁夏羊肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '羊肉泡馍银川风', mains: ['宁夏羊肉', '白萝卜'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '清炒时蔬银川', mains: ['小白菜'], meatVeg: 'veg', tasteTags: ['light'] }
    ]
  },
  {
    city: '石嘴山市',
    code: 'szs',
    ings: [
      { name: '石嘴山羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '惠农枸杞', category: 'fruit_veg' },
      { name: '平罗高硒菜', category: 'leaf' },
      { name: '大武口土豆', category: 'root' },
      { name: '星海湖鱼', category: 'seafood', avoidTags: ['seafood'] }
    ],
    rcps: [
      { name: '清蒸星海湖鱼', mains: ['星海湖鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '羊肉炖土豆石', mains: ['石嘴山羊肉', '大武口土豆'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '枸杞排骨石嘴', mains: ['惠农枸杞', '排骨'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '高硒菜炒肉', mains: ['平罗高硒菜', '猪肉'], meatVeg: 'meat' }
    ]
  },
  {
    city: '吴忠市',
    code: 'wzong',
    ings: [
      { name: '吴忠羊杂', category: 'meat', avoidTags: ['lamb'] },
      { name: '盐池滩羊', category: 'meat', avoidTags: ['lamb'] },
      { name: '青铜峡大米配', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '同心圆枣', category: 'fruit_veg' },
      { name: '红寺堡葡萄', category: 'fruit_veg' }
    ],
    rcps: [
      { name: '盐池烤羊肉家常', mains: ['盐池滩羊', '洋葱'], meatVeg: 'meat' },
      { name: '羊杂汤吴忠', mains: ['吴忠羊杂', '白萝卜'], meatVeg: 'soup', dishForms: ['soup'] },
      { name: '圆枣炖鸡吴', mains: ['同心圆枣', '鸡肉'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '土豆烧牛腩吴忠', mains: ['牛腩', '土豆'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },

  // —— 新疆 ——
  {
    city: '乌鲁木齐市',
    code: 'wlmq',
    ings: [
      { name: '新疆羊肉乌', category: 'meat', avoidTags: ['lamb'] },
      { name: '拉条子面', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '馕', category: 'staple', availability: 'year_round', onConfirmPage: false },
      { name: '皮芽子', category: 'root' },
      { name: '新疆葡萄干配', category: 'fruit_veg', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '羊肉抓饭配菜', mains: ['新疆羊肉乌', '胡萝卜'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '拉条子浇头', mains: ['拉条子面', '新疆羊肉乌'], meatVeg: 'staple', dishForms: ['noodle'], stapleForms: ['noodle'] },
      { name: '过油肉皮芽子', mains: ['猪肉', '皮芽子'], meatVeg: 'meat' },
      { name: '馕坑肉家常', mains: ['新疆羊肉乌'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '克拉玛依市',
    code: 'klmy',
    ings: [
      { name: '克拉玛依羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '魔鬼城蘑菇', category: 'mushroom' },
      { name: '白碱滩鱼', category: 'seafood', avoidTags: ['seafood'] },
      { name: '乌尔禾沙棘', category: 'fruit_veg' },
      { name: '油田土豆', category: 'root' }
    ],
    rcps: [
      { name: '羊肉炖土豆克', mains: ['克拉玛依羊肉', '油田土豆'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '蘑菇炒肉克', mains: ['魔鬼城蘑菇', '猪肉'], meatVeg: 'meat' },
      { name: '清蒸白碱滩鱼', mains: ['白碱滩鱼'], meatVeg: 'meat', dishForms: ['steam'], tasteTags: ['light'] },
      { name: '沙棘排骨克', mains: ['乌尔禾沙棘', '排骨'], meatVeg: 'meat', dishForms: ['braise'] }
    ]
  },
  {
    city: '喀什市',
    code: 'ks',
    ings: [
      { name: '喀什羊肉', category: 'meat', avoidTags: ['lamb'] },
      { name: '石榴喀什', category: 'fruit_veg' },
      { name: '巴旦木配', category: 'root', availability: 'year_round', onConfirmPage: false },
      { name: '喀什甜瓜', category: 'fruit_veg' },
      { name: '手抓饭米配', category: 'staple', availability: 'year_round', onConfirmPage: false }
    ],
    rcps: [
      { name: '喀什手抓饭浇', mains: ['喀什羊肉', '胡萝卜'], meatVeg: 'meat', dishForms: ['braise'] },
      { name: '烤羊肉串家常喀', mains: ['喀什羊肉', '洋葱'], seasonings: ['盐', '花椒'], meatVeg: 'meat' },
      { name: '石榴炒肉片', mains: ['石榴喀什', '猪肉'], meatVeg: 'meat' },
      { name: '甜瓜虾仁喀', mains: ['喀什甜瓜', '虾仁'], meatVeg: 'meat', tasteTags: ['light'] }
    ]
  }
]

module.exports = { PACKS }
