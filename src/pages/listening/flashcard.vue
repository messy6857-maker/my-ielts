<script setup lang="ts">
import words from './listening179.json'
import type { DeckCard } from '../../components/KeywordFlashcard.vue'

defineOptions({ name: 'ListeningFlashcardPage' })

const cards: DeckCard[] = (words as any[]).map(w => ({
  id: w.index,
  word: w.word,
  pos: w.type || '',
  meaning: w.meaning,
  synonyms: Array.isArray(w.replace) ? w.replace : [],
}))

// 相对路径，自动适配部署基址（/my-ielts/）
const audioFor = (word: string) => `179_audios/${word}.mp3`
</script>

<template>
  <KeywordFlashcard
    ns="listening179"
    title="听力 179 自测"
    subtitle="看到单词先凭感觉自评，重点记同义替换"
    back-to="/listening/keyword"
    back-label="返回考点词"
    :cards="cards"
    :audio-for="audioFor"
    mistake-module="listening"
    progress-module="listening_flashcard"
  />
</template>
