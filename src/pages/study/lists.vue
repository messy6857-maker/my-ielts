<script setup lang="ts">
import type { StudyCard } from '../../utils/studyDeck'
import type { ListEntry, WordList } from '../../utils/wordLists'
import { confirmDialog } from '../../composables/useDialog'
import { loadSiteCards, loadWordLists } from '../../utils/loadStudyCards'
import { DECK_META } from '../../utils/studyDeck'
import {
  entryFromCard,
  entryId,
  fillMeanings,
  MAX_LIST_WORDS,
  mergeEntries,
  newList,
  parseImport,
  readLists,
  saveLists,
} from '../../utils/wordLists'

// 我的词表：新建词表，往里加词（粘贴、上传文件、从网站词库里选），改释义、删词。
// 建好的词表在学新词、复习到期的词、练拼写里当一个词库用。
defineOptions({ name: 'StudyListsPage' })

const { currentUser } = useAuth()
const lists = ref<WordList[]>(readLists())
const selectedId = ref('')
const selected = computed(() => lists.value.find(l => l.id === selectedId.value) ?? null)
const missing = computed(() => selected.value?.words.filter(w => !w.meaning).length ?? 0)

const countText = computed(() => [
  `${selected.value?.words.length ?? 0} 个词`,
  missing.value
    ? `，${missing.value} 个还没有释义`
    : '',
  '。',
].join(''))
function persist() {
  saveLists(lists.value)
}
function update(words: ListEntry[]) {
  const list = lists.value.find(l => l.id === selectedId.value)
  if (!list)
    return
  list.words = words
  list.updatedAt = Date.now()
  persist()
}

// —— 网站词库（查释义、选词用），第一次用到时才加载 ——
const siteCards = shallowRef<StudyCard[] | null>(null)
const siteError = ref(false)
let sitePromise: Promise<StudyCard[]> | null = null
function ensureSite() {
  siteError.value = false
  sitePromise ??= loadSiteCards()
    .then((cards) => {
      siteCards.value = cards
      return cards
    })
    .catch((error) => {
      sitePromise = null
      siteError.value = true
      throw error
    })
  return sitePromise
}
// 以前单词地牢、听写里的“我的词单”第一次打开时搬成一个普通词表
async function loadLists() {
  const owner = currentUser.value
  try {
    await loadWordLists()
  }
  catch {
    // 网站词库没加载出来：旧词单这次先不搬，不影响自己的词表
  }
  if (owner === currentUser.value)
    lists.value = readLists()
}

// 打开一个词表时要清空的输入：粘贴框、提示、搜索词、显示多少个词
const pasteText = ref('')
const notice = ref('')
const query = ref('')
const shown = ref(100)
// —— 词表列表 ——
const newName = ref('')
function createList() {
  const list = newList(newName.value)
  lists.value = [...lists.value, list]
  persist()
  newName.value = ''
  open(list.id)
}
function open(id: string) {
  selectedId.value = id
  notice.value = ''
  pasteText.value = ''
  query.value = ''
  shown.value = 100
}
function rename(value: string) {
  const list = lists.value.find(l => l.id === selectedId.value)
  if (!list)
    return
  list.name = value.trim().slice(0, 40) || '未命名词表'
  persist()
}
async function removeList() {
  const list = selected.value
  if (!list)
    return
  if (!(await confirmDialog(`确定删除词表“${list.name}”吗？里面的 ${list.words.length} 个词会从词表里移走，已经学过的进度还留着。`, { danger: true, confirmText: '删除' })))
    return
  lists.value = lists.value.filter(l => l.id !== list.id)
  persist()
  selectedId.value = ''
}

