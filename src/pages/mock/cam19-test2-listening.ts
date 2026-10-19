import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 19 Test 2 听力（40 题）
 * 转录自 Cambridge IELTS 19 PDF，答案来自书后 answer key (p.122)
 *
 * 注意：Q17&18、Q19&20 为 "Choose TWO letters" 题（IN EITHER ORDER），
 * answer 存为下标数组；Q25-28 为配对题（写字母 A-F），用 map-label。
 */
export const cam19Test2Listening: ListeningMockTest = {
  id: 'cam19-test2-listening',
  title: '剑19 Test 2 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Guitar Group',
      audio: 'mock/cam19-test2-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Coordinator: Gary ____', answer: 'mathieson' },
        { id: 'Q2', type: 'fill-blank', question: 'Level: ____', answer: 'beginners' },
        { id: 'Q3', type: 'fill-blank', question: 'Place: the ____', answer: 'college' },
        { id: 'Q4', type: 'fill-blank', question: '____ Street, First floor, Room T347', answer: 'new' },
        { id: 'Q5', type: 'fill-blank', question: 'Time: Thursday morning at ____', answer: '11' },
        { id: 'Q6', type: 'fill-blank', question: 'Recommended website: ‘The perfect ____’', answer: 'instrument' },
        { id: 'Q7', type: 'fill-blank', question: 'tuning guitars: using an app or by ____', answer: 'ear' },
        { id: 'Q8', type: 'fill-blank', question: 'strumming chords: keeping time while the teacher is ____', answer: 'clapping' },
        { id: 'Q9', type: 'fill-blank', question: 'playing songs: often listening to a ____ of a song', answer: 'recording' },
        { id: 'Q10', type: 'fill-blank', question: 'playing single notes and simple tunes: playing together, then ____', answer: 'alone' },
      ],
    },
    {
      title: 'Part 2：Working as a lifeboat volunteer',
      audio: 'mock/cam19-test2-listening-part2.mp3',
      questions: [
        { id: 'Q11', type: 'multiple-choice', question: 'What made David leave London and move to Northsea?', options: ['A He was eager to develop a hobby.', 'B He wanted to work shorter hours.', 'C He found his job in website design unsatisfying.'], answer: 0 },
        { id: 'Q12', type: 'multiple-choice', question: 'The Lifeboat Institution in Northsea was built with money provided by', options: ['A a local organisation.', 'B a local resident.', 'C the local council.'], answer: 1 },
        { id: 'Q13', type: 'multiple-choice', question: 'In his health assessment, the doctor was concerned about the fact that David', options: ['A might be colour blind.', 'B was rather short-sighted.', 'C had undergone eye surgery.'], answer: 0 },
        { id: 'Q14', type: 'multiple-choice', question: 'After arriving at the lifeboat station, they aim to launch the boat within', options: ['A five minutes.', 'B six to eight minutes.', 'C eight and a half minutes.'], answer: 1 },
        { id: 'Q15', type: 'multiple-choice', question: 'As a ‘helmsman’, David has the responsibility of deciding', options: ['A who will be the members of his crew.', 'B what equipment it will be necessary to take.', 'C if the lifeboat should be launched.'], answer: 2 },
        { id: 'Q16', type: 'multiple-choice', question: 'As well as going out on the lifeboat, David', options: ['A gives talks on safety at sea.', 'B helps with fundraising.', 'C recruits new volunteers.'], answer: 0 },
        { id: 'Q17-18', type: 'multi-select', question: 'Which TWO things does David say about the lifeboat volunteer training? (Choose TWO letters, A–E)', options: ['A The residential course developed his leadership skills.', 'B The training in use of ropes and knots was quite brief.', 'C The training exercises have built up his mental strength.', 'D The casualty care activities were particularly challenging for him.', 'E The wave tank activities provided practice in survival techniques.'], answer: [2, 4] },
        { id: 'Q19-20', type: 'multi-select', question: 'Which TWO things does David find most motivating about the work he does? (Choose TWO letters, A–E)', options: ['A working as part of a team', 'B experiences when working in winter', 'C being thanked by those he has helped', 'D the fact that it keeps him fit', 'E the chance to develop new equipment'], answer: [0, 1] },
      ],
    },
    {
      title: 'Part 3：Recycling footwear',
      audio: 'mock/cam19-test2-listening-part3.mp3',
      questions: [
        { id: 'Q21', type: 'multiple-choice', question: 'At first, Don thought the topic of recycling footwear might be too', options: ['A limited in scope.', 'B hard to research.', 'C boring for listeners.'], answer: 0 },
        { id: 'Q22', type: 'multiple-choice', question: 'When discussing trainers, Bella and Don disagree about', options: ['A how popular they are among young people.', 'B how suitable they are for school.', 'C how quickly they wear out.'], answer: 1 },
        { id: 'Q23', type: 'multiple-choice', question: 'Bella says that she sometimes recycles shoes because', options: ['A they no longer fit.', 'B she no longer likes them.', 'C they are no longer in fashion.'], answer: 1 },
        { id: 'Q24', type: 'multiple-choice', question: 'What did the article say that confused Don?', options: ['A Public consumption of footwear has risen.', 'B Less footwear is recycled now than in the past.', 'C People dispose of more footwear than they used to.'], answer: 1 },
        { id: 'Q25', type: 'map-label', question: 'the high-heeled shoes — Reasons: A one shoe was missing; B the colour of one shoe had faded; C one shoe had a hole in it; D the shoes were brand new; E the shoes were too dirty; F the stitching on the shoes was broken', answer: 'E' },
        { id: 'Q26', type: 'map-label', question: 'the ankle boots', answer: 'B' },
        { id: 'Q27', type: 'map-label', question: 'the baby shoes', answer: 'A' },
        { id: 'Q28', type: 'map-label', question: 'the trainers', answer: 'C' },
        { id: 'Q29', type: 'multiple-choice', question: 'Why did the project to make ‘new’ shoes out of old shoes fail?', options: ['A People believed the ‘new’ pairs of shoes were unhygienic.', 'B There were not enough good parts to use in the old shoes.', 'C The shoes in the ‘new’ pairs were not completely alike.'], answer: 2 },
        { id: 'Q30', type: 'multiple-choice', question: 'Bella and Don agree that they can present their topic', options: ['A from a new angle.', 'B with relevant images.', 'C in a straightforward way.'], answer: 0 },
      ],
    },
    {
      title: 'Part 4：Tardigrades',
      audio: 'mock/cam19-test2-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'also known as water ‘bears’ (due to how they ____) and ‘moss piglets’', answer: 'move' },
        { id: 'Q32', type: 'fill-blank', question: 'a ____ round body and four pairs of legs', answer: 'short' },
        { id: 'Q33', type: 'fill-blank', question: 'claws or ____ for gripping', answer: 'discs' },
        { id: 'Q34', type: 'fill-blank', question: 'body filled with a liquid that carries both ____ and blood', answer: 'oxygen' },
        { id: 'Q35', type: 'fill-blank', question: 'mouth shaped like a ____ with teeth called stylets', answer: 'tube' },
        { id: 'Q36', type: 'fill-blank', question: 'very resilient and can exist in very low or high ____', answer: 'temperatures' },
        { id: 'Q37', type: 'fill-blank', question: 'A type of ____ ensures their DNA is not damaged.', answer: 'protein' },
        { id: 'Q38', type: 'fill-blank', question: 'Research is underway to find out how many days they can stay alive in ____.', answer: 'space' },
        { id: 'Q39', type: 'fill-blank', question: 'consume liquids, e.g., those found in moss or ____', answer: 'seaweed' },
        { id: 'Q40', type: 'fill-blank', question: 'They are not considered to be ____.', answer: 'endangered' },
      ],
    },
  ],
}
