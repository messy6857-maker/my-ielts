// 巧记提示：关于单词的例句或简洁记法
// 三档策略：手写巧记（谐音/联想小故事）> 拆词微故事（连接词义）> 例句填空

export interface MnemonicPart {
  text: string
  gloss: string
}

export type MnemonicKind = 'curated' | 'parts' | 'sentence'

export interface MnemonicHint {
  kind: MnemonicKind
  title: string
  body: string
  // sentence 档：填空的答案（即单词本身）
  answer?: string
  // parts 档：拆分展示
  parts?: MnemonicPart[]
}

// 手写巧记：谐音梗 / 联想小故事，一句话，紧扣词义
const CURATED: Record<string, string> = {
  pest: '谐音"拍死它"：看见害虫，拍死它 → 害虫',
  oasis: '谐音"哦哎死"：沙漠里看见绿洲：哦，哎，死不了了 → 绿洲',
  cliff: '谐音"可累服"：爬悬崖可累服了 → 悬崖，峭壁',
  breeze: '谐音"不累死"：微风吹来，一点不累 → 微风',
  tide: '谐音"太得"：潮水涨得太得劲了 → 潮汐，潮流',
  ponder: '谐音"胖的"：胖的爱沉思人生 → 沉思，考虑',
  ambulance: '谐音"俺不懒死"：病再重俺不懒死，快叫救护车 → 救护车',
  lava: '谐音"辣哇"：岩浆辣哇，小心烫 → 岩浆',
  marble: '谐音"妈宝"：妈宝家铺的大理石地面 → 大理石',
  granite: '谐音"哥拿它"：哥拿它砌墙，真硬 → 花岗岩',
  quartz: '谐音"阔次"：阔佬戴的次品水晶 → 石英',
  pebble: '谐音"拍不"：小石子拍不碎 → 鹅卵石',
  gorge: '谐音"狗日"：狗日的峡谷真深 → 峡谷',
  strait: '谐音"死追"：两条船在海峡里死追 → 海峡',
  drought: '谐音"抓特"：干旱把庄稼抓特干了 → 干旱',
  beach: '谐音"必去"：夏天必去的地方 → 海滩',
  disaster: 'dis（坏）+ aster（星星）→ 凶星出现 → 灾难',
  abandon: 'a（一）+ ban（禁）→ 一个人被禁赛 → 被抛弃 → 抛弃，放弃',
  ambiguous: 'ambi（两）+ igu（走）→ 两头走，骑墙 → 模棱两可的',
  ambition: '联想：在大城市（big town）出人头地 → 雄心，野心',
  erupt: 'e（出）+ rupt（断裂）→ 一热就喷出来 → 爆发',
  flood: 'floo（流）+ d（大）→ 大水流 → 洪水，泛滥',
  applaud: 'ap（向）+ plaud（拍）→ 向台上拍手 → 鼓掌，赞许',
  appetite: 'ap（向）+ petite（小蛋糕）→ 向小蛋糕伸手 → 食欲，胃口',
  ascend: 'a（向上）+ scend（爬）→ 向上爬 → 上升，攀登',
  aspire: 'a（向）+ spire（尖顶）→ 向着尖顶 → 渴望，立志',
  assemble: 'as（一）+ semble（相同）→ 把相同的聚一起 → 集合，装配',
  assert: 'as（向）+ sert（插）→ 把观点插进去 → 断言，坚持',
  assess: 'as（向）+ sess（坐）→ 坐下来评一评 → 评估',
  assign: 'as（向）+ sign（记号）→ 做上记号分下去 → 分配，指派',
  assist: 'as（向）+ sist（站）→ 站到身边 → 帮助',
  associate: 'as（进）+ soci（社交圈）→ 进入社交圈 → 交往；联想',
  assume: 'as（向）+ sume（拿）→ 拿来就当真的 → 假定，承担',
  assure: 'as（向）+ sure（确信）→ 让人确信 → 保证',
  astonish: 'as（被）+ tonish（雷劈）→ 像被雷劈中 → 震惊',
  asylum: 'as（向）+ ylum（收容）→ 寻求收容 → 避难所',
  antique: 'anti（古）+ que → 老古董 → 古董，古老的',
  artery: 'art（艺术）+ ery → 像艺术品一样精密 → 动脉，干线',
  articulate: 'art（技巧）+ iculate → 说话有技巧 → 善于表达的',
  ascribe: 'a（向）+ scribe（写）→ 写上名字 → 归因于',
  aspect: 'a（向）+ spect（看）→ 朝哪面看 → 方面，外观',
  horizon: 'hor（≈hour时间）+ izon → 时间尽头 → 地平线',
  altitude: 'alt（高）+ itude（状态）→ 高的状态 → 海拔，高度',
  volcano: 'volc（火）+ ano → 喷火的山 → 火山',
  glacier: 'glac（冰）+ ier → 冰的 → 冰川',
  peninsula: 'peni（几乎）+ insula（岛）→ 几乎是岛 → 半岛',
  fertile: 'fer（农夫）+ tile（田）→ 农夫的田 → 肥沃的',
  summit: 'sum（最高）+ mit（送）→ 送到最高处 → 顶点，峰会',
  canyon: 'can（刻）+ yon → 刻出来的深沟 → 峡谷',
  meander: 'me（我）+ ander（漫步）→ 我漫步，河也漫步 → 蜿蜒，漫步',
}