// —— 往词表里加词 ——
type AddMode = 'paste' | 'file' | 'site'
const addMode = ref<AddMode>('paste')
const importing = ref(false)
async function importText(text: string) {
  const list = lists.value.find(l => l.id === selectedId.value)
  if (!list || importing.value)
    return
  const { entries, skipped } = parseImport(text)
  if (!entries.length) {
    notice.value = '没有认出单词。一行写一个词，后面可以跟中文释义，比如“abandon 放弃”。'
    return
  }
  importing.value = true
  const owner = currentUser.value
  let filled = entries
  try {
    filled = fillMeanings(entries, await ensureSite())
  }
  catch {
    // 网站词库没加载出来：照样导入，没写释义的先空着
  }
  importing.value = false
  if (owner !== currentUser.value || list.id !== selectedId.value)
    return
  const before = list.words.length
  const merged = mergeEntries(list.words, filled)
  update(merged.words)
  const full = merged.words.length >= MAX_LIST_WORDS
  const noMeaning = merged.words.slice(before).filter(w => !w.meaning).length
  notice.value = [
    `加了 ${merged.added} 个词`,
    entries.length - merged.added > 0 && !full
      ? `${entries.length - merged.added} 个已经在词表里或重复`
      : '',
    skipped
      ? `${skipped} 行没认出来`
      : '',
    noMeaning
      ? `${noMeaning} 个没找到释义，可以在下面自己补`
      : '',
    full
      ? `一个词表最多 ${MAX_LIST_WORDS} 个词，多出来的没有加`
      : '',
  ].filter(Boolean).join('，').concat('。')
  pasteText.value = ''
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return
  if (file.size > 2 * 1024 * 1024) {
    notice.value = '文件太大了（超过 2MB）。请用纯文本的 txt 或 csv 文件。'
    return
  }
  try {
    await importText(await file.text())
  }
  catch {
    notice.value = '这个文件读不出来。请用纯文本的 txt 或 csv 文件，Excel 表格先另存为 csv。'
  }
}
// 从网站词库里选
const inList = computed(() => new Set(selected.value?.words.map(w => entryId(w.word)) ?? []))
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = siteCards.value
  if (!q || !all)
    return []
  const seen = new Set<string>()
  const out: StudyCard[] = []
  const add = (c: StudyCard) => {
    const id = entryId(c.word.replace(/\*/g, ''))
    if (seen.has(id) || out.length >= 30)
      return
    seen.add(id)
    out.push(c)
  }
  // 单词开头匹配的排前面，其次是单词里含有、释义里含有
  all.filter(c => c.word.toLowerCase().startsWith(q)).forEach(add)
  all.filter(c => c.word.toLowerCase().includes(q)).forEach(add)
  all.filter(c => c.meaning.includes(q)).forEach(add)
  return out
})
function addCard(card: StudyCard) {
  const list = selected.value
  if (!list)
    return
  update(mergeEntries(list.words, [
    entryFromCard(card),
  ]).words)
}
watch(addMode, (mode) => {
  if (mode === 'site')
    ensureSite().catch(() => {})
})

// —— 词表里的词 ——
function setMeaning(index: number, value: string) {
  const list = selected.value
  if (!list)
    return
  update(list.words.map((w, i) => i === index
    ? {
        ...w,
        meaning: value.trim().slice(0, 200),
      }
    : w))
}
function removeWord(index: number) {
  const list = selected.value
  if (!list)
    return
  update(list.words.filter((_, i) => i !== index))
}

