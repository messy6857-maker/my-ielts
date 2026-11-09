import{r as M,w as O}from"./index-f7fa0ae0.js";import{s as _}from"./text-48e2a596.js";function ue(e,t=!1){const o=M(t);try{const n=localStorage.getItem(e);n!==null&&(o.value=n==="1")}catch{}return O(o,n=>{try{localStorage.setItem(e,n?"1":"0")}catch{}}),o}const f={ta:{label:"Task Achievement",labelCn:"任务完成度"},cc:{label:"Coherence & Cohesion",labelCn:"连贯与衔接"},lr:{label:"Lexical Resource",labelCn:"词汇资源"},gra:{label:"Grammatical Range & Accuracy",labelCn:"语法多样性与准确性"}};function R(e){return e.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]}function D(e){const t=e.split(/\n\s*\n/).map(n=>n.trim()).filter(n=>n.length>0);if(t.length>1)return t;const o=e.split(/\n/).map(n=>n.trim()).filter(n=>n.length>0);return o.length>1?o:[e.trim()]}function N(e,t){let o=0;for(const n of t){const a=e.match(n);a&&(o+=a.length)}return o}function b(e,t){return t.filter(o=>{const n=o.split(" ").map(a=>a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s+");return new RegExp(`\\b${n}\\b`,"i").test(e)})}const P=["overall","in general","generally speaking","generally,","it is clear that","it can be seen that","in summary","to sum up","the main trend","main trends","the most noticeable","striking feature"],T=["however","moreover","furthermore","in addition","besides","in contrast","on the other hand","on the contrary","conversely","while","whereas","although","though","despite","in spite of","therefore","consequently","as a result","thus","hence","similarly","likewise","in comparison","compared to","compared with","in terms of","with regard to","regarding","for example","for instance","namely","in particular","particularly","overall","finally","firstly","secondly","subsequently","meanwhile","nevertheless","nonetheless","instead","alternatively","accordingly"],q=["increase","increased","increases","increasing","decrease","decreased","decreases","decreasing","rise","rose","risen","rises","rising","fall","fell","fallen","falls","falling","grow","grew","grown","grows","growing","growth","decline","declined","declines","declining","drop","dropped","drops","dropping","surge","surged","soar","soared","plummet","plummeted","fluctuate","fluctuated","fluctuation","fluctuations","remain","remained","stable","stability","steady","peak","peaked","reach a peak","trough","dramatic","dramatically","sharp","sharply","steep","steeply","gradual","gradually","slight","slightly","marginal","marginally","significant","significantly","considerable","considerably","account for","accounts for","accounted for","comprise","comprises","comprised","constitute","constitutes","proportion","percentage","overtake","overtook","surpass"],U=["although","though","while","whereas","because","which","who","whom","whose","if","unless","so that"],V=["higher than","lower than","more than","less than","greater than","compared to","compared with","in comparison","in contrast","while","whereas","by contrast","similarly","twice as"];function B(e,t){if(!e.startsWith(t))return!1;const o=e[t.length];return o===void 0||!/[a-z]/.test(o)}function z(e){return e.some(t=>{const o=t.toLowerCase().trim();return P.some(n=>B(o,n))})}const S=/\b(am|is|are|was|were|be|been|being|has|have|had|will|would|can|could|may|might|must|shall|should|do|does|did)\b/,L=["rose","fell","grew","went","came","saw","took","gave","became","stood","reached","remained","accounted","showed","recorded"],j=["taken","built","shown","given","made","found","written","spoken","chosen","broken","brought","bought","caught","taught","sold","sent","kept","held","seen","done","read"],F=new RegExp(`\\b(is|are|was|were|be|been|being)\\s+(\\w+ed|${j.join("|")})\\b`),y=["rise","rises","fall","falls","show","shows","increase","increases","decrease","decreases","grow","grows","change","changes","vary","varies","remain","remains","stay","stays","stand","stands","drop","drops","climb","climbs","decline","declines","fluctuate","fluctuates","reach","reaches","exceed","exceeds","surpass","surpasses","dominate","dominates","lead","leads","follow","follows","continue","continues","begin","begins","start","starts","end","ends"],x=new Set(["a","an","the","in","on","at","to","of","for","from","with","by","despite","after","before","during","over","under","sharp","sharply","dramatic","dramatically","slight","slightly","gradual","gradually","significant","significantly","steep","steeply","considerable","considerably","marginal","marginally","rapid","rapidly","substantial","modest","marked","noticeable","strong","weak","large","small"]);function H(e){return e.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]}function k(e){return S.test(` ${e} `)||/\w+ed$/.test(e)||L.includes(e)?!0:y.includes(e)}function E(e){const t=` ${e.toLowerCase()} `;if(S.test(t)||/\b\w+ed\b/.test(t)||L.some(n=>t.includes(` ${n} `)))return!0;const o=H(e);return o.some((n,a)=>a>0&&y.includes(n)&&!x.has(o[a-1]))}const C=new Set(["percentage","percentages","share","shares","proportion","proportions","rate","rates","ratio","ratios","fraction","fractions","whole","level","levels","amount","amounts","number","numbers","total","totals","figure","figures"]),K=new Set(["act","acted","acting","acts","serve","served","serves","serving","volunteer","volunteered","volunteering","volunteers","work","worked","working","works"]),W=new Set(["a","an","the","this","that","these","those","its","their","our","your","his","her","my"]);function Q(e){const t=e.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[,;:]/g)||[],o=new Set(["in","on","at","to","of","for","from","with","by"]),n=(a,i,l=null)=>{if(i&&a+1<t.length&&k(t[a+1]))return!0;for(let r=1;r<=12;r++){const s=a+r;if(s>=t.length||[",",";",":"].includes(t[s]))return!1;if(l&&["and","but","or"].includes(t[s])){if(l==="role")return!1;let c=s+1,p=!1,d=!1;for(;c<t.length&&c<=s+6&&![",",";",":"].includes(t[c]);){if(W.has(t[c]))p=!0;else if(p&&k(t[c])){d=!0;break}c++}if(p&&d)continue;let u=s-1;if(u>=2&&t[u-1]==="of"?u-=2:u>=3&&W.has(t[u-1])&&t[u-2]==="of"&&(u-=3),C.has(t[u]))return!1;continue}if(!k(t[s]))continue;const h=t.slice(a+1,s);if(!(o.has(h[0])||h.length>0&&x.has(h.at(-1)))&&!(y.includes(t[s])&&h.length===0))return!0}return!1};for(let a=0;a<t.length;a++){const i=t[a];if(i==="that"){if(a===0)continue;if(n(a,!0))return!0}else if(i==="when"||i==="where"){if(a+1<t.length&&o.has(t[a+1]))continue;if(n(a,!1))return!0}else if(i==="as"){if(t[a+1]==="a"&&t[a+2]==="result"||a+1<t.length&&o.has(t[a+1]))continue;const l=t[a+1+(["a","an","the"].includes(t[a+1])?1:0)],r=C.has(l),s=K.has(t[a-1])&&["a","an"].includes(t[a+1]);if(n(a,!1,s?"role":r?"measure":null))return!0}}return!1}function X(e){const t=e.split(",");for(let o=0;o<t.length-1;o++){const n=t.slice(0,o+1).join(","),a=t.slice(o+1).join(",");if(n.trim().split(/\s+/).length>=3&&a.trim().split(/\s+/).length>=3&&E(n)&&E(a))return!0}return!1}function g(e){return Math.round(e*2)/2}function w(e,t,o){return Math.min(o,Math.max(t,e))}function J(e){const t=R(e),o=e.trim()?e.trim().split(/\s+/).filter(Boolean).length:0,n=_(e),a=D(e),i=e.toLowerCase(),l=new Set(t),r=b(e,T),s=b(e,q),h=z(a),c=(e.match(/\d[\d,.]*\s*(%|percent|million|billion|thousand)/gi)||[]).length+(e.match(/\b\d+\s*(in \d{4}|from \d{4}|to \d{4}|by \d{4})/gi)||[]).length,p=b(e,V).length;let d=0;for(const m of n){const v=` ${m.toLowerCase()} `,I=U.some(G=>v.includes(` ${G} `)),Y=Q(m),A=F.test(v),$=X(m);(I||Y||A||$)&&d++}const u=n.length>0?t.length/n.length:0;return{words:o,sentences:n.length,paragraphs:a.length,avgSentenceLen:Math.round(u*10)/10,typeTokenRatio:t.length>0?Math.round(l.size/t.length*100)/100:0,linkingTotal:N(i,T.map(m=>new RegExp(`\\b${m.replace(/ /g,"\\s+")}\\b`,"g"))),linkingUnique:r.length,trendWords:s.length,complexRatio:n.length>0?Math.round(d/n.length*100)/100:0,dataRefs:c,hasOverview:h,comparisons:p}}function Z(e){let t=6;const o=[],n=[];return e.words<150?(t-=1.5,n.push(`词数只有 ${e.words}，不足 150 会被扣分（Task 1 要求至少 150 词）`)):(o.push(`词数 ${e.words}，达到 150 词要求`),e.words>220&&n.push("词数偏多（>220），注意精简，避免堆砌细节冲淡重点")),e.hasOverview?(t+=.5,o.push("检测到 overview 概述段——这是 7 分以上的关键")):(t-=1,n.push("没有检测到 overview 概述段：用 Overall / In general 开头单独一段总结主要趋势（不要放数据），这是冲 7 分的硬性要求")),e.dataRefs>=5?(t+=.5,o.push(`引用了 ${e.dataRefs} 处具体数据，支撑充分`)):e.dataRefs<=2&&(t-=.5,n.push("数据引用太少，多用具体数字支撑关键特征（如 25%、3 million）")),e.comparisons>=2?(t+=.25,o.push("能做数据间的对比（comparative / while / whereas），符合 Task 1 要求")):n.push("多做对比：用 higher than / compared with / while / whereas 突出差异，这是考官看重的"),{key:"ta",...f.ta,score:g(w(t,4,8.5)),strengths:o,improvements:n}}function ee(e){let t=6;const o=[],n=[];return e.paragraphs>=4&&e.paragraphs<=5?(t+=.5,o.push(`${e.paragraphs} 段结构清晰（引言 + 概述 + 细节段是经典结构）`)):e.paragraphs<=2?(t-=1,n.push(`只有 ${e.paragraphs} 段：建议分成 4 段——改写引言、overview 概述、两个细节段`)):e.paragraphs>=7&&(t-=.5,n.push("段落过多过碎，合并相关内容，保持 4 段左右")),e.linkingUnique>=6?(t+=.5,o.push(`使用了 ${e.linkingUnique} 种衔接手段，比较灵活`)):e.linkingUnique<=2?(t-=.5,n.push("衔接词太少太单一，多用 however / in contrast / while / whereas / furthermore 等连接逻辑")):o.push(`使用了 ${e.linkingUnique} 种衔接手段`),e.linkingTotal>e.linkingUnique*3&&e.linkingTotal>6&&(t-=.25,n.push("衔接词有堆砌嫌疑，注意自然融入，不要每句都用")),{key:"cc",...f.cc,score:g(w(t,4,8)),strengths:o,improvements:n}}function te(e,t){let o=6;const n=[],a=[];e.typeTokenRatio>=.55?(o+=.5,n.push(`词汇多样性不错（TTR ${e.typeTokenRatio}），重复较少`)):e.typeTokenRatio<.42&&e.words>=100&&(o-=.5,a.push(`词汇重复较多（TTR ${e.typeTokenRatio}），多用同义替换（如 increase → rise / grow / climb）`)),e.trendWords>=8?(o+=.5,n.push(`趋势/程度词汇丰富（${e.trendWords} 个），如描述变化与程度的搭配`)):e.trendWords<=3&&(o-=.5,a.push("趋势词汇太少：积累 rise / fall / fluctuate / remain stable / dramatic / marginal 等表达"));const i=new Map;for(const s of t)s.length>=5&&i.set(s,(i.get(s)||0)+1);let l="",r=0;for(const[s,h]of i)h>r&&(r=h,l=s);return r>=8&&e.words>=120&&(o-=.25,a.push(`"${l}" 出现了 ${r} 次，找同义词替换，避免重复扣分`)),{key:"lr",...f.lr,score:g(w(o,4,8)),strengths:n,improvements:a}}function ne(e){let t=6;const o=[],n=[];return e.complexRatio>=.4?(t+=.5,o.push(`复合句占比 ${Math.round(e.complexRatio*100)}%，句式有变化`)):e.complexRatio<.2&&(t-=.75,n.push("几乎全是简单句：多用定语从句（which/who）、状语从句（while/although/because）和被动语态")),e.avgSentenceLen>=12&&e.avgSentenceLen<=24?o.push(`平均句长 ${e.avgSentenceLen} 词，节奏合适`):e.avgSentenceLen<12&&e.sentences>=5?(t-=.5,n.push(`平均句长只有 ${e.avgSentenceLen} 词，句子偏短碎，尝试合并扩展`)):e.avgSentenceLen>28&&(t-=.25,n.push(`平均句长 ${e.avgSentenceLen} 词偏长，注意断句和标点，避免一逗到底`)),e.sentences<6&&e.words>=120&&(t-=.5,n.push("句子数量太少，检查是否漏了句号或把多句写成了一句")),{key:"gra",...f.gra,score:g(w(t,4,8)),strengths:o,improvements:n}}function he(e){const t=e.trim(),o=J(t),n=R(t),a=[Z(o),ee(o),te(o,n),ne(o)];return{overall:g(a.reduce((l,r)=>l+r.score,0)/a.length),criteria:a,stats:o}}const ce=[{key:"ta",title:"任务完成度 Task Achievement",points:["不少于 150 词（20 分钟）","必须有独立的 overview 段：总结主要趋势/差异/阶段，不放具体数据","筛选关键特征，用数据支撑，不要机械罗列所有数字","开头改写题目，不要照抄"]},{key:"cc",title:"连贯与衔接 Coherence & Cohesion",points:["经典 4 段：改写引言 → overview → 细节段1 → 细节段2","衔接词灵活多样：however / in contrast / while / whereas / furthermore","逻辑递进清晰，代词指代明确"]},{key:"lr",title:"词汇资源 Lexical Resource",points:["趋势词汇：rise / fall / fluctuate / remain stable / peak","程度副词：dramatically / slightly / marginally / considerably","多用同义替换，避免重复；注意拼写"]},{key:"gra",title:"语法多样性与准确性 Grammatical Range & Accuracy",points:["长短句结合，多用复合句：定语从句、状语从句、宾语从句、被动语态","时态准确（多用过去时描述过去数据）","标点规范，避免中式逗号一逗到底"]}],oe=[{id:"c18-t1-task1",book:"剑18",testLabel:"Test 1",task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below gives information about the percentage of the population in four Asian countries living in cities from 1970 to 2020, with predictions for 2030 and 2040.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"折线图：四个亚洲国家城市人口占比（1970–2040，含预测）",image:"writing/c18-t1-task1.png"},{id:"c18-t1-task2",book:"剑18",testLabel:"Test 1",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

The most important aim of science should be to improve people's lives.

To what extent do you agree or disagree with this statement?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"大作文：科学最重要的目标是否应是改善人们的生活"},{id:"c18-t2-task1",book:"剑18",testLabel:"Test 2",task:1,promptEn:`You should spend about 20 minutes on this task.

The chart below shows the number of households in the US by their annual income in 2007, 2011 and 2015.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"柱状图：美国家庭按年收入的户数分布（2007/2011/2015）",image:"writing/c18-t2-task1.png"},{id:"c18-t2-task2",book:"剑18",testLabel:"Test 2",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some university students want to learn about other subjects in addition to their main subjects. Others believe it is more important to give all their time and attention to studying for a qualification.

Discuss both these views and give your own opinion.

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"大作文：大学生是否该学习主修专业之外的科目"},{id:"c18-t3-task1",book:"剑18",testLabel:"Test 3",task:1,promptEn:`You should spend about 20 minutes on this task.

The diagram below shows the floor plan of a public library 20 years ago and how it looks now.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"平面图：公共图书馆20年前与现在的布局对比",image:"writing/c18-t3-task1.png"},{id:"c18-t3-task2",book:"剑18",testLabel:"Test 3",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

In many countries around the world, rural people are moving to cities, so the population in the countryside is decreasing.

Do you think this is a positive or a negative development?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"大作文：农村人口流入城市是积极还是消极的发展"},{id:"c18-t4-task1",book:"剑18",testLabel:"Test 4",task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below shows the average monthly change in the prices of three metals during 2014.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"折线图：铜镍锌三种金属2014年月均价格变化",image:"writing/c18-t4-task1.png"},{id:"c18-t4-task2",book:"剑18",testLabel:"Test 4",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

In many countries, people are now living longer than ever before. Some people say an ageing population creates problems for governments. Other people think there are benefits if society has more elderly people.

To what extent do the advantages of having an ageing population outweigh the disadvantages?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"大作文：人口老龄化的利是否大于弊"}],ae=[{id:"c19-t1-task1",book:"剑19",testLabel:"Test 1",task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below gives information on the numbers of participants for different activities at one social centre in Melbourne, Australia for the period 2000 to 2020.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"折线图：墨尔本某社交中心2000–2020年各项活动参与人数",image:"writing/c19-t1-task1.png"},{id:"c19-t1-task2",book:"剑19",testLabel:"Test 1",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some people think that competition at work, at school and in daily life is a good thing. Others believe that we should try to cooperate more, rather than competing against each other.

Discuss both these views and give your own opinion.

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"竞争与合作：讨论双方观点并给出自己的看法"},{id:"c19-t2-task1",book:"剑19",testLabel:"Test 2",task:1,promptEn:`You should spend about 20 minutes on this task.

The plans below show a harbour in 2000 and how it looks today.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"地图对比：Porth Harbour 2000年与现在的变化",image:"writing/c19-t2-task1.png"},{id:"c19-t2-task2",book:"剑19",testLabel:"Test 2",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

The working week should be shorter and workers should have a longer weekend.

Do you agree or disagree?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"是否赞成缩短工作周、延长周末"},{id:"c19-t3-task1",book:"剑19",testLabel:"Test 3",task:1,promptEn:`You should spend about 20 minutes on this task.

The diagram below shows how a biofuel called ethanol is produced.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"流程图：生物燃料乙醇的生产过程",image:"writing/c19-t3-task1.png"},{id:"c19-t3-task2",book:"剑19",testLabel:"Test 3",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

It is important for everyone, including young people, to save money for their future.

To what extent do you agree or disagree with this statement?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"存钱的重要性：你在多大程度上同意"},{id:"c19-t4-task1",book:"剑19",testLabel:"Test 4",task:1,promptEn:`You should spend about 20 minutes on this task.

The charts below give information on the location and types of dance classes young people in a town in Australia are currently attending.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"饼图+条形图：澳洲某镇年轻人舞蹈课的地点与类型",image:"writing/c19-t4-task1.png"},{id:"c19-t4-task2",book:"剑19",testLabel:"Test 4",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

In many countries nowadays, consumers can go to a supermarket and buy food produced all over the world.

Do you think this is a positive or negative development?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"全球食品贸易：是积极还是消极的发展"}],se=[{id:"c20-t1-task1",book:"剑20",testLabel:"Test 1",task:1,promptEn:`You should spend about 20 minutes on this task.
The first table below shows changes in the total population of New York City from 1800 to 2000. The second and third tables show changes in the population of the five districts of the city (Manhattan, Brooklyn, Bronx, Queens, Staten Island) over the same period.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,promptCn:"表格：1800–2000 年纽约市总人口及曼哈顿与其他四区人口变化",image:"writing/c20-t1-task1.png"},{id:"c20-t1-task2",book:"剑20",testLabel:"Test 1",task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
Access to clean water is a basic human right. Therefore, every home should have a water supply that is provided free of charge.
Do you agree or disagree?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:"是否同意：清洁水是基本人权，每家应免费供水"},{id:"c20-t2-task1",book:"剑20",testLabel:"Test 2",task:1,promptEn:`You should spend about 20 minutes on this task.
The plans below show the site of a farm in 1950 and the same site today.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,promptCn:"地图：1950 年与现在的 Beechwood 农场变迁对比",image:"writing/c20-t2-task1.png"},{id:"c20-t2-task2",book:"剑20",testLabel:"Test 2",task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
In many countries, primary and secondary schools close for two months or more in the summer holidays.
What is the value of long school holidays?
What are the arguments in favour of shorter school holidays?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:"暑假长短之争：长假期的价值 vs 支持缩短假期的论据"},{id:"c20-t3-task1",book:"剑20",testLabel:"Test 3",task:1,promptEn:`You should spend about 20 minutes on this task.
The charts below give information about a public library in a town called Little Chalfont.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words`,promptCn:"饼图+表格+柱状图：Little Chalfont 公共图书馆会员与借阅情况",image:"writing/c20-t3-task1.png"},{id:"c20-t3-task2",book:"剑20",testLabel:"Test 3",task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
Some people have decided to reduce the number of times they fly every year or to stop flying altogether.
Do you think the environmental benefits of this development outweigh the disadvantages for individuals and businesses?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:"减少乘机：环保收益是否超过对个人和企业的弊端"},{id:"c20-t4-task1",book:"剑20",testLabel:"Test 4",task:1,promptEn:`You should spend about 20 minutes on this task.
The diagram below shows how fabric is manufactured from bamboo.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,promptCn:"流程图：竹子制成布料的 9 个步骤",image:"writing/c20-t4-task1.png"},{id:"c20-t4-task2",book:"剑20",testLabel:"Test 4",task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
Many aspects of the way people dress today are influenced by global fashion trends.
How has global fashion become such a strong influence on people's lives? Do you think this is a positive or negative development?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:"全球时尚潮流对穿着的影响：原因及利弊"}],re=[{id:"c21-t1-task1",book:"剑21",testLabel:"Test 1",task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below gives information about the number of jobs in four sectors of the economy in the US between 1960 and 2020.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"折线图：1960–2020年美国四个经济部门的就业人数",image:"writing/c21-t1-task1.png"},{id:"c21-t1-task2",book:"剑21",testLabel:"Test 1",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

The best way to provide enough homes in large cities is to build tall apartment blocks.

To what extent do you agree or disagree with this statement?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"大城市建高层公寓是否是解决住房问题的最佳方式"},{id:"c21-t2-task1",book:"剑21",testLabel:"Test 2",task:1,promptEn:`You should spend about 20 minutes on this task.

The plans below show a college café before it was redesigned and how it looks now.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"平面图对比：大学咖啡馆重新设计前后的变化",image:"writing/c21-t2-task1.png"},{id:"c21-t2-task2",book:"剑21",testLabel:"Test 2",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some people say that in the digital age, theatres and cinemas are no longer important as people can watch all the entertainment they want online. Others argue that theatres and cinemas are still important both economically and culturally.

Discuss both these views and give your own opinion.

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"数字时代剧院和电影院是否仍重要：讨论双方观点"},{id:"c21-t3-task1",book:"剑21",testLabel:"Test 3",task:1,promptEn:`You should spend about 20 minutes on this task.

The diagram below shows how one type of desert, known as a rain-shadow desert, is formed.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"流程图：雨影沙漠的形成过程",image:"writing/c21-t3-task1.png"},{id:"c21-t3-task2",book:"剑21",testLabel:"Test 3",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

All university undergraduate courses should include a period of time spent studying abroad or doing a work placement.

Do you think the advantages of this would outweigh the disadvantages?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"大学本科课程是否应包含留学或实习：利弊权衡"},{id:"c21-t4-task1",book:"剑21",testLabel:"Test 4",task:1,promptEn:`You should spend about 20 minutes on this task.

The chart and table below show the results of a survey of library users at a university.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:"饼图+表格：大学图书馆用户构成与满意度调查",image:"writing/c21-t4-task1.png"},{id:"c21-t4-task2",book:"剑21",testLabel:"Test 4",task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some people argue that primary schools focus too much on formal learning.

To what extent do you agree with this opinion?

How important do you think it is for children to play as well as learn in the primary school classroom?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:"小学是否过于注重正式学习、玩耍与学习哪个更重要"}],pe=[...re,...se,...ae,...oe];export{pe as C,J as a,ce as b,he as g,ue as u};
