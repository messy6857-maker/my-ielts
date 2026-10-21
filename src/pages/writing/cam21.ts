// 剑桥雅思 21 写作真题：Test 1–4 的 Task 1 + Task 2，共 8 题
// 题干英文照搬书中原文；Task 1 图表从 PDF 裁出（public/writing/c21-t{N}-task1.png）
import type { CambridgeWritingTask } from './cambridge'

export const cam21Writing: CambridgeWritingTask[] = [
  {
    id: 'c21-t1-task1',
    book: '剑21',
    testLabel: 'Test 1',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The graph below gives information about the number of jobs in four sectors of the economy in the US between 1960 and 2020.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '折线图：1960–2020年美国四个经济部门的就业人数',
    image: 'writing/c21-t1-task1.png',
  },
  {
    id: 'c21-t1-task2',
    book: '剑21',
    testLabel: 'Test 1',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'The best way to provide enough homes in large cities is to build tall apartment blocks.\n\n'
      + 'To what extent do you agree or disagree with this statement?\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '大城市建高层公寓是否是解决住房问题的最佳方式',
  },
  {
    id: 'c21-t2-task1',
    book: '剑21',
    testLabel: 'Test 2',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The plans below show a college café before it was redesigned and how it looks now.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '平面图对比：大学咖啡馆重新设计前后的变化',
    image: 'writing/c21-t2-task1.png',
  },
  {
    id: 'c21-t2-task2',
    book: '剑21',
    testLabel: 'Test 2',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'Some people say that in the digital age, theatres and cinemas are no longer important as people can watch all the entertainment they want online. Others argue that theatres and cinemas are still important both economically and culturally.\n\n'
      + 'Discuss both these views and give your own opinion.\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '数字时代剧院和电影院是否仍重要：讨论双方观点',
  },
  {
    id: 'c21-t3-task1',
    book: '剑21',
    testLabel: 'Test 3',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The diagram below shows how one type of desert, known as a rain-shadow desert, is formed.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '流程图：雨影沙漠的形成过程',
    image: 'writing/c21-t3-task1.png',
  },
  {
    id: 'c21-t3-task2',
    book: '剑21',
    testLabel: 'Test 3',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'All university undergraduate courses should include a period of time spent studying abroad or doing a work placement.\n\n'
      + 'Do you think the advantages of this would outweigh the disadvantages?\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '大学本科课程是否应包含留学或实习：利弊权衡',
  },
  {
    id: 'c21-t4-task1',
    book: '剑21',
    testLabel: 'Test 4',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The chart and table below show the results of a survey of library users at a university.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '饼图+表格：大学图书馆用户构成与满意度调查',
    image: 'writing/c21-t4-task1.png',
  },
  {
    id: 'c21-t4-task2',
    book: '剑21',
    testLabel: 'Test 4',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'Some people argue that primary schools focus too much on formal learning.\n\n'
      + 'To what extent do you agree with this opinion?\n\n'
      + 'How important do you think it is for children to play as well as learn in the primary school classroom?\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '小学是否过于注重正式学习、玩耍与学习哪个更重要',
  },
]
