import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 18 Test 3 听力（40 题）
 * 转录自 Cambridge IELTS 18 PDF，答案来自书后 answer key (p.123)
 *
 * 注意：Q11&12、Q13&14、Q21&22、Q23&24 为 "Choose TWO letters" 题（IN EITHER ORDER），
 * 用 type: 'multi-select'，answer 存为下标数组。
 * Q25-30 为配对题（write the correct letter, A-G），用 type: 'map-label' 原生格式，
 * 选项框已裁为图片 mock/cam18-test3-part3-box.png。
 */
export const cam18Test3Listening: ListeningMockTest = {
  id: 'cam18-test3-listening',
  title: '剑18 Test 3 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Wayside Camera Club',
      audio: 'mock/cam18-test3-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Home address: 52 1 ____ Street, Peacetown', answer: 'Marrowfield' },
        { id: 'Q2', type: 'fill-blank', question: 'Heard about us: from a 2 ____', answer: 'relative' },
        { id: 'Q3', type: 'fill-blank', question: 'Reasons for joining: to 3 ____', answer: ['socialise', 'socialize'] },
        { id: 'Q4', type: 'fill-blank', question: 'Type of membership: 4 ____ membership (£30)', answer: 'full' },
        { id: 'Q5', type: 'fill-blank', question: 'Title of competition: \'5 ____\' (A scene in the home)', answer: 'Domestic Life' },
        { id: 'Q6', type: 'fill-blank', question: 'Scene must show some 6 ____', answer: 'clouds' },
        { id: 'Q7', type: 'fill-blank', question: 'The 7 ____ was wrong', answer: 'timing' },
        { id: 'Q8', type: 'fill-blank', question: 'Title of competition: \'8 ____\'', answer: 'Animal Magic' },
        { id: 'Q9', type: 'fill-blank', question: 'Scene must show 9 ____', answer: ['movement', 'animal movement'] },
        { id: 'Q10', type: 'fill-blank', question: 'The photograph was too 10 ____', answer: 'dark' },
      ],
    },
    {
      title: 'Part 2：Picking mushrooms',
      audio: 'mock/cam18-test3-listening-part2.mp3',
      questions: [
        { id: 'Q11-12', type: 'multi-select', question: 'Which TWO warnings does Dan give about picking mushrooms? (Choose TWO letters, A–E)', options: ['A Don\'t pick more than one variety of mushroom at a time.', 'B Don\'t pick mushrooms near busy roads.', 'C Don\'t eat mushrooms given to you.', 'D Don\'t eat mushrooms while picking them.', 'E Don\'t pick old mushrooms.'], answer: [1, 2] },
        { id: 'Q13-14', type: 'multi-select', question: 'Which TWO ideas about wild mushrooms does Dan say are correct? (Choose TWO letters, A–E)', options: ['A Mushrooms should always be peeled before eating.', 'B Mushrooms eaten by animals may be unsafe.', 'C Cooking destroys toxins in mushrooms.', 'D Brightly coloured mushrooms can be edible.', 'E All poisonous mushrooms have a bad smell.'], answer: [1, 3] },
        { id: 'Q15', type: 'multiple-choice', question: 'What advice does Dan give about picking mushrooms in parks?', options: ['A Choose wooded areas.', 'B Don\'t disturb wildlife.', 'C Get there early.'], answer: 2 },
        { id: 'Q16', type: 'multiple-choice', question: 'Dan says it is a good idea for beginners to', options: ['A use a mushroom app.', 'B join a group.', 'C take a reference book.'], answer: 1 },
        { id: 'Q17', type: 'multiple-choice', question: 'What does Dan say is important for conservation?', options: ['A selecting only fully grown mushrooms', 'B picking a limited amount of mushrooms', 'C avoiding areas where rare mushroom species grow'], answer: 1 },
        { id: 'Q18', type: 'multiple-choice', question: 'According to Dan, some varieties of wild mushrooms are in decline because there is', options: ['A a huge demand for them from restaurants.', 'B a lack of rain in this part of the country.', 'C a rise in building developments locally.'], answer: 2 },
        { id: 'Q19', type: 'multiple-choice', question: 'Dan says that when storing mushrooms, people should', options: ['A keep them in the fridge for no more than two days.', 'B keep them in a brown bag in a dark room.', 'C leave them for a period after washing them.'], answer: 0 },
        { id: 'Q20', type: 'multiple-choice', question: 'What does Dan say about trying new varieties of mushrooms?', options: ['A Experiment with different recipes.', 'B Expect some to have a strong taste.', 'C Cook them for a long time.'], answer: 0 },
      ],
    },
    {
      title: 'Part 3：The Luddites and the future of work',
      audio: 'mock/cam18-test3-listening-part3.mp3',
      image: 'mock/cam18-test3-part3-box.png',
      questions: [
        { id: 'Q21-22', type: 'multi-select', question: 'Which TWO opinions about the Luddites do the students express? (Choose TWO letters, A–E)', options: ['A Their actions were ineffective.', 'B They are still influential today.', 'C They have received unfair criticism.', 'D They were proved right.', 'E Their attitude is understandable.'], answer: [0, 4] },
        { id: 'Q23-24', type: 'multi-select', question: 'Which TWO predictions about the future of work are the students doubtful about? (Choose TWO letters, A–E)', options: ['A Work will be more rewarding.', 'B Unemployment will fall.', 'C People will want to delay retiring.', 'D Working hours will be shorter.', 'E People will change jobs more frequently.'], answer: [1, 3] },
        { id: 'Q25', type: 'map-label', question: 'Accountants', answer: 'G' },
        { id: 'Q26', type: 'map-label', question: 'Hairdressers', answer: 'E' },
        { id: 'Q27', type: 'map-label', question: 'Administrative staff', answer: 'B' },
        { id: 'Q28', type: 'map-label', question: 'Agricultural workers', answer: 'C' },
        { id: 'Q29', type: 'map-label', question: 'Care workers', answer: 'F' },
        { id: 'Q30', type: 'map-label', question: 'Bank clerks', answer: 'A' },
      ],
    },
    {
      title: 'Part 4：Space Traffic Management',
      audio: 'mock/cam18-test3-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'would aim to set up legal and 31 ____ ways of improving safety.', answer: 'technical' },
        { id: 'Q32', type: 'fill-blank', question: 'Satellites are now quite 32 ____ and therefore more widespread.', answer: 'cheap' },
        { id: 'Q33', type: 'fill-blank', question: 'there are constellations made up of 33 ____ of satellites', answer: 'thousands' },
        { id: 'Q34', type: 'fill-blank', question: 'At present, satellites are not required to transmit information to help with their 34 ____.', answer: 'identification' },
        { id: 'Q35', type: 'fill-blank', question: 'There are few systems for 35 ____ satellites.', answer: 'tracking' },
        { id: 'Q36', type: 'fill-blank', question: 'Operators may be unwilling to share details of satellites used for 36 ____ or commercial reasons.', answer: 'military' },
        { id: 'Q37', type: 'fill-blank', question: 'It may be hard to collect details of the object\'s 37 ____ at a given time.', answer: 'location' },
        { id: 'Q38', type: 'fill-blank', question: 'Scientists can only make a 38 ____ about where the satellite will go.', answer: 'prediction' },
        { id: 'Q39', type: 'fill-blank', question: 'The information should be combined in one 39 ____.', answer: 'database' },
        { id: 'Q40', type: 'fill-blank', question: 'A coordinated system must be designed to create 40 ____ in its users.', answer: 'trust' },
      ],
    },
  ],
}
