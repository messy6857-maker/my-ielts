import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 16 Test 1 听力（40 题）
 * 转录自 Cambridge IELTS 16 PDF，答案来自书后 answer key (p.121)
 *
 * 注意：Q21/Q22、Q23/Q24 为 "Choose TWO letters" 题，
 * answer 存为下标数组，前端需支持多选。
 */
export const cam16Test1Listening: ListeningMockTest = {
  id: 'cam16-test1-listening',
  title: '剑16 Test 1 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Children\'s Engineering Workshops',
      audio: 'mock/cam16-test1-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Tiny Engineers (ages 4-5): Create a cover for an 1 ____ so they can drop it from a height without breaking it.', answer: 'egg' },
        { id: 'Q2', type: 'fill-blank', question: 'Take part in a competition to build the tallest 2 ____.', answer: 'tower' },
        { id: 'Q3', type: 'fill-blank', question: 'Make a 3 ____ powered by a balloon.', answer: 'car' },
        { id: 'Q4', type: 'fill-blank', question: 'Junior Engineers (ages 6-8): Build model cars, trucks and 4 ____ and learn how to program them so they can move.', answer: 'animals' },
        { id: 'Q5', type: 'fill-blank', question: 'Take part in a competition to build the longest 5 ____ using card and wood.', answer: 'bridge' },
        { id: 'Q6', type: 'fill-blank', question: 'Create a short 6 ____ with special software.', answer: 'movie' },
        { id: 'Q7', type: 'fill-blank', question: 'Build, 7 ____ and program a humanoid robot.', answer: 'decorate' },
        { id: 'Q8', type: 'fill-blank', question: 'Held on 8 ____ from 10 am to 11 am.', answer: 'wednesdays' },
        { id: 'Q9', type: 'fill-blank', question: 'Location: Building 10A, 9 ____ Industrial Estate, Grasford.', answer: 'fradstone' },
        { id: 'Q10', type: 'fill-blank', question: 'Plenty of 10 ____ is available.', answer: 'parking' },
      ],
    },
    {
      title: 'Part 2：Stevenson\'s',
      audio: 'mock/cam16-test1-listening-part2.mp3',
      questions: [
        { id: 'Q11', type: 'multiple-choice', question: 'Stevenson\'s was founded in', options: ['A 1923.', 'B 1924.', 'C 1926.'], answer: 2 },
        { id: 'Q12', type: 'multiple-choice', question: 'Originally, Stevenson\'s manufactured goods for', options: ['A the healthcare industry.', 'B the automotive industry.', 'C the machine tools industry.'], answer: 0 },
        { id: 'Q13', type: 'multiple-choice', question: 'What does the speaker say about the company premises?', options: ['A The company has recently moved.', 'B The company has no plans to move.', 'C The company is going to move shortly.'], answer: 1 },
        { id: 'Q14', type: 'multiple-choice', question: 'The programme for the work experience group includes', options: ['A time to do research.', 'B meetings with a teacher.', 'C talks by staff.'], answer: 2 },
        { id: 'Q15', type: 'multiple-choice', question: 'Plan of Stevenson\'s site: coffee room', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], answer: 7 },
        { id: 'Q16', type: 'multiple-choice', question: 'Plan of Stevenson\'s site: warehouse', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], answer: 2 },
        { id: 'Q17', type: 'multiple-choice', question: 'Plan of Stevenson\'s site: staff canteen', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], answer: 6 },
        { id: 'Q18', type: 'multiple-choice', question: 'Plan of Stevenson\'s site: meeting room', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], answer: 1 },
        { id: 'Q19', type: 'multiple-choice', question: 'Plan of Stevenson\'s site: human resources', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], answer: 8 },
        { id: 'Q20', type: 'multiple-choice', question: 'Plan of Stevenson\'s site: boardroom', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], answer: 0 },
      ],
    },
    {
      title: 'Part 3：Art projects (Jess and Tom)',
      audio: 'mock/cam16-test1-listening-part3.mp3',
      questions: [
        { id: 'Q21-22', type: 'multi-select', question: 'Which TWO parts of the introductory stage to their art projects do Jess and Tom agree were useful?', options: ['A the Bird Park visit', 'B the workshop sessions', 'C the Natural History Museum visit', 'D the projects done in previous years', 'E the handouts with research sources'], answer: [2, 4] },
        { id: 'Q23-24', type: 'multi-select', question: 'In which TWO ways do both Jess and Tom decide to change their proposals?', options: ['A by giving a rationale for their action plans', 'B by being less specific about the outcome', 'C by adding a video diary presentation', 'D by providing a timeline and a mind map', 'E by making their notes more evaluative'], answer: [1, 4] },
        { id: 'Q25', type: 'multiple-choice', question: 'Falcon (Landseer)', options: ['A a childhood memory', 'B hope for the future', 'C fast movement', 'D a potential threat', 'E the power of colour', 'F the continuity of life', 'G protection of nature', 'H a confused attitude to nature'], answer: 3 },
        { id: 'Q26', type: 'multiple-choice', question: 'Fish hawk (Audubon)', options: ['A a childhood memory', 'B hope for the future', 'C fast movement', 'D a potential threat', 'E the power of colour', 'F the continuity of life', 'G protection of nature', 'H a confused attitude to nature'], answer: 2 },
        { id: 'Q27', type: 'multiple-choice', question: 'Kingfisher (van Gogh)', options: ['A a childhood memory', 'B hope for the future', 'C fast movement', 'D a potential threat', 'E the power of colour', 'F the continuity of life', 'G protection of nature', 'H a confused attitude to nature'], answer: 0 },
        { id: 'Q28', type: 'multiple-choice', question: 'Portrait of William Wells', options: ['A a childhood memory', 'B hope for the future', 'C fast movement', 'D a potential threat', 'E the power of colour', 'F the continuity of life', 'G protection of nature', 'H a confused attitude to nature'], answer: 7 },
        { id: 'Q29', type: 'multiple-choice', question: 'Vairumati (Gauguin)', options: ['A a childhood memory', 'B hope for the future', 'C fast movement', 'D a potential threat', 'E the power of colour', 'F the continuity of life', 'G protection of nature', 'H a confused attitude to nature'], answer: 5 },
        { id: 'Q30', type: 'multiple-choice', question: 'Portrait of Giovanni de Medici', options: ['A a childhood memory', 'B hope for the future', 'C fast movement', 'D a potential threat', 'E the power of colour', 'F the continuity of life', 'G protection of nature', 'H a confused attitude to nature'], answer: 6 },
      ],
    },
    {
      title: 'Part 4：Stoicism',
      audio: 'mock/cam16-test1-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'Stoicism is still relevant today because of its 31 ____ appeal.', answer: 'practical' },
        { id: 'Q32', type: 'fill-blank', question: 'The Stoics\' ideas are surprisingly well known, despite not being intended for 32 ____.', answer: 'publication' },
        { id: 'Q33', type: 'fill-blank', question: 'Epictetus said that external events cannot be controlled but the 33 ____ people make in response can be controlled.', answer: 'choices' },
        { id: 'Q34', type: 'fill-blank', question: 'A Stoic is someone who has a different view on experiences which others would consider as 34 ____.', answer: 'negative' },
        { id: 'Q35', type: 'fill-blank', question: 'George Washington organised a 35 ____ about Cato to motivate his men.', answer: 'play' },
        { id: 'Q36', type: 'fill-blank', question: 'Adam Smith\'s ideas on 36 ____ were influenced by Stoicism.', answer: 'capitalism' },
        { id: 'Q37', type: 'fill-blank', question: 'Cognitive Behaviour Therapy (CBT): the treatment for 37 ____ is based on ideas from Stoicism.', answer: 'depression' },
        { id: 'Q38', type: 'fill-blank', question: 'CBT: people learn to base their thinking on 38 ____.', answer: 'logic' },
        { id: 'Q39', type: 'fill-blank', question: 'In business, people benefit from Stoicism by identifying obstacles as 39 ____.', answer: 'opportunity' },
        { id: 'Q40', type: 'fill-blank', question: 'It requires a lot of 40 ____ but Stoicism can help people to lead a good life.', answer: 'practice' },
      ],
    },
  ],
}
