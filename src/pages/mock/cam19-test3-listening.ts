import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 19 Test 3 听力（40 题）
 * 转录自 Cambridge IELTS 19 PDF，答案来自书后 answer key (p.124)
 *
 * Part 2 Q11-16 为配对题（Information A-H），Q26-30 为流程图选词（A-H），
 * 均保持原生的"写字母"格式（type: 'map-label'），未转成选择题。
 * Q17&18、Q19&20 为 "Choose TWO letters" 题（multi-select，存下标）。
 */
export const cam19Test3Listening: ListeningMockTest = {
  id: 'cam19-test3-listening',
  title: '剑19 Test 3 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Local food shops',
      audio: 'mock/cam19-test3-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Kite Place – near the ____', answer: 'harbour' },
        { id: 'Q2', type: 'fill-blank', question: 'Fish market: cross the ____ and turn right', answer: 'bridge' },
        { id: 'Q3', type: 'fill-blank', question: 'Fish market: best to go before ____ pm, earlier than closing time', answer: ['3.30', 'three thirty', 'half 3', 'three'] },
        { id: 'Q4', type: 'fill-blank', question: 'Organic shop: called \'____\'', answer: 'rose' },
        { id: 'Q5', type: 'fill-blank', question: 'Organic shop: look for the large ____ outside', answer: 'sign' },
        { id: 'Q6', type: 'fill-blank', question: 'Supermarket: take a ____ minibus, number 289', answer: 'purple' },
        { id: 'Q7', type: 'fill-blank', question: 'Fish market: a handful of ____ (type of seaweed)', answer: 'samphire' },
        { id: 'Q8', type: 'fill-blank', question: 'Organic shop: beans and a ____ for dessert', answer: 'melon' },
        { id: 'Q9', type: 'fill-blank', question: 'Organic shop: spices and ____', answer: 'coconut' },
        { id: 'Q10', type: 'fill-blank', question: 'Bakery: a ____ tart', answer: 'strawberry' },
      ],
    },
    {
      title: 'Part 2：Children\'s book festival workshops',
      audio: 'mock/cam19-test3-listening-part2.mp3',
      image: 'mock/cam19-test3-part2-box.png',
      questions: [
        { id: 'Q11', type: 'map-label', question: 'Superheroes', answer: 'C' },
        { id: 'Q12', type: 'map-label', question: 'Just do it', answer: 'D' },
        { id: 'Q13', type: 'map-label', question: 'Count on me', answer: 'F' },
        { id: 'Q14', type: 'map-label', question: 'Speak up', answer: 'G' },
        { id: 'Q15', type: 'map-label', question: 'Jump for joy', answer: 'B' },
        { id: 'Q16', type: 'map-label', question: 'Sticks and stones', answer: 'H' },
        { id: 'Q17-18', type: 'multi-select', question: 'Which TWO reasons does the speaker give for recommending Alive and Kicking? (Choose TWO letters, A–E)', options: ['A It will appeal to both boys and girls.', 'B The author is well known.', 'C It has colourful illustrations.', 'D It is funny.', 'E It deals with an important topic.'], answer: [3, 4] },
        { id: 'Q19-20', type: 'multi-select', question: 'Which TWO pieces of advice does the speaker give to parents about reading? (Choose TWO letters, A–E)', options: ['A Encourage children to write down new vocabulary.', 'B Allow children to listen to audio books.', 'C Get recommendations from librarians.', 'D Give children a choice about what they read.', 'E Only read aloud to children until they can read independently.'], answer: [1, 2] },
      ],
    },
    {
      title: 'Part 3：Science experiment for Year 12 students',
      audio: 'mock/cam19-test3-listening-part3.mp3',
      image: 'mock/cam19-test3-part3-box.png',
      questions: [
        { id: 'Q21', type: 'multiple-choice', question: 'How does Clare feel about the students in her Year 12 science class?', options: ['A worried that they are not making progress', 'B challenged by their poor behaviour in class', 'C frustrated at their lack of interest in the subject'], answer: 2 },
        { id: 'Q22', type: 'multiple-choice', question: 'How does Jake react to Clare\'s suggestion about an experiment based on children\'s diet?', options: ['A He is concerned that the results might not be meaningful.', 'B He feels some of the data might be difficult to obtain.', 'C He suspects that the conclusions might be upsetting.'], answer: 1 },
        { id: 'Q23', type: 'multiple-choice', question: 'What problem do they agree may be involved in an experiment involving animals?', options: ['A Any results may not apply to humans.', 'B It may be complicated to get permission.', 'C Students may not be happy about animal experiments.'], answer: 0 },
        { id: 'Q24', type: 'multiple-choice', question: 'What question do they decide the experiment should address?', options: ['A Are mice capable of controlling their food intake?', 'B Does an increase in sugar lead to health problems?', 'C How much do supplements of different kinds affect health?'], answer: 0 },
        { id: 'Q25', type: 'multiple-choice', question: 'Clare might also consider doing another experiment involving', options: ['A other types of food supplement.', 'B different genetic strains of mice.', 'C varying amounts of exercise.'], answer: 2 },
        { id: 'Q26', type: 'map-label', question: 'Choose mice which are all the same ____', answer: 'C' },
        { id: 'Q27', type: 'map-label', question: 'Divide the mice into two groups, each with a different ____', answer: 'H' },
        { id: 'Q28', type: 'map-label', question: 'Feed group B the same, but also sugar contained in ____', answer: 'E' },
        { id: 'Q29', type: 'map-label', question: 'Place them in a weighing chamber to prevent ____', answer: 'B' },
        { id: 'Q30', type: 'map-label', question: 'Do all necessary ____', answer: 'F' },
      ],
    },
    {
      title: 'Part 4：Microplastics',
      audio: 'mock/cam19-test3-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'fibres from some ____ during washing', answer: 'clothing' },
        { id: 'Q32', type: 'fill-blank', question: 'They cause injuries to the ____ of wildlife and affect their digestive systems.', answer: 'mouths' },
        { id: 'Q33', type: 'fill-blank', question: 'They enter the food chain, e.g., in bottled and tap water, ____ and seafood.', answer: 'salt' },
        { id: 'Q34', type: 'fill-blank', question: 'They may not affect human health, but they are already banned in skin cleaning products and ____ in some countries.', answer: 'toothpaste' },
        { id: 'Q35', type: 'fill-blank', question: 'Microplastics enter the soil through the air, rain and ____.', answer: 'fertilisers' },
        { id: 'Q36', type: 'fill-blank', question: 'Earthworms are important because they add ____ to the soil.', answer: 'nutrients' },
        { id: 'Q37', type: 'fill-blank', question: 'The study aimed to find whether microplastics in earthworms affect the ____ of plants.', answer: 'growth' },
        { id: 'Q38', type: 'fill-blank', question: 'The study found that microplastics caused: ____ loss in earthworms', answer: 'weight' },
        { id: 'Q39', type: 'fill-blank', question: 'a rise in the level of ____ in the soil.', answer: 'acid' },
        { id: 'Q40', type: 'fill-blank', question: 'changes to soil damage both ecosystems and ____.', answer: 'society' },
      ],
    },
  ],
}
