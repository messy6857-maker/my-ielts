import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 20 Test 4 听力（40 题）
 * 转录自 Cambridge IELTS 20 PDF，答案来自书后 answer key (p.121)
 *
 * 注意：Q11/Q12、Q13/Q14、Q21/Q22、Q23/Q24 为 "Choose TWO letters" 题，
 * answer 存为下标数组。Q15-Q20 为配对题（write letter A-H），用 map-label 原生格式。
 */
export const cam20Test4Listening: ListeningMockTest = {
  id: 'cam20-test4-listening',
  title: '剑20 Test 4 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Advice on family visit',
      audio: 'mock/cam20-test4-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: '____ Hotel on George Street', answer: ['Kings', 'King\'s'] },
        { id: 'Q2', type: 'fill-blank', question: 'cost of family room per night: 2 £ ____ (approx.)', answer: ['125', 'one hundred and twenty-five'] },
        { id: 'Q3', type: 'fill-blank', question: 'a ____ tour of the city centre (starts in Carlton Square)', answer: 'walking' },
        { id: 'Q4', type: 'fill-blank', question: 'a trip by ____ to the old fort', answer: 'boat' },
        { id: 'Q5', type: 'fill-blank', question: 'best day to visit: ____', answer: 'Tuesday' },
        { id: 'Q6', type: 'fill-blank', question: 'see the exhibition about ____, which opens soon', answer: 'space' },
        { id: 'Q7', type: 'fill-blank', question: 'good for ____ food', answer: 'vegetarian' },
        { id: 'Q8', type: 'fill-blank', question: 'need to have lunch before ____ p.m.', answer: ['2.30', 'two thirty'] },
        { id: 'Q9', type: 'fill-blank', question: 'save up to ____ % on ticket prices at bargaintickets.com', answer: ['75', 'seventy-five'] },
        { id: 'Q10', type: 'fill-blank', question: 'climb Telegraph Hill to see a view of the ____', answer: 'port' },
      ],
    },
    {
      title: 'Part 2：Football stadium',
      audio: 'mock/cam20-test4-listening-part2.mp3',
      questions: [
        { id: 'Q11-12', type: 'multi-select', question: 'Which TWO things does the speaker say about visiting the football stadium with children? (Choose TWO letters, A–E)', options: ['A Children can get their photo taken with a football player.', 'B There is a competition for children today.', 'C Parents must stay with their children at all times.', 'D Children will need sunhats and drinks.', 'E The cafe has a special offer on meals for children.'], answer: [1, 2] },
        { id: 'Q13-14', type: 'multi-select', question: 'Which TWO features of the stadium tour are new this year? (Choose TWO letters, A–E)', options: ['A VIP tour', 'B 360 cinema experience', 'C audio guide', 'D dressing room tour', 'E tours in other languages'], answer: [0, 2] },
        { id: 'Q15', type: 'map-label', question: '1870 – Which event in the history of football in the UK took place in this year? (Choose from the box: A. The introduction of pay for the players; B. a change to the design of the goal; C. the first use of lights for matches; D. the Introduction of goalkeepers; E. the first International match; F. two changes to the rules of the game; G. the introduction of a fee for spectators; H. an agreement on the length of a game)', answer: 'D' },
        { id: 'Q16', type: 'map-label', question: '1874 – Which event in the history of football in the UK took place in this year? (See box in Q15)', answer: 'F' },
        { id: 'Q17', type: 'map-label', question: '1875 – Which event in the history of football in the UK took place in this year? (See box in Q15)', answer: 'B' },
        { id: 'Q18', type: 'map-label', question: '1877 – Which event in the history of football in the UK took place in this year? (See box in Q15)', answer: 'H' },
        { id: 'Q19', type: 'map-label', question: '1878 – Which event in the history of football in the UK took place in this year? (See box in Q15)', answer: 'C' },
        { id: 'Q20', type: 'map-label', question: '1880 – Which event in the history of football in the UK took place in this year? (See box in Q15)', answer: 'G' },
      ],
    },
    {
      title: 'Part 3：Teaching handwriting',
      audio: 'mock/cam20-test4-listening-part3.mp3',
      questions: [
        { id: 'Q21-22', type: 'multi-select', question: 'Which TWO benefits for children of learning to write did both students find surprising? (Choose TWO letters, A–E)', options: ['A improved fine motor skills', 'B improved memory', 'C improved concentration', 'D improved imagination', 'E improved spatial awareness'], answer: [2, 4] },
        { id: 'Q23-24', type: 'multi-select', question: 'For children with dyspraxia, which TWO problems with handwriting do the students think are easiest to correct? (Choose TWO letters, A–E)', options: ['A not spacing letters correctly', 'B not writing in a straight line', 'C applying too much pressure when writing', 'D confusing letter shapes', 'E writing very slowly'], answer: [0, 2] },
        { id: 'Q25', type: 'multiple-choice', question: 'What does the woman say about using laptops to teach writing to children with dyslexia?', options: ['A Children often lack motivation to learn that way.', 'B Children become fluent relatively quickly.', 'C Children react more positively if they make a mistake.'], answer: 2 },
        { id: 'Q26', type: 'multiple-choice', question: 'When discussing whether to teach cursive or print writing, the woman thinks that', options: ['A cursive writing disadvantages a certain group of children.', 'B print writing is associated with lower academic performance.', 'C most teachers in the UK prefer a traditional approach to handwriting.'], answer: 0 },
        { id: 'Q27', type: 'multiple-choice', question: 'According to the students, what impact does poor handwriting have on exam performance?', options: ['A There is evidence to suggest grades are affected by poor handwriting.', 'B Neat handwriting is less important now than it used to be.', 'C Candidates write more slowly and produce shorter answers.'], answer: 0 },
        { id: 'Q28', type: 'multiple-choice', question: 'What prediction does the man make about the future of handwriting?', options: ['A Touch typing will be taught before writing by hand.', 'B Children will continue to learn to write by hand.', 'C People will dislike handwriting on digital devices.'], answer: 1 },
        { id: 'Q29', type: 'multiple-choice', question: 'The woman is concerned that relying on digital devices has made it difficult for her to', options: ['A take detailed notes.', 'B spell and punctuate.', 'C read old documents.'], answer: 1 },
        { id: 'Q30', type: 'multiple-choice', question: 'How do the students feel about their own handwriting?', options: ['A concerned they are unable to write quickly', 'B embarrassed by comments made about it', 'C regretful that they have lost the habit'], answer: 2 },
      ],
    },
    {
      title: 'Part 4：Research in the area around the Chembe Bird Sanctuary',
      audio: 'mock/cam20-test4-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'They destroy ____ and other rodents.', answer: 'rats' },
        { id: 'Q32', type: 'fill-blank', question: 'They help to prevent farmers from being bitten by ____.', answer: 'snakes' },
        { id: 'Q33', type: 'fill-blank', question: 'They now support the economy by encouraging ____ in the area.', answer: 'tourism' },
        { id: 'Q34', type: 'fill-blank', question: 'By ____ when they are hunting or sleeping', answer: 'traffic' },
        { id: 'Q35', type: 'fill-blank', question: 'by electrocution from contact with power lines, especially at times when there is a lot of ____', answer: 'rain' },
        { id: 'Q36', type: 'fill-blank', question: 'Local farmers may illegally shoot them or ____ them.', answer: 'poison' },
        { id: 'Q37', type: 'fill-blank', question: 'providing a ____ for chickens (expensive)', answer: 'building' },
        { id: 'Q38', type: 'fill-blank', question: 'keeping a ____', answer: 'dog' },
        { id: 'Q39', type: 'fill-blank', question: 'making a ____', answer: 'noise' },
        { id: 'Q40', type: 'fill-blank', question: 'A ____ of methods is usually most effective.', answer: 'combination' },
      ],
    },
  ],
}
