import{r as A,N as d,S as I}from"./index-69295f36.js";const w="myielts_ai_settings_v1",f={baseUrl:"https://api-cdn.thehive.ai/api/v3",apiKey:"",model:"deepseek-ai/deepseek-v4.1-flash-1017"};function l(){try{const t=localStorage.getItem(w);if(t)return{...f,...JSON.parse(t)}}catch{}return{...f}}function v(t){localStorage.setItem(w,JSON.stringify(t))}function g(){const t=l();return!!(t.apiKey.trim()&&t.baseUrl.trim()&&t.model.trim())}function p(t){const r=t.replace(/<\|?endoftext\|?>/gi,"").replace(/<\/?think>/gi,"").trim(),n=r.match(/```(?:json)?\s*([\s\S]*?)```/),o=(n?n[1]:r).trim(),s=o.indexOf("{"),e=o.lastIndexOf("}");return s>=0&&e>s?o.slice(s,e+1):o}async function S(t,r,n){var i,a,m,h;const o=d();if(!o)throw new Error("请先登录（AI 中转需要登录态）");let s;try{s=await fetch(`${I}/ai/chat`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${o}`},body:JSON.stringify({baseUrl:t.baseUrl.trim(),apiKey:t.apiKey.trim(),model:t.model.trim(),messages:[{role:"system",content:r},{role:"user",content:n}],temperature:.3})})}catch{throw new Error("中转请求失败，请检查网络连接")}const e=await s.json().catch(()=>null);if(s.status===401)throw new Error("登录已过期，请重新登录");if(s.status===403)throw new Error((e==null?void 0:e.message)||"无权限使用 AI 功能");if(!s.ok||!(e!=null&&e.ok))throw new Error((e==null?void 0:e.message)||`请求失败（${s.status}）`);const c=(h=(m=(a=(i=e.data)==null?void 0:i.choices)==null?void 0:a[0])==null?void 0:m.message)==null?void 0:h.content;if(!c)throw new Error("AI 返回为空，请重试");return c}const E=`【Task Achievement】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`,y=`【Task Response】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`;function u(t,r,n,o){const c=`你是雅思写作${t}考官，必须严格依据以下官方评分标准（IELTS Writing Band Descriptors）打分：

${t==="Task 1"?E:y}

打分规则：每项按0.5分制（4.0-9.0）；作文必须完全符合某档的正面特征才能得该档，负面特征会拉低分数。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "${r}": 6.5, "cc": 6.0, "lr": 6.5, "gra": 6.0, "overall": 6.5},
"comments": { "${r}": "先说依据官方标准的哪条给分，再给1-2句下一步建议", "cc": "...", "lr": "...", "gra": "..."},
"corrections": [ { "original": "原文句子", "fixed": "修改后的句子", "reason": "中文说明，指出违反了哪项标准"}],
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）"
}
其中 ${r} 对应${t==="Task 1"?"任务完成情况(Task Achievement)":"任务回应(Task Response)"}，cc=连贯与衔接，lr=词汇资源，gra=语法多样性与准确性。corrections 挑 3-6 个最值得改的句子。全部用中文（original/fixed 保留英文原文）。`,i=`【题目】
${n}

【考生作文】
${o}`;return{system:c,user:i}}async function O(t,r,n){const o=l();if(!g())throw new Error("请先在设置页填写 API 地址、Key 和模型");if(n.trim().split(/\s+/).filter(Boolean).length<20)throw new Error("作文太短，无法批改");const{system:e,user:c}=t==="task1"?u("Task 1","ta",r,n):u("Task 2","tr",r,n),i=await S(o,e,c);let a;try{a=JSON.parse(p(i))}catch{throw new Error("AI 返回格式异常，请重试")}if(!(a!=null&&a.scores)||typeof a.scores.overall!="number")throw new Error("AI 返回格式异常，请重试");return a}async function $(){const t=l();if(!g())throw new Error("请先填写 API 地址、Key 和模型");const r=await S(t,'只回复 {"ok":true}',"ping");try{const n=JSON.parse(p(r));if(n!=null&&n.ok)return"连接成功"}catch{}if(r&&r.trim().length>0)return"连接成功（模型有响应）";throw new Error("API 返回为空，请重试")}const C=A(l());export{l as a,C as b,O as g,g as h,v as s,$ as t};
