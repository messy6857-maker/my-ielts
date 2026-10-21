import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 18 Test 2 听力（40 题）
 * 转录自 Cambridge IELTS 18 PDF，答案来自书后 answer key (p.121)
 * 全部 80 题逐题核对，地图/配对题用 map-label 原生格式
 */
export const cam18Test2Listening: ListeningMockTest = {
  id: 'cam18-test2-listening',
  title: '剑18 Test 2 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Working at Milo\'s Restaurants',
      audio: 'mock/cam18-test2-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Benefits: ____ provided for all staff', answer: 'training' },
        { id: 'Q2', type: 'fill-blank', question: 'Benefits: ____ during weekdays at all Milo\'s Restaurants', answer: 'discount' },
        { id: 'Q3', type: 'fill-blank', question: 'Benefits: ____ provided after midnight', answer: 'taxi' },
        { id: 'Q4', type: 'fill-blank', question: 'Person specification: must care about maintaining a high standard of ____', answer: 'service' },
        { id: 'Q5', type: 'fill-blank', question: 'Person specification: must have a qualification in ____', answer: 'English' },
        { id: 'Q6', type: 'fill-blank', question: 'Location: ____ Street, Job title: Breakfast supervisor', answer: 'Wivenhoe' },
        { id: 'Q7', type: 'fill-blank', question: 'Responsibilities include: Making sure ____ is clean', answer: 'equipment' },
        { id: 'Q8', type: 'fill-blank', question: 'Pay and conditions: Starting salary £ ____ per hour', answer: '9.75' },
        { id: 'Q9', type: 'fill-blank', question: 'Responsibilities include: Maintaining stock and organising ____', answer: 'deliveries' },
        { id: 'Q10', type: 'fill-blank', question: 'Pay and conditions: No work on a ____ once a month', answer: 'Sunday' },
      ],
    },
    {
      title: 'Part 2：Housing development',
      audio: 'mock/cam18-test2-listening-part2.mp3',
      image: 'mock/cam18-test2-part2-map.png',
      questions: [
        { id: 'Q11-12', type: 'multi-select', question: 'What are the TWO main reasons why this site has been chosen for the housing development? (Choose TWO letters, A–E)', options: ['A It has suitable geographical features.', 'B There is easy access to local facilities.', 'C It has good connections with the airport.', 'D The land is of little agricultural value.', 'E It will be convenient for workers.'], answer: [1, 4] },
        { id: 'Q13-14', type: 'multi-select', question: 'Which TWO aspects of the planned housing development have people given positive feedback about? (Choose TWO letters, A–E)', options: ['A the facilities for cyclists', 'B the impact on the environment', 'C the encouragement of good relations between residents', 'D the low cost of all the accommodation', 'E the rural location'], answer: [1, 2] },
        { id: 'Q15', type: 'map-label', question: 'School', answer: 'G' },
        { id: 'Q16', type: 'map-label', question: 'Sports centre', answer: 'C' },
        { id: 'Q17', type: 'map-label', question: 'Clinic', answer: 'D' },
        { id: 'Q18', type: 'map-label', question: 'Community centre', answer: 'B' },
        { id: 'Q19', type: 'map-label', question: 'Supermarket', answer: 'H' },
        { id: 'Q20', type: 'map-label', question: 'Playground', answer: 'A' },
      ],
    },
    {
      title: 'Part 3：The Laki eruption of 1783',
      audio: 'mock/cam18-test2-listening-part3.mp3',
      image: 'mock/cam18-test2-part3-comments.png',
      questions: [
        { id: 'Q21', type: 'multiple-choice', question: 'Why do the students think the Laki eruption of 1783 is so important?', options: ['A It was the most severe eruption in modern times.', 'B It led to the formal study of volcanoes.', 'C It had a profound effect on society.'], answer: 2 },
        { id: 'Q22', type: 'multiple-choice', question: 'What surprised Adam about observations made at the time?', options: ['A the number of places producing them', 'B the contradictions in them', 'C the lack of scientific data to support them'], answer: 0 },
        { id: 'Q23', type: 'multiple-choice', question: 'According to Michelle, what did the contemporary sources say about the Laki haze?', options: ['A People thought it was similar to ordinary fog.', 'B It was associated with health issues.', 'C It completely blocked out the sun for weeks.'], answer: 1 },
        { id: 'Q24', type: 'multiple-choice', question: 'Adam corrects Michelle when she claims that Benjamin Franklin', options: ['A came to the wrong conclusion about the cause of the haze.', 'B was the first to identify the reason for the haze.', 'C supported the opinions of other observers about the haze.'], answer: 1 },
        { id: 'Q25-26', type: 'multi-select', question: 'Which TWO issues following the Laki eruption surprised the students? (Choose TWO letters, A–E)', options: ['A how widespread the effects were', 'B how long-lasting the effects were', 'C the number of deaths it caused', 'D the speed at which the volcanic ash cloud spread', 'E how people ignored the warning signs'], answer: [0, 1] },
        { id: 'Q27', type: 'map-label', question: 'Iceland', answer: 'D' },
        { id: 'Q28', type: 'map-label', question: 'Egypt', answer: 'A' },
        { id: 'Q29', type: 'map-label', question: 'UK', answer: 'C' },
        { id: 'Q30', type: 'map-label', question: 'USA', answer: 'F' },
      ],
    },
    {
      title: 'Part 4：Pockets',
      audio: 'mock/cam18-test2-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'Reason for choice of subject: They are ____ but can be overlooked by consumers and designers.', answer: 'convenient' },
        { id: 'Q32', type: 'fill-blank', question: 'Pockets in men\'s clothes: Men started to wear ____ in the 18th century.', answer: 'suits' },
        { id: 'Q33', type: 'fill-blank', question: 'A ____ sewed pockets into the lining of the garments.', answer: 'tailor' },
        { id: 'Q34', type: 'fill-blank', question: 'Bigger pockets might be made for men who belonged to a certain type of ____.', answer: 'profession' },
        { id: 'Q35', type: 'fill-blank', question: 'Pockets in women\'s clothes: Women\'s pockets were less ____ than men\'s.', answer: 'visible' },
        { id: 'Q36', type: 'fill-blank', question: 'Pockets were produced in pairs using ____ to link them together.', answer: ['string', 'strings'] },
        { id: 'Q37', type: 'fill-blank', question: 'Pockets hung from the women\'s ____ under skirts and petticoats.', answer: ['waist', 'waists'] },
        { id: 'Q38', type: 'fill-blank', question: 'Items such as ____ could be reached through a gap in the material.', answer: 'perfume' },
        { id: 'Q39', type: 'fill-blank', question: 'When dresses changed shape, hidden pockets had a negative effect on the ____ of women.', answer: 'image' },
        { id: 'Q40', type: 'fill-blank', question: 'Bags called \'pouches\' became popular, before women carried a ____.', answer: 'handbag' },
      ],
    },
  ],
}
