import { ref} from 'vue'
import { SYNC_API_BASE } from '../sync-config'
import { getToken } from './syncClient'

// AI 批改设置：存在浏览器 localStorage（全局，不按账号隔离），key 只留用户自己浏览器
export interface AISettings {
baseUrl: string // 如 https://api-cdn.thehive.ai/api/v3（不带 /chat/completions）
apiKey: string
model: string // 如 deepseek-ai/deepseek-v4.1-flash-1017
}

const KEY = 'myielts_ai_settings_v1'

const DEFAULTS: AISettings = {
baseUrl: 'https://api-cdn.thehive.ai/api/v3',
apiKey: '',
model: 'deepseek-ai/deepseek-v4.1-flash-1017',
}

export function getAISettings(): AISettings {
try {
const raw = localStorage.getItem(KEY)
if (raw)
return {...DEFAULTS,...JSON.parse(raw)}
}
catch { /* 忽略 */}
return {...DEFAULTS}
}

export function saveAISettings(s: AISettings) {
localStorage.setItem(KEY, JSON.stringify(s))
}

export function hasAISettings(): boolean {
const s = getAISettings()
return!!(s.apiKey.trim() && s.baseUrl.trim() && s.model.trim())
}

// ---------- AI 批改调用（OpenAI 兼容接口） ----------

export interface AICorrection {
original: string
fixed: string
reason: string
}

export interface AIGradeResult {
scores: { ta: number, cc: number, lr: number, gra: number, overall: number}
comments: { ta: string, cc: string, lr: string, gra: string}
corrections: AICorrection[]
suggestion: string
}

function extractJson(text: string): string {
// 去掉模型可能输出的特殊 token（如 <endoftext>）和 think 标签
const clean = text.replace(/<\|?endoftext\|?>/gi, '').replace(/<\/?think>/gi, '').trim()
// 兼容模型把 JSON 包在 markdown 代码块里的情况
const m = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
const raw = (m? m[1]: clean).trim()
const start = raw.indexOf('{')
const end = raw.lastIndexOf('}')
if (start >= 0 && end > start)
return raw.slice(start, end + 1)
return raw
}

