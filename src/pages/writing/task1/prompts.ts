// 雅思学术类小作文练习题（自编模拟题）
// 图表题用 chart 数据渲染 SVG；流程/地图题用 steps/description 文本呈现

export type ChartType = 'bar' | 'line' | 'pie' | 'table' | 'process' | 'map'

export interface BarDatum { label: string, value: number }
export interface LineDatum { label: string, values: number[] }
export interface PieDatum { label: string, value: number }

export interface Task1Prompt {
  id: string
  type: ChartType
  typeCn: string
  title: string      // 英文题干
  titleCn: string    // 中文说明
  unit?: string      // 数值单位
  series?: string[]  // line 图的系列名
  barData?: BarDatum[]
  lineData?: LineDatum[]
  pies?: { title: string, data: PieDatum[] }[]
  tableHead?: string[]
  tableRows?: (string | number)[][]
  steps?: string[]
  description?: string
  tips: string[]
}

export const TASK1_PROMPTS: Task1Prompt[] = [
  {
    id: 'bar-internet',
    type: 'bar',
    typeCn: '柱状图',
    title: 'The bar chart shows the percentage of households with internet access in six countries in 2020.',
    titleCn: '柱状图：2020 年六个国家家庭互联网普及率',
    unit: '%',
    barData: [
      { label: 'Country A', value: 95 },
      { label: 'Country B', value: 88 },
      { label: 'Country C', value: 76 },
      { label: 'Country D', value: 64 },
      { label: 'Country E', value: 52 },
      { label: 'Country F', value: 41 },
    ],
    tips: ['先找最高/最低', '分组描述（高普及组 vs 低普及组）', '注意 data 的选择，不要每个柱子平均用力'],
  },
  {
    id: 'line-phones',
    type: 'line',
    typeCn: '折线图',
    title: 'The line graph shows the number of smartphone users (in millions) in three regions from 2015 to 2023.',
    titleCn: '折线图：2015–2023 三个地区智能手机用户数（百万）',
    unit: 'million',
    series: ['Asia', 'Europe', 'Africa'],
    lineData: [
      { label: '2015', values: [420, 310, 90] },
      { label: '2017', values: [680, 350, 150] },
      { label: '2019', values: [950, 380, 240] },
      { label: '2021', values: [1200, 400, 360] },
      { label: '2023', values: [1450, 410, 520] },
    ],
    tips: ['描述趋势动词要多样：rise / surge / remain stable', '关注交叉点和差距变化', 'overview 里点出 Asia 增长最快'],
  },
  {
    id: 'pie-expense',
    type: 'pie',
    typeCn: '饼图',
    title: 'The pie charts compare the average household expenditure in a country in 2000 and 2020.',
    titleCn: '饼图：某国家庭平均支出构成（2000 vs 2020）',
    unit: '%',
    pies: [
      {
        title: '2000',
        data: [
          { label: 'Housing', value: 28 },
          { label: 'Food', value: 24 },
          { label: 'Transport', value: 16 },
          { label: 'Education', value: 12 },
          { label: 'Others', value: 20 },
        ],
      },
      {
        title: '2020',
        data: [
          { label: 'Housing', value: 35 },
          { label: 'Food', value: 18 },
          { label: 'Transport', value: 19 },
          { label: 'Education', value: 14 },
          { label: 'Others', value: 14 },
        ],
      },
    ],
    tips: ['对比两年同一类别的变化', '找出变化最大/最小的项', '用 while / whereas 做对比句'],
  },
  {
    id: 'table-employment',
    type: 'table',
    typeCn: '表格',
    title: 'The table shows the employment rates of university graduates in four countries in 2010 and 2020.',
    titleCn: '表格：四国大学毕业生就业率（2010 vs 2020）',
    tableHead: ['Country', '2010', '2020', 'Change'],
    tableRows: [
      ['UK', '78%', '85%', '+7%'],
      ['USA', '82%', '84%', '+2%'],
      ['Japan', '88%', '91%', '+3%'],
      ['Brazil', '65%', '58%', '-7%'],
    ],
    tips: ['表格题也要写 overview：总体上升、Brazil 例外下降', '挑选关键数据，不要逐格复述', '注意单位一致'],
  },
  {
    id: 'process-coffee',
    type: 'process',
    typeCn: '流程图',
    title: 'The diagram illustrates the process of producing instant coffee.',
    titleCn: '流程图：速溶咖啡生产过程',
    steps: [
      'Harvest ripe coffee cherries by hand',
      'Dry the cherries in the sun for 3 weeks',
      'Remove the outer skin and pulp to get green beans',
      'Roast the beans at 200°C for 15 minutes',
      'Grind the roasted beans into fine powder',
      'Brew with hot water and then freeze-dry the liquid',
      'Pack the instant coffee granules into jars',
    ],
    tips: ['全程被动语态 + 顺序词：firstly / next / after that / finally', 'overview 总结：共 7 步，从采摘到包装', '时态用一般现在时'],
  },
  {
    id: 'map-town',
    type: 'map',
    typeCn: '地图',
    title: 'The maps show the changes in the town of Briston between 1990 and 2020.',
    titleCn: '地图：Briston 小镇 1990 vs 2020 的变化',
    description: '1990: farmland in the north, a small village with 20 houses in the centre, a river running east–west in the south, no railway. 2020: farmland replaced by a housing estate (200 houses), a railway line built along the river with a new station, a supermarket and a school added near the station, the village expanded.',
    tips: ['按方位组织：north / centre / south', '对比句式：while / whereas / in contrast', '时态：1990 用过去时，2020 可用现在完成时'],
  },
]

export const TASK1_INSTRUCTION = 'You should spend about 20 minutes on this task. Write at least 150 words.'
