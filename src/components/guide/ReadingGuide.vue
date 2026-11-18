<script setup lang="ts">
// 雅思阅读（学术类）的考试结构、常见题型和做题方法
const TYPES = [
  ['判断题 T / F / NG、Y / N / NG', '先找到原文对应句再判断：和原文一致选 True / Yes，和原文矛盾选 False / No，原文没提到选 Not Given。不要用自己的常识补充。答案按原文顺序出现。'],
  ['段落标题配对 Matching Headings', '先做这一题，读每段的首句和尾句抓主旨；不要被段落里出现的同一个词带偏，标题往往是同义改写。'],
  ['信息配对 Matching Information', '题目里的信息是某段的细节，顺序是乱的，最好放在最后做；一段可能对应多题。'],
  ['填空 Sentence / Summary / Note Completion', '先看字数要求（如 NO MORE THAN TWO WORDS），预判要填的词性；答案一般照抄原文，拼写错误不给分。'],
  ['选择题 Multiple Choice', '先定位题干关键词，再逐个排除选项；和原文字面最像的选项常是干扰项，正确选项多是同义替换。'],
  ['人名 / 观点配对 Matching Features', '先在原文里把所有人名圈出来，再看每个人的观点；同一个人可能出现多次。'],
]
</script>

<template>
  <div class="text-gray-600 dark:text-gray-300" data-guide="reading">
    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      阅读概述
    </h3>
    <ul class="mb-6 ml-6 list-disc space-y-1">
      <li>时限 60 分钟，3 篇文章，共 40 题；没有额外誊写时间（纸笔考试也要在 60 分钟内写完答题卡）</li>
      <li>难度大致逐篇递增，第 3 篇最难，建议按 17 / 20 / 23 分钟分配</li>
      <li>大部分题型答案按原文顺序出现，配对类题目例外</li>
      <li>拼写错误、超过字数要求都不给分</li>
    </ul>

    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      常见题型怎么做
    </h3>
    <dl class="mb-6 space-y-3">
      <div v-for="t in TYPES" :key="t[0]">
        <dt class="text-gray-900 font-bold dark:text-white">
          {{ t[0] }}
        </dt>
        <dd class="ml-4">
          {{ t[1] }}
        </dd>
      </div>
    </dl>

    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      总结
    </h3>
    <ol class="ml-6 list-decimal space-y-1">
      <li>先读题、划关键词，再回原文定位，不要从头精读全文</li>
      <li>略读（skimming）抓段落大意，扫读（scanning）找数字、人名、专有名词</li>
      <li>
        重点认同义替换：题目和原文很少用同一个词。阅读考点词在
        <RouterLink to="/reading" class="text-blue-700 underline dark:text-blue-300">
          背单词 → 查单词表
        </RouterLink>，背和练在背单词的学新词、复习里
      </li>
      <li>一题卡住先跳过，最后回来猜，不要空着</li>
    </ol>
  </div>
</template>
