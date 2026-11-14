import{e as d}from"./text-48e2a596.js";import{r as x,z as y,an as P,ao as K}from"./index-766918d7.js";const m="myielts_ai_settings_v1";function G(e){return e?`${m}:u:${e}`:`${m}:guest`}function $(){const e=G(y().currentUser.value);try{const t=localStorage.getItem(m);t!==null&&(localStorage.getItem(e)===null&&localStorage.setItem(e,t),localStorage.removeItem(m))}catch{}return e}const I={baseUrl:"https://api-cdn.thehive.ai/api/v3",apiKey:"",model:"deepseek-ai/deepseek-v4.1-flash-1017",reasoningEffort:"medium"},z={flagship:"旗舰最强",strong:"强",balanced:"均衡",light:"轻量快速",reasoning:"推理最强"},U=[{id:"hive",label:"Hive",baseUrl:"https://api-cdn.thehive.ai/api/v3",keyHint:"Hive 控制台",models:[{id:"deepseek-ai/deepseek-v4.1-flash-1017",label:"DeepSeek V4.1 Flash",strength:"balanced",note:"当前默认：快速、便宜，批改和翻译都够用"}]},{id:"openai",label:"OpenAI",baseUrl:"https://api.openai.com/v1",keyHint:"platform.openai.com → API Keys",models:[{id:"gpt-6.1-sol",label:"GPT-6.1 Sol",strength:"strong",note:"最新主力，接近旗舰水平，性价比最高；不接受 temperature",reasoning:!0},{id:"gpt-6-astra",label:"GPT-6 Astra",strength:"flagship",note:"旗舰最强，难题和深度批改用，价格最高；不接受 temperature",reasoning:!0},{id:"gpt-6.1-terra",label:"GPT-6.1 Terra",strength:"balanced",note:"快速均衡，日常够用；不接受 temperature",reasoning:!0},{id:"gpt-6-luna",label:"GPT-6 Luna",strength:"light",note:"最便宜，适合翻译等简单任务；不接受 temperature",reasoning:!0},{id:"gpt-4o-mini",label:"GPT-4o mini",strength:"light",note:"便宜老款，兼容性最好（自动识别的探测模型）"}]},{id:"deepseek",label:"DeepSeek 官方",baseUrl:"https://api.deepseek.com",keyHint:"platform.deepseek.com → API Keys",models:[{id:"deepseek-flash",label:"DeepSeek Flash",strength:"balanced",note:"快速、便宜，批改和翻译都够用（V4.1 Flash）"},{id:"deepseek-v4-pro",label:"DeepSeek V4 Pro",strength:"flagship",note:"旗舰最强，精细批改和难题用"}]}];function _(e){const t=e.trim().replace(/\/+$/,"").toLowerCase();return U.find(r=>r.baseUrl.toLowerCase()===t)??null}function g(e){var t;return((t=_(e))==null?void 0:t.id)??"custom"}function Y(e,t){const r={...e.apiKeys??{}};return r[g(e.baseUrl)]=e.apiKey.trim(),{...e,apiKeys:r,baseUrl:t.baseUrl,apiKey:r[t.id]??"",model:t.models.some(o=>o.id===e.model.trim())?e.model.trim():t.models[0].id}}function W(e,t){const r=U.find(o=>o.id===e);return(r==null?void 0:r.models.find(o=>o.id===t))??null}function Q(e,t){return e==="deepseek"?!0:e==="openai"?/^(?:o\d|gpt-[56](?:[.-]|$))/.test(t)&&!t.includes("-chat-"):!1}function N(e,t){return e==="deepseek"?t==="low"||t==="max"?t:"high":t==="low"||t==="high"?t:t==="max"?"high":"medium"}function u(){try{const e=localStorage.getItem($());if(e){const t={...I,...JSON.parse(e)};return!t.apiKeys&&t.apiKey.trim()&&(t.apiKeys={[g(t.baseUrl)]:t.apiKey.trim()}),t}}catch{}return{...I}}function X(e){const t={...e.apiKeys??{}};t[g(e.baseUrl)]=e.apiKey.trim(),localStorage.setItem($(),JSON.stringify({...e,apiKeys:t}))}function w(){const e=u();return!!(e.apiKey.trim()&&e.baseUrl.trim()&&e.model.trim())}async function p(e,t,r,o){var A,E,v,b;const n=P(y().currentUser.value);if(!n)throw new Error("请先登录（AI 中转需要登录态）");const a=new AbortController,i=()=>a.abort();o==null||o.addEventListener("abort",i,{once:!0}),o!=null&&o.aborted&&a.abort();const l=setTimeout(i,12e4);let f,s;try{f=await fetch(`${K}/ai/chat`,{method:"POST",signal:a.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify({baseUrl:e.baseUrl.trim(),apiKey:e.apiKey.trim(),model:e.model.trim(),messages:[{role:"system",content:t},{role:"user",content:r}],temperature:.3,reasoningEffort:N(g(e.baseUrl),e.reasoningEffort)})}),s=await f.json().catch(()=>null)}catch{throw new Error(o!=null&&o.aborted?"已取消评分":a.signal.aborted?"评分请求超时，请重试":"中转请求失败，请检查网络连接")}finally{clearTimeout(l),o==null||o.removeEventListener("abort",i)}if(f.status===401)throw((s==null?void 0:s.message)||"").includes("AI 接口返回")?new Error("API Key 无效或已过期，请去设置页检查 Key 是否正确"):new Error("登录已过期，请重新登录");if(f.status===403)throw new Error((s==null?void 0:s.message)||"无权限使用 AI 功能");if(!f.ok||!(s!=null&&s.ok))throw new Error((s==null?void 0:s.message)||`请求失败（${f.status}）`);const S=(b=(v=(E=(A=s.data)==null?void 0:A.choices)==null?void 0:E[0])==null?void 0:v.message)==null?void 0:b.content;if(!S)throw new Error("AI 返回为空，请重试");return S}const L=`【Task Achievement】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`,M=`【Task Response】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`;function k(e,t,r,o){const n=e==="Task 1"?L:M,a=e==="Task 1"?"任务完成情况(Task Achievement)":"任务回应(Task Response)",i=`你是雅思写作${e}考官，必须严格依据以下官方评分标准（IELTS Writing Band Descriptors，May 2023 版）打分：

${n}

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
其中 ${t} 对应${a}，cc=连贯与衔接，lr=词汇资源，gra=语法多样性与准确性。corrections 挑 3-6 个最值得改的句子。全部用中文（original/fixed/rewritten 保留英文原文）。`,l=`【题目】
${r}

【考生作文】
${o}`;return{system:i,user:l}}async function Z(e,t,r,o){const n=u();if(!w())throw new Error("请先在设置页填写 API 地址、Key 和模型");if(r.trim().split(/\s+/).filter(Boolean).length<20)throw new Error("作文太短，无法批改");const{system:i,user:l}=e==="task1"?k("Task 1","ta",t,r):k("Task 2","tr",t,r),f=await p(n,i,l,o);let s;try{s=JSON.parse(d(f))}catch{throw new Error("AI 返回格式异常，请重试")}if(!B(s,e))throw new Error("AI 返回格式异常，请重试");return e==="task2"&&R(s),s}function R(e){const t=e.scores,r=e.comments,o=e.advice;return t&&t.tr!==void 0&&t.ta===void 0&&(t.ta=t.tr,delete t.tr),r&&r.tr!==void 0&&r.ta===void 0&&(r.ta=r.tr,delete r.tr),o&&o.tr!==void 0&&o.ta===void 0&&(o.ta=o.tr,delete o.tr),e}const T=["ta","cc","lr","gra"];function D(e){return Math.round(e*2)/2}function h(e,t){return((t==="task2"?e.ta??e.tr:e.ta)+e.cc+e.lr+e.gra)/4}function c(e){return typeof e=="number"&&Number.isFinite(e)&&e>=0&&e<=9}function C(e){if(!e||typeof e!="object")return!1;const t=e;return!(typeof t.original!="string"||typeof t.fixed!="string"||t.reason!==void 0&&typeof t.reason!="string")}function B(e,t){if(!e||typeof e!="object")return!1;const r=e,o=r.scores,n=r.comments;if(!o||!n)return!1;const a=t==="task2"?o.ta??o.tr:o.ta,i=t==="task2"?n.ta??n.tr:n.ta;return!(!c(a)||!c(o.cc)||!c(o.lr)||!c(o.gra)||!c(o.overall)||Math.abs(o.overall-h(o,t))>=1||typeof i!="string"||typeof n.cc!="string"||typeof n.lr!="string"||typeof n.gra!="string"||!Array.isArray(r.corrections)||!r.corrections.every(C)||typeof r.suggestion!="string"||r.rewritten!==void 0&&typeof r.rewritten!="string")}function q(e,t){if(!e||typeof e!="object")return null;const r=t==="task2"?R(e):e,o=r.scores;if(!o||!T.every(a=>c(o[a]))||!c(o.overall))return null;Math.abs(o.overall-h(o,t))>=1&&(o.overall=D(h(o,t)));const n=r.comments&&typeof r.comments=="object"?r.comments:{};for(const a of T)typeof n[a]!="string"&&(n[a]="");return r.comments=n,Array.isArray(r.corrections)?r.corrections=r.corrections.filter(C):r.corrections=[],typeof r.suggestion!="string"&&(r.suggestion=""),r.rewritten!==void 0&&typeof r.rewritten!="string"&&(r.rewritten=""),r}const j=`【Fluency and Coherence 流利度与连贯性】
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
5分: 句式有限重复；错误多但大意可懂。`,J=`你是雅思口语考官。考生用英语回答了口语题目，下面给你的是【语音转写的文字稿】（转写可能有小错，请宽容）。
必须严格依据以下官方口语评分标准（IELTS Speaking Band Descriptors）打分：

${j}

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
其中 fluency=流利度与连贯性，lexical=词汇资源，grammar=语法多样性与准确性。全部用中文（引用考生原话时保留英文）。`;function F(e){if(!e||typeof e!="object")return!1;const t=e,r=t.scores;if(!r||!c(r.overall)||!c(r.fluency)||!c(r.lexical)||!c(r.grammar)||[r.overall,r.fluency,r.lexical,r.grammar].some(a=>Math.abs(a*2-Math.round(a*2))>=1e-9))return!1;const n=(r.fluency+r.lexical+r.grammar)/3;return!(Math.abs(r.overall-n)>=1||!t.comments||typeof t.comments.fluency!="string"||typeof t.comments.lexical!="string"||typeof t.comments.grammar!="string"||typeof t.suggestion!="string"||!t.suggestion.trim())}async function ee(e,t,r){const o=u();if(!w())throw new Error("请先在设置页填写 API 地址、Key 和模型");if(t.trim().split(/\s+/).filter(Boolean).length<10)throw new Error("转写文字太少，无法评分（请说几句完整的英语再试）");const a=`【题目】
${e}

【考生回答（语音转写）】
${t}`,i=await p(o,J,a,r);let l;try{l=JSON.parse(d(i))}catch{throw new Error("AI 返回格式异常，请重试")}if(!F(l))throw new Error("AI 返回格式异常，请重试");return l}async function te(e,t){const r=u();if(!w())throw new Error("请先在设置页填写 API 地址、Key 和模型");const o=e.trim();if(!o)throw new Error("没有可翻译的内容");if(o.length>2e3)throw new Error("选中的内容太长，请选一句话以内");const i=(await p(r,"你是一个英汉翻译助手。把用户给出的英文翻译成自然、地道的中文。只输出中文译文，不要加解释、不要输出英文原文、不要加拼音。如果输入是单个单词，给出最常用的中文意思（1-2 个，用分号隔开）；如果是词组或句子，给出整句的中文翻译。",o,t)).trim();if(!i)throw new Error("AI 返回为空，请重试");return i}async function re(e){const t=P(y().currentUser.value);if(!t)throw new Error("请先登录（AI 中转需要登录态）");if(!e.trim())throw new Error("请先填写 API Key");let r,o;try{r=await fetch(`${K}/ai/detect`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({apiKey:e.trim()})}),o=await r.json().catch(()=>null)}catch{throw new Error("识别请求失败，请检查网络连接")}if(!r.ok||!(o!=null&&o.ok))throw new Error((o==null?void 0:o.message)||`识别失败（${r.status}）`);return{provider:o.provider,label:o.label,baseUrl:o.baseUrl}}async function oe(e=u()){if(![e.baseUrl,e.apiKey,e.model].every(r=>r.trim()))throw new Error("请先填写 API 地址、Key 和模型");const t=await p(e,'只回复 {"ok":true}',"ping");try{const r=JSON.parse(d(t));if(r!=null&&r.ok)return"连接成功"}catch{}if(t&&t.trim().length>0)return"连接成功（模型有响应）";throw new Error("API 返回为空，请重试")}const ne=x(u());export{U as A,z as M,ee as a,u as b,ne as c,oe as d,re as e,_ as f,Z as g,w as h,F as i,W as j,N as k,Y as l,Q as m,q as r,X as s,te as t};
