// 剑18 写作真题（Test 1–4，每套 Task 1 + Task 2，共 8 题）
// 题干照搬书中原文；Task 1 图表从 PDF 裁出存 public/writing/
import type { CambridgeWritingTask } from './cambridge'

export const cam18Writing: CambridgeWritingTask[] = [
  {
    id: 'c18-t1-task1',
    book: '剑18',
    testLabel: 'Test 1',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\nThe graph below gives information about the percentage of the population in four Asian countries living in cities from 1970 to 2020, with predictions for 2030 and 2040.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.',
    promptCn: '折线图：四个亚洲国家城市人口占比（1970–2040，含预测）',
    image: 'writing/c18-t1-task1.png',
  },
  {
    id: 'c18-t1-task2',
    book: '剑18',
    testLabel: 'Test 1',
    task: 2,
    promptEn: "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nThe most important aim of science should be to improve people's lives.\n\nTo what extent do you agree or disagree with this statement?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.",
    promptCn: '大作文：科学最重要的目标是否应是改善人们的生活',
  },
  {
    id: 'c18-t2-task1',
    book: '剑18',
    testLabel: 'Test 2',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\nThe chart below shows the number of households in the US by their annual income in 2007, 2011 and 2015.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.',
    promptCn: '柱状图：美国家庭按年收入的户数分布（2007/2011/2015）',
    image: 'writing/c18-t2-task1.png',
  },
  {
    id: 'c18-t2-task2',
    book: '剑18',
    testLabel: 'Test 2',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nSome university students want to learn about other subjects in addition to their main subjects. Others believe it is more important to give all their time and attention to studying for a qualification.\n\nDiscuss both these views and give your own opinion.\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.',
    promptCn: '大作文：大学生是否该学习主修专业之外的科目',
  },
  {
    id: 'c18-t3-task1',
    book: '剑18',
    testLabel: 'Test 3',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\nThe diagram below shows the floor plan of a public library 20 years ago and how it looks now.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.',
    promptCn: '平面图：公共图书馆20年前与现在的布局对比',
    image: 'writing/c18-t3-task1.png',
  },
  {
    id: 'c18-t3-task2',
    book: '剑18',
    testLabel: 'Test 3',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nIn many countries around the world, rural people are moving to cities, so the population in the countryside is decreasing.\n\nDo you think this is a positive or a negative development?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.',
    promptCn: '大作文：农村人口流入城市是积极还是消极的发展',
  },
  {
    id: 'c18-t4-task1',
    book: '剑18',
    testLabel: 'Test 4',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\nThe graph below shows the average monthly change in the prices of three metals during 2014.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.',
    promptCn: '折线图：铜镍锌三种金属2014年月均价格变化',
    image: 'writing/c18-t4-task1.png',
  },
  {
    id: 'c18-t4-task2',
    book: '剑18',
    testLabel: 'Test 4',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nIn many countries, people are now living longer than ever before. Some people say an ageing population creates problems for governments. Other people think there are benefits if society has more elderly people.\n\nTo what extent do the advantages of having an ageing population outweigh the disadvantages?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.',
    promptCn: '大作文：人口老龄化的利是否大于弊',
  },
]
