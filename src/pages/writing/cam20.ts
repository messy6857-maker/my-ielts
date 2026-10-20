// 剑桥雅思 20 真题作文题（Test 1–4，每套 Task 1 + Task 2，共 8 题）
// 题干照搬书中原文；Task 1 图表从 PDF 裁出存 public/writing/
import type { CambridgeWritingTask } from './cambridge'

export const cam20Writing: CambridgeWritingTask[] = [
  {
    id: 'c20-t1-task1',
    book: '剑20',
    testLabel: 'Test 1',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n'
      + 'The first table below shows changes in the total population of New York City from 1800 to 2000. '
      + 'The second and third tables show changes in the population of the five districts of the city '
      + '(Manhattan, Brooklyn, Bronx, Queens, Staten Island) over the same period.\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n'
      + 'Write at least 150 words.',
    promptCn: '表格：1800–2000 年纽约市总人口及曼哈顿与其他四区人口变化',
    image: '/writing/c20-t1-task1.png',
  },
  {
    id: 'c20-t1-task2',
    book: '剑20',
    testLabel: 'Test 1',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task. Write at least 250 words.\n'
      + 'You should spend about 40 minutes on this task. Write about the following topic:\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n'
      + 'Access to clean water is a basic human right. Therefore, every home should have a water supply that is provided free of charge.\n'
      + 'Do you agree or disagree?\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n'
      + 'Write at least 250 words.',
    promptCn: '是否同意：清洁水是基本人权，每家应免费供水',
  },
  {
    id: 'c20-t2-task1',
    book: '剑20',
    testLabel: 'Test 2',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n'
      + 'The plans below show the site of a farm in 1950 and the same site today.\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n'
      + 'Write at least 150 words.',
    promptCn: '地图：1950 年与现在的 Beechwood 农场变迁对比',
    image: '/writing/c20-t2-task1.png',
  },
  {
    id: 'c20-t2-task2',
    book: '剑20',
    testLabel: 'Test 2',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n'
      + 'Write about the following topic:\n'
      + 'In many countries, primary and secondary schools close for two months or more in the summer holidays.\n'
      + 'What is the value of long school holidays?\n'
      + 'What are the arguments in favour of shorter school holidays?\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n'
      + 'Write at least 250 words.',
    promptCn: '暑假长短之争：长假期的价值 vs 支持缩短假期的论据',
  },
  {
    id: 'c20-t3-task1',
    book: '剑20',
    testLabel: 'Test 3',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n'
      + 'The charts below give information about a public library in a town called Little Chalfont.\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n'
      + 'Write at least 150 words',
    promptCn: '饼图+表格+柱状图：Little Chalfont 公共图书馆会员与借阅情况',
    image: '/writing/c20-t3-task1.png',
  },
  {
    id: 'c20-t3-task2',
    book: '剑20',
    testLabel: 'Test 3',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n'
      + 'Write about the following topic:\n'
      + 'Some people have decided to reduce the number of times they fly every year or to stop flying altogether.\n'
      + 'Do you think the environmental benefits of this development outweigh the disadvantages for individuals and businesses?\n'
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n'
      + 'Write at least 250 words.',
    promptCn: '减少乘机：环保收益是否超过对个人和企业的弊端',
  },
  {
    id: 'c20-t4-task1',
    book: '剑20',
    testLabel: 'Test 4',
    task: 1,
    promptEn: 'You should spend about 20 minutes on this task.\n'
      + 'The diagram below shows how fabric is manufactured from bamboo.\n'
      + 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n'
      + 'Write at least 150 words.',
    promptCn: '流程图：竹子制成布料的 9 个步骤',
    image: '/writing/c20-t4-task1.png',
  },
  {
    id: 'c20-t4-task2',
    book: '剑20',
    testLabel: 'Test 4',
    task: 2,
    promptEn: 'You should spend about 40 minutes on this task.\n'
      + 'Write about the following topic:\n'
      + 'Many aspects of the way people dress today are influenced by global fashion trends.\n'
      + "How has global fashion become such a strong influence on people's lives? Do you think this is a positive or negative development?\n"
      + 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n'
      + 'Write at least 250 words.',
    promptCn: '全球时尚潮流对穿着的影响：原因及利弊',
  },
]
