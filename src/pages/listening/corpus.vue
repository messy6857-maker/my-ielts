<script setup>
import { RouterLink } from 'vue-router'
import { speechLanguage, useAudioGroup } from '../../composables/useAudioGroup'

import { resolveAudioUrl } from '../../composables/useAudio'
import chapterData from './spelling_convention'

const managedAudio = useAudioGroup()

let audio = null
function play(word) {
  // word 可能是数组（多拼写），取第一个
  const w = Array.isArray(word) ? word[0] : word
  // 新播放先停旧音频、取消旧朗读，避免叠加
  speechSynthesis.cancel()
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  audio = managedAudio.create()
  audio.src = resolveAudioUrl(`179_audios/${w}.mp3`)
  // MP3 不存在时用浏览器朗读兜底（onerror 与 play().catch 只触发一次）
  let fellBack = false
  const fallback = () => {
    if (fellBack)
      return
    fellBack = true
    const u = new SpeechSynthesisUtterance(w)
    u.lang = speechLanguage()
    speechSynthesis.speak(u)
  }
  audio.onerror = fallback
  audio.play().catch(fallback)
}

const keyword = ref('')
const chapter = ref('Chapter2 拼写规范')
const chapters = [
  'Chapter2 拼写规范',
  'Chapter3 特别名词',
  'Chapter4 形容词副词',
]

const curChapter = computed(() => {
  const ch = chapterData[chapter.value]
  if (!ch)
    return ch
  // 深拷贝 rows 再 split，绝不改写共享数据模块（否则自测页读到数组会崩）
  const rows = ch.rows.map((row) => {
    const copy = [...row]
    if (typeof copy[0] === 'string')
      copy[0] = copy[0].split(', ')
    return copy
  })
  return { ...ch, rows }
})

// 搜索框：按关键词过滤当前章节，任一单元格包含即命中（忽略大小写）
const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const rows = curChapter.value?.rows ?? []
  if (!kw)
    return rows
  return rows.filter(row =>
    row.some(cell =>
      String(Array.isArray(cell) ? cell.join(', ') : cell)
        .toLowerCase()
        .includes(kw),
    ),
  )
})
</script>

<template>
  <!-- Card header -->
  <div class="mt-6 items-center justify-between lg:flex">
    <div class="mb-4 lg:mb-0">
      <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
        听力真题语料库
      </h3>
      <span class="text-base font-normal text-gray-500 dark:text-gray-400">包括各种词性、特殊训练</span>
      <div class="mt-3">
        <RouterLink
          to="/listening/corpus-flashcard"
          class="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🃏 进入自测卡片
        </RouterLink>
      </div>
    </div>
    <div class="items-center sm:flex">
      <div class="flex items-center">
        <select
          v-model="chapter"
          class="block w-full flex-1 border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
        >
          <!-- <option value="">
            全部章节
          </option> -->
          <option v-for="k in chapters" :key="k" :value="k">
            {{ k }}
          </option>
        </select>
        <div class="relative ml-2 flex-1">
          <div
            class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
          >
            <svg
              class="h-4 w-4 text-gray-500 dark:text-gray-400"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 20 20"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"
              />
            </svg>
          </div>
          <input
            v-model="keyword"
            type="search"
            class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
            placeholder="Search"
          >
        </div>
      </div>
    </div>
  </div>
  <div class="mt-6">
    <template v-if="chapter in chapterData">
      <div class="mb-4 mt-6 items-center justify-between lg:flex">
        <div class="mb-4 lg:mb-0">
          <h3 class="mb-2 font-bold text-gray-900 dark:text-white">
            {{ curChapter.title }}
          </h3>
          <span
            class="text-base font-normal text-gray-500 dark:text-gray-400"
          >{{ curChapter.desc }}</span>
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg">
        <table
          class="min-w-[640px] w-full text-left text-sm text-gray-500 dark:text-gray-400"
        >
          <thead
            class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400"
          >
            <tr>
              <th class="w-0 px-6 py-3">
                #
              </th>
              <th class="w-0">
                <!-- Pronunciation -->
              </th>
              <th
                v-for="label in curChapter.columns"
                :key="label"
                class="w-0 px-6 py-3"
              >
                {{ label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row[0]"
              class="border-b bg-white dark:border-gray-700 dark:bg-gray-800"
            >
              <td class="px-6 py-4">
                {{ curChapter.rows.indexOf(row) + 1 }}
              </td>
              <td class="px-6 py-4">
                <a
                  href="javascript:;"
                  class="i-carbon-volume-up-filled block"
                  @click="play(row[0])"
                />
              </td>
              <th
                class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white"
              >
                <a
                  class="hover:underline"
                  :title="`在剑桥词典中查询 ${row[0][0]}`"
                  :href="`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${row[0][0]}`"
                  target="_blank" rel="noopener noreferrer"
                >{{ row[0].join(', ') }}</a>
              </th>
              <td
                class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white"
              >
                {{ row[1] }}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                {{ row[2] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <!-- <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
      <thead class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
        <tr>
          <th class="w-0 px-6 py-3">
            #
          </th>
          <th class="w-0 px-6 py-3" />
          <th scope="col" class="w-0 px-6 py-3">
            考点词
          </th>
          <th scope="col" class="w-0 px-6 py-3">
            词性
          </th>
          <th scope="col" class="w-80 px-6 py-3">
            词义
          </th>
          <th scope="col" class="px-6 py-3">
            同义替换
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="w in ws" :key="w.index" class="border-b bg-white dark:border-gray-700 dark:bg-gray-800">
          <td class="px-6 py-4">
            {{ w.index }}
          </td>
          <td class="px-6 py-4">
            <a href="javascript:;" class="i-carbon-volume-up-filled block" @click="play(w.word)" />
          </td>
          <th scope="row" class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">
            <a
              :href="`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${w.word}`"
              target="_blank" rel="noopener noreferrer"
            >{{ w.word }}</a>
          </th>
          <td class="px-6 py-4 italic">
            {{ w.type }}
          </td>
          <td class="px-6 py-4">
            {{ w.meaning }}
          </td>
          <td class="px-6 py-4">
            {{ w.replace.join(', ') }}
          </td>
        </tr>
      </tbody>
    </table> -->
  </div>
</template>
