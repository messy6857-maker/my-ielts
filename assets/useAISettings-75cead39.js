import{e as d}from"./text-48e2a596.js";import{r as C,ai as K,s as O,aj as $}from"./index-86fbec76.js";const I="myielts_ai_settings_v1",E={baseUrl:"https://api-cdn.thehive.ai/api/v3",apiKey:"",model:"deepseek-ai/deepseek-v4.1-flash-1017",reasoningEffort:"medium"},J={flagship:"旗舰最强",strong:"强",balanced:"均衡",light:"轻量快速",reasoning:"推理最强"},k=[{id:"hive",label:"Hive",baseUrl:"https://api-cdn.thehive.ai/api/v3",keyHint:"Hive 控制台",models:[{id:"deepseek-ai/deepseek-v4.1-flash-1017",label:"DeepSeek V4.1 Flash",strength:"balanced",note:"当前默认：快速、便宜，批改和翻译都够用"}]},{id:"openai",label:"OpenAI",baseUrl:"https://api.openai.com/v1",keyHint:"platform.openai.com → API Keys",models:[{id:"gpt-5",label:"GPT-5",strength:"flagship",note:"最新旗舰，批改和翻译最准，价格最高"},{id:"gpt-5-mini",label:"GPT-5 mini",strength:"balanced",note:"旗舰轻量版，性价比高"},{id:"gpt-4.1",label:"GPT-4.1",strength:"strong",note:"长上下文，稳定可靠"},{id:"gpt-4.1-mini",label:"GPT-4.1 mini",strength:"balanced",note:"便宜快速，日常够用"},{id:"gpt-4o",label:"GPT-4o",strength:"strong",note:"多模态，稳定"},{id:"gpt-4o-mini",label:"GPT-4o mini",strength:"light",note:"最便宜，适合翻译等简单任务"},{id:"o3",label:"o3",strength:"reasoning",note:"推理模型，难题和深度批改用；不接受 temperature",reasoning:!0},{id:"o4-mini",label:"o4-mini",strength:"reasoning",note:"推理模型，快速版；不接受 temperature",reasoning:!0}]},{id:"deepseek",label:"DeepSeek 官方",baseUrl:"https://api.deepseek.com",keyHint:"platform.deepseek.com → API Keys",models:[{id:"deepseek-flash",label:"DeepSeek Flash",strength:"balanced",note:"快速、便宜，批改和翻译都够用（V4.1 Flash）"},{id:"deepseek-v4-pro",label:"DeepSeek V4 Pro",strength:"flagship",note:"旗舰最强，精细批改和难题用"}]}];function j(e){const r=e.trim().replace(/\/+$/,"").toLowerCase();return k.find(t=>t.baseUrl.toLowerCase()===r)??null}function F(e,r){const t=k.find(n=>n.id===e);return(t==null?void 0:t.models.find(n=>n.id===r))??null}function H(e,r){return e==="deepseek"?!0:e==="openai"?/^o\d/.test(r):!1}function m(){try{const e=localStorage.getItem(I);if(e)return{...E,...JSON.parse(e)}}catch{}return{...E}}function V(e){localStorage.setItem(I,JSON.stringify(e))}function p(){const e=m();return!!(e.apiKey.trim()&&e.baseUrl.trim()&&e.model.trim())}async function u(e,r,t,n){var y,w,A,S;const o=K(O().currentUser.value);if(!o)throw new Error("请先登录（AI 中转需要登录态）");const s=new AbortController,i=()=>s.abort();n==null||n.addEventListener("abort",i,{once:!0}),n!=null&&n.aborted&&s.abort();const l=setTimeout(i,12e4);let f,a;try{f=await fetch(`${$}/ai/chat`,{method:"POST",signal:s.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${o}`},body:JSON.stringify({baseUrl:e.baseUrl.trim(),apiKey:e.apiKey.trim(),model:e.model.trim(),messages:[{role:"system",content:r},{role:"user",content:t}],temperature:.3,reasoningEffort:e.reasoningEffort??"medium"})}),a=await f.json().catch(()=>null)}catch{throw new Error(n!=null&&n.aborted?"已取消评分":s.signal.aborted?"评分请求超时，请重试":"中转请求失败，请检查网络连接")}finally{clearTimeout(l),n==null||n.removeEventListener("abort",i)}if(f.status===401)throw((a==null?void 0:a.message)||"").includes("AI 接口返回")?new Error("API Key 无效或已过期，请去设置页检查 Key 是否正确"):new Error("登录已过期，请重新登录");if(f.status===403)throw new Error((a==null?void 0:a.message)||"无权限使用 AI 功能");if(!f.ok||!(a!=null&&a.ok))throw new Error((a==null?void 0:a.message)||`请求失败（${f.status}）`);const h=(S=(A=(w=(y=a.data)==null?void 0:y.choices)==null?void 0:w[0])==null?void 0:A.message)==null?void 0:S.content;if(!h)throw new Error("AI 返回为空，请重试");return h}const G=`【Task Achievement】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`,x=`【Task Response】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`;function b(e,r,t,n){const o=e==="Task 1"?G:x,s=e==="Task 1"?"任务完成情况(Task Achievement)":"任务回应(Task Response)",i=`你是雅思写作${e}考官，必须严格依据以下官方评分标准（IELTS Writing Band Descriptors，May 2023 版）打分：

${o}

打分规则：每项按0.5分制（4.0-9.0）；作文必须完全符合某档的正面特征才能得该档，负面特征会拉低分数。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "${r}": 6.5, "cc": 6.0, "lr": 6.5, "gra": 6.0, "overall": 6.5},
"comments": { "${r}": "先说依据官方标准的哪条给分，再给1-2句下一步建议", "cc": "...", "lr": "...", "gra": "..."},
"corrections": [ { "original": "原文句子", "fixed": "修改后的句子", "reason": "中文说明，指出违反了哪项标准"}],
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）",
"advice": {
"${r}": "针对${s}的详细修改建议（中文，3-5句，具体指出哪里没做好、应该怎么改，最好给1个改写示例）",
"cc": "针对连贯与衔接的详细修改建议（同上）",
"lr": "针对词汇资源的详细修改建议（同上，给出可替换的高级表达）",
"gra": "针对语法的详细修改建议（同上，指出典型句式问题）"
},
"rewritten": "把整篇文章按你的建议改写一遍（英文全文，保持原意和段落结构，应用所有改进；不要加中文）"
}
其中 ${r} 对应${s}，cc=连贯与衔接，lr=词汇资源，gra=语法多样性与准确性。corrections 挑 3-6 个最值得改的句子。全部用中文（original/fixed/rewritten 保留英文原文）。`,l=`【题目】
${t}

【考生作文】
${n}`;return{system:i,user:l}}async function W(e,r,t,n){const o=m();if(!p())throw new Error("请先在设置页填写 API 地址、Key 和模型");if(t.trim().split(/\s+/).filter(Boolean).length<20)throw new Error("作文太短，无法批改");const{system:i,user:l}=e==="task1"?b("Task 1","ta",r,t):b("Task 2","tr",r,t),f=await u(o,i,l,n);let a;try{a=JSON.parse(d(f))}catch{throw new Error("AI 返回格式异常，请重试")}if(!M(a,e))throw new Error("AI 返回格式异常，请重试");return e==="task2"&&T(a),a}function T(e){const r=e.scores,t=e.comments,n=e.advice;return r&&r.tr!==void 0&&r.ta===void 0&&(r.ta=r.tr,delete r.tr),t&&t.tr!==void 0&&t.ta===void 0&&(t.ta=t.tr,delete t.tr),n&&n.tr!==void 0&&n.ta===void 0&&(n.ta=n.tr,delete n.tr),e}const v=["ta","cc","lr","gra"];function _(e){return Math.round(e*2)/2}function g(e,r){return((r==="task2"?e.ta??e.tr:e.ta)+e.cc+e.lr+e.gra)/4}function c(e){return typeof e=="number"&&Number.isFinite(e)&&e>=0&&e<=9}function P(e){if(!e||typeof e!="object")return!1;const r=e;return!(typeof r.original!="string"||typeof r.fixed!="string"||r.reason!==void 0&&typeof r.reason!="string")}function M(e,r){if(!e||typeof e!="object")return!1;const t=e,n=t.scores,o=t.comments;if(!n||!o)return!1;const s=r==="task2"?n.ta??n.tr:n.ta,i=r==="task2"?o.ta??o.tr:o.ta;return!(!c(s)||!c(n.cc)||!c(n.lr)||!c(n.gra)||!c(n.overall)||Math.abs(n.overall-g(n,r))>=1||typeof i!="string"||typeof o.cc!="string"||typeof o.lr!="string"||typeof o.gra!="string"||!Array.isArray(t.corrections)||!t.corrections.every(P)||typeof t.suggestion!="string"||t.rewritten!==void 0&&typeof t.rewritten!="string")}function Y(e,r){if(!e||typeof e!="object")return null;const t=r==="task2"?T(e):e,n=t.scores;if(!n||!v.every(s=>c(n[s]))||!c(n.overall))return null;Math.abs(n.overall-g(n,r))>=1&&(n.overall=_(g(n,r)));const o=t.comments&&typeof t.comments=="object"?t.comments:{};for(const s of v)typeof o[s]!="string"&&(o[s]="");return t.comments=o,Array.isArray(t.corrections)?t.corrections=t.corrections.filter(P):t.corrections=[],typeof t.suggestion!="string"&&(t.suggestion=""),t.rewritten!==void 0&&typeof t.rewritten!="string"&&(t.rewritten=""),t}const N=`【Fluency and Coherence 流利度与连贯性】
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
5分: 句式有限重复；错误多但大意可懂。`,D=`你是雅思口语考官。考生用英语回答了口语题目，下面给你的是【语音转写的文字稿】（转写可能有小错，请宽容）。
必须严格依据以下官方口语评分标准（IELTS Speaking Band Descriptors）打分：

${N}

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
其中 fluency=流利度与连贯性，lexical=词汇资源，grammar=语法多样性与准确性。全部用中文（引用考生原话时保留英文）。`;function U(e){if(!e||typeof e!="object")return!1;const r=e,t=r.scores;if(!t||!c(t.overall)||!c(t.fluency)||!c(t.lexical)||!c(t.grammar)||[t.overall,t.fluency,t.lexical,t.grammar].some(s=>Math.abs(s*2-Math.round(s*2))>=1e-9))return!1;const o=(t.fluency+t.lexical+t.grammar)/3;return!(Math.abs(t.overall-o)>=1||!r.comments||typeof r.comments.fluency!="string"||typeof r.comments.lexical!="string"||typeof r.comments.grammar!="string"||typeof r.suggestion!="string"||!r.suggestion.trim())}async function z(e,r,t){const n=m();if(!p())throw new Error("请先在设置页填写 API 地址、Key 和模型");if(r.trim().split(/\s+/).filter(Boolean).length<10)throw new Error("转写文字太少，无法评分（请说几句完整的英语再试）");const s=`【题目】
${e}

【考生回答（语音转写）】
${r}`,i=await u(n,D,s,t);let l;try{l=JSON.parse(d(i))}catch{throw new Error("AI 返回格式异常，请重试")}if(!U(l))throw new Error("AI 返回格式异常，请重试");return l}async function Q(e,r){const t=m();if(!p())throw new Error("请先在设置页填写 API 地址、Key 和模型");const n=e.trim();if(!n)throw new Error("没有可翻译的内容");if(n.length>2e3)throw new Error("选中的内容太长，请选一句话以内");const i=(await u(t,"你是一个英汉翻译助手。把用户给出的英文翻译成自然、地道的中文。只输出中文译文，不要加解释、不要输出英文原文、不要加拼音。如果输入是单个单词，给出最常用的中文意思（1-2 个，用分号隔开）；如果是词组或句子，给出整句的中文翻译。",n,r)).trim();if(!i)throw new Error("AI 返回为空，请重试");return i}async function X(e=m()){if(![e.baseUrl,e.apiKey,e.model].every(t=>t.trim()))throw new Error("请先填写 API 地址、Key 和模型");const r=await u(e,'只回复 {"ok":true}',"ping");try{const t=JSON.parse(d(r));if(t!=null&&t.ok)return"连接成功"}catch{}if(r&&r.trim().length>0)return"连接成功（模型有响应）";throw new Error("API 返回为空，请重试")}const Z=C(m());export{k as A,J as M,z as a,m as b,Z as c,X as d,j as e,F as f,W as g,p as h,U as i,H as m,Y as r,V as s,Q as t};
