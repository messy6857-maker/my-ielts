<script setup lang="ts">
import raw from './reading538words'
import type { DeckCard } from '../../components/KeywordFlashcard.vue'

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

const audioFor = (word: string) => `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`
</script>

<template>
  <div class="bg-gray-50 dark:bg-gray-900 px-4 pt-6 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <ReadingTabs />
    </div>
  </div>
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