const PREFIXES: [string, string][] = [
  ['counter', '反'], ['trans', '穿过'], ['super', '超级'], ['inter', '在之间'],
  ['anti', '反对'], ['auto', '自动'], ['fore', '在前'], ['over', '过度'],
  ['under', '在下'], ['ultra', '极端'], ['extra', '额外'], ['hyper', '超级'],
  ['intro', '向内'], ['retro', '向后'], ['tele', '远'], ['photo', '光'],
  ['micro', '微小'],
  ['macro', '巨大'], ['multi', '多'], ['poly', '多'], ['semi', '半'],
  ['un', '不'], ['re', '再'], ['dis', '分开'], ['in', '不'], ['im', '不'],
  ['il', '不'], ['ir', '不'], ['non', '非'], ['pre', '前'], ['post', '后'],
  ['co', '共同'], ['de', '除去'], ['ex', '向外'], ['mis', '错误'],
  ['sub', '下'], ['up', '向上'], ['out', '向外'], ['mid', '中'],
  ['bi', '二'], ['tri', '三'], ['pro', '向前'], ['con', '共同'],
  ['per', '贯穿'], ['sur', '在上'], ['com', '共同'], ['ob', '逆'],
  ['ab', '离开'], ['ad', '向'], ['be', '使'], ['en', '使'], ['em', '使'],
]

const SUFFIXES: [string, string][] = [
  ['tion', '名词后缀'], ['sion', '名词后缀'], ['ment', '名词后缀'],
  ['ness', '名词后缀'], ['ship', '名词后缀'], ['hood', '名词后缀'],
  ['able', '可…的'], ['ible', '可…的'], ['ful', '充满…的'],
  ['less', '无…的'], ['ous', '多…的'], ['ive', '…的'],
  ['ward', '向…的'], ['wise', '…方向'], ['ity', '名词后缀'],
  ['ate', '动词后缀'], ['ize', '使…化'], ['ify', '使…化'],
  ['ist', '…的人'], ['ism', '…主义'], ['ary', '…的'],
  ['ory', '…的'], ['ant', '…的人'], ['ent', '…的人'],
  ['ance', '名词后缀'], ['ence', '名词后缀'], ['ure', '名词后缀'],
  ['al', '…的'], ['ic', '…的'], ['ish', '…的'],
  ['er', '…的人/物'], ['or', '…的人/物'], ['ee', '被…者'],
  ['ly', '…地'], ['ing', '动名词'], ['ed', '过去式'],
  ['ty', '名词后缀'], ['cy', '名词后缀'], ['th', '名词后缀'],
  ['age', '名词后缀'], ['dom', '名词后缀'],
]

