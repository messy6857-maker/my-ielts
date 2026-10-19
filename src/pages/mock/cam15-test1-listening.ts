import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 15 Test 1 听力（40 题）
 * 转录自 Cambridge IELTS 15 PDF，答案来自书后 answer key (p.119)
 *
 * 注意：Q29/Q30 为 "Choose TWO letters" 题，answer 存为下标数组。
 */
export const cam15Test1Listening: ListeningMockTest = {
  id: 'cam15-test1-listening',
  title: '剑15 Test 1 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Bankside Recruitment Agency',
      audio: 'mock/cam15-test1-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Name of agent: Becky ____', answer: 'jamieson' },
        { id: 'Q2', type: 'fill-blank', question: 'Best to call her in the ____', answer: 'afternoon' },
        { id: 'Q3', type: 'fill-blank', question: 'Must have good ____ skills', answer: 'communication' },
        { id: 'Q4', type: 'fill-blank', question: 'Jobs are usually for at least one ____', answer: 'week' },
        { id: 'Q5', type: 'fill-blank', question: 'Pay is usually £ ____ per hour', answer: '10' },
        { id: 'Q6', type: 'fill-blank', question: 'Wear a ____ to the interview', answer: 'suit' },
        { id: 'Q7', type: 'fill-blank', question: 'Must bring your ____ to the interview', answer: 'passport' },
        { id: 'Q8', type: 'fill-blank', question: 'They will ask questions about each applicant\'s ____', answer: 'personality' },
        { id: 'Q9', type: 'fill-blank', question: 'The ____ you receive at interview will benefit you', answer: 'feedback' },
        { id: 'Q10', type: 'fill-blank', question: 'Less ____ is involved in applying for jobs', answer: 'time' },
      ],
    },
    {
      title: 'Part 2：Matthews Island Holidays / Isle of Man',
      audio: 'mock/cam15-test1-listening-part2.mp3',
      questions: [
        { id: 'Q11', type: 'multiple-choice', question: 'According to the speaker, the company', options: ['A has been in business for longer than most of its competitors.', 'B arranges holidays to more destinations than its competitors.', 'C has more customers than its competitors.'], answer: 0 },
        { id: 'Q12', type: 'multiple-choice', question: 'Where can customers meet the tour manager before travelling to the Isle of Man?', options: ['A Liverpool', 'B Heysham', 'C Luton'], answer: 1 },
        { id: 'Q13', type: 'multiple-choice', question: 'How many lunches are included in the price of the holiday?', options: ['A three', 'B four', 'C five'], answer: 0 },
        { id: 'Q14', type: 'multiple-choice', question: 'Customers have to pay extra for', options: ['A guaranteeing themselves a larger room.', 'B booking at short notice.', 'C transferring to another date.'], answer: 2 },
        { id: 'Q15', type: 'fill-blank', question: 'Hotel dining room has view of the ____', answer: 'river' },
        { id: 'Q16', type: 'fill-blank', question: 'Tynwald may have been founded in ____ not 979.', answer: '1422' },
        { id: 'Q17', type: 'fill-blank', question: 'train to the ____ of Snaefell', answer: 'top' },
        { id: 'Q18', type: 'fill-blank', question: 'Company provides a ____ for local transport and heritage sites.', answer: 'pass' },
        { id: 'Q19', type: 'fill-blank', question: 'Take the ____ railway train from Douglas to Port Erin', answer: 'steam' },
        { id: 'Q20', type: 'fill-blank', question: 'former ____ has old castle.', answer: 'capital' },
      ],
    },
    {
      title: 'Part 3：Birth order and personality',
      audio: 'mock/cam15-test1-listening-part3.mp3',
      questions: [
        { id: 'Q21', type: 'multiple-choice', question: 'the eldest child', options: ['A outgoing', 'B selfish', 'C independent', 'D attention-seeking', 'E introverted', 'F co-operative', 'G caring', 'H competitive'], answer: 6 },
        { id: 'Q22', type: 'multiple-choice', question: 'a middle child', options: ['A outgoing', 'B selfish', 'C independent', 'D attention-seeking', 'E introverted', 'F co-operative', 'G caring', 'H competitive'], answer: 5 },
        { id: 'Q23', type: 'multiple-choice', question: 'the youngest child', options: ['A outgoing', 'B selfish', 'C independent', 'D attention-seeking', 'E introverted', 'F co-operative', 'G caring', 'H competitive'], answer: 0 },
        { id: 'Q24', type: 'multiple-choice', question: 'a twin', options: ['A outgoing', 'B selfish', 'C independent', 'D attention-seeking', 'E introverted', 'F co-operative', 'G caring', 'H competitive'], answer: 4 },
        { id: 'Q25', type: 'multiple-choice', question: 'an only child', options: ['A outgoing', 'B selfish', 'C independent', 'D attention-seeking', 'E introverted', 'F co-operative', 'G caring', 'H competitive'], answer: 1 },
        { id: 'Q26', type: 'multiple-choice', question: 'a child with much older siblings', options: ['A outgoing', 'B selfish', 'C independent', 'D attention-seeking', 'E introverted', 'F co-operative', 'G caring', 'H competitive'], answer: 2 },
        { id: 'Q27', type: 'multiple-choice', question: 'What do the speakers say about the evidence relating to birth order and academic success?', options: ['A There is conflicting evidence about whether oldest children perform best in intelligence tests.', 'B There is little doubt that birth order has less influence on academic achievement than socio-economic status.', 'C Some studies have neglected to include important factors such as family size.'], answer: 2 },
        { id: 'Q28', type: 'multiple-choice', question: 'What does Ruth think is surprising about the difference in oldest children\'s academic performance?', options: ['A It is mainly thanks to their roles as teachers for their younger siblings.', 'B The advantages they have only lead to a slightly higher level of achievement.', 'C The extra parental attention they receive at a young age makes little difference.'], answer: 0 },
        { id: 'Q29-30', type: 'multi-select', question: 'Which TWO experiences of sibling rivalry do the speakers agree has been valuable for them?', options: ['A learning to share', 'B learning to stand up for oneself', 'C learning to be a good loser', 'D learning to be tolerant', 'E learning to say sorry'], answer: [1, 3] },
      ],
    },
    {
      title: 'Part 4：The Eucalyptus Tree in Australia',
      audio: 'mock/cam15-test1-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'it provides ____ and food for a wide range of species', answer: 'shelter' },
        { id: 'Q32', type: 'fill-blank', question: 'its leaves provide ____ which is used to make a disinfectant', answer: 'oil' },
        { id: 'Q33', type: 'fill-blank', question: 'lime used for making ____ was absorbed', answer: 'roads' },
        { id: 'Q34', type: 'fill-blank', question: '____ feed on eucalyptus leaves', answer: 'insects' },
        { id: 'Q35', type: 'fill-blank', question: 'resulting in the growth of ____', answer: 'grass' },
        { id: 'Q36', type: 'fill-blank', question: 'make more ____ available to the trees', answer: 'water' },
        { id: 'Q37', type: 'fill-blank', question: 'maintain the quality of the ____', answer: 'soil' },
        { id: 'Q38', type: 'fill-blank', question: 'result in the growth of ____ \'rainforest\'', answer: 'dry' },
        { id: 'Q39', type: 'fill-blank', question: 'a ____ ecosystem', answer: 'simple' },
        { id: 'Q40', type: 'fill-blank', question: 'an ideal environment for the ____ of the bell-miner', answer: 'nest' },
      ],
    },
  ],
}
