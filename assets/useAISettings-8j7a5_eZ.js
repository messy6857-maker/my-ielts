import{R as e}from"./runtime-core.esm-bundler-CI-XPz3W.js";import{t}from"./text-C4geGQEy.js";import{S as n,k as r,u as i}from"./useAuth-CFgKiFp4.js";var a=`myielts_ai_settings_v1`;function o(e){return e?`${a}:u:${e}`:`${a}:guest`}function s(){let e=o(i().currentUser.value);try{let t=localStorage.getItem(a);t!==null&&(localStorage.getItem(e)===null&&localStorage.setItem(e,t),localStorage.removeItem(a))}catch{}return e}var c={baseUrl:`https://api-cdn.thehive.ai/api/v3`,apiKey:``,model:`deepseek-ai/deepseek-v4.1-flash-1017`,reasoningEffort:`medium`},l={flagship:`旗舰最强`,strong:`强`,balanced:`均衡`,light:`轻量快速`,reasoning:`推理最强`},u=[{id:`hive`,label:`Hive`,baseUrl:`https://api-cdn.thehive.ai/api/v3`,keyHint:`Hive 控制台`,models:[{id:`deepseek-ai/deepseek-v4.1-flash-1017`,label:`DeepSeek V4.1 Flash`,strength:`balanced`,note:`当前默认：快速、便宜，批改和翻译都够用`}]},{id:`openai`,label:`OpenAI`,baseUrl:`https://api.openai.com/v1`,keyHint:`platform.openai.com → API Keys`,models:[{id:`gpt-6.1-sol`,label:`GPT-6.1 Sol`,strength:`strong`,note:`最新主力，接近旗舰水平，性价比最高；不接受 temperature`,reasoning:!0},{id:`gpt-6-astra`,label:`GPT-6 Astra`,strength:`flagship`,note:`旗舰最强，难题和深度批改用，价格最高；不接受 temperature`,reasoning:!0},{id:`gpt-6.1-terra`,label:`GPT-6.1 Terra`,strength:`balanced`,note:`快速均衡，日常够用；不接受 temperature`,reasoning:!0},{id:`gpt-6-luna`,label:`GPT-6 Luna`,strength:`light`,note:`最便宜，适合翻译等简单任务；不接受 temperature`,reasoning:!0},{id:`gpt-4o-mini`,label:`GPT-4o mini`,strength:`light`,note:`便宜老款，兼容性最好（自动识别的探测模型）`}]},{id:`deepseek`,label:`DeepSeek 官方`,baseUrl:`https://api.deepseek.com`,keyHint:`platform.deepseek.com → API Keys`,models:[{id:`deepseek-flash`,label:`DeepSeek Flash`,strength:`balanced`,note:`快速、便宜，批改和翻译都够用（V4.1 Flash）`},{id:`deepseek-v4-pro`,label:`DeepSeek V4 Pro`,strength:`flagship`,note:`旗舰最强，精细批改和难题用`}]}];function d(e){let t=e.trim().replace(/\/+$/,``).toLowerCase();return u.find(e=>e.baseUrl.toLowerCase()===t)??null}function f(e){return d(e)?.id??`custom`}function p(e,t){let n={...e.apiKeys??{}};return n[f(e.baseUrl)]=e.apiKey.trim(),{...e,apiKeys:n,baseUrl:t.baseUrl,apiKey:n[t.id]??``,model:t.models.some(t=>t.id===e.model.trim())?e.model.trim():t.models[0].id}}function m(e,t){return u.find(t=>t.id===e)?.models.find(e=>e.id===t)??null}function h(e,t){return e===`deepseek`||e===`openai`&&/^(?:o\d|gpt-[56](?:[.-]|$))/.test(t)&&!t.includes(`-chat-`)}function g(e,t){return e===`deepseek`?t===`low`||t===`max`?t:`high`:t===`low`||t===`high`?t:t===`max`?`high`:`medium`}function _(){try{let e=localStorage.getItem(s());if(e){let t={...c,...JSON.parse(e)};return!t.apiKeys&&t.apiKey.trim()&&(t.apiKeys={[f(t.baseUrl)]:t.apiKey.trim()}),t}}catch{}return{...c}}function v(e){let t={...e.apiKeys??{}};t[f(e.baseUrl)]=e.apiKey.trim(),localStorage.setItem(s(),JSON.stringify({...e,apiKeys:t}))}function y(){let e=_();return!!(e.apiKey.trim()&&e.baseUrl.trim()&&e.model.trim())}async function b(e,t,a,o){let s=n(i().currentUser.value);if(!s)throw Error(`请先登录（AI 中转需要登录态）`);let c=new AbortController,l=()=>c.abort();o?.addEventListener(`abort`,l,{once:!0}),o?.aborted&&c.abort();let u=setTimeout(l,12e4),d,p;try{d=await fetch(`${r}/ai/chat`,{method:`POST`,signal:c.signal,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${s}`},body:JSON.stringify({baseUrl:e.baseUrl.trim(),apiKey:e.apiKey.trim(),model:e.model.trim(),messages:[{role:`system`,content:t},{role:`user`,content:a}],temperature:.3,reasoningEffort:g(f(e.baseUrl),e.reasoningEffort)})}),p=await d.json().catch(()=>null)}catch{throw Error(o?.aborted?`已取消评分`:c.signal.aborted?`评分请求超时，请重试`:`中转请求失败，请检查网络连接`)}finally{clearTimeout(u),o?.removeEventListener(`abort`,l)}if(d.status===401)throw(p?.message||``).includes(`AI 接口返回`)?Error(`API Key 无效或已过期，请去设置页检查 Key 是否正确`):Error(`登录已过期，请重新登录`);if(d.status===403)throw Error(p?.message||`无权限使用 AI 功能`);if(!d.ok||!p?.ok)throw Error(p?.message||`请求失败（${d.status}）`);let m=p.data?.choices?.[0]?.message?.content;if(!m)throw Error(`AI 返回为空，请重试`);return m}var x=`【Task Achievement】
9分: 任务所有要求得到充分恰当的满足；内容上可能有极罕见的疏漏。
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`,S=`【Task Response】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`;function C(e,t,n,r){let i=e===`Task 1`?x:S,a=e===`Task 1`?`任务完成情况(Task Achievement)`:`任务回应(Task Response)`;return{system:`你是雅思写作${e}考官，必须严格依据以下官方评分标准（IELTS Writing Band Descriptors，May 2023 版）打分：

${i}

打分规则：每项按0.5分制（4.0-9.0）；作文必须完全符合某档的正面特征才能得该档，负面特征会拉低分数。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "${t}": 6.5, "cc": 6.0, "lr": 6.5, "gra": 6.0, "overall": 6.5},
"comments": { "${t}": "先说依据官方标准的哪条给分，再给1-2句下一步建议", "cc": "...", "lr": "...", "gra": "..."},
"corrections": [ { "original": "原文句子", "fixed": "修改后的句子", "reason": "中文说明，指出违反了哪项标准"}],
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）",
"advice": {
"${t}": "针对${a}的详细修改建议（中文，3-5句，具体指出哪里没做好、应该怎么改，最好给1个改写示例）",
"cc": "针对连贯与衔接的详细修改建议（同上）",
"lr": "针对词汇资源的详细修改建议（同上，给出可替换的高级表达）",
"gra": "针对语法的详细修改建议（同上，指出典型句式问题）"
},
"rewritten": "把整篇文章按你的建议改写一遍（英文全文，保持原意和段落结构，应用所有改进；不要加中文）"
}
其中 ${t} 对应${a}，cc=连贯与衔接，lr=词汇资源，gra=语法多样性与准确性。corrections 挑 3-6 个最值得改的句子。全部用中文（original/fixed/rewritten 保留英文原文）。`,user:`【题目】\n${n}\n\n【考生作文】\n${r}`}}async function w(e,n,r,i){let a=_();if(!y())throw Error(`请先在设置页填写 API 地址、Key 和模型`);if(r.trim().split(/\s+/).filter(Boolean).length<20)throw Error(`作文太短，无法批改`);let{system:o,user:s}=e===`task1`?C(`Task 1`,`ta`,n,r):C(`Task 2`,`tr`,n,r),c=await b(a,o,s,i),l;try{l=JSON.parse(t(c))}catch{throw Error(`AI 返回格式异常，请重试`)}if(!j(l,e))throw Error(`AI 返回格式异常，请重试`);return e===`task2`&&T(l),l}function T(e){let t=e.scores,n=e.comments,r=e.advice;return t&&t.tr!==void 0&&t.ta===void 0&&(t.ta=t.tr,delete t.tr),n&&n.tr!==void 0&&n.ta===void 0&&(n.ta=n.tr,delete n.tr),r&&r.tr!==void 0&&r.ta===void 0&&(r.ta=r.tr,delete r.tr),e}var E=[`ta`,`cc`,`lr`,`gra`];function D(e){return Math.round(e*2)/2}function O(e,t){return((t===`task2`?e.ta??e.tr:e.ta)+e.cc+e.lr+e.gra)/4}function k(e){return typeof e==`number`&&Number.isFinite(e)&&e>=0&&e<=9}function A(e){if(!e||typeof e!=`object`)return!1;let t=e;return!(typeof t.original!=`string`||typeof t.fixed!=`string`||t.reason!==void 0&&typeof t.reason!=`string`)}function j(e,t){if(!e||typeof e!=`object`)return!1;let n=e,r=n.scores,i=n.comments;if(!r||!i)return!1;let a=t===`task2`?r.ta??r.tr:r.ta,o=t===`task2`?i.ta??i.tr:i.ta;return!(!k(a)||!k(r.cc)||!k(r.lr)||!k(r.gra)||!k(r.overall)||Math.abs(r.overall-O(r,t))>=1||typeof o!=`string`||typeof i.cc!=`string`||typeof i.lr!=`string`||typeof i.gra!=`string`||!Array.isArray(n.corrections)||!n.corrections.every(A)||typeof n.suggestion!=`string`||n.rewritten!==void 0&&typeof n.rewritten!=`string`)}function M(e,t){if(!e||typeof e!=`object`)return null;let n=t===`task2`?T(e):e,r=n.scores;if(!r||!E.every(e=>k(r[e]))||!k(r.overall))return null;Math.abs(r.overall-O(r,t))>=1&&(r.overall=D(O(r,t)));let i=n.comments&&typeof n.comments==`object`?n.comments:{};for(let e of E)typeof i[e]!=`string`&&(i[e]=``);return n.comments=i,n.corrections=Array.isArray(n.corrections)?n.corrections.filter(A):[],typeof n.suggestion!=`string`&&(n.suggestion=``),n.rewritten!==void 0&&typeof n.rewritten!=`string`&&(n.rewritten=``),n}var N=`你是雅思口语考官。考生用英语回答了口语题目，下面给你的是【语音转写的文字稿】（转写可能有小错，请宽容）。
必须严格依据以下官方口语评分标准（IELTS Speaking Band Descriptors）打分：

【Fluency and Coherence 流利度与连贯性】
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
5分: 句式有限重复；错误多但大意可懂。

重要说明：
- 发音(Pronunciation)无法从文字评估，不要打分，overall 按三项综合估算。
- 转写文本没有标点/大小写问题，不要因此扣分；关注内容、词汇、句式。
- 注意：语音转写通常会丢弃 um/uh 等填充词，且不记录停顿时长；流利度只能按文字稿的连贯与展开程度估算，不要断言录音中实际的停顿、重复频率。
- 每项按0.5分制（4.0-9.0）。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "fluency": 6.5, "lexical": 6.0, "grammar": 6.0, "overall": 6.0 },
"comments": { "fluency": "依据标准的哪条给分+1-2句建议", "lexical": "...", "grammar": "..." },
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）"
}
其中 fluency=流利度与连贯性，lexical=词汇资源，grammar=语法多样性与准确性。全部用中文（引用考生原话时保留英文）。`;function P(e){if(!e||typeof e!=`object`)return!1;let t=e,n=t.scores;if(!n||!k(n.overall)||!k(n.fluency)||!k(n.lexical)||!k(n.grammar)||[n.overall,n.fluency,n.lexical,n.grammar].some(e=>Math.abs(e*2-Math.round(e*2))>=1e-9))return!1;let r=(n.fluency+n.lexical+n.grammar)/3;return!(Math.abs(n.overall-r)>=1||!t.comments||typeof t.comments.fluency!=`string`||typeof t.comments.lexical!=`string`||typeof t.comments.grammar!=`string`||typeof t.suggestion!=`string`||!t.suggestion.trim())}async function F(e,n,r){let i=_();if(!y())throw Error(`请先在设置页填写 API 地址、Key 和模型`);if(n.trim().split(/\s+/).filter(Boolean).length<10)throw Error(`转写文字太少，无法评分（请说几句完整的英语再试）`);let a=await b(i,N,`【题目】\n${e}\n\n【考生回答（语音转写）】\n${n}`,r),o;try{o=JSON.parse(t(a))}catch{throw Error(`AI 返回格式异常，请重试`)}if(!P(o))throw Error(`AI 返回格式异常，请重试`);return o}async function I(e,t){let n=_();if(!y())throw Error(`请先在设置页填写 API 地址、Key 和模型`);let r=e.trim();if(!r)throw Error(`没有可翻译的内容`);if(r.length>2e3)throw Error(`选中的内容太长，请选一句话以内`);let i=(await b(n,`你是一个英汉翻译助手。把用户给出的英文翻译成自然、地道的中文。只输出中文译文，不要加解释、不要输出英文原文、不要加拼音。如果输入是单个单词，给出最常用的中文意思（1-2 个，用分号隔开）；如果是词组或句子，给出整句的中文翻译。`,r,t)).trim();if(!i)throw Error(`AI 返回为空，请重试`);return i}async function L(e){let t=n(i().currentUser.value);if(!t)throw Error(`请先登录（AI 中转需要登录态）`);if(!e.trim())throw Error(`请先填写 API Key`);let a,o;try{a=await fetch(`${r}/ai/detect`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${t}`},body:JSON.stringify({apiKey:e.trim()})}),o=await a.json().catch(()=>null)}catch{throw Error(`识别请求失败，请检查网络连接`)}if(!a.ok||!o?.ok)throw Error(o?.message||`识别失败（${a.status}）`);return{provider:o.provider,label:o.label,baseUrl:o.baseUrl}}async function R(e=_()){if(![e.baseUrl,e.apiKey,e.model].every(e=>e.trim()))throw Error(`请先填写 API 地址、Key 和模型`);let n=await b(e,`只回复 {"ok":true}`,`ping`);try{if(JSON.parse(t(n))?.ok)return`连接成功`}catch{}if(n&&n.trim().length>0)return`连接成功（模型有响应）`;throw Error(`API 返回为空，请重试`)}var z=e(_());export{R as _,_ as a,w as c,P as d,h as f,p as g,v as h,L as i,F as l,M as m,l as n,m as o,g as p,z as r,d as s,u as t,y as u,I as v};