import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 20 Test 2 听力（40 题）
 * 转录自 Cambridge IELTS 20 PDF (Test 2, pp.39-45)，答案来自书后 answer key (p.46)
 */
export const cam20Test2Listening: ListeningMockTest = {
  id: 'cam20-test2-listening',
  title: '剑20 Test 2 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：照顾老人的社区支持',
      audio: 'mock/cam20-test2-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'This can give the carer: time for other responsibilities; a ____', answer: 'break' },
        { id: 'Q2', type: 'fill-blank', question: 'how much ____ the caring involves', answer: 'time' },
        { id: 'Q3', type: 'fill-blank', question: 'helping her have a ____', answer: 'shower' },
        { id: 'Q4', type: 'fill-blank', question: 'dealing with ____', answer: 'money' },
        { id: 'Q5', type: 'fill-blank', question: 'loss of ____', answer: 'memory' },
        { id: 'Q6', type: 'fill-blank', question: '____ her', answer: 'lifting' },
        { id: 'Q7', type: 'fill-blank', question: 'preventing a ____', answer: 'fall' },
        { id: 'Q8', type: 'fill-blank', question: 'transport costs, e.g. cost of a ____', answer: 'taxi' },
        { id: 'Q9', type: 'fill-blank', question: 'car-related costs, e.g. fuel and ____', answer: 'insurance' },
        { id: 'Q10', type: 'fill-blank', question: 'help to reduce ____', answer: 'stress' },
      ],
    },
    {
      title: 'Part 2：志愿者活动',
      audio: 'mock/cam20-test2-listening-part2.mp3',
      questions: [
        { id: 'Q11', type: 'map-label', question: 'walking around the town centre', answer: 'D' },
        { id: 'Q12', type: 'map-label', question: 'helping at concerts', answer: 'I' },
        { id: 'Q13', type: 'map-label', question: 'getting involved with community groups', answer: 'H' },
        { id: 'Q14', type: 'map-label', question: 'helping with a magazine', answer: 'E' },
        { id: 'Q15', type: 'map-label', question: 'participating at lunches for retired people', answer: 'A' },
        { id: 'Q16', type: 'map-label', question: 'helping with the website', answer: 'B' },
        { id: 'Q17', type: 'multiple-choice', question: 'Which event requires the largest number of volunteers?', options: ['A the music festival', 'B the science festival', 'C the book festival'], answer: 1 },
        { id: 'Q18', type: 'multiple-choice', question: 'What is the most important requirement for volunteers at the festivals?', options: ['A interpersonal skills', 'B personal interest in the event', 'C flexibility'], answer: 0 },
        { id: 'Q19', type: 'multiple-choice', question: 'New volunteers will start working in the week beginning', options: ['A 2 September.', 'B 9 September.', 'C 23 September.'], answer: 1 },
        { id: 'Q20', type: 'multiple-choice', question: 'What is the next annual event for volunteers?', options: ['A a boat trip', 'B a barbecue', 'C a party'], answer: 0 },
      ],
    },
    {
      title: 'Part 3：人文地理讨论',
      audio: 'mock/cam20-test2-listening-part3.mp3',
      questions: [
        { id: 'Q21', type: 'map-label', question: 'Population', answer: 'D' },
        { id: 'Q22', type: 'map-label', question: 'Health', answer: 'G' },
        { id: 'Q23', type: 'map-label', question: 'Economies', answer: 'B' },
        { id: 'Q24', type: 'map-label', question: 'Culture', answer: 'A' },
        { id: 'Q25', type: 'map-label', question: 'Poverty', answer: 'E' },
        { id: 'Q26', type: 'multiple-choice', question: 'Rosie says that in her own city the main problem is', options: ['A crime.', 'B housing.', 'C unemployment.'], answer: 2 },
        { id: 'Q27', type: 'multiple-choice', question: 'What recent additions to the outskirts of their cities are both students happy about?', options: ['A conference centres', 'B sports centres', 'C retail centres'], answer: 0 },
        { id: 'Q28', type: 'multiple-choice', question: 'The students agree that developing disused industrial sites may', options: ['A have unexpected costs.', 'B damage the urban environment.', 'C destroy valuable historical buildings.'], answer: 0 },
        { id: 'Q29', type: 'multiple-choice', question: 'The students will mention Masdar City as an example of an attempt to achieve', options: ['A daily collections for waste recycling.', 'B sustainable energy use.', 'C free transport for everyone.'], answer: 1 },
        { id: 'Q30', type: 'multiple-choice', question: 'When discussing the Eco town of Greenhill Abbots, Colin is uncertain about', options: ['A what its objectives were.', 'B why there was opposition to it.', 'C how much of it has actually been built.'], answer: 2 },
      ],
    },
    {
      title: 'Part 4：食品趋势',
      audio: 'mock/cam20-test2-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'The growth in interest in food fashions started with ____ of food being shared on social media.', answer: 'photos' },
        { id: 'Q32', type: 'fill-blank', question: 'Sales of ____ food brands have grown this way.', answer: 'vegan' },
        { id: 'Q33', type: 'fill-blank', question: 'Famous ____ are influential.', answer: 'chefs' },
        { id: 'Q34', type: 'fill-blank', question: '____ were invited to visit growers in South Africa.', answer: 'journalists' },
        { id: 'Q35', type: 'fill-blank', question: 'Advertising focused on its ____ benefits.', answer: 'health' },
        { id: 'Q36', type: 'fill-blank', question: 'Promotion in the USA through ____ shops reduced the need for advertising.', answer: 'coffee' },
        { id: 'Q37', type: 'fill-blank', question: 'It appealed to consumers who are concerned about the ____.', answer: 'environment' },
        { id: 'Q38', type: 'fill-blank', question: 'has helped strengthen the ____ of Norwegian seafood.', answer: 'reputation' },
        { id: 'Q39', type: 'fill-blank', question: 'Its success led to an increase in its ____.', answer: 'price' },
        { id: 'Q40', type: 'fill-blank', question: 'Overuse of resources resulted in poor quality ____.', answer: 'soil' },
      ],
    },
  ],
}