watch(currentUser, () => {
  lists.value = readLists()
  selectedId.value = ''
  loadLists()
})
onMounted(loadLists)
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-2xl text-gray-900 dark:text-white">
      <!-- 词表列表 -->
      <template v-if="!selected">
        <div class="mb-4 flex items-center gap-3">
          <StudyBack to="/study" label="背单词" />
          <div>
            <h3 class="text-xl font-bold">
              我的词表
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              自己建词表，在学新词、复习、练拼写和单词地牢里当一个词库用。
            </p>
          </div>
        </div>
        <form class="mb-4 flex gap-2" @submit.prevent="createList">
          <input
            v-model="newName"
            aria-label="词表名字"
            maxlength="40"
            placeholder="新词表的名字，比如“剑 18 生词”"
            class="block min-w-0 flex-1 border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
          <button type="submit" data-create class="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-bold disabled:opacity-50" :disabled="!newName.trim()">
            新建词表
          </button>
        </form>
        <p v-if="!lists.length" class="text-sm text-gray-600 dark:text-gray-300" data-empty>
          还没有词表。先起个名字新建一个，再往里加词。
        </p>
        <div class="flex flex-col gap-3">
          <button
            v-for="l in lists"
            :key="l.id"
            :data-list="l.id"
            class="block border border-gray-200 rounded-lg bg-white p-4 text-left shadow-sm dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            @click="open(l.id)"
          >
            <span class="font-bold">{{ l.name }} →</span>
            <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">{{ l.words.length }} 个词</span>
          </button>
        </div>
        <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          词表和它的学习进度目前只保存在这台设备的浏览器里，不会跟着云同步，也不在备份文件里。
        </p>
      </template>

      <!-- 一个词表 -->
      <template v-else>
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <button
            data-back
            class="shrink-0 border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="selectedId = ''"
          >
            ← 返回词表列表
          </button>
          <input
            :value="selected.name"
            aria-label="词表名字"
            maxlength="40"
            class="block min-w-0 flex-1 border border-gray-300 rounded-lg bg-white p-2 text-lg font-bold dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @change="rename(($event.target as HTMLInputElement).value)"
          >
        </div>
        <p class="mb-3 text-sm text-gray-600 dark:text-gray-300" data-count>
          {{ countText }}
        </p>
        <div class="mb-4 flex flex-wrap gap-2">
          <RouterLink
            :to="`/study/learn?deck=custom&list=${selected.id}`"
            data-go-learn
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-bold"
            :class="selected.words.length ? '' : 'pointer-events-none opacity-50'"
          >
            用它学新词
          </RouterLink>
          <RouterLink
            :to="`/study/spell?source=custom&list=${selected.id}`"
            data-go-spell
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold dark:border-gray-600"
            :class="selected.words.length ? '' : 'pointer-events-none opacity-50'"
          >
            用它练拼写
          </RouterLink>
          <button class="ml-auto border border-red-300 rounded-lg px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:text-red-400" @click="removeList">
            删除词表
          </button>
        </div>

        <div class="mb-4 border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-3 flex flex-wrap gap-2">
            <button
              v-for="m in ([['paste', '粘贴单词'], ['file', '上传文件'], ['site', '从网站词库里选']] as const)"
              :key="m[0]"
              :data-add="m[0]"
              :aria-pressed="addMode === m[0]"
              class="border rounded-lg px-3 py-2 text-sm font-medium"
              :class="addMode === m[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
              @click="addMode = m[0]"
            >
              {{ m[1] }}
            </button>
          </div>
          <template v-if="addMode === 'paste'">
            <textarea
              v-model="pasteText"
              aria-label="粘贴单词"
              rows="6"
              placeholder="一行一个词，后面可以跟中文释义：&#10;abandon 放弃&#10;take off 起飞&#10;sustainable&#10;没写释义的会先在网站词库里找，找不到的留空。"
              class="block w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <button data-import class="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-bold disabled:opacity-50" :disabled="!pasteText.trim() || importing" @click="importText(pasteText)">
              {{ importing ? '导入中…' : '导入' }}
            </button>
          </template>
          <template v-else-if="addMode === 'file'">
            <p class="mb-2 text-sm text-gray-600 dark:text-gray-300">
              选一个 txt 或 csv 文件：一行一个词，释义写在单词后面（用空格、逗号或制表符隔开）。Excel 表格请先另存为 csv。
            </p>
            <input type="file" aria-label="上传文件" accept=".txt,.csv,.tsv,text/plain,text/csv" class="block w-full text-sm" :disabled="importing" @change="importFile">
          </template>
          <template v-else>
            <input
              v-model="query"
              aria-label="搜索网站词库"
              placeholder="输入单词或中文释义，点一下加入词表"
              class="block w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
            <p v-if="siteError" class="mt-2 text-sm text-amber-700" role="alert">
              网站词库加载失败。<button class="underline" @click="ensureSite().catch(() => {})">
                重试
              </button>
            </p>
            <p v-else-if="!siteCards" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              网站词库加载中…
            </p>
            <p v-else-if="query.trim() && !results.length" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              网站词库里没有找到。可以用“粘贴单词”自己加。
            </p>
            <ul class="mt-2 space-y-1" data-results>
              <li v-for="c in results" :key="c.key">
                <button
                  class="w-full flex flex-wrap items-baseline gap-x-2 border border-gray-200 rounded-lg px-3 py-2 text-left text-sm dark:border-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-700"
                  :disabled="inList.has(entryId(c.word.replace(/\*/g, '')))"
                  @click="addCard(c)"
                >
                  <span class="font-bold">{{ inList.has(entryId(c.word.replace(/\*/g, ''))) ? '✓' : '＋' }} {{ c.word.replace(/\*/g, '') }}</span>
                  <span class="text-gray-600 dark:text-gray-300">{{ c.pos }} {{ c.meaning }}</span>
                  <span class="ml-auto text-xs text-gray-400">{{ DECK_META[c.deck].name }}</span>
                </button>
              </li>
            </ul>
          </template>
          <p v-if="notice" class="mt-3 text-sm text-blue-700 dark:text-blue-300" role="status" data-notice>
            {{ notice }}
          </p>
        </div>

        <ul class="space-y-2" data-words>
          <li
            v-for="(w, i) in selected.words.slice(0, shown)"
            :key="entryId(w.word)"
            class="flex flex-wrap items-center gap-2 border border-gray-200 rounded-lg bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
          >
            <span class="font-bold">{{ w.word }}</span>
            <span v-if="w.pos" class="text-sm text-gray-400 italic" style="font-family: times">{{ w.pos }}</span>
            <input
              :value="w.meaning"
              :aria-label="`${w.word} 的释义`"
              maxlength="200"
              placeholder="还没有释义，在这里补上"
              class="block min-w-0 flex-1 border border-gray-200 rounded bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              @change="setMeaning(i, ($event.target as HTMLInputElement).value)"
            >
            <button class="shrink-0 text-sm text-red-600 dark:text-red-400" :title="`从词表里移走 ${w.word}`" @click="removeWord(i)">
              移走
            </button>
          </li>
        </ul>
        <button v-if="selected.words.length > shown" class="mt-3 text-sm underline" @click="shown += 200">
          再显示 200 个（共 {{ selected.words.length }} 个）
        </button>
      </template>
    </div>
  </div>
</template>
