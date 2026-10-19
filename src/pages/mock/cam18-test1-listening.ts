import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 18 Test 1 听力（40 题）
 * 转录自 Cambridge IELTS 18 PDF（第12-17页 / pg-012.png ~ pg-017.png），答案来自书后 answer key
 *
 * 题型：
 * - Part 1：Transport survey，Q1-10 填空（ONE WORD AND/OR A NUMBER）
 * - Part 2：Becoming a volunteer for ACE，Q11-13 单选，Q14-15 多选（Choose TWO），Q16-20 配对（题库中转为单选，选项 A–G）
 * - Part 3：Talk on jobs in fashion design，Q21-26 单选，Q27-28 / Q29-30 多选（Choose TWO）
 * - Part 4：Elephant translocation，Q31-40 填空（ONE WORD ONLY）
 *
 * 注意：Q14-15、Q27-28、Q29-30 为 "Choose TWO letters" 题，合并为一条 multi-select，
 * answer 存为 0 起下标数组，前端支持多选。
 */
export const cam18Test1Listening: ListeningMockTest = {
  id: 'cam18-test1-listening',
  title: '剑18 Test 1 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Transport survey',
      audio: 'mock/cam18-test1-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Postcode: ____', answer: 'dw30 7yz' },
        { id: 'Q2', type: 'fill-blank', question: 'Date of bus journey: ____', answer: '24th april' },
        { id: 'Q3', type: 'fill-blank', question: 'Reason for trip: shopping and visit to the ____', answer: 'dentist' },
        { id: 'Q4', type: 'fill-blank', question: 'Travelled by bus because cost of ____ too high', answer: 'parking' },
        { id: 'Q5', type: 'fill-blank', question: 'Got on bus at ____ Street', answer: 'claxby' },
        { id: 'Q6', type: 'fill-blank', question: 'Complaints about bus service: bus today was ____', answer: 'late' },
        { id: 'Q7', type: 'fill-blank', question: 'Complaints about bus service: frequency of buses in the ____', answer: 'evening' },
        { id: 'Q8', type: 'fill-blank', question: 'Goes to the ____ by car', answer: 'supermarket' },
        { id: 'Q9', type: 'fill-blank', question: 'Dislikes travelling by bike in the city centre because of the ____', answer: 'pollution' },
        { id: 'Q10', type: 'fill-blank', question: 'Doesn\'t own a bike because of a lack of ____', answer: 'storage' },
      ],
    },
    {
      title: 'Part 2：Becoming a volunteer for ACE',
      audio: 'mock/cam18-test1-listening-part2.mp3',
      questions: [
        { id: 'Q11', type: 'multiple-choice', question: 'Why does the speaker apologise about the seats?', options: ['They are too small.', 'There are not enough of them.', 'Some of them are very close together.'], answer: 2 },
        { id: 'Q12', type: 'multiple-choice', question: 'What does the speaker say about the age of volunteers?', options: ['The age of volunteers is less important than other factors.', 'Young volunteers are less reliable than older ones.', 'Most volunteers are about 60 years old.'], answer: 0 },
        { id: 'Q13', type: 'multiple-choice', question: 'What does the speaker say about training?', options: ['It is continuous.', 'It is conducted by a manager.', 'It takes place online.'], answer: 0 },
        { id: 'Q14-15', type: 'multi-select', question: 'Which TWO issues does the speaker ask the audience to consider before they apply to be volunteers? (Choose TWO letters, A–E)', options: ['their financial situation', 'their level of commitment', 'their work experience', 'their ambition', 'their availability'], answer: [1, 4] },
        { id: 'Q16', type: 'multiple-choice', question: 'Fundraising: what does the speaker suggest would be helpful for this area of voluntary work?', options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'], answer: 1 },
        { id: 'Q17', type: 'multiple-choice', question: 'Litter collection: what does the speaker suggest would be helpful for this area of voluntary work?', options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'], answer: 6 },
        { id: 'Q18', type: 'multiple-choice', question: '\'Playmates\': what does the speaker suggest would be helpful for this area of voluntary work?', options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'], answer: 3 },
        { id: 'Q19', type: 'multiple-choice', question: 'Story club: what does the speaker suggest would be helpful for this area of voluntary work?', options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'], answer: 0 },
        { id: 'Q20', type: 'multiple-choice', question: 'First aid: what does the speaker suggest would be helpful for this area of voluntary work?', options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'], answer: 5 },
      ],
    },
    {
      title: 'Part 3：Talk on jobs in fashion design',
      audio: 'mock/cam18-test1-listening-part3.mp3',
      questions: [
        { id: 'Q21', type: 'multiple-choice', question: 'What problem did Chantal have at the start of the talk?', options: ['Her view of the speaker was blocked.', 'She was unable to find an empty seat.', 'The students next to her were talking.'], answer: 0 },
        { id: 'Q22', type: 'multiple-choice', question: 'What were Hugo and Chantal surprised to hear about the job market?', options: ['It has become more competitive than it used to be.', 'There is more variety in it than they had realised.', 'Some areas of it are more exciting than others.'], answer: 1 },
        { id: 'Q23', type: 'multiple-choice', question: 'Hugo and Chantal agree that the speaker\'s message was', options: ['unfair to them at times.', 'hard for them to follow.', 'critical of the industry.'], answer: 0 },
        { id: 'Q24', type: 'multiple-choice', question: 'What do Hugo and Chantal criticise about their school careers advice?', options: ['when they received the advice', 'how much advice was given', 'who gave the advice'], answer: 2 },
        { id: 'Q25', type: 'multiple-choice', question: 'When discussing their future, Hugo and Chantal disagree on', options: ['which is the best career in fashion.', 'when to choose a career in fashion.', 'why they would like a career in fashion.'], answer: 1 },
        { id: 'Q26', type: 'multiple-choice', question: 'How does Hugo feel about being an unpaid assistant?', options: ['He is realistic about the practice.', 'He feels the practice is dishonest.', 'He thinks others want to change the practice.'], answer: 0 },
        { id: 'Q27-28', type: 'multi-select', question: 'Which TWO mistakes did the speaker admit she made in her first job? (Choose TWO letters, A–E)', options: ['being dishonest to her employer', 'paying too much attention to how she looked', 'expecting to become well known', 'trying to earn a lot of money', 'openly disliking her client'], answer: [1, 4] },
        { id: 'Q29-30', type: 'multi-select', question: 'Which TWO pieces of retail information do Hugo and Chantal agree would be useful? (Choose TWO letters, A–E)', options: ['the reasons people return fashion items', 'how much time people have to shop for clothes', 'fashion designs people want but can\'t find', 'the best time of year for fashion buying', 'the most popular fashion sizes'], answer: [0, 2] },
      ],
    },
    {
      title: 'Part 4：Elephant translocation',
      audio: 'mock/cam18-test1-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'Problems caused by elephant overpopulation: damage to ____ in the park', answer: 'fences' },
        { id: 'Q32', type: 'fill-blank', question: 'The translocation process: a suitable group of elephants from the same ____ was selected', answer: 'family' },
        { id: 'Q33', type: 'fill-blank', question: 'Vets and park staff made use of ____ to help guide the elephants into an open plain', answer: 'helicopters' },
        { id: 'Q34', type: 'fill-blank', question: 'This process had to be completed quickly to reduce ____', answer: 'stress' },
        { id: 'Q35', type: 'fill-blank', question: 'Elephants had to be turned on their ____ to avoid damage to their lungs', answer: 'sides' },
        { id: 'Q36', type: 'fill-blank', question: 'Elephants\' ____ had to be monitored constantly', answer: 'breathing' },
        { id: 'Q37', type: 'fill-blank', question: 'Data including the size of their tusks and ____ was taken', answer: 'feet' },
        { id: 'Q38', type: 'fill-blank', question: 'Advantages of translocation at Nkhotakota Wildlife Park: ____ opportunities', answer: 'employment' },
        { id: 'Q39', type: 'fill-blank', question: 'A reduction in the number of poachers and ____', answer: 'weapons' },
        { id: 'Q40', type: 'fill-blank', question: 'An increase in ____ as a contributor to GDP', answer: 'tourism' },
      ],
    },
  ],
}