async function callChatApi(settings: AISettings, system: string, user: string): Promise<string> {
// 走 VPS 中转：浏览器直连第三方 API 会被 CORS 拦截
const token = getToken()
if (!token)
throw new Error('请先登录（AI 中转需要登录态）')
let res: Response
try {
res = await fetch(`${SYNC_API_BASE}/ai/chat`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${token}`,
},
body: JSON.stringify({
baseUrl: settings.baseUrl.trim(),
apiKey: settings.apiKey.trim(),
model: settings.model.trim(),
messages: [
{ role: 'system', content: system},
{ role: 'user', content: user},
],
temperature: 0.3,
}),
})
}
catch (e) {
throw new Error('中转请求失败，请检查网络连接')
}
const body = await res.json().catch(() => null)
if (res.status === 401)
throw new Error('登录已过期，请重新登录')
if (res.status === 403)
throw new Error(body?.message || '无权限使用 AI 功能')
if (!res.ok || !body?.ok)
throw new Error(body?.message || `请求失败（${res.status}）`)
const content = body.data?.choices?.[0]?.message?.content
if (!content)
throw new Error('AI 返回为空，请重试')
return content
}

// 官方评分标准（IELTS Writing Band Descriptors, May 2023 更新版）condensed
const TASK1_DESCRIPTORS = `【Task Achievement】
9分: 任务所有要求得到充分恰当的满足；关键特征选取巧妙，呈现清晰、突出并有例证；概述清晰。
8分: 覆盖任务所有要求，恰当、相关、充分；关键特征选取巧妙，呈现清晰、突出、有例证；偶有遗漏。
7分: 覆盖任务要求，内容相关准确，偶有遗漏；有清晰的overview，数据分类恰当，识别主要趋势/差异；例证可更充分。
6分: 紧扣任务要求，格式恰当；关键特征得到覆盖和充分强调；尝试给出相关概述；用数据支撑；细节处可能有不相关/不准确信息，部分细节缺失或冗余。
5分: 大体回应任务要求；关键特征覆盖不足；细节复述偏机械；可能缺乏数据支撑；倾向堆砌细节而无全局观。
【Coherence and Cohesion】
9分: 行文毫不费力；衔接自然到几乎不被注意；段落划分娴熟。
8分: 行文流畅；信息逻辑排序，衔接处理好；偶有小问题；段落使用充分恰当。
7分: 逻辑组织清晰，通篇推进明确；衔接手段（含指代、替代）多样但有小错误或过度/不足。
6分: 大体连贯，有整体推进；衔接手段有效果但句内/句间衔接可能因误用、过度、缺失而显机械。
5分: 有组织但逻辑不完全，缺乏整体推进；句子连接不流畅；衔接手段有限/过度且有错误。
【Lexical Resource】
9分: 词汇运用充分灵活精准；搭配非常自然老道；拼写/构词错误极罕见。
8分: 词汇资源宽广，运用流畅灵活；能巧妙使用非常见/习语表达，偶有选词搭配小错。
7分: 词汇足以支撑灵活精准；能用一些非常见/习语表达；有搭配意识但有不当；偶错不影响理解。
6分: 词汇大体够用；意义清楚但范围受限、选词欠精准；有一些拼写/构词错误。
5分: 词汇有限但勉强够用；简单词可用但变化少；选词常不当；错误明显或造成阅读困难。
【Grammatical Range and Accuracy】
9分: 句式范围广，运用充分灵活；标点语法全程恰当；错误极罕见。
8分: 句式范围广，灵活准确；多数句子无错；标点好；偶有零散错误。
7分: 复杂句式多样，有一定灵活准确度；无错句常见；个别错误不影响理解。
6分: 简单复杂句混用但灵活性有限；复杂句准确度不如简单句；有错但少影响理解。
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`

const TASK2_DESCRIPTORS = `【Task Response】
9分: 切题深入；立场清晰完整，直接回应问题；观点相关、充分展开、有力支撑。
8分: 切题充分；立场清晰且展开好；观点相关、展开充分、有支撑；偶有遗漏。
7分: 回应题目主要部分；立场清晰且有展开；主要观点有扩展支撑，但可能过度概括或支撑欠聚焦。
6分: 回应主要部分（详略不一）；立场与题目直接相关，但结论可能不清/无据/重复；观点展开不足。
5分: 回应不完整；有立场但展开不清；主要观点有限、展开不足，可能有无关细节。
【Coherence and Cohesion】
9分: 行文毫不费力；衔接自然到几乎不被注意；段落划分娴熟。
8分: 行文流畅；信息逻辑排序，衔接处理好；偶有小问题；段落使用充分恰当。
7分: 逻辑组织清晰，通篇推进明确；衔接手段多样但有小错误或过度/不足；段落总体有效。
6分: 大体连贯，有整体推进；衔接手段有效果但可能机械；段落未必合乎逻辑。
5分: 有组织但逻辑不完全；句子连接不流畅；衔接手段有限/过度且有错误；段落可能缺失。
【Lexical Resource】
9分: 词汇运用充分灵活精准；搭配非常自然老道；拼写/构词错误极罕见。
8分: 词汇资源宽广，运用流畅灵活；能巧妙使用非常见/习语表达，偶有选词搭配小错。
7分: 词汇足以支撑灵活精准；能用一些非常见/习语表达；有搭配意识但有不当；偶错不影响理解。
6分: 词汇大体够用；意义清楚但范围受限、选词欠精准；有一些拼写/构词错误。
5分: 词汇有限但勉强够用；简单词可用但变化少；选词常不当；错误明显或造成阅读困难。
【Grammatical Range and Accuracy】
9分: 句式范围广，运用充分灵活；标点语法全程恰当；错误极罕见。
8分: 句式范围广，灵活准确；多数句子无错；标点好；偶有零散错误。
7分: 复杂句式多样，有一定灵活准确度；无错句常见；个别错误不影响理解。
6分: 简单复杂句混用但灵活性有限；复杂句准确度不如简单句；有错但少影响理解。
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`

function buildPrompt(taskLabel: string, criterion1: string, question: string, essay: string): { system: string, user: string} {
const descriptors = taskLabel === 'Task 1' ? TASK1_DESCRIPTORS : TASK2_DESCRIPTORS
const c1name = taskLabel === 'Task 1' ? '任务完成情况(Task Achievement)' : '任务回应(Task Response)'
const system = `你是雅思写作${taskLabel}考官，必须严格依据以下官方评分标准（IELTS Writing Band Descriptors）打分：

${descriptors}

打分规则：每项按0.5分制（4.0-9.0）；作文必须完全符合某档的正面特征才能得该档，负面特征会拉低分数。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "${criterion1}": 6.5, "cc": 6.0, "lr": 6.5, "gra": 6.0, "overall": 6.5},
"comments": { "${criterion1}": "先说依据官方标准的哪条给分，再给1-2句下一步建议", "cc": "...", "lr": "...", "gra": "..."},
"corrections": [ { "original": "原文句子", "fixed": "修改后的句子", "reason": "中文说明，指出违反了哪项标准"}],
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）"
}
其中 ${criterion1} 对应${c1name}，cc=连贯与衔接，lr=词汇资源，gra=语法多样性与准确性。corrections 挑 3-6 个最值得改的句子。全部用中文（original/fixed 保留英文原文）。`
const user = `【题目】\n${question}\n\n【考生作文】\n${essay}`
return { system, user}
}

export async function gradeEssayWithAI(
task: 'task1' | 'task2',
question: string,
essay: string,
): Promise<AIGradeResult> {
const settings = getAISettings()
if (!hasAISettings())
throw new Error('请先在设置页填写 API 地址、Key 和模型')
const words = essay.trim().split(/\s+/).filter(Boolean).length
if (words < 20)
throw new Error('作文太短，无法批改')
const { system, user} = task === 'task1'
? buildPrompt('Task 1', 'ta', question, essay)
: buildPrompt('Task 2', 'tr', question, essay)
const raw = await callChatApi(settings, system, user)
let parsed: AIGradeResult
try {
parsed = JSON.parse(extractJson(raw))
}
catch {
throw new Error('AI 返回格式异常，请重试')
}
if (!parsed?.scores || typeof parsed.scores.overall!== 'number')
throw new Error('AI 返回格式异常，请重试')
// Task 2 第一项 key 为 tr，归一化为 ta，方便面板统一渲染
if (task === 'task2') {
const s = parsed.scores as unknown as Record<string, number>
const c = parsed.comments as unknown as Record<string, string>
if (s.tr !== undefined && s.ta === undefined) {
s.ta = s.tr
delete s.tr
}
if (c.tr !== undefined && c.ta === undefined) {
c.ta = c.tr
delete c.tr
}
}
return parsed
}

export interface AISpeakingResult {
  scores: { fluency: number, lexical: number, grammar: number, overall: number }
  comments: { fluency: string, lexical: string, grammar: string }
  suggestion: string
}

// 口语评分标准 condensed（IELTS Speaking Band Descriptors）
// 注意：发音(Pronunciation)无法从文字转写评估，不纳入 AI 打分
const SPEAKING_DESCRIPTORS = `【Fluency and Coherence 流利度与连贯性】
9分: 自然流利，极少重复/自我纠正；连贯衔接自然；话题展开充分。
8分: 流利，偶有重复/纠正；衔接恰当；话题展开充分。
7分: 有一定流利度；偶有重复/纠正/犹豫；能使用多种衔接手段；能展开话题。
6分: 能保持较长发言但有重复/纠正；衔接手段有限但大体有效；能展开但不够充分。
5分: 能保持发言但明显不流利；重复纠正多；衔接手段少；展开有限。
【Lexical Resource 词汇资源】
9分: 词汇丰富精确，搭配自然；习语运用自如。
8分: 词汇丰富灵活，搭配多准确；偶有小错。
7分: 词汇量够，能谈多话题；搭配意识强；偶有用词不当。
6分: 词汇够谈熟悉话题；能改述但不总成功；有搭配错误。
5分: 词汇有限；简单话题可应付；错误多但大意可懂。
【Grammatical Range and Accuracy 语法多样性与准确性】
9分: 句式丰富灵活，全程准确。
8分: 句式多样，多数准确，偶有小错。
7分: 复杂句多样，有一定准确度；错误不影响理解。
6分: 简单复杂句混用；复杂句错误多于简单句。
5分: 句式有限重复；错误多但大意可懂。`

const SPEAKING_SYSTEM_PROMPT = `你是雅思口语考官。考生用英语回答了口语题目，下面给你的是【语音转写的文字稿】（转写可能有小错，请宽容）。
必须严格依据以下官方口语评分标准（IELTS Speaking Band Descriptors）打分：

${SPEAKING_DESCRIPTORS}

重要说明：
- 发音(Pronunciation)无法从文字评估，不要打分，overall 按三项综合估算。
- 转写文本没有标点/大小写问题，不要因此扣分；关注内容、词汇、句式。
- 每项按0.5分制（4.0-9.0）。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "fluency": 6.5, "lexical": 6.0, "grammar": 6.0, "overall": 6.0 },
"comments": { "fluency": "依据标准的哪条给分+1-2句建议", "lexical": "...", "grammar": "..." },
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）"
}
其中 fluency=流利度与连贯性，lexical=词汇资源，grammar=语法多样性与准确性。全部用中文（引用考生原话时保留英文）。`

export async function gradeSpeakingWithAI(
  question: string,
  transcript: string,
): Promise<AISpeakingResult> {
  const settings = getAISettings()
  if (!hasAISettings())
    throw new Error('请先在设置页填写 API 地址、Key 和模型')
  const words = transcript.trim().split(/\s+/).filter(Boolean).length
  if (words < 10)
    throw new Error('转写文字太少，无法评分（请说几句完整的英语再试）')
  const user = `【题目】\n${question}\n\n【考生回答（语音转写）】\n${transcript}`
  const raw = await callChatApi(settings, SPEAKING_SYSTEM_PROMPT, user)
  let parsed: AISpeakingResult
  try {
    parsed = JSON.parse(extractJson(raw))
  }
  catch {
    throw new Error('AI 返回格式异常，请重试')
  }
  if (!parsed?.scores || typeof parsed.scores.overall !== 'number')
    throw new Error('AI 返回格式异常，请重试')
  return parsed
}

// 测试连接：发一个极短请求验证 Key/地址/模型可用
export async function testAIConnection(): Promise<string> {const settings = getAISettings()
if (!hasAISettings())
throw new Error('请先填写 API 地址、Key 和模型')
const content = await callChatApi(settings, '只回复 {"ok":true}', 'ping')
// 能拿到模型回复即算连通，不强求标准 JSON
try {
const parsed = JSON.parse(extractJson(content))
if (parsed?.ok)
return '连接成功'
} catch { /* 忽略解析失败 */ }
if (content && content.trim().length > 0)
return '连接成功（模型有响应）'
throw new Error('API 返回为空，请重试')
}

export const aiSettingsState = ref<AISettings>(getAISettings())
