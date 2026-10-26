import{r as d,O as A,S as I}from"./index-078ef616.js";const y="myielts_ai_settings_v1",w={baseUrl:"https://api-cdn.thehive.ai/api/v3",apiKey:"",model:"deepseek-ai/deepseek-v4.1-flash-1017"};function l(){try{const e=localStorage.getItem(y);if(e)return{...w,...JSON.parse(e)}}catch{}return{...w}}function $(e){localStorage.setItem(y,JSON.stringify(e))}function m(){const e=l();return!!(e.apiKey.trim()&&e.baseUrl.trim()&&e.model.trim())}function f(e){const t=e.replace(/<\|?endoftext\|?>/gi,"").replace(/<\/?think>/gi,"").trim(),n=t.match(/```(?:json)?\s*([\s\S]*?)```/),o=(n?n[1]:t).trim(),a=o.indexOf("{"),r=o.lastIndexOf("}");return a>=0&&r>a?o.slice(a,r+1):o}async function u(e,t,n){var i,c,g,h;const o=A();if(!o)throw new Error("请先登录（AI 中转需要登录态）");let a;try{a=await fetch(`${I}/ai/chat`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${o}`},body:JSON.stringify({baseUrl:e.baseUrl.trim(),apiKey:e.apiKey.trim(),model:e.model.trim(),messages:[{role:"system",content:t},{role:"user",content:n}],temperature:.3})})}catch{throw new Error("中转请求失败，请检查网络连接")}const r=await a.json().catch(()=>null);if(a.status===401)throw((r==null?void 0:r.message)||"").includes("AI 接口返回")?new Error("API Key 无效或已过期，请去设置页检查 Key 是否正确"):new Error("登录已过期，请重新登录");if(a.status===403)throw new Error((r==null?void 0:r.message)||"无权限使用 AI 功能");if(!a.ok||!(r!=null&&r.ok))throw new Error((r==null?void 0:r.message)||`请求失败（${a.status}）`);const s=(h=(g=(c=(i=r.data)==null?void 0:i.choices)==null?void 0:c[0])==null?void 0:g.message)==null?void 0:h.content;if(!s)throw new Error("AI 返回为空，请重试");return s}const E=`【Task Achievement】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`,v=`【Task Response】
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
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`;function S(e,t,n,o){const a=e==="Task 1"?E:v,r=e==="Task 1"?"任务完成情况(Task Achievement)":"任务回应(Task Response)",s=`你是雅思写作${e}考官，必须严格依据以下官方评分标准（IELTS Writing Band Descriptors）打分：

${a}

打分规则：每项按0.5分制（4.0-9.0）；作文必须完全符合某档的正面特征才能得该档，负面特征会拉低分数。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "${t}": 6.5, "cc": 6.0, "lr": 6.5, "gra": 6.0, "overall": 6.5},
"comments": { "${t}": "先说依据官方标准的哪条给分，再给1-2句下一步建议", "cc": "...", "lr": "...", "gra": "..."},
"corrections": [ { "original": "原文句子", "fixed": "修改后的句子", "reason": "中文说明，指出违反了哪项标准"}],
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）",
"advice": {
"${t}": "针对${r}的详细修改建议（中文，3-5句，具体指出哪里没做好、应该怎么改，最好给1个改写示例）",
"cc": "针对连贯与衔接的详细修改建议（同上）",
"lr": "针对词汇资源的详细修改建议（同上，给出可替换的高级表达）",
"gra": "针对语法的详细修改建议（同上，指出典型句式问题）"
},
"rewritten": "把整篇文章按你的建议改写一遍（英文全文，保持原意和段落结构，应用所有改进；不要加中文）"
}
其中 ${t} 对应${r}，cc=连贯与衔接，lr=词汇资源，gra=语法多样性与准确性。corrections 挑 3-6 个最值得改的句子。全部用中文（original/fixed/rewritten 保留英文原文）。`,i=`【题目】
${n}

【考生作文】
${o}`;return{system:s,user:i}}async function x(e,t,n){const o=l();if(!m())throw new Error("请先在设置页填写 API 地址、Key 和模型");if(n.trim().split(/\s+/).filter(Boolean).length<20)throw new Error("作文太短，无法批改");const{system:r,user:s}=e==="task1"?S("Task 1","ta",t,n):S("Task 2","tr",t,n),i=await u(o,r,s);let c;try{c=JSON.parse(f(i))}catch{throw new Error("AI 返回格式异常，请重试")}if(!(c!=null&&c.scores)||typeof c.scores.overall!="number")throw new Error("AI 返回格式异常，请重试");return e==="task2"&&T(c),c}function T(e){const t=e.scores,n=e.comments,o=e.advice;return t.tr!==void 0&&t.ta===void 0&&(t.ta=t.tr,delete t.tr),n.tr!==void 0&&n.ta===void 0&&(n.ta=n.tr,delete n.tr),o&&o.tr!==void 0&&o.ta===void 0&&(o.ta=o.tr,delete o.tr),e}const k=`【Fluency and Coherence 流利度与连贯性】
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
5分: 句式有限重复；错误多但大意可懂。`,O=`你是雅思口语考官。考生用英语回答了口语题目，下面给你的是【语音转写的文字稿】（转写可能有小错，请宽容）。
必须严格依据以下官方口语评分标准（IELTS Speaking Band Descriptors）打分：

${k}

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
其中 fluency=流利度与连贯性，lexical=词汇资源，grammar=语法多样性与准确性。全部用中文（引用考生原话时保留英文）。`;async function R(e,t){const n=l();if(!m())throw new Error("请先在设置页填写 API 地址、Key 和模型");if(t.trim().split(/\s+/).filter(Boolean).length<10)throw new Error("转写文字太少，无法评分（请说几句完整的英语再试）");const a=`【题目】
${e}

【考生回答（语音转写）】
${t}`,r=await u(n,O,a);let s;try{s=JSON.parse(f(r))}catch{throw new Error("AI 返回格式异常，请重试")}if(!(s!=null&&s.scores)||typeof s.scores.overall!="number"||typeof s.scores.fluency!="number"||typeof s.scores.lexical!="number"||typeof s.scores.grammar!="number"||!s.comments||typeof s.comments.fluency!="string"||typeof s.comments.lexical!="string"||typeof s.comments.grammar!="string")throw new Error("AI 返回格式异常，请重试");return s}async function K(){const e=l();if(!m())throw new Error("请先填写 API 地址、Key 和模型");const t=await u(e,'只回复 {"ok":true}',"ping");try{const n=JSON.parse(f(t));if(n!=null&&n.ok)return"连接成功"}catch{}if(t&&t.trim().length>0)return"连接成功（模型有响应）";throw new Error("API 返回为空，请重试")}const C=d(l());export{R as a,l as b,C as c,x as g,m as h,T as n,$ as s,K as t};
