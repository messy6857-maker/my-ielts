// 规则版“巧记”：把单词拆成 前缀 + 词根 + 后缀 并给出中文含义
// 替代视频中 AI 助记的轻量实现；接入大模型 API 后可升级为真正的个性化助记

export interface MnemonicPart {
  text: string
  gloss: string
}

export interface MnemonicHint {
  parts: MnemonicPart[]
  note: string
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
  rog: '问', san: '健康', scop: '看', scrib2: '写', sed: '坐',
  sol: '单独', somn: '睡', soph: '智慧', spec: '看', spir2: '呼吸',
  stell: '星', strict: '拉紧', sum: '取', tact: '触', text: '织',
  the: '神', tom: '切', tort: '扭', tox: '毒', urb: '城市',
  usu: '用', vail: '强', vap: '蒸汽', vari: '变化', vel: '速度',
  vend: '卖', verb: '词', vest: '衣服', vi: '路', vibr: '震动',
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

export function getMnemonic(word: string): MnemonicHint | null {
  const w = word.toLowerCase().trim()
  if (w.length < 4)
    return null
  const parts: MnemonicPart[] = []
  let stem = w

  // 先剥后缀（词尾），再剥前缀（词头），尽量最长匹配
  const suffix = longestSuffix(stem, 3)
  if (suffix) {
    stem = stem.slice(0, stem.length - suffix[0].length)
    parts.push({ text: `-${suffix[0]}`, gloss: suffix[1] })
  }
  const prefix = longestMatch(stem, PREFIXES, 3)
  if (prefix) {
    stem = stem.slice(prefix[0].length)
    parts.unshift({ text: `${prefix[0]}-`, gloss: prefix[1] })
  }

  const rootGloss = ROOTS[stem] ?? ROOTS[stem.replace(/[aeiou]$/, '')]
  if (rootGloss) {
    parts.unshift({ text: stem, gloss: rootGloss })
    return {
      parts,
      note: `巧记：${parts.map(p => `${p.text}（${p.gloss}）`).join(' + ')}，合起来帮助记忆`,
    }
  }
  // 词根不在表里，但拆出了词缀，仍然有提示价值
  if (parts.length > 0 && stem.length >= 3) {
    parts.unshift({ text: stem, gloss: '词根' })
    return {
      parts,
      note: `巧记：先记词缀 ${parts.slice(1).map(p => `${p.text}（${p.gloss}）`).join('、')}，再整体跟读几遍`,
    }
  }
  return null
}
