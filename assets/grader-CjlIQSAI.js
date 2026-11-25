import{B as e,C as t,i as n,k as r}from"./runtime-core.esm-bundler-BaT_QEjx.js";import{i}from"./vue-router-nfpj53qs.js";import{J as a,L as o,Z as s,o as c,u as l,w as u}from"./useAuth-CKk4WY0K.js";import{a as ee,i as d,n as f,o as te,r as p,t as ne}from"./drafts-yJVMIIQh.js";import{a as re,r as ie}from"./index-CwNJfv5-.js";import{i as m}from"./text-Cc8He0Ar.js";function h(m){let{task:h,essayKey:g,timeLimit:_,findPrompt:v}=m,y=e(`home`),b=e([]);function x(){b.value=Object.values(a(g,l().currentUser.value)).sort((e,t)=>t.createdAt-e.createdAt)}x();let S=e(!1),{currentUser:C}=l();r(C,()=>{x(),G()});function w(e){if(!s(g,String(e.id),e,C.value))return!1;x();for(let e of b.value.slice(50))s(g,String(e.id),void 0,C.value);return x(),!0}function T(e){s(g,String(e),void 0,C.value),x()}let E=e(null),D=e(``),O=e(_),k=e(!1),A=e(!1),j=e(!1),M=e(!1),N=null,P=0,F=n(()=>D.value.trim().split(/\s+/).filter(Boolean).length),I=n(()=>{let e=Math.max(0,O.value);return`${`${Math.floor(e/60)}`.padStart(2,`0`)}:${`${e%60}`.padStart(2,`0`)}`}),L={get:e=>f.get(JSON.stringify([h,e])),set:(e,t)=>f.set(JSON.stringify([h,e]),t),delete:e=>f.delete(JSON.stringify([h,e]))},R=C.value,z=null,B=e(p(h,R));function V(){if(y.value!==`write`||!E.value)return!0;let e=D.value.trim()?te(h,R,{promptId:E.value.id,text:D.value,secondsLeft:O.value,overtime:M.value}):(ne(h,R,E.value.id),!0);return e&&L.delete(R),B.value=p(h,R),e}let H=c(V),U=u(x);function W(){document.visibilityState===`hidden`&&V()}window.addEventListener(`pagehide`,V),document.addEventListener(`visibilitychange`,W),i(()=>V()),r(D,()=>{y.value===`write`&&(z&&clearTimeout(z),z=setTimeout(V,2e3))}),t(()=>{H(),U(),window.removeEventListener(`pagehide`,V),document.removeEventListener(`visibilitychange`,W),N&&clearInterval(N),z&&clearTimeout(z),!V()&&E.value&&L.set(R,{promptId:E.value.id,text:D.value,secondsLeft:O.value,overtime:M.value})});function G(e=!1){!V()&&E.value&&L.set(R,{promptId:E.value.id,text:D.value,secondsLeft:O.value,overtime:M.value}),z&&clearTimeout(z),z=null,N&&clearInterval(N),N=null,k.value=!1,R=C.value;try{B.value=p(h,R);let t=e?m.resumeSelection():void 0,n=t&&o(R)+t.draft,r=d(h,R,t?.prompt,n);S.value=!!t&&!r;let i=t?r:L.get(R)??r;if(i){let e=v(i.promptId);if(i.text&&e){E.value=e,D.value=i.text;let t=typeof i.secondsLeft==`number`&&Number.isFinite(i.secondsLeft)?i.secondsLeft:_;O.value=Math.min(Math.max(0,t),_),j.value=O.value<=0,M.value=!!i.overtime,A.value=O.value<_||!!i.overtime,y.value=`write`;return}}}catch{}E.value=null,D.value=``,O.value=_,M.value=!1,j.value=!1,y.value=`home`}G(!0),r(m.resumeSelection,e=>{if(!e)return;let t=o(R)+e.draft,n=p(h,R).find(n=>n.promptId===e.prompt&&n.versionId===t);S.value=!n,n&&me(n.promptId,n.versionId)});function K(e,t){if(!V())return;let n=d(h,R,e.id,t);E.value=e,D.value=n?.text??``,O.value=n?.secondsLeft??_,j.value=O.value<=0,M.value=!!n?.overtime,A.value=O.value<_||!!n?.overtime,k.value=!1,N&&clearInterval(N),y.value=`write`}function ae(){M.value=!0,k.value=!1,N&&clearInterval(N),V()}function oe(){j.value||M.value||(k.value?(k.value=!1,P&&(O.value=Math.max(0,Math.ceil((P-Date.now())/1e3))),P=0,N&&clearInterval(N)):(k.value=!0,A.value=!0,P=Date.now()+O.value*1e3,N=setInterval(()=>{O.value=Math.max(0,Math.ceil((P-Date.now())/1e3)),O.value<=0&&(O.value=0,j.value=!0,k.value=!1,P=0,N&&clearInterval(N))},1e3)))}function se(){N&&clearInterval(N),k.value=!1,A.value=!1,M.value=!1,j.value=!1,O.value=_}function ce(){V()&&(N&&clearInterval(N),k.value=!1,y.value=`home`,x())}let q=e(null),J=e(null),Y=e(``),X=e(0),Z=e(!0),Q=e(``),$=null;function le(e){$??={owner:R,record:e,draft:ee(h,R,e.promptId)},w(e)?($.draft&&ne(h,$.owner,e.promptId,$.draft),$=null,Q.value=``,B.value=p(h,R)):Q.value=`作文存档失败，原文仍保留在草稿中。请重试保存或复制原文后再离开。`}function ue(){$?.owner===C.value&&le($.record)}function de(){F.value<50?ie(m.messages.tooFew):F.value<m.minWords?re(m.messages.confirm(F.value),{confirmText:`提交`}).then(e=>{e&&fe()}):fe()}function fe(){N&&clearInterval(N),k.value=!1,X.value=_-O.value,Z.value=A.value,q.value=m.analyze(D.value),J.value=E.value,Y.value=E.value?m.questionOf(E.value):``,V()&&(y.value=`result`,E.value&&q.value&&($=null,le({id:`${Date.now()}-${crypto.randomUUID()}`,promptId:E.value.id,promptTitleCn:m.titleCnOf(E.value),text:D.value,...m.recordFields(q.value),secondsUsed:X.value,timed:A.value,overtime:M.value,createdAt:Date.now()})))}function pe(e){let t=v(e.promptId);J.value=t,Y.value=t?m.questionOf(t):e.promptTitleCn,D.value=e.text,q.value=m.analyze(e.text),X.value=e.secondsUsed,Z.value=e.timed!==!1,M.value=!!e.overtime,y.value=`result`}function me(e,t){let n=v(e);n&&K(n,t)}return{view:y,history:b,resumeError:S,removeEssay:T,prompt:E,essayText:D,secondsLeft:O,timerOn:k,timerStarted:A,timeUp:j,overtime:M,wordCount:F,timeText:I,drafts:B,saveDraftNow:V,startWrite:K,continueOvertime:ae,toggleTimer:oe,resetTimer:se,backHome:ce,result:q,resultPrompt:J,resultQuestion:Y,secondsUsed:X,secondsTimed:Z,archiveError:Q,retryArchive:ue,submitEssay:de,reviewEssay:pe,resumeDraft:me}}function g(e){let t=new Date(e);return`${t.getMonth()+1}/${t.getDate()} ${`${t.getHours()}`.padStart(2,`0`)}:${`${t.getMinutes()}`.padStart(2,`0`)}`}function _(e){return`${Math.floor(e/60)}分${e%60}秒`}var v=[{id:`c21-t1-task1`,book:`剑21`,testLabel:`Test 1`,task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below gives information about the number of jobs in four sectors of the economy in the US between 1960 and 2020.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`折线图：1960–2020年美国四个经济部门的就业人数`,image:`writing/c21-t1-task1.png`},{id:`c21-t1-task2`,book:`剑21`,testLabel:`Test 1`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

The best way to provide enough homes in large cities is to build tall apartment blocks.

To what extent do you agree or disagree with this statement?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`大城市建高层公寓是否是解决住房问题的最佳方式`},{id:`c21-t2-task1`,book:`剑21`,testLabel:`Test 2`,task:1,promptEn:`You should spend about 20 minutes on this task.

The plans below show a college café before it was redesigned and how it looks now.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`平面图对比：大学咖啡馆重新设计前后的变化`,image:`writing/c21-t2-task1.png`},{id:`c21-t2-task2`,book:`剑21`,testLabel:`Test 2`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some people say that in the digital age, theatres and cinemas are no longer important as people can watch all the entertainment they want online. Others argue that theatres and cinemas are still important both economically and culturally.

Discuss both these views and give your own opinion.

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`数字时代剧院和电影院是否仍重要：讨论双方观点`},{id:`c21-t3-task1`,book:`剑21`,testLabel:`Test 3`,task:1,promptEn:`You should spend about 20 minutes on this task.

The diagram below shows how one type of desert, known as a rain-shadow desert, is formed.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`流程图：雨影沙漠的形成过程`,image:`writing/c21-t3-task1.png`},{id:`c21-t3-task2`,book:`剑21`,testLabel:`Test 3`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

All university undergraduate courses should include a period of time spent studying abroad or doing a work placement.

Do you think the advantages of this would outweigh the disadvantages?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`大学本科课程是否应包含留学或实习：利弊权衡`},{id:`c21-t4-task1`,book:`剑21`,testLabel:`Test 4`,task:1,promptEn:`You should spend about 20 minutes on this task.

The chart and table below show the results of a survey of library users at a university.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`饼图+表格：大学图书馆用户构成与满意度调查`,image:`writing/c21-t4-task1.png`},{id:`c21-t4-task2`,book:`剑21`,testLabel:`Test 4`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some people argue that primary schools focus too much on formal learning.

To what extent do you agree with this opinion?

How important do you think it is for children to play as well as learn in the primary school classroom?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`小学是否过于注重正式学习、玩耍与学习哪个更重要`},{id:`c20-t1-task1`,book:`剑20`,testLabel:`Test 1`,task:1,promptEn:`You should spend about 20 minutes on this task.
The first table below shows changes in the total population of New York City from 1800 to 2000. The second and third tables show changes in the population of the five districts of the city (Manhattan, Brooklyn, Bronx, Queens, Staten Island) over the same period.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,promptCn:`表格：1800–2000 年纽约市总人口及曼哈顿与其他四区人口变化`,image:`writing/c20-t1-task1.png`},{id:`c20-t1-task2`,book:`剑20`,testLabel:`Test 1`,task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
Access to clean water is a basic human right. Therefore, every home should have a water supply that is provided free of charge.
Do you agree or disagree?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:`是否同意：清洁水是基本人权，每家应免费供水`},{id:`c20-t2-task1`,book:`剑20`,testLabel:`Test 2`,task:1,promptEn:`You should spend about 20 minutes on this task.
The plans below show the site of a farm in 1950 and the same site today.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,promptCn:`地图：1950 年与现在的 Beechwood 农场变迁对比`,image:`writing/c20-t2-task1.png`},{id:`c20-t2-task2`,book:`剑20`,testLabel:`Test 2`,task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
In many countries, primary and secondary schools close for two months or more in the summer holidays.
What is the value of long school holidays?
What are the arguments in favour of shorter school holidays?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:`暑假长短之争：长假期的价值 vs 支持缩短假期的论据`},{id:`c20-t3-task1`,book:`剑20`,testLabel:`Test 3`,task:1,promptEn:`You should spend about 20 minutes on this task.
The charts below give information about a public library in a town called Little Chalfont.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words`,promptCn:`饼图+表格+柱状图：Little Chalfont 公共图书馆会员与借阅情况`,image:`writing/c20-t3-task1.png`},{id:`c20-t3-task2`,book:`剑20`,testLabel:`Test 3`,task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
Some people have decided to reduce the number of times they fly every year or to stop flying altogether.
Do you think the environmental benefits of this development outweigh the disadvantages for individuals and businesses?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:`减少乘机：环保收益是否超过对个人和企业的弊端`},{id:`c20-t4-task1`,book:`剑20`,testLabel:`Test 4`,task:1,promptEn:`You should spend about 20 minutes on this task.
The diagram below shows how fabric is manufactured from bamboo.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,promptCn:`流程图：竹子制成布料的 9 个步骤`,image:`writing/c20-t4-task1.png`},{id:`c20-t4-task2`,book:`剑20`,testLabel:`Test 4`,task:2,promptEn:`You should spend about 40 minutes on this task.
Write about the following topic:
Many aspects of the way people dress today are influenced by global fashion trends.
How has global fashion become such a strong influence on people's lives? Do you think this is a positive or negative development?
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,promptCn:`全球时尚潮流对穿着的影响：原因及利弊`},{id:`c19-t1-task1`,book:`剑19`,testLabel:`Test 1`,task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below gives information on the numbers of participants for different activities at one social centre in Melbourne, Australia for the period 2000 to 2020.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`折线图：墨尔本某社交中心2000–2020年各项活动参与人数`,image:`writing/c19-t1-task1.png`},{id:`c19-t1-task2`,book:`剑19`,testLabel:`Test 1`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some people think that competition at work, at school and in daily life is a good thing. Others believe that we should try to cooperate more, rather than competing against each other.

Discuss both these views and give your own opinion.

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`竞争与合作：讨论双方观点并给出自己的看法`},{id:`c19-t2-task1`,book:`剑19`,testLabel:`Test 2`,task:1,promptEn:`You should spend about 20 minutes on this task.

The plans below show a harbour in 2000 and how it looks today.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`地图对比：Porth Harbour 2000年与现在的变化`,image:`writing/c19-t2-task1.png`},{id:`c19-t2-task2`,book:`剑19`,testLabel:`Test 2`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

The working week should be shorter and workers should have a longer weekend.

Do you agree or disagree?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`是否赞成缩短工作周、延长周末`},{id:`c19-t3-task1`,book:`剑19`,testLabel:`Test 3`,task:1,promptEn:`You should spend about 20 minutes on this task.

The diagram below shows how a biofuel called ethanol is produced.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`流程图：生物燃料乙醇的生产过程`,image:`writing/c19-t3-task1.png`},{id:`c19-t3-task2`,book:`剑19`,testLabel:`Test 3`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

It is important for everyone, including young people, to save money for their future.

To what extent do you agree or disagree with this statement?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`存钱的重要性：你在多大程度上同意`},{id:`c19-t4-task1`,book:`剑19`,testLabel:`Test 4`,task:1,promptEn:`You should spend about 20 minutes on this task.

The charts below give information on the location and types of dance classes young people in a town in Australia are currently attending.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`饼图+条形图：澳洲某镇年轻人舞蹈课的地点与类型`,image:`writing/c19-t4-task1.png`},{id:`c19-t4-task2`,book:`剑19`,testLabel:`Test 4`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

In many countries nowadays, consumers can go to a supermarket and buy food produced all over the world.

Do you think this is a positive or negative development?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`全球食品贸易：是积极还是消极的发展`},{id:`c18-t1-task1`,book:`剑18`,testLabel:`Test 1`,task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below gives information about the percentage of the population in four Asian countries living in cities from 1970 to 2020, with predictions for 2030 and 2040.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`折线图：四个亚洲国家城市人口占比（1970–2040，含预测）`,image:`writing/c18-t1-task1.png`},{id:`c18-t1-task2`,book:`剑18`,testLabel:`Test 1`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

The most important aim of science should be to improve people's lives.

To what extent do you agree or disagree with this statement?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`大作文：科学最重要的目标是否应是改善人们的生活`},{id:`c18-t2-task1`,book:`剑18`,testLabel:`Test 2`,task:1,promptEn:`You should spend about 20 minutes on this task.

The chart below shows the number of households in the US by their annual income in 2007, 2011 and 2015.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`柱状图：美国家庭按年收入的户数分布（2007/2011/2015）`,image:`writing/c18-t2-task1.png`},{id:`c18-t2-task2`,book:`剑18`,testLabel:`Test 2`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

Some university students want to learn about other subjects in addition to their main subjects. Others believe it is more important to give all their time and attention to studying for a qualification.

Discuss both these views and give your own opinion.

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`大作文：大学生是否该学习主修专业之外的科目`},{id:`c18-t3-task1`,book:`剑18`,testLabel:`Test 3`,task:1,promptEn:`You should spend about 20 minutes on this task.

The diagram below shows the floor plan of a public library 20 years ago and how it looks now.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`平面图：公共图书馆20年前与现在的布局对比`,image:`writing/c18-t3-task1.png`},{id:`c18-t3-task2`,book:`剑18`,testLabel:`Test 3`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

In many countries around the world, rural people are moving to cities, so the population in the countryside is decreasing.

Do you think this is a positive or a negative development?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`大作文：农村人口流入城市是积极还是消极的发展`},{id:`c18-t4-task1`,book:`剑18`,testLabel:`Test 4`,task:1,promptEn:`You should spend about 20 minutes on this task.

The graph below shows the average monthly change in the prices of three metals during 2014.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.`,promptCn:`折线图：铜镍锌三种金属2014年月均价格变化`,image:`writing/c18-t4-task1.png`},{id:`c18-t4-task2`,book:`剑18`,testLabel:`Test 4`,task:2,promptEn:`You should spend about 40 minutes on this task.

Write about the following topic:

In many countries, people are now living longer than ever before. Some people say an ageing population creates problems for governments. Other people think there are benefits if society has more elderly people.

To what extent do the advantages of having an ageing population outweigh the disadvantages?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`,promptCn:`大作文：人口老龄化的利是否大于弊`}],y={ta:{label:`Task Achievement`,labelCn:`任务完成度`},cc:{label:`Coherence & Cohesion`,labelCn:`连贯与衔接`},lr:{label:`Lexical Resource`,labelCn:`词汇资源`},gra:{label:`Grammatical Range & Accuracy`,labelCn:`语法多样性与准确性`}};function b(e){return e.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]}function x(e){let t=e.split(/\n\s*\n/).map(e=>e.trim()).filter(e=>e.length>0);if(t.length>1)return t;let n=e.split(/\n/).map(e=>e.trim()).filter(e=>e.length>0);return n.length>1?n:[e.trim()]}function S(e,t){let n=0;for(let r of t){let t=e.match(r);t&&(n+=t.length)}return n}function C(e,t){return t.filter(t=>{let n=t.split(` `).map(e=>e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`)).join(`\\s+`);return RegExp(`\\b${n}\\b`,`i`).test(e)})}var w=[`overall`,`in general`,`generally speaking`,`generally,`,`it is clear that`,`it can be seen that`,`in summary`,`to sum up`,`the main trend`,`main trends`,`the most noticeable`,`striking feature`],T=`however.moreover.furthermore.in addition.besides.in contrast.on the other hand.on the contrary.conversely.while.whereas.although.though.despite.in spite of.therefore.consequently.as a result.thus.hence.similarly.likewise.in comparison.compared to.compared with.in terms of.with regard to.regarding.for example.for instance.namely.in particular.particularly.overall.finally.firstly.secondly.subsequently.meanwhile.nevertheless.nonetheless.instead.alternatively.accordingly`.split(`.`),E=`increase.increased.increases.increasing.decrease.decreased.decreases.decreasing.rise.rose.risen.rises.rising.fall.fell.fallen.falls.falling.grow.grew.grown.grows.growing.growth.decline.declined.declines.declining.drop.dropped.drops.dropping.surge.surged.soar.soared.plummet.plummeted.fluctuate.fluctuated.fluctuation.fluctuations.remain.remained.stable.stability.steady.peak.peaked.reach a peak.trough.dramatic.dramatically.sharp.sharply.steep.steeply.gradual.gradually.slight.slightly.marginal.marginally.significant.significantly.considerable.considerably.account for.accounts for.accounted for.comprise.comprises.comprised.constitute.constitutes.proportion.percentage.overtake.overtook.surpass`.split(`.`),D=[`although`,`though`,`while`,`whereas`,`because`,`which`,`who`,`whom`,`whose`,`if`,`unless`,`so that`],O=[`higher than`,`lower than`,`more than`,`less than`,`greater than`,`compared to`,`compared with`,`in comparison`,`in contrast`,`while`,`whereas`,`by contrast`,`similarly`,`twice as`];function k(e,t){if(!e.startsWith(t))return!1;let n=e[t.length];return n===void 0||!/[a-z]/.test(n)}function A(e){return e.some(e=>{let t=e.toLowerCase().trim();return w.some(e=>k(t,e))})}var j=/\b(am|is|are|was|were|be|been|being|has|have|had|will|would|can|could|may|might|must|shall|should|do|does|did)\b/,M=[`rose`,`fell`,`grew`,`went`,`came`,`saw`,`took`,`gave`,`became`,`stood`,`reached`,`remained`,`accounted`,`showed`,`recorded`],N=RegExp(`\\b(is|are|was|were|be|been|being)\\s+(\\w+ed|taken|built|shown|given|made|found|written|spoken|chosen|broken|brought|bought|caught|taught|sold|sent|kept|held|seen|done|read)\\b`),P=`rise.rises.fall.falls.show.shows.increase.increases.decrease.decreases.grow.grows.change.changes.vary.varies.remain.remains.stay.stays.stand.stands.drop.drops.climb.climbs.decline.declines.fluctuate.fluctuates.reach.reaches.exceed.exceeds.surpass.surpasses.dominate.dominates.lead.leads.follow.follows.continue.continues.begin.begins.start.starts.end.ends`.split(`.`),F=new Set(`a.an.the.in.on.at.to.of.for.from.with.by.despite.after.before.during.over.under.sharp.sharply.dramatic.dramatically.slight.slightly.gradual.gradually.significant.significantly.steep.steeply.considerable.considerably.marginal.marginally.rapid.rapidly.substantial.modest.marked.noticeable.strong.weak.large.small`.split(`.`));function I(e){return e.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]}function L(e){return j.test(` ${e} `)||/\w+ed$/.test(e)||M.includes(e)?!0:P.includes(e)}function R(e){let t=` ${e.toLowerCase()} `;if(j.test(t)||/\b\w+ed\b/.test(t)||M.some(e=>t.includes(` ${e} `)))return!0;let n=I(e);return n.some((e,t)=>t>0&&P.includes(e)&&!F.has(n[t-1]))}var z=new Set([`percentage`,`percentages`,`share`,`shares`,`proportion`,`proportions`,`rate`,`rates`,`ratio`,`ratios`,`fraction`,`fractions`,`whole`,`level`,`levels`,`amount`,`amounts`,`number`,`numbers`,`total`,`totals`,`figure`,`figures`]),B=new Set([`act`,`acted`,`acting`,`acts`,`serve`,`served`,`serves`,`serving`,`volunteer`,`volunteered`,`volunteering`,`volunteers`,`work`,`worked`,`working`,`works`]),V=new Set([`a`,`an`,`the`,`this`,`that`,`these`,`those`,`its`,`their`,`our`,`your`,`his`,`her`,`my`]);function H(e){let t=e.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[,;:]/g)||[],n=new Set([`in`,`on`,`at`,`to`,`of`,`for`,`from`,`with`,`by`]),r=(e,r,i=null)=>{if(r&&e+1<t.length&&L(t[e+1]))return!0;for(let r=1;r<=12;r++){let a=e+r;if(a>=t.length||[`,`,`;`,`:`].includes(t[a]))return!1;if(i&&[`and`,`but`,`or`].includes(t[a])){if(i===`role`)return!1;let e=a+1,n=!1,r=!1;for(;e<t.length&&e<=a+6&&![`,`,`;`,`:`].includes(t[e]);){if(V.has(t[e]))n=!0;else if(n&&L(t[e])){r=!0;break}e++}if(n&&r)continue;let o=a-1;if(o>=2&&t[o-1]===`of`?o-=2:o>=3&&V.has(t[o-1])&&t[o-2]===`of`&&(o-=3),z.has(t[o]))return!1;continue}if(!L(t[a]))continue;let o=t.slice(e+1,a);if(!(n.has(o[0])||o.length>0&&F.has(o.at(-1)))&&!(P.includes(t[a])&&o.length===0))return!0}return!1};for(let e=0;e<t.length;e++){let i=t[e];if(i===`that`){if(e===0)continue;if(r(e,!0))return!0}else if(i===`when`||i===`where`){if(e+1<t.length&&n.has(t[e+1]))continue;if(r(e,!1))return!0}else if(i===`as`){if(t[e+1]===`a`&&t[e+2]===`result`||e+1<t.length&&n.has(t[e+1]))continue;let i=t[e+1+ +!![`a`,`an`,`the`].includes(t[e+1])],a=z.has(i),o=B.has(t[e-1])&&[`a`,`an`].includes(t[e+1]);if(r(e,!1,o?`role`:a?`measure`:null))return!0}}return!1}function U(e){let t=e.split(`,`);for(let e=0;e<t.length-1;e++){let n=t.slice(0,e+1).join(`,`),r=t.slice(e+1).join(`,`);if(n.trim().split(/\s+/).length>=3&&r.trim().split(/\s+/).length>=3&&R(n)&&R(r))return!0}return!1}function W(e){return Math.round(e*2)/2}function G(e,t,n){return Math.min(n,Math.max(t,e))}function K(e){let t=b(e),n=e.trim()?e.trim().split(/\s+/).filter(Boolean).length:0,r=m(e),i=x(e),a=e.toLowerCase(),o=new Set(t),s=C(e,T),c=C(e,E),l=A(i),u=(e.match(/\d[\d,.]*\s*(%|percent|million|billion|thousand)/gi)||[]).length+(e.match(/\b\d+\s*(in \d{4}|from \d{4}|to \d{4}|by \d{4})/gi)||[]).length,ee=C(e,O).length,d=0;for(let e of r){let t=` ${e.toLowerCase()} `,n=D.some(e=>t.includes(` ${e} `)),r=H(e),i=N.test(t),a=U(e);(n||r||i||a)&&d++}let f=r.length>0?t.length/r.length:0;return{words:n,sentences:r.length,paragraphs:i.length,avgSentenceLen:Math.round(f*10)/10,typeTokenRatio:t.length>0?Math.round(o.size/t.length*100)/100:0,linkingTotal:S(a,T.map(e=>RegExp(`\\b${e.replace(/ /g,`\\s+`)}\\b`,`g`))),linkingUnique:s.length,trendWords:c.length,complexRatio:r.length>0?Math.round(d/r.length*100)/100:0,dataRefs:u,hasOverview:l,comparisons:ee}}function ae(e){let t=6,n=[],r=[];return e.words<150?(t-=1.5,r.push(`词数只有 ${e.words}，不足 150 会被扣分（Task 1 要求至少 150 词）`)):(n.push(`词数 ${e.words}，达到 150 词要求`),e.words>220&&r.push(`词数偏多（>220），注意精简，避免堆砌细节冲淡重点`)),e.hasOverview?(t+=.5,n.push(`检测到 overview 概述段——这是 7 分以上的关键`)):(--t,r.push(`没有检测到 overview 概述段：用 Overall / In general 开头单独一段总结主要趋势（不要放数据），这是冲 7 分的硬性要求`)),e.dataRefs>=5?(t+=.5,n.push(`引用了 ${e.dataRefs} 处具体数据，支撑充分`)):e.dataRefs<=2&&(t-=.5,r.push(`数据引用太少，多用具体数字支撑关键特征（如 25%、3 million）`)),e.comparisons>=2?(t+=.25,n.push(`能做数据间的对比（comparative / while / whereas），符合 Task 1 要求`)):r.push(`多做对比：用 higher than / compared with / while / whereas 突出差异，这是考官看重的`),{key:`ta`,...y.ta,score:W(G(t,4,8.5)),strengths:n,improvements:r}}function oe(e){let t=6,n=[],r=[];return e.paragraphs>=4&&e.paragraphs<=5?(t+=.5,n.push(`${e.paragraphs} 段结构清晰（引言 + 概述 + 细节段是经典结构）`)):e.paragraphs<=2?(--t,r.push(`只有 ${e.paragraphs} 段：建议分成 4 段——改写引言、overview 概述、两个细节段`)):e.paragraphs>=7&&(t-=.5,r.push(`段落过多过碎，合并相关内容，保持 4 段左右`)),e.linkingUnique>=6?(t+=.5,n.push(`使用了 ${e.linkingUnique} 种衔接手段，比较灵活`)):e.linkingUnique<=2?(t-=.5,r.push(`衔接词太少太单一，多用 however / in contrast / while / whereas / furthermore 等连接逻辑`)):n.push(`使用了 ${e.linkingUnique} 种衔接手段`),e.linkingTotal>e.linkingUnique*3&&e.linkingTotal>6&&(t-=.25,r.push(`衔接词有堆砌嫌疑，注意自然融入，不要每句都用`)),{key:`cc`,...y.cc,score:W(G(t,4,8)),strengths:n,improvements:r}}function se(e,t){let n=6,r=[],i=[];e.typeTokenRatio>=.55?(n+=.5,r.push(`词汇多样性不错（TTR ${e.typeTokenRatio}），重复较少`)):e.typeTokenRatio<.42&&e.words>=100&&(n-=.5,i.push(`词汇重复较多（TTR ${e.typeTokenRatio}），多用同义替换（如 increase → rise / grow / climb）`)),e.trendWords>=8?(n+=.5,r.push(`趋势/程度词汇丰富（${e.trendWords} 个），如描述变化与程度的搭配`)):e.trendWords<=3&&(n-=.5,i.push(`趋势词汇太少：积累 rise / fall / fluctuate / remain stable / dramatic / marginal 等表达`));let a=new Map;for(let e of t)e.length>=5&&a.set(e,(a.get(e)||0)+1);let o=``,s=0;for(let[e,t]of a)t>s&&(s=t,o=e);return s>=8&&e.words>=120&&(n-=.25,i.push(`"${o}" 出现了 ${s} 次，找同义词替换，避免重复扣分`)),{key:`lr`,...y.lr,score:W(G(n,4,8)),strengths:r,improvements:i}}function ce(e){let t=6,n=[],r=[];return e.complexRatio>=.4?(t+=.5,n.push(`复合句占比 ${Math.round(e.complexRatio*100)}%，句式有变化`)):e.complexRatio<.2&&(t-=.75,r.push(`几乎全是简单句：多用定语从句（which/who）、状语从句（while/although/because）和被动语态`)),e.avgSentenceLen>=12&&e.avgSentenceLen<=24?n.push(`平均句长 ${e.avgSentenceLen} 词，节奏合适`):e.avgSentenceLen<12&&e.sentences>=5?(t-=.5,r.push(`平均句长只有 ${e.avgSentenceLen} 词，句子偏短碎，尝试合并扩展`)):e.avgSentenceLen>28&&(t-=.25,r.push(`平均句长 ${e.avgSentenceLen} 词偏长，注意断句和标点，避免一逗到底`)),e.sentences<6&&e.words>=120&&(t-=.5,r.push(`句子数量太少，检查是否漏了句号或把多句写成了一句`)),{key:`gra`,...y.gra,score:W(G(t,4,8)),strengths:n,improvements:r}}function q(e){let t=e.trim(),n=K(t),r=b(t),i=[ae(n),oe(n),se(n,r),ce(n)];return{overall:W(i.reduce((e,t)=>e+t.score,0)/i.length),criteria:i,stats:n}}var J=[{key:`ta`,title:`任务完成度 Task Achievement`,points:[`不少于 150 词（20 分钟）`,`必须有独立的 overview 段：总结主要趋势/差异/阶段，不放具体数据`,`筛选关键特征，用数据支撑，不要机械罗列所有数字`,`开头改写题目，不要照抄`]},{key:`cc`,title:`连贯与衔接 Coherence & Cohesion`,points:[`经典 4 段：改写引言 → overview → 细节段1 → 细节段2`,`衔接词灵活多样：however / in contrast / while / whereas / furthermore`,`逻辑递进清晰，代词指代明确`]},{key:`lr`,title:`词汇资源 Lexical Resource`,points:[`趋势词汇：rise / fall / fluctuate / remain stable / peak`,`程度副词：dramatically / slightly / marginally / considerably`,`多用同义替换，避免重复；注意拼写`]},{key:`gra`,title:`语法多样性与准确性 Grammatical Range & Accuracy`,points:[`长短句结合，多用复合句：定语从句、状语从句、宾语从句、被动语态`,`时态准确（多用过去时描述过去数据）`,`标点规范，避免中式逗号一逗到底`]}];export{g as a,v as i,K as n,_ as o,q as r,h as s,J as t};