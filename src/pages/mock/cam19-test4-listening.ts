import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 19 Test 4 听力（40 题）
 * 转录自 Cambridge IELTS 19 PDF，答案来自书后 answer key (p.126)
 *
 * 注意：Q11/Q12、Q13/Q14 为 "Choose TWO letters" 题（IN EITHER ORDER），
 * answer 存为下标数组。
 * Q15–18、Q26–30 为配对题（写字母），用 map-label 原生格式。
 */
export const cam19Test4Listening: ListeningMockTest = {
  id: 'cam19-test4-listening',
  title: '剑19 Test 4 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：First day at work',
      audio: 'mock/cam19-test4-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Name of supervisor: ____', answer: 'Kaeden' },
        { id: 'Q2', type: 'fill-blank', question: 'Where to leave coat and bag: use ____ in staffroom', answer: ['locker', 'lockers'] },
        { id: 'Q3', type: 'fill-blank', question: 'See Tiffany in HR: to give ____ number', answer: 'passport' },
        { id: 'Q4', type: 'fill-blank', question: 'See Tiffany in HR: to collect ____', answer: 'uniform' },
        { id: 'Q5', type: 'fill-blank', question: 'Location of HR office: on ____ floor', answer: ['third', '3rd'] },
        { id: 'Q6', type: 'fill-blank', question: 'Supervisor\u2019s mobile number: ____', answer: ['0412 665 903', '0412665903'] },
        { id: 'Q7', type: 'fill-blank', question: 'Bakery section: Use ____ labels', answer: 'yellow' },
        { id: 'Q8', type: 'fill-blank', question: 'Sushi takeaway counter: Re-stock with ____ boxes if needed', answer: 'plastic' },
        { id: 'Q9', type: 'fill-blank', question: 'Meat and fish counters: Collect ____ for the fish from the cold-room', answer: 'ice' },
        { id: 'Q10', type: 'fill-blank', question: 'Meat and fish counters: Must wear special ____', answer: 'gloves' },
      ],
    },
    {
      title: 'Part 2：Compton Park Runners Club',
      audio: 'mock/cam19-test4-listening-part2.mp3',
      image: 'mock/cam19-test4-part2-box.png',
      questions: [
        { id: 'Q11-12', type: 'multi-select', question: 'Which TWO problems with some training programmes for new runners does Liz mention? (Choose TWO letters, A–E)', options: ['A There is a risk of serious injury.', 'B They are unsuitable for certain age groups.', 'C They are unsuitable for people with health issues.', 'D It is difficult to stay motivated.', 'E There is a lack of individual support.'], answer: [2, 4] },
        { id: 'Q13-14', type: 'multi-select', question: 'Which TWO tips does Liz recommend for new runners? (Choose TWO letters, A–E)', options: ['A doing two runs a week', 'B running in the evening', 'C going on runs with a friend', 'D listening to music during runs', 'E running very slowly'], answer: [0, 3] },
        { id: 'Q15', type: 'map-label', question: 'What reason prevented Ceri from joining the Compton Park Runners Club until recently?', answer: 'A' },
        { id: 'Q16', type: 'map-label', question: 'What reason prevented James from joining the Compton Park Runners Club until recently?', answer: 'B' },
        { id: 'Q17', type: 'map-label', question: 'What reason prevented Leo from joining the Compton Park Runners Club until recently?', answer: 'C' },
        { id: 'Q18', type: 'map-label', question: 'What reason prevented Mark from joining the Compton Park Runners Club until recently?', answer: 'A' },
        { id: 'Q19', type: 'multiple-choice', question: 'What does Liz say about running her first marathon?', options: ['A It had always been her ambition.', 'B Her husband persuaded her to do it.', 'C She nearly gave up before the end.'], answer: 2 },
        { id: 'Q20', type: 'multiple-choice', question: 'Liz says new runners should sign up for a race', options: ['A every six months.', 'B within a few weeks of taking up running.', 'C after completing several practice runs.'], answer: 1 },
      ],
    },
    {
      title: 'Part 3：Jane and Kieran / Books',
      audio: 'mock/cam19-test4-listening-part3.mp3',
      image: 'mock/cam19-test4-part3-box.png',
      questions: [
        { id: 'Q21', type: 'multiple-choice', question: 'Kieran thinks the packing advice given by Jane\u2019s grandfather is', options: ['A common sense.', 'B hard to follow.', 'C over-protective.'], answer: 0 },
        { id: 'Q22', type: 'multiple-choice', question: 'How does Jane feel about the books her grandfather has given her?', options: ['A They are not worth keeping.', 'B They should go to a collector.', 'C They have sentimental value for her.'], answer: 2 },
        { id: 'Q23', type: 'multiple-choice', question: 'Jane and Kieran agree that hardback books should be', options: ['A put out on display.', 'B given as gifts to visitors.', 'C more attractively designed.'], answer: 0 },
        { id: 'Q24', type: 'multiple-choice', question: 'While talking about taking a book from a shelf, Jane', options: ['A describes the mistakes other people make doing it.', 'B reflects on a significant childhood experience.', 'C explains why some books are easier to remove than others.'], answer: 1 },
        { id: 'Q25', type: 'multiple-choice', question: 'What do Jane and Kieran suggest about new books?', options: ['A Their parents liked buying them as presents.', 'B They would like to buy more of them.', 'C Not everyone can afford them.'], answer: 2 },
        { id: 'Q26', type: 'map-label', question: 'Where does Jane\u2019s grandfather keep rare books in his shop?', answer: 'D' },
        { id: 'Q27', type: 'map-label', question: 'Where does Jane\u2019s grandfather keep children\u2019s books in his shop?', answer: 'F' },
        { id: 'Q28', type: 'map-label', question: 'Where does Jane\u2019s grandfather keep unwanted books in his shop?', answer: 'A' },
        { id: 'Q29', type: 'map-label', question: 'Where does Jane\u2019s grandfather keep requested books in his shop?', answer: 'C' },
        { id: 'Q30', type: 'map-label', question: 'Where does Jane\u2019s grandfather keep coursebooks in his shop?', answer: 'G' },
      ],
    },
    {
      title: 'Part 4：Tree planting',
      audio: 'mock/cam19-test4-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'Reforestation projects should not include invasive species because of possible ____ with native species', answer: 'competition' },
        { id: 'Q32', type: 'fill-blank', question: 'Reforestation projects should aim to capture carbon, protect the environment and provide sustainable sources of ____ for local people', answer: 'food' },
        { id: 'Q33', type: 'fill-blank', question: 'Use tree seeds with a high genetic diversity to increase resistance to ____ and climate change', answer: 'disease' },
        { id: 'Q34', type: 'fill-blank', question: 'Plant trees on previously forested land which is in a bad condition, not select land which is being used for ____', answer: 'agriculture' },
        { id: 'Q35', type: 'fill-blank', question: 'Large-scale reforestation projects: Base planning decisions on information from accurate ____', answer: 'maps' },
        { id: 'Q36', type: 'fill-blank', question: 'Drones are useful for identifying areas in Brazil which are endangered by keeping ____ and illegal logging', answer: 'cattle' },
        { id: 'Q37', type: 'fill-blank', question: 'Lampang Province, Northern Thailand: increasing the ____ of recovery by attracting animals and birds', answer: 'speed' },
        { id: 'Q38', type: 'fill-blank', question: 'e.g., ____ were soon attracted to the area', answer: 'monkeys' },
        { id: 'Q39', type: 'fill-blank', question: 'Destruction of mangrove forests in Madagascar made it difficult for people to make a living from ____', answer: 'fishing' },
        { id: 'Q40', type: 'fill-blank', question: 'The mangrove reforestation project protects against the higher risk of ____', answer: 'flooding' },
      ],
    },
  ],
}
