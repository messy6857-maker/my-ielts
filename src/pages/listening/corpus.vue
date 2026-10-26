<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAudioPlayer } from '../../composables/useSingleAudio'
import chapterData from './spelling_convention'

const audioPlayer = useAudioPlayer()
const audioError = ref('')
async function play(words: string[]) {
  audioError.value = ''
  const word = words[0]
  if (!await audioPlayer.play(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`))
    audioError.value = '发音加载失败，请检查网络后重试'
}
const keyword = ref('')
const chapter = ref('Chapter2 拼写规范')
const chapters = ['Chapter2 拼写规范', 'Chapter3 特别名词', 'Chapter4 形容词副词']
const curChapter = computed(() => {
  const data = chapterData[chapter.value as keyof typeof chapterData]
  if (!data) return null
  const needle = keyword.value.trim().toLocaleLowerCase()
  return { ...data, rows: data.rows.map(row => ({
    british: row[0].split(/,\s*/), american: row[1], meaning: row[2],
  })).filter(row => `${row.british.join(' ')} ${row.american} ${row.meaning}`.toLocaleLowerCase().includes(needle)) }
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
          <option
            v-for="k in chapters"
            :key="k"
            :value="k"
          >
            {{ k }}
          </option>
        </select>
        <div class="relative ml-2 flex-1">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg class="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
            </svg>
          </div>
          <input
            v-model="keyword"
            type="search"
            class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400" placeholder="Search"
          >
        </div>
      </div>
    </div>
  </div>
  <div class="mt-6">
    <p v-if="audioError" role="alert" class="mb-4 text-red-600">
{{ audioError }}
</p>
    <template v-if="curChapter">
      <div class="mb-4 mt-6 items-center justify-between lg:flex">
        <div class="mb-4 lg:mb-0">
          <h3 class="mb-2 font-bold text-gray-900 dark:text-white">
            {{ curChapter.title }}
          </h3>
          <span class="text-base font-normal text-gray-500 dark:text-gray-400">{{ curChapter.desc }}</span>
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg">
      <table class="w-full min-w-[640px] text-left text-sm text-gray-500 dark:text-gray-400">
        <thead class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
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
            v-for="(row, index) in curChapter.rows"
            :key="row.british.join(',')"
            class="border-b bg-white dark:border-gray-700 dark:bg-gray-800"
          >
            <td class="px-6 py-4">
              {{ index + 1 }}
            </td>
            <td class="px-6 py-4">
              <a href="javascript:;" class="i-carbon-volume-up-filled block" @click="play(row.british)" />
            </td>
            <th class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">
              <a
                class="hover:underline"
                :title="`在剑桥词典中查询 ${row.british[0]}`"
                :href="`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${row.british[0]}`"
                target="_blank"
              >{{ row.british.join(', ') }}</a>
            </th>
            <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">
              {{ row.american }}
            </td>
            <td class="whitespace-nowrap px-6 py-4">
              {{ row.meaning }}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <p v-if="!curChapter.rows.length" role="status" class="p-4">
没有匹配的词条，请更换关键词。
</p>
    </template>
    <p v-else role="status" class="p-4">
本章资料待补充，请先学习 Chapter2 拼写规范。
</p>
  </div>
</template>
