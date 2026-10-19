import type { ReadingMockTest } from './types'

/**
 * 剑桥雅思 18 Test 3 阅读（40 题）
 * 转录自 Cambridge IELTS 18 PDF，答案来自书后 answer key (p.124)
 *
 * 题型均为原生格式：
 * Q1-4 段落匹配（write the correct letter, A-H）→ map-label
 * Q9-13 人名配对（write the correct letter, A-D，可重复使用）→ map-label，名单已裁为图片
 * Q14-20 标题匹配（write the correct number, i-viii）→ map-label，标题列表已裁为图片
 * Q31-35 短语配对（write the correct letter, A-I）→ map-label，短语列表已裁为图片
 */
export const cam18Test3Reading: ReadingMockTest = {
  id: 'cam18-test3-reading',
  title: '剑18 Test 3 阅读',
  timeLimit: 3600,
  passages: [
    {
      title: 'Materials to take us beyond concrete',
      image: 'mock/cam18-test3-reading-people.png',
      passage: `A Concrete is the second most used substance in the global economy, after water – and one of the world's biggest single sources of greenhouse gas emissions. The chemical process by which cement, the key ingredient of concrete, is created results in large quantities of carbon dioxide. The UN estimates that there will be 9.8 billion people living on the planet by mid-century. They will need somewhere to live. If concrete is the only answer to the construction of new cities, then carbon emissions will soar, aggravating global warming. And so scientists have started innovating with other materials, in a scramble for alternatives to a universal commodity that has underpinned our modern life for many years.

B The problem with replacing concrete is that it is so very good at what it does. Chris Cheeseman, an engineering professor at Imperial College London, says the key thing to consider is the extent to which concrete is used around the world, and is likely to continue to be used. 'Concrete is not a high-carbon product. Cement is high carbon, but concrete is not. But it is the scale on which it is used that makes it high carbon. The sheer scale of manufacture is so huge, that is the issue.'

C Not only are the ingredients of concrete relatively cheap and found in abundance in most places around the globe, the stuff itself has marvellous properties: Portland cement, the vital component of concrete, is mouldable and pourable, but quickly sets hard. Cheeseman also notes another advantage: concrete and steel have similar thermal expansion properties, so steel can be used to reinforce concrete, making it far stronger and more flexible as a building material than it could be on its own. According to Cheeseman, all these factors together make concrete hard to beat. 'Concrete is amazing stuff. Making anything with similar properties is going to be very difficult.'

D A possible alternative to concrete is wood. Making buildings from wood may seem like a rather medieval idea, but climate change is driving architects to turn to treated timber as a possible resource. Recent years have seen the emergence of tall buildings constructed almost entirely from timber. Vancouver, Vienna and Brumunddal in Norway are all home to constructed tall, wooden buildings.

E Using wood to construct buildings, however, is not straightforward. Wood expands as it absorbs moisture from the air and is susceptible to pests, not to mention fire. But treating wood and combining it with other materials can improve its properties. Cross-laminated timber is engineered wood. An adhesive is used to stick layers of solid-sawn timber together, crosswise, to form building blocks. This material is light but has the strength of concrete and steel. Construction experts say that wooden buildings can be constructed at a greater speed than ones of concrete and steel and the process, it seems, is quieter.

F Stora Enso is Europe's biggest supplier of cross-laminated timber, and its vice-president Markus Mannström reports that the company is seeing increasing demand globally for building in wood, with climate change concerns the key driver. Finland, with its large forests, where Stora Enso is based, has been leading the way, but the company is seeing a rise in demand for its timber products across the world, including in Asia. Of course, using timber in a building also locks away the carbon that it absorbed as it grew. But even treated wood has its limitations and only when a wider range of construction projects has been proven in practice will it be possible to see wood as a real alternative to concrete in constructing tall buildings.

G Fly ash and slag from iron ore are possible alternatives to cement in a concrete mix. Fly ash, a byproduct of coal-burning power plants, can be incorporated into concrete mixes to make up as much as 15 to 30% of the cement, without harming the strength or durability of the resulting mix. Iron-ore slag, a byproduct of the iron-ore smelting process, can be used in a similar way. Their incorporation into concrete mixes has the potential to reduce greenhouse gas emissions.

But Anna Surgenor, of the UK's Green Building Council, notes that although these waste products can save carbon in the concrete mix, their use is not always straightforward. 'It's possible to replace the cement content in concrete with waste products to lower the overall carbon impact. But there are several calculations that need to be considered across the entire life cycle of the building – these include factoring in where these materials are being shipped from. If they are transported over long distances, using fossil fuels, the use of alternative materials might not make sense from an overall carbon reduction perspective.'

H While these technologies are all promising ideas, they are either unproven or based on materials that are not abundant. In their overview of innovation in the concrete industry, Felix Preston and Johanna Lehne of the UK's Royal Institute of International Affairs reached the conclusion that, 'Some novel cements have been discussed for more than a decade within the research community, without breaking through. At present, these alternatives are rarely as cost-effective as conventional cement, and they face raw-material shortages and resistance from customers.'`,
      questions: [
        { id: 'Q1', type: 'map-label', question: 'an explanation of the industrial processes that create potential raw materials for concrete', answer: 'G' },
        { id: 'Q2', type: 'map-label', question: 'a reference to the various locations where high-rise wooden buildings can be found', answer: 'D' },
        { id: 'Q3', type: 'map-label', question: 'an indication of how widely available the raw materials of concrete are', answer: 'C' },
        { id: 'Q4', type: 'map-label', question: 'the belief that more high-rise wooden buildings are needed before wood can be regarded as a viable construction material', answer: 'F' },
        { id: 'Q5', type: 'fill-blank', question: 'Wood is a traditional building material, but current environmental concerns are encouraging 5 ____ to use wood in modern construction projects.', answer: 'architects' },
        { id: 'Q6', type: 'fill-blank', question: 'as 6 ____ in the atmosphere enters wood, it increases in size', answer: 'moisture' },
        { id: 'Q7', type: 'fill-blank', question: '7 ____ of solid wood are glued together to create building blocks', answer: 'layers' },
        { id: 'Q8', type: 'fill-blank', question: 'in terms of the 8 ____ with which they can be constructed and how much noise is generated by the process', answer: 'speed' },
        { id: 'Q9', type: 'map-label', question: 'The environmental advantage of cement alternatives may not be as great as initially assumed.', answer: 'C' },
        { id: 'Q10', type: 'map-label', question: 'It would be hard to create a construction alternative to concrete that offers so many comparable benefits.', answer: 'A' },
        { id: 'Q11', type: 'map-label', question: 'Worries about the environment have led to increased interest in wood as a construction material.', answer: 'B' },
        { id: 'Q12', type: 'map-label', question: 'Expense has been a factor in the negative response to the development of new cements.', answer: 'D' },
        { id: 'Q13', type: 'map-label', question: 'The environmental damage caused by concrete is due to it being produced in large quantities.', answer: 'A' },
      ],
    },
    {
      title: 'The steam car',
      image: 'mock/cam18-test3-reading-headings.png',
      passage: `A When primitive automobiles first began to appear in the 1800s, their engines were based on steam power. Steam had already enjoyed a long and successful career in the railways, so it was only natural that the technology evolved into a miniaturized version which was separate from the trains. But these early cars inherited steam's weaknesses along with its strengths. The boilers had to be lit by hand, and they required about twenty minutes to build up pressure before they could be driven. Furthermore, their water reservoirs only lasted for about thirty miles before needing replenishment. Despite such shortcomings, these newly designed self-propelled carriages offered quick transportation, and by the early 1900s it was not uncommon to see such machines shuttling wealthy citizens around town.

B But the glory days of steam cars were few. A new technology called the Internal Combustion Engine soon appeared, which offered the ability to drive down the road just moments after starting up. At first, these noisy gasoline cars were unpopular because they were more complicated to operate and they had difficult hand-crank starters, which were known to break arms when the engines backfired. But in 1912 General Motors introduced the electric starter, and over the following few years steam power was gradually phased out.

C Even as the market was declining, four brothers made one last effort to rekindle the technology. Between 1906 and 1909, while still attending high school, Abner Doble and his three brothers built their first steam car in their parents' basement. It comprised parts taken from a wrecked early steam car but reconfigured to drive an engine of their own design. Though it did not run well, the Doble brothers went on to build a second and third prototype in the following years. Though the Doble boys' third prototype, nicknamed the Model B, still lacked the convenience of an internal combustion engine, it drew the attention of automobile trade magazines due to its numerous improvements over previous steam cars. The Model B proved to be superior to gasoline automobiles in many ways. Its high-pressure steam drove the engine pistons in virtual silence, in contrast to clattering gas engines which emitted the aroma of burned hydrocarbons. Perhaps most impressively, the Model B was amazingly swift. It could accelerate from zero to sixty miles per hour in just fifteen seconds, a feat described as 'remarkable acceleration' by Automobile magazine in 1914.

D The following year Abner Doble drove the Model B from Massachusetts to Detroit in order to seek investment in his automobile design, which he used to open the General Engineering Company. He and his brothers immediately began working on the Model C, which was intended to expand upon the innovations of the Model B. The brothers added features such as a key-based ignition in the cabin, eliminating the need for the operator to manually ignite the boiler. With these enhancements, the Dobles' new car company promised a steam vehicle which would provide all of the convenience of a gasoline car, but with much greater speed, much simpler driving controls, and a virtually silent powerplant. By the following April, the General Engineering Company had received 5,390 deposits for Doble Detroits, which were scheduled for delivery in early 1918.

E Later that year Abner Doble delivered unhappy news to those eagerly awaiting the delivery of their modern new cars. Those buyers who received the handful of completed cars complained that the vehicles were sluggish and erratic, sometimes going in reverse when they should go forward. The new engine design, though innovative, was still plagued with serious glitches.

F The brothers made one final attempt to produce a viable steam automobile. In early 1924, the Doble brothers shipped a Model E to New York City to be road-tested by the Automobile Club of America. After sitting overnight in freezing temperatures, the car was pushed out into the road and left to sit for over an hour in the frosty morning air. At the turn of the key, the boiler lit and reached its operating pressure inside of forty seconds. As they drove the test vehicle further, they found that its evenly distributed weight lent it surprisingly good handling, even though it was so heavy. As the new Doble steamer was further developed and tested, its maximum speed was pushed to over a hundred miles per hour, and it achieved about fifteen miles per gallon of kerosene with negligible emissions.

G Sadly, the Dobles' brilliant steam car never was a financial success. Priced at around $18,000 in 1924, it was popular only among the very wealthy. Plus, it is said that no two Model Es were quite the same, because Abner Doble tinkered endlessly with the design. By the time the company folded in 1931, fewer than fifty of the amazing Model E steam cars had been produced. For his whole career, until his death in 1961, Abner Doble remained adamant that steam-powered automobiles were at least equal to gasoline cars, if not superior. Given the evidence, he may have been right. Many of the Model E Dobles which have survived are still in good working condition, some having been driven over half a million miles with only normal maintenance. Astonishingly, an unmodified Doble Model E runs clean enough to pass the emissions laws in California today, and they are pretty strict. It is true that the technology poses some difficult problems, but you cannot help but wonder how efficient a steam car might be with the benefit of modern materials and computers. Under the current pressure to improve automotive performance and reduce emissions, it is not unthinkable that the steam car may rise again.`,
      questions: [
        { id: 'Q14', type: 'map-label', question: 'Paragraph A', answer: 'iii' },
        { id: 'Q15', type: 'map-label', question: 'Paragraph B', answer: 'viii' },
        { id: 'Q16', type: 'map-label', question: 'Paragraph C', answer: 'vi' },
        { id: 'Q17', type: 'map-label', question: 'Paragraph D', answer: 'v' },
        { id: 'Q18', type: 'map-label', question: 'Paragraph E', answer: 'vii' },
        { id: 'Q19', type: 'map-label', question: 'Paragraph F', answer: 'i' },
        { id: 'Q20', type: 'map-label', question: 'Paragraph G', answer: 'iv' },
        { id: 'Q21', type: 'multiple-choice', question: 'What point does the writer make about the steam car in Paragraph B?', options: ['A Its success was short-lived.', 'B Not enough cars were made.', 'C Car companies found them hard to sell.', 'D People found them hard to drive.'], answer: 0 },
        { id: 'Q22', type: 'multiple-choice', question: 'When building their first steam car, the Doble brothers', options: ['A constructed all the parts themselves.', 'B made written notes at each stage of the construction.', 'C needed several attempts to achieve a competitive model.', 'D sought the advice of experienced people in the car industry.'], answer: 2 },
        { id: 'Q23', type: 'multiple-choice', question: 'In order to produce the Model C, the Doble brothers', options: ['A moved production to a different city.', 'B raised financial capital.', 'C employed an additional worker.', 'D abandoned their earlier designs.'], answer: 1 },
        { id: 'Q24', type: 'fill-blank', question: 'A later version of the Model E raised its 24 ____, while keeping its emissions extremely low.', answer: 'speed' },
        { id: 'Q25', type: 'fill-blank', question: 'Under 25 ____ cars were produced before the company went out of business.', answer: ['fifty', '50'] },
        { id: 'Q26', type: 'fill-blank', question: 'They are straightforward to maintain, and they satisfy California\'s 26 ____ emissions laws.', answer: 'strict' },
      ],
    },
    {
      title: 'The case for mixed-ability classes',
      image: 'mock/cam18-test3-reading-phrases.png',
      passage: `Picture this scene. It's an English literature lesson in a UK school, and the teacher has just read an extract from Shakespeare's Romeo and Juliet with a class of 15-year-olds. He's given some of the students copies of No Fear Shakespeare, a kid-friendly translation of the original. For three students, even these literacy demands are beyond them. Another girl simply can't focus and he gives her pens and paper to draw with. The teacher can ask the No Fear group to identify the key characters and maybe provide a tentative plot summary. He can ask most of the class about character development, and five of them might be able to support their statements with textual evidence. Now two curious students are wondering whether Shakespeare advocates living a life of moderation or one of passionate engagement.

As a teacher myself, I'd think my lesson would be going rather well if the discussion went as described above. But wouldn't this kind of class work better if there weren't such a huge gap between the top and the bottom? If we put all the kids who needed literacy support into one class, and all the students who want to discuss the virtue of moderation into another?

The practice of 'streaming', or 'tracking', involves separating students into classes depending on their diagnosed levels of attainment. At a macro level, it requires the establishment of academically selective schools for the brightest students, and comprehensive schools for the rest. Within schools, it means selecting students into a 'stream' of general ability, or 'sets' of subject-specific ability. The practice is intuitively appealing to almost every stakeholder.

I have heard the mixed-ability model attacked by way of analogy: a group hike. The fittest in the group take the lead and set a brisk pace, only to have to stop and wait every 20 minutes. This is frustrating, and their enthusiasm wanes. Meanwhile, the slowest ones are not only embarrassed but physically struggling to keep up. What's worse, they never get a long enough break. They honestly just want to quit. Hiking, they feel, is not for them.

Mixed-ability classes bore students, frustrate parents and burn out teachers. The brightest ones will never summit Mount Qomolangma, and the stragglers won't enjoy the lovely stroll in the park they are perhaps more suited to. Individuals suffer at the demands of the collective, mediocrity prevails. So: is learning like hiking?

The current pedagogical paradigm is arguably that of constructivism, which emerged out of the work of psychologist Lev Vygotsky. In the 1930s, Vygotsky emphasised the importance of targeting a student's specific 'zone of proximal development' (ZPD). This is the gap between what they can achieve only with support – teachers, textbooks, worked examples, parents and so on – and what they can achieve independently. The purpose of teaching is to provide and then gradually remove this 'scaffolding' until they are autonomous. If we accept this model, it follows that streaming students with similar ZPDs would be an efficient and effective solution. And that forcing everyone on the same hike – regardless of aptitude – would be madness.

Despite all this, there is limited empirical evidence to suggest that streaming results in better outcomes for students. Professor John Hattie, director of the Melbourne Education Research Institute, notes that 'tracking has minimal effects on learning outcomes'. What is more, streaming appears to significantly – and negatively – affect those students assigned to the lowest sets. These students tend to have much higher representation of low socioeconomic class. Less significant is the small benefit for those lucky clever students in the higher sets. The overall result is that the smart stay smart and the dumb get dumber, further entrenching the social divide.

In the latest update of Hattie's influential meta-analysis of factors influencing student achievement, one of the most significant factors is the teachers' estimate of achievement. Streaming students by diagnosed achievement automatically limits what the teacher feels the student is capable of. Meanwhile, in a mixed environment, teachers' estimates need to be more diverse and flexible.

While streaming might seem to help teachers effectively target a student's ZPD, it can underestimate the importance of peer-to-peer learning. A crucial aspect of constructivist theory is the role of the MKO – 'more-knowledgeable other' – in knowledge construction. While teachers are traditionally the MKOs in classrooms, the value of knowledgeable student peers must not go unrecognised either.

I find it amazing to watch students get over an idea to their peers in ways that I would never think of. They operate with different language tools and different social tools from teachers and, having just learnt it themselves, they possess similar cognitive structures to their struggling classmates. There is also something exciting about passing on skills and knowledge that you yourself have just mastered – a certain pride and zeal, a certain freshness to the interaction between 'teacher' and 'learner' that is often lost by the expert for whom the steps are obvious and the joy of discovery forgotten.

Having a variety of different abilities in a collaborative learning environment provides valuable resources for helping students meet their learning needs, not to mention improving their communication and social skills. And today, more than ever, we need the many to flourish – not suffer at the expense of a few bright stars. Once a year, I go on a hike with my class, a mixed bunch of students. It is challenging. The fittest students realise they need to encourage the reluctant. There are lookouts who report back, and extra items to carry for others. We make it – together.`,
      questions: [
        { id: 'Q27', type: 'multiple-choice', question: 'The writer describes the Romeo and Juliet lesson in order to demonstrate', options: ['A how few students are interested in literature.', 'B how a teacher handles a range of learning needs.', 'C how unsuitable Shakespeare is for most teenagers.', 'D how weaker students can disrupt their classmates\' learning.'], answer: 1 },
        { id: 'Q28', type: 'multiple-choice', question: 'What does the writer say about streaming in the third paragraph?', options: ['A It has a very broad appeal.', 'B It favours cleverer students.', 'C It is relatively simple to implement.', 'D It works better in some schools than others.'], answer: 0 },
        { id: 'Q29', type: 'multiple-choice', question: 'What idea is suggested by the reference to Mount Qomolangma in the fifth paragraph?', options: ['A students following unsuitable paths', 'B students attempting interesting tasks', 'C students not achieving their full potential', 'D students not being aware of their limitations'], answer: 2 },
        { id: 'Q30', type: 'multiple-choice', question: 'What does the word \'scaffolding\' in the sixth paragraph refer to?', options: ['A the factors which prevent a student from learning effectively', 'B the environment where most of a student\'s learning takes place', 'C the assistance given to a student in their initial stages of learning', 'D the setting of appropriate learning targets for a student\'s aptitude'], answer: 2 },
        { id: 'Q31', type: 'map-label', question: 'there is very little indication that streaming leads to 31 ____', answer: 'H' },
        { id: 'Q32', type: 'map-label', question: 'the most significant impact is on those students placed in the 32 ____', answer: 'D' },
        { id: 'Q33', type: 'map-label', question: 'especially where a large proportion of them have 33 ____', answer: 'F' },
        { id: 'Q34', type: 'map-label', question: 'Meanwhile, for the 34 ____, there appears to be only minimal advantage', answer: 'E' },
        { id: 'Q35', type: 'map-label', question: 'teachers tend to have 35 ____ of students in streamed groups', answer: 'B' },
        { id: 'Q36', type: 'tfng', question: 'The Vygotsky model of education supports the concept of a mixed-ability class.', options: ['YES', 'NO', 'NOT GIVEN'], answer: 1 },
        { id: 'Q37', type: 'tfng', question: 'Some teachers are uncertain about allowing students to take on MKO roles in the classroom.', options: ['YES', 'NO', 'NOT GIVEN'], answer: 2 },
        { id: 'Q38', type: 'tfng', question: 'It can be rewarding to teach knowledge which you have only recently acquired.', options: ['YES', 'NO', 'NOT GIVEN'], answer: 0 },
        { id: 'Q39', type: 'tfng', question: 'The priority should be to ensure that the highest-achieving students attain their goals.', options: ['YES', 'NO', 'NOT GIVEN'], answer: 1 },
        { id: 'Q40', type: 'tfng', question: 'Taking part in collaborative outdoor activities with teachers and classmates can improve student outcomes in the classroom.', options: ['YES', 'NO', 'NOT GIVEN'], answer: 2 },
      ],
    },
  ],
}
