import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 18 Test 4 听力（40 题）
 * 转录自 Cambridge IELTS 18 PDF，答案来自书后 answer key (p.125)
 *
 * 注意：Q21/Q22 为 "Choose TWO letters" 且 "IN EITHER ORDER"，
 * 存为 multi-select 下标数组（多选判分不计顺序）。
 * Q15–20、Q23–27 为配对题（写字母作答），用 type: 'map-label'。
 */
export const cam18Test4Listening: ListeningMockTest = {
  id: 'cam18-test4-listening',
  title: '剑18 Test 4 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Job details from employment agency',
      audio: 'mock/cam18-test4-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Role: ____', answer: 'receptionist' },
        { id: 'Q2', type: 'fill-blank', question: 'Location: Fordham ____ Centre', answer: 'Medical' },
        { id: 'Q3', type: 'fill-blank', question: '____ Road, Fordham', answer: 'Chastons' },
        { id: 'Q4', type: 'fill-blank', question: 'Work involves: making ____ and reorganising them', answer: 'appointments' },
        { id: 'Q5', type: 'fill-blank', question: 'Work involves: maintaining the internal ____', answer: 'database' },
        { id: 'Q6', type: 'fill-blank', question: 'Requirements: ____ (essential)', answer: 'experience' },
        { id: 'Q7', type: 'fill-blank', question: 'Requirements: a calm and ____ manner', answer: 'confident' },
        { id: 'Q8', type: 'fill-blank', question: 'Other information: a ____ job – further opportunities may be available', answer: 'temporary' },
        { id: 'Q9', type: 'fill-blank', question: 'Other information: hours: 7.45 a.m. to ____ p.m. Monday to Friday', answer: '1.15' },
        { id: 'Q10', type: 'fill-blank', question: 'Other information: ____ is available onsite', answer: 'parking' },
      ],
    },
    {
      title: 'Part 2：Museum tour',
      audio: 'mock/cam18-test4-listening-part2.mp3',
      image: 'mock/cam18-test4-part2-information.png',
      questions: [
        { id: 'Q11', type: 'multiple-choice', question: 'The museum building was originally', options: ['A a factory.', 'B a private home.', 'C a hall of residence.'], answer: 1 },
        { id: 'Q12', type: 'multiple-choice', question: 'The university uses part of the museum building as', options: ['A teaching rooms.', 'B a research library.', 'C administration offices.'], answer: 0 },
        { id: 'Q13', type: 'multiple-choice', question: 'What does the guide say about the entrance fee?', options: ['A Visitors decide whether or not they wish to pay.', 'B Only children and students receive a discount.', 'C The museum charges extra for special exhibitions.'], answer: 0 },
        { id: 'Q14', type: 'multiple-choice', question: 'What are visitors advised to leave in the cloakroom?', options: ['A cameras', 'B coats', 'C bags'], answer: 2 },
        { id: 'Q15', type: 'map-label', question: 'Four Seasons', answer: 'F' },
        { id: 'Q16', type: 'map-label', question: 'Farmhouse Kitchen', answer: 'G' },
        { id: 'Q17', type: 'map-label', question: 'A Year on the Farm', answer: 'E' },
        { id: 'Q18', type: 'map-label', question: 'Wagon Walk', answer: 'A' },
        { id: 'Q19', type: 'map-label', question: 'Bees are Magic', answer: 'C' },
        { id: 'Q20', type: 'map-label', question: 'The Pond', answer: 'B' },
      ],
    },
    {
      title: 'Part 3：Origami in education',
      audio: 'mock/cam18-test4-listening-part3.mp3',
      image: 'mock/cam18-test4-part3-comments.png',
      questions: [
        { id: 'Q21-22', type: 'multi-select', question: 'Which TWO educational skills were shown in the video of children doing origami? (Choose TWO letters, A–E)', options: ['A solving problems', 'B following instructions', 'C working cooperatively', 'D learning through play', 'E developing hand-eye coordination'], answer: [1, 3] },
        { id: 'Q23', type: 'map-label', question: 'Sid', answer: 'D' },
        { id: 'Q24', type: 'map-label', question: 'Jack', answer: 'A' },
        { id: 'Q25', type: 'map-label', question: 'Naomi', answer: 'C' },
        { id: 'Q26', type: 'map-label', question: 'Anya', answer: 'G' },
        { id: 'Q27', type: 'map-label', question: 'Zara', answer: 'F' },
        { id: 'Q28', type: 'multiple-choice', question: 'Before starting an origami activity in class, the students think it is important for the teacher to', options: ['A make models that demonstrate the different stages.', 'B check children understand the terminology involved.', 'C tell children not to worry if they find the activity difficult.'], answer: 0 },
        { id: 'Q29', type: 'multiple-choice', question: 'The students agree that some teachers might be unwilling to use origami in class because', options: ['A they may not think that crafts are important.', 'B they may not have the necessary skills.', 'C they may worry that it will take up too much time.'], answer: 1 },
        { id: 'Q30', type: 'multiple-choice', question: 'Why do the students decide to use origami in their maths teaching practice?', options: ['A to correct a particular misunderstanding', 'B to set a challenge', 'C to introduce a new concept'], answer: 2 },
      ],
    },
    {
      title: 'Part 4：Victor Hugo',
      audio: 'mock/cam18-test4-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'We know more about its overall ____ than about its author.', answer: 'plot' },
        { id: 'Q32', type: 'fill-blank', question: 'He spoke publicly about social issues, such as ____ and education.', answer: 'poverty' },
        { id: 'Q33', type: 'fill-blank', question: 'Victor Hugo had to live elsewhere in ____.', answer: 'Europe' },
        { id: 'Q34', type: 'fill-blank', question: 'He used his income from the sale of some ____ he had written to buy a house on Guernsey.', answer: 'poetry' },
        { id: 'Q35', type: 'fill-blank', question: 'The ground floor contains portraits, ____ and tapestries that he valued.', answer: 'drawings' },
        { id: 'Q36', type: 'fill-blank', question: 'He bought cheap ____ made of wood and turned this into beautiful wall carvings.', answer: 'furniture' },
        { id: 'Q37', type: 'fill-blank', question: 'The first floor consists of furnished areas with wallpaper and ____ that have a Chinese design.', answer: 'lamps' },
        { id: 'Q38', type: 'fill-blank', question: 'He wrote in a room at the top of the house that had a view of the ____.', answer: ['harbour', 'harbor'] },
        { id: 'Q39', type: 'fill-blank', question: 'He entertained other writers as well as poor ____ in his house.', answer: 'children' },
        { id: 'Q40', type: 'fill-blank', question: "Victor Hugo's ____ gave ownership of the house to the city of Paris in 1927.", answer: 'relatives' },
      ],
    },
  ],
}
