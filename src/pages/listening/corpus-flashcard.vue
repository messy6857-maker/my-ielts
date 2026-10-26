<script setup lang="ts">
import corpusData from './spelling_convention'
import type { DeckCard } from '../../components/KeywordFlashcard.vue'
import { resolveAudioUrl } from '../../composables/useAudio'

defineOptions({ name: 'CorpusFlashcardPage' })

const cards: DeckCard[] = []

// Chapter2: [British, American, Meaning]，取第一个拼写为主词
// r[0] 可能是字符串或数组（语料库页改写后），两种都兼容
const firstCell = (r: any): string => {
  const v = Array.isArray(r[0]) ? r[0][0] : r[0]
  return typeof v === 'string' ? v : ''
}
const ch2 = (corpusData as any)['Chapter2 拼写规范']
if (ch2) {
  ch2.rows.forEach((r: string[], i: number) => {
    const word = firstCell(r).split(', ')[0]
    cards.push({
      id: `ch2-${i}`,
      word,
      pos: '',
      meaning: r[2],
      synonyms: r[1] ? [r[1]] : [],
    })
  })
}

// Chapter3: [Word, 注意, Meaning]
const ch3 = (corpusData as any)['Chapter3 特别名词']
if (ch3) {
  ch3.rows.forEach((r: string[], i: number) => {
    cards.push({
      id: `ch3-${i}`,
      word: firstCell(r),
      pos: '',
      meaning: `${r[2]}（${r[1]}）`,
      synonyms: [],
    })
  })
}

// Chapter4: [Word, 词性, Meaning]
const ch4 = (corpusData as any)['Chapter4 形容词副词']
if (ch4) {
  ch4.rows.forEach((r: string[], i: number) => {
    cards.push({
      id: `ch4-${i}`,
      word: firstCell(r),
      pos: r[1] || '',
      meaning: r[2],
      synonyms: [],
    })
  })
}

// 媒体站绝对地址（见 useAudio.ts）
const audioFor = (word: string) => resolveAudioUrl(`179_audios/${word}.mp3`)
</script>

<template>
  <KeywordFlashcard
    ns="corpus"
    title="听力王语料库自测"
    subtitle="拼写规范 · 特别名词 · 形容词副词，看到单词先凭感觉自评"
    back-to="/listening/corpus"
    back-label="返回语料库"
    :cards="cards"
    :audio-for="audioFor"
    mistake-module="listening"
    progress-module="corpus_flashcard"
  />
</template>
