// 剑桥雅思 19 写作真题：Test 1–4 的 Task 1 + Task 2，共 8 题
// 题干英文照搬书中原文；Task 1 图表从 PDF 裁出（public/writing/c19-t{N}-task1.png）
import type { CambridgeWritingTask } from './cambridge'

export const cam19Writing: CambridgeWritingTask[] = [
  {
    id: 'c19-t1-task1',
    book: '剑19',
    testLabel: 'Test 1',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The graph below gives information on the numbers of participants for different activities at one social centre in Melbourne, Australia for the period 2000 to 2020.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '折线图：墨尔本某社交中心2000–2020年各项活动参与人数',
    image: '/writing/c19-t1-task1.png',
  },
  {
    id: 'c19-t1-task2',
    book: '剑19',
    testLabel: 'Test 1',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'Some people think that competition at work, at school and in daily life is a good thing. Others believe that we should try to cooperate more, rather than competing against each other.\n\n'
      + 'Discuss both these views and give your own opinion.\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '竞争与合作：讨论双方观点并给出自己的看法',
  },
  {
    id: 'c19-t2-task1',
    book: '剑19',
    testLabel: 'Test 2',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The plans below show a harbour in 2000 and how it looks today.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '地图对比：Porth Harbour 2000年与现在的变化',
    image: '/writing/c19-t2-task1.png',
  },
  {
    id: 'c19-t2-task2',
    book: '剑19',
    testLabel: 'Test 2',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'The working week should be shorter and workers should have a longer weekend.\n\n'
      + 'Do you agree or disagree?\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '是否赞成缩短工作周、延长周末',
  },
  {
    id: 'c19-t3-task1',
    book: '剑19',
    testLabel: 'Test 3',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The diagram below shows how a biofuel called ethanol is produced.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '流程图：生物燃料乙醇的生产过程',
    image: '/writing/c19-t3-task1.png',
  },
  {
    id: 'c19-t3-task2',
    book: '剑19',
    testLabel: 'Test 3',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'It is important for everyone, including young people, to save money for their future.\n\n'
      + 'To what extent do you agree or disagree with this statement?\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '存钱的重要性：你在多大程度上同意',
  },
  {
    id: 'c19-t4-task1',
    book: '剑19',
    testLabel: 'Test 4',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n\n'
      + 'The charts below give information on the location and types of dance classes young people in a town in Australia are currently attending.\n\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n'
      + 'Write at least 150 words.',
    promptCn: '饼图+条形图：澳洲某镇年轻人舞蹈课的地点与类型',
    image: '/writing/c19-t4-task1.png',
  },
  {
    id: 'c19-t4-task2',
    book: '剑19',
    testLabel: 'Test 4',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n\n'
      + 'Write about the following topic:\n\n'
      + 'In many countries nowadays, consumers can go to a supermarket and buy food produced all over the world.\n\n'
      + 'Do you think this is a positive or negative development?\n\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n'
      + 'Write at least 250 words.',
    promptCn: '全球食品贸易：是积极还是消极的发展',
  },
]
