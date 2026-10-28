<script setup>
import { speechLanguage, useAudioGroup } from '../../composables/useAudioGroup'

import { resolveAudioUrl } from '../../composables/useAudio'
import words from './listening179.json'

const managedAudio = useAudioGroup()

const ws = reactive(
  words.map((v) => {
    const item = {
      ...v,
      form: {
        word: '',
        replaceStr: '',
      },
      result: {
        checked: false,
        errorWords: [],
      },
    }
    return item
  }),
)

const { addMistake, decrementMistake } = useMistakes()
const { setProgress } = useProgress()

function onKeydown(e, word) {
  if (e.key === '`') {
    e.preventDefault()
    play(word)
  }
}

let audio = null
function play(word) {
  // 复用单个 audio，播放前先停旧的；MP3 缺失时用浏览器朗读兜底（只触发一次）
  speechSynthesis.cancel()
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  audio = managedAudio.create()
  audio.src = resolveAudioUrl(`179_audios/${word}.mp3`)
  let fellBack = false
  const fallback = () => {
    if (fellBack)
      return
    fellBack = true
    const u = new SpeechSynthesisUtterance(word)
    u.lang = speechLanguage()
    speechSynthesis.speak(u)
  }
  audio.onerror = fallback
  audio.play().catch(fallback)
}
function next(index) {
  const i = index + 1
  const isLast = i >= words.length

  // 校验结果（最后一词同样先跑完校验、记错词、推进度，再结束）
  const cw = ws[index]

  // 处理词
  const practiceWord = cw.form.word.trim().toLowerCase()
  const practiceReplace = cw.form.replaceStr
    .split(/[,，]/)
    .map(v => v.trim().toLowerCase().replace(/\s+/g, ' '))
  // window.console.log(practiceReplace, practiceWord)

  // 重复检查守卫：同一行已记过错时不再重复记错；改对后递减一次（与自测卡片 goBackOne 语义对齐）
  const hadErrors = cw.result.checked && cw.result.errorWords.length > 0
  const errorWords = []
  if (practiceWord !== cw.word.trim().toLowerCase())
    errorWords.push(cw.word)

  errorWords.push(
    ...cw.replace.filter((w) => {
      return !practiceReplace.includes(
        w.trim().toLowerCase().replace(/\s+/g, ' '),
      )
    }),
  )
  cw.result.checked = true
  cw.result.errorWords = errorWords

  if (errorWords.length > 0) {
    // 有错词：首次记错才记入错词本（仍错的重复检查不重复记）
    if (!hadErrors) {
      addMistake('listening', {
        key: `listening179:${cw.index}`,
        title: cw.word,
        detail: `${cw.type} ${cw.meaning}；同义替换：${cw.replace.join(' / ')}`,
      })
    }
  }
  else if (hadErrors) {
    // 上次记错、本次改对：错题计数减一
    decrementMistake(`listening179:${cw.index}`)
  }
  setProgress('listening', index + 1, words.length)

  // window.console.log(cw)

  // 最后一词：校验与进度已完成，不再播下一个词/移光标
  if (isLast)
    return
  const nw = words[i]
  play(nw.word)
  // 光标移动到下一个输入框
  document.getElementById(`input_${i + 1}`)?.focus()
}
</script>

<template>
  <div>
    <div class="mt-6 items-center justify-between lg:flex">
      <div class="mb-4 lg:mb-0">
        <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
          听力 179 考点词练习
        </h3>
        <ul
          class="ml-4 list-decimal text-sm font-normal text-gray-500 dark:text-gray-400"
        >
          <li>
            同义替换多个词使用英文逗号
            <kbd
              class="rounded-lg bg-gray-100 px-2 text-xs font-semibold text-gray-800 dark:border-gray-500 dark:bg-gray-600 dark:text-gray-100"
            >,</kbd>
            分割
          </li>
          <li>
            音频会在切换下一个词、点击喇叭图表、按键
            <kbd
              class="rounded-lg bg-gray-100 px-2 text-xs font-semibold text-gray-800 dark:border-gray-500 dark:bg-gray-600 dark:text-gray-100"
            >`</kbd>（数字 1 左边那个）播放
          </li>
          <li>
            输入完考点词按 Tab 切换到同义词，输入完同义词按 Enter
            自动检查并切换到下一个词
          </li>
          <li>单词之间多个空格，逗号后是否有空格不影响结果判断</li>
        </ul>
      </div>
      <div class="items-center sm:flex">
        <div class="flex items-center">
          <button
            type="button"
            class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="
              () => {
                play(words[0].word)
              }
            "
          >
            开始
          </button>
        </div>
      </div>
    </div>
    <div class="relative mt-4 overflow-x-auto">
      <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
        <thead
          class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400"
        >
          <tr>
            <th class="w-0 px-6 py-3">
              #
            </th>

            <th class="w-0 px-6 py-3">
              词性
            </th>
            <th class="w-20 px-6 py-3">
              音频
            </th>
            <th class="px-6 py-3">
              考点词/同义替换
            </th>
            <th class="px-6 py-3">
              结果
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(w, i) in ws"
            :key="w.index"
            class="border-b bg-white dark:border-gray-700 dark:bg-gray-800"
          >
            <td class="px-6 py-4">
              {{ w.index }}
            </td>
            <td class="px-6 py-4 italic">
              {{ w.type }}
            </td>
            <td class="px-6 py-4">
              <button class="i-carbon-volume-up-filled" @click="play(w.word)" />
            </td>
            <td
              class="flex flex-row items-center justify-start px-6 py-4"
              @keydown="onKeydown($event, w.word)"
            >
              <input
                :id="`input_${w.index}`"
                v-model="w.form.word"
                p="x-2 y-1"
                w="150px"
                bg="transparent"
                border="~ rounded gray-200 dark:gray-700"
                outline="none active:none"
                spellcheck="false"
                type="text"
                placeholder="请输入..."
              >
              <div class="px-4">
                {{ w.meaning }}
              </div>
              <input
                v-model="w.form.replaceStr"
                p="x-2 y-1"
                w="300px"
                bg="transparent"
                border="~ rounded gray-200 dark:gray-700"
                outline="none active:none"
                type="text"
                spellcheck="false"
                placeholder="请输入..."
                @keydown.enter="next(i)"
              >
            </td>
            <td class="px-6 py-4">
              <i
                v-if="w.result.checked && w.result.errorWords.length < 1"
                class="i-carbon-checkmark block text-green-700"
              />
              <p v-if="w.result.checked && w.result.errorWords.length > 0">
                {{ w.result.errorWords.join(', ') }}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
