<script setup lang="ts">
import type { DeckCard } from '../../components/KeywordFlashcard.vue'
import raw from './reading538words'

defineOptions({ name: 'ReadingFlashcardPage' })

interface RawCat {
  title: string
  words: [number, string, string[], string[], string[], string][]
}

const cards: DeckCard[] = (raw as unknown as RawCat[]).flatMap(cat =>
  cat.words.map(w => ({
    id: `${cat.title}-${w[0]}`,
    word: w[1],
    pos: (w[2] || []).join(' '),
    meaning: (w[3] || []).join('；'),
    synonyms: w[4] || [],
  })),
)

const audioFor = (word: string) => `https://dict.youdao.com/dictvoice?audio=${word}&type=1`
</script>

<template>
  <KeywordFlashcard
    ns="reading538"
    title="阅读 538 自测"
    subtitle="看到单词先凭感觉自评，重点记同义替换"
    back-to="/reading"
    back-label="返回考点词"
    :cards="cards"
    :audio-for="audioFor"
    mistake-module="reading"
    progress-module="reading_flashcard"
  />
</template>
