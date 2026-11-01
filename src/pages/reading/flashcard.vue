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
    pos: (w[2] || []).join(' ') || '短语',
    meaning: (w[3] || []).join('；'),
    synonyms: w[4] || [],
    remark: w[5] || '',
  })),
)

function audioFor(word: string) {
  // 星号词（that* 等）的 * 只作界面标记：发音接口不认 *，先去掉
  const clean = word.replace(/\*/g, '')
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=1`
}
</script>

<template>
  <div class="bg-gray-50 px-4 pt-6 dark:bg-gray-900 lg:px-8 sm:px-6">
    <div class="mx-auto max-w-2xl">
      <ReadingTabs />
    </div>
  </div>
  <KeywordFlashcard
    ns="reading538"
    title="阅读 376 自测"
    subtitle="看到单词先凭感觉自评，重点记同义替换"
    back-to="/reading"
    back-label="返回考点词"
    :cards="cards"
    :audio-for="audioFor"
    mistake-module="reading"
    progress-module="reading_flashcard"
  />
</template>