const ROOTS: Record<string, string> = {
  spect: '看', dict: '说', port: '搬运', scrib: '写', script: '写',
  ject: '投掷', tract: '拉', struct: '建造', mit: '送出', miss: '送出',
  ceed: '行走', cess: '行走', pend: '悬挂', pos: '放置', duc: '引导',
  fer: '携带', form: '形成', gen: '产生', grad: '步', graph: '写',
  log: '言语', man: '手', meter: '测量', mot: '移动', mob: '移动',
  morph: '形态', path: '情感', ped: '脚', phon: '声音', photo: '光',
  scope: '观察', sect: '切割', sent: '感觉', sens: '感觉', sequ: '跟随',
  solv: '松开', spir: '呼吸', sta: '站立', therm: '热', vers: '转向',
  vert: '转向', vid: '看', vis: '看', voc: '呼喊', vol: '卷',
  press: '压', claim: '喊', test: '证', fort: '强', junct: '连接',
  lect: '选择', memor: '记住', nom: '名', nov: '新', plic: '折叠',
  rupt: '断裂', sci: '知道', sign: '记号', simil: '相似', sist: '站立',
  tain: '握住', tempor: '时间', tend: '伸展', terr: '土地', trib: '给予',
  turb: '搅动', uni: '一', vac: '空', ven: '到来', ver: '真实',
  vit: '生命', aud: '听', cred: '相信', curr: '跑', don: '给',
  fac: '做', fess: '承认', flect: '弯曲', fract: '碎', greg: '群',
  habit: '住', her: '粘', jac: '投', lat: '边', liber: '自由',
  loc: '地方', loqu: '说', lumin: '光', magn: '大', mater: '母亲',
  medi: '中间', migr: '迁移', min: '小', mir: '惊奇', mort: '死',
  nat: '出生', navig: '航行', nect: '结', not: '记', numer: '数',
  oper: '工作', ori: '升起', pac: '和平', par: '平等', pater: '父亲',
  pet: '寻求', plac: '平息', popul: '人民', prim: '第一', quer: '问',
  radi: '射线', rap: '抓', rect: '直', reg: '统治', rid: '笑',
  rog: '问', san: '健康', scop: '看', sed: '坐',
  sol: '单独', somn: '睡', soph: '智慧', spec: '看',
  stell: '星', strict: '拉紧', sum: '取', tact: '触', text: '织',
  the: '神', tom: '切', tort: '扭', tox: '毒', urb: '城市',
  usu: '用', vail: '强', vap: '蒸汽', vari: '变化', vel: '速度',
  vend: '卖', verb: '词', vest: '衣服', vi: '路', vibr: '震动',
  sphere: '球体', atmo: '蒸汽', hydro: '水', litho: '石头', dic: '说',
}

function longestMatch(word: string, table: [string, string][], minStem: number): [string, string] | null {
  const sorted = [...table].sort((a, b) => b[0].length - a[0].length)
  for (const [affix, gloss] of sorted) {
    if (word.length - affix.length >= minStem && word.startsWith(affix))
      return [affix, gloss]
  }
  return null
}

function longestSuffix(word: string, minStem: number): [string, string] | null {
  const sorted = [...SUFFIXES].sort((a, b) => b[0].length - a[0].length)
  for (const [affix, gloss] of sorted) {
    if (word.length - affix.length >= minStem && word.endsWith(affix))
      return [affix, gloss]
  }
  return null
}

// 把单词从例句中挖空，做成填空
function blankWord(example: string, word: string): string | null {
  const idx = example.toLowerCase().indexOf(word.toLowerCase())
  if (idx === -1)
    return null
  return `${example.slice(0, idx)}______${example.slice(idx + word.length)}`
}

export function getMnemonic(word: string, meaning = '', example = ''): MnemonicHint | null {
  const w = word.toLowerCase().trim()

  // 第一档：手写巧记
  const tip = CURATED[w]
  if (tip)
    return { kind: 'curated', title: '巧记', body: tip }

  if (w.length < 4)
    return null
  let stem = w

  // 先剥后缀（词尾），再剥前缀（词头），尽量最长匹配
  const suffix = longestSuffix(stem, 3)
  if (suffix)
    stem = stem.slice(0, stem.length - suffix[0].length)
  const prefix = longestMatch(stem, PREFIXES, 3)
  if (prefix)
    stem = stem.slice(prefix[0].length)

  // 第二档：拆词微故事，落点一定是词义；按单词原顺序排列
  const rootGloss = ROOTS[stem] ?? ROOTS[stem.replace(/[aeiou]$/, '')]
  const hasAffix = !!(prefix || suffix)
  if (rootGloss || (hasAffix && stem.length >= 3)) {
    const ordered: MnemonicPart[] = [
      ...(prefix ? [{ text: `${prefix[0]}-`, gloss: prefix[1] }] : []),
      { text: stem, gloss: rootGloss ?? '词根' },
      ...(suffix ? [{ text: `-${suffix[0]}`, gloss: suffix[1] }] : []),
    ]
    const tail = meaning ? ` → 也就是「${meaning}」` : ''
    return {
      kind: 'parts',
      title: '拆词巧记',
      parts: ordered,
      body: `拆词：${ordered.map(p => `${p.text}（${p.gloss}）`).join(' + ')}${tail}`,
    }
  }

  // 第三档：例句填空
  if (example) {
    const blanked = blankWord(example, w)
    if (blanked) {
      return {
        kind: 'sentence',
        title: '例句巧记',
        body: blanked,
        answer: word,
      }
    }
  }
  return null
}
