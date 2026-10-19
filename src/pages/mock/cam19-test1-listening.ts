import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 19 Test 1 听力（40 题）
 * 转录自 Cambridge IELTS 19 PDF，答案来自书后 answer key (p.120)
 *
 * 注意：Q21/Q22、Q23/Q24 为 "Choose TWO letters" 题，
 * answer 存为逗号分隔的字母（如 "B,D"），前端需支持多选。
 */
export const cam19Test1Listening: ListeningMockTest = {
  id: 'cam19-test1-listening',
  title: '剑19 Test 1 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Hinchingbrooke Country Park',
      audio: 'mock/cam19-test1-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Area: ____ hectares', answer: '69' },
        { id: 'Q2', type: 'fill-blank', question: 'Wetland: lakes, ponds and a ____', answer: 'stream' },
        { id: 'Q3', type: 'fill-blank', question: 'Science: Children look at ____ about plants, etc.', answer: 'data' },
        { id: 'Q4', type: 'fill-blank', question: 'Geography: includes learning to use a ____ and compass', answer: 'map' },
        { id: 'Q5', type: 'fill-blank', question: 'Leisure and tourism: mostly concentrates on the park\'s ____', answer: 'visitors' },
        { id: 'Q6', type: 'fill-blank', question: 'Music: Children make ____ with natural materials, and experiment with rhythm and speed.', answer: 'sounds' },
        { id: 'Q7', type: 'fill-blank', question: 'They give children a feeling of ____ that they may not have elsewhere.', answer: 'freedom' },
        { id: 'Q8', type: 'fill-blank', question: 'Children learn new ____ and gain self-confidence.', answer: 'skills' },
        { id: 'Q9', type: 'fill-blank', question: 'Cost per child: 9 £ ____', answer: '4.95' },
        { id: 'Q10', type: 'fill-blank', question: 'Adults, such as ____, free', answer: 'leaders' },
      ],
    },
    {
      title: 'Part 2：Stanthorpe Twinning Association / Farley House',
      audio: 'mock/cam19-test1-listening-part2.mp3',
      image: 'mock/cam19-test1-part2-map.png',
      questions: [
        { id: 'Q11', type: 'multiple-choice', question: 'During the visit to Malatte, in France, members especially enjoyed', options: ['A going to a theme park.', 'B experiencing a river trip.', 'C visiting a cheese factory.'], answer: 1 },
        { id: 'Q12', type: 'multiple-choice', question: 'What will happen in Stanthorpe to mark the 25th anniversary of the Twinning Association?', options: ['A A tree will be planted.', 'B A garden seat will be bought.', 'C A footbridge will be built.'], answer: 0 },
        { id: 'Q13', type: 'multiple-choice', question: 'Which event raised most funds this year?', options: ['A the film show', 'B the pancake evening', 'C the cookery demonstration'], answer: 1 },
        { id: 'Q14', type: 'multiple-choice', question: 'For the first evening with the French visitors host families are advised to', options: ['A take them for a walk round the town.', 'B go to a local restaurant.', 'C have a meal at home.'], answer: 2 },
        { id: 'Q15', type: 'multiple-choice', question: 'On Saturday evening there will be the chance to', options: ['A listen to a concert.', 'B watch a match.', 'C take part in a competition.'], answer: 0 },
        { id: 'Q16', type: 'map-label', question: 'Farm shop', answer: 'G' },
        { id: 'Q17', type: 'map-label', question: 'Disabled entry', answer: 'C' },
        { id: 'Q18', type: 'map-label', question: 'Adventure playground', answer: 'B' },
        { id: 'Q19', type: 'map-label', question: 'Kitchen gardens', answer: 'D' },
        { id: 'Q20', type: 'map-label', question: 'The Temple of the Four Winds', answer: 'A' },
      ],
    },
    {
      title: 'Part 3：Bread reuse project / Food trends discussion',
      audio: 'mock/cam19-test1-listening-part3.mp3',
      questions: [
        { id: 'Q21-22', type: 'multi-select', question: 'Which TWO things did Colin find most satisfying about his bread reuse project? (Choose TWO letters, A–E)', options: ['A receiving support from local restaurants', 'B finding a good way to prevent waste', 'C overcoming problems in a basic process', 'D experimenting with designs and colours', 'E learning how to apply 3-D printing'], answer: [1, 3] },
        { id: 'Q23-24', type: 'multi-select', question: 'Which TWO ways do the students agree that touch-sensitive sensors for food labels could be developed in future? (Choose TWO letters, A–E)', options: ['A for use on medical products', 'B to show that food is no longer fit to eat', 'C for use with drinks as well as foods', 'D to provide applications for blind people', 'E to indicate the weight of certain foods'], answer: [0, 4] },
        { id: 'Q25', type: 'multiple-choice', question: 'Use of local products', options: ['A This is only relevant to young people.', 'B This may have disappointing results.', 'C This already seems to be widespread.', 'D Retailers should do more to encourage this.', 'E More financial support is needed for this.', 'F Most people know little about this.', 'G There should be stricter regulations about this.', 'H This could be dangerous.'], answer: 3 },
        { id: 'Q26', type: 'multiple-choice', question: 'Reduction in unnecessary packaging', options: ['A This is only relevant to young people.', 'B This may have disappointing results.', 'C This already seems to be widespread.', 'D Retailers should do more to encourage this.', 'E More financial support is needed for this.', 'F Most people know little about this.', 'G There should be stricter regulations about this.', 'H This could be dangerous.'], answer: 6 },
        { id: 'Q27', type: 'multiple-choice', question: 'Gluten-free and lactose-free food', options: ['A This is only relevant to young people.', 'B This may have disappointing results.', 'C This already seems to be widespread.', 'D Retailers should do more to encourage this.', 'E More financial support is needed for this.', 'F Most people know little about this.', 'G There should be stricter regulations about this.', 'H This could be dangerous.'], answer: 2 },
        { id: 'Q28', type: 'multiple-choice', question: 'Use of branded products related to celebrity chefs', options: ['A This is only relevant to young people.', 'B This may have disappointing results.', 'C This already seems to be widespread.', 'D Retailers should do more to encourage this.', 'E More financial support is needed for this.', 'F Most people know little about this.', 'G There should be stricter regulations about this.', 'H This could be dangerous.'], answer: 1 },
        { id: 'Q29', type: 'multiple-choice', question: 'Development of ‘ghost kitchens’ for takeaway food', options: ['A This is only relevant to young people.', 'B This may have disappointing results.', 'C This already seems to be widespread.', 'D Retailers should do more to encourage this.', 'E More financial support is needed for this.', 'F Most people know little about this.', 'G There should be stricter regulations about this.', 'H This could be dangerous.'], answer: 5 },
        { id: 'Q30', type: 'multiple-choice', question: 'Use of mushrooms for common health concerns', options: ['A This is only relevant to young people.', 'B This may have disappointing results.', 'C This already seems to be widespread.', 'D Retailers should do more to encourage this.', 'E More financial support is needed for this.', 'F Most people know little about this.', 'G There should be stricter regulations about this.', 'H This could be dangerous.'], answer: 7 },
      ],
    },
    {
      title: 'Part 4：Céide Fields',
      audio: 'mock/cam19-test1-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'In the 1930s, a local teacher realised that stones beneath the bog surface were once ____.', answer: 'walls' },
        { id: 'Q32', type: 'fill-blank', question: 'His ____ became an archaeologist and undertook an investigation of the site.', answer: 'son' },
        { id: 'Q33', type: 'fill-blank', question: 'A traditional method used by local people to dig for ____ was used to identify where stones were located.', answer: 'fuel' },
        { id: 'Q34', type: 'fill-blank', question: 'Items are well preserved in the bog because of a lack of ____.', answer: 'oxygen' },
        { id: 'Q35', type: 'fill-blank', question: 'Houses were ____ in shape and had a hole in the roof.', answer: 'rectangular' },
        { id: 'Q36', type: 'fill-blank', question: 'Pots used for storage and to make ____.', answer: 'lamps' },
        { id: 'Q37', type: 'fill-blank', question: 'Each field at Céide was large enough to support a big ____.', answer: 'family' },
        { id: 'Q38', type: 'fill-blank', question: 'No evidence of structures to house them during ____.', answer: 'winter' },
        { id: 'Q39', type: 'fill-blank', question: 'A decline in ____ quality', answer: 'soil' },
        { id: 'Q40', type: 'fill-blank', question: 'An increase in ____', answer: 'rain' },
      ],
    },
  ],
}
