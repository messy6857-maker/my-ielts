<script setup lang="ts">
import { computed } from 'vue'
import { highlightPieces } from '../utils/text'

const props = withDefaults(
  defineProps<{
    text: string
    words: string[]
    colors?: string[]
    marking?: boolean
  }>(),
  { colors: () => [], marking: false },
)
const pieces = computed(() =>
  highlightPieces(props.text, props.words).map((piece, id) => ({
    ...piece,
    id,
  })),
)
</script>

<template>
  <template v-for="piece in pieces" :key="piece.id">
    <mark v-if="piece.highlighted && marking" class="user-mark">{{
      piece.text
    }}</mark>
    <span
      v-else-if="piece.highlighted"
      class="font-bold"
      :class="colors[piece.index % colors.length]"
    >{{ piece.text }}</span>
    <template v-else>
      {{ piece.text }}
    </template>
  </template>
</template>
