import type { ListeningMockTest } from './types'

/**
 * 剑桥雅思 20 Test 3 听力（40 题）
 * 转录自 Cambridge IELTS 20 PDF，答案来自书后 answer key (PDF p.85)
 */
export const cam20Test3Listening: ListeningMockTest = {
  id: 'cam20-test3-listening',
  title: '剑20 Test 3 听力',
  timeLimit: 2400,
  parts: [
    {
      title: 'Part 1：Furniture Rental Companies',
      audio: 'mock/cam20-test3-listening-part1.mp3',
      questions: [
        { id: 'Q1', type: 'fill-blank', question: 'Peak Rentals: Prices range from $105 to $____ per room per month', answer: ['239', 'two hundred thirty-nine'] },
        { id: 'Q2', type: 'fill-blank', question: 'Peak Rentals: The furniture is very ____', answer: 'modern' },
        { id: 'Q3', type: 'fill-blank', question: 'Peak Rentals: Special offer: Free ____ with every living room set', answer: 'lamp' },
        { id: 'Q4', type: 'fill-blank', question: '____ and Oliver: Mid-range prices', answer: 'Aaron' },
        { id: 'Q5', type: 'fill-blank', question: 'Aaron and Oliver: 12% monthly fee for ____', answer: 'damage' },
        { id: 'Q6', type: 'fill-blank', question: 'Larch Furniture: Offers cheapest prices for renting furniture and ____ items', answer: 'electronic' },
        { id: 'Q7', type: 'fill-blank', question: 'Larch Furniture: Must have own ____', answer: 'insurance' },
        { id: 'Q8', type: 'fill-blank', question: '____ Rentals: Minimum contract length: six months', answer: 'space' },
        { id: 'Q9', type: 'fill-blank', question: 'Space Rentals: See the ____ for the most up-to-date prices', answer: 'app' },
        { id: 'Q10', type: 'fill-blank', question: 'Space Rentals: ____ are allowed within 7 days of delivery', answer: 'exchanges' },
      ],
    },
    {
      title: 'Part 2：Bidcaster Archaeological Dig',
      audio: 'mock/cam20-test3-listening-part2.mp3',
      image: 'mock/cam20-test3-part2-map.png',
      questions: [
        { id: 'Q11', type: 'multiple-choice', question: 'Who was responsible for starting the community project?', options: ['A the castle owners', 'B a national charity', 'C the local council'], answer: 1 },
        { id: 'Q12', type: 'multiple-choice', question: 'How was the gold coin found?', options: ['A Heavy rain had removed some of the soil.', 'B The ground was dug up by wild rabbits.', 'C A person with a metal detector searched the area.'], answer: 0 },
        { id: 'Q13', type: 'multiple-choice', question: 'What led the archaeologists to believe there was an ancient village on this site?', options: ['A the lucky discovery of old records', 'B the bases of several structures visible in the grass', 'C the unusual stones found near the castle'], answer: 0 },
        { id: 'Q14', type: 'multiple-choice', question: 'What are the team still hoping to find?', options: ['A everyday pottery', 'B animal bones', 'C pieces of jewellery'], answer: 2 },
        { id: 'Q15', type: 'multiple-choice', question: 'What was found on the other side of the river to the castle?', options: ['A the remains of a large palace', 'B the outline of fields', 'C a number of small huts'], answer: 1 },
        { id: 'Q16', type: 'multiple-choice', question: 'What do the team plan to do after work ends this summer?', options: ['A prepare a display for a museum', 'B take part in a television programme', 'C start to organise school visits'], answer: 2 },
        { id: 'Q17', type: 'map-label', question: 'bridge foundations', answer: 'B' },
        { id: 'Q18', type: 'map-label', question: 'rubbish pit', answer: 'A' },
        { id: 'Q19', type: 'map-label', question: 'meeting hall', answer: 'G' },
        { id: 'Q20', type: 'map-label', question: 'fish pond', answer: 'E' },
      ],
    },
    {
      title: 'Part 3：Theatre programmes project',
      audio: 'mock/cam20-test3-listening-part3.mp3',
      questions: [
        { id: 'Q21', type: 'multiple-choice', question: 'Finn was pleased to discover that their topic', options: ['A was not familiar to their module leader.', 'B had not been chosen by other students.', 'C did not prove to be difficult to research.'], answer: 1 },
        { id: 'Q22', type: 'multiple-choice', question: 'Maya says a mistaken belief about theatre programmes is that', options: ['A theatres pay companies to produce them.', 'B few theatre-goers buy them nowadays.', 'C they contain far more adverts than previously.'], answer: 0 },
        { id: 'Q23', type: 'multiple-choice', question: 'Finn was surprised that, in early British theatre, programmes', options: ['A were difficult for audiences to obtain.', 'B were given out free of charge.', 'C were seen as a kind of contract.'], answer: 2 },
        { id: 'Q24', type: 'multiple-choice', question: 'Maya feels their project should include an explanation of why companies of actors', options: ['A promoted their own plays.', 'B performed plays outdoors.', 'C had to tour with their plays.'], answer: 0 },
        { id: 'Q25', type: 'multiple-choice', question: 'Finn and Maya both think that, compared to nineteenth-century programmes, those from the eighteenth century', options: ['A were more original.', 'B were more colourful.', 'C were more informative.'], answer: 2 },
        { id: 'Q26', type: 'multiple-choice', question: 'Maya doesn\'t fully understand why, in the twentieth century,', options: ['A very few theatre programmes were printed in the USA.', 'B British theatre programmes failed to develop for so long.', 'C theatre programmes in Britain copied fashions from the USA.'], answer: 1 },
        { id: 'Q27', type: 'map-label', question: 'Ruy Blas', answer: 'F' },
        { id: 'Q28', type: 'map-label', question: 'Man of La Mancha', answer: 'E' },
        { id: 'Q29', type: 'map-label', question: 'The Tragedy of Jane Shore', answer: 'B' },
        { id: 'Q30', type: 'map-label', question: 'The Sailors\' Festival', answer: 'D' },
      ],
    },
    {
      title: 'Part 4：Inclusive design',
      audio: 'mock/cam20-test3-listening-part4.mp3',
      questions: [
        { id: 'Q31', type: 'fill-blank', question: 'Definition: Designing products that can be accessed by a diverse range of people without the need for any ____', answer: 'adaptation' },
        { id: 'Q32', type: 'fill-blank', question: 'Not the same as universal design: that is design for everyone, including catering for people with ____ problems', answer: 'cognitive' },
        { id: 'Q33', type: 'fill-blank', question: 'Examples: ____ which are adjustable, avoiding back or neck problems', answer: 'desks' },
        { id: 'Q34', type: 'fill-blank', question: 'Examples: ____ in public toilets which are easier to use', answer: 'taps' },
        { id: 'Q35', type: 'fill-blank', question: 'To assist the elderly: designers avoid using ____ in interfaces', answer: 'blue' },
        { id: 'Q36', type: 'fill-blank', question: 'To assist the elderly: people can make commands using a mouse, keyboard or their ____', answer: 'voice' },
        { id: 'Q37', type: 'fill-blank', question: 'Safety: Seatbelts are especially problematic for ____ women', answer: 'pregnant' },
        { id: 'Q38', type: 'fill-blank', question: 'Safety: PPE jackets are often unsuitable because of the size of women\'s ____', answer: 'shoulders' },
        { id: 'Q39', type: 'fill-blank', question: 'Safety: PPE for female ____ officers dealing with emergencies is the worst', answer: 'police' },
        { id: 'Q40', type: 'fill-blank', question: 'Comfort in the workplace: The ____ in offices is often too low for women', answer: 'temperature' },
      ],
    },
  ],
}
