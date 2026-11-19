import type { WatchSource } from 'vue'
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { lookupVocabularyMeaning, lookupVocabularyWord } from '../pages/vocabulary/loadVocabulary'
import { translateWithAI } from './useAISettings'

// 读文章时的点词查义 / 选中翻译：点正文里的单词，在单词旁边弹出释义卡片
// （先查文章自带的生词注释，再查本站词库，最后走 AI）；选中一段话可以翻译成中文。
// 卡片里可以把词加进“我的词表”。不绑定某一类文章，以后别的阅读页面也能用。
// 页面需要：正文容器加 class="passage-text"，每篇文章外层加 data-article="<key>"。

export interface LookupNote {
  word: string
  pos: string
  meaning: string
}

export interface TranslatePopupState {
  source: string
  kind: 'word' | 'selection'
  phonetic: string
  pos: string
  meaning: string
  loading: boolean
  error: string
  showTranslateButton: boolean
  /** 这个词是文章生词注释里的（用注释里的写法加进词表） */
  fromNote?: boolean
  /** 已经加进词表时，加进去的写法 */
  addedAs?: string
  /** 锚点（单词/选区的视口包围盒），卡片贴着它显示 */
  anchor: { left: number, top: number, bottom: number, right: number }

export function useWordLookupPopup(options: {
  /** 音标（卡片里显示） */
  phoneticOf: (word: string) => string
  /** 把查到的词加进词表 */
  addWord: (entry: { word: string, meaning: string, pos: string }) => Promise<unknown>
  /** data-article 为 key 的那篇文章的生词注释 */
  notesForArticle: (key: string) => LookupNote[]
  /** 这些值一变（换日期、换账号）就关掉卡片 */
  resetOn: WatchSource[]
}) {
  }
  const translatePopup = ref<TranslatePopupState | null>(null)
  /** 查词卡片里的词：词库里有就用词库的原形（travelled → travel），没有就用点的这个词 */
  async function addPopupWord() {
    const popup = translatePopup.value
    if (!popup || popup.kind !== 'word')
      return
    let word = popup.source.trim()
    let meaning = popup.meaning
    let pos = popup.pos
    if (!popup.fromNote) {
      try {
        const hit = await lookupVocabularyWord(word)
        if (hit?.word) {
          word = hit.word
          meaning = meaning || hit.meaning
          pos = pos || hit.pos
        }
      }
      catch {
        // 词库没加载出来：照样加，用点的这个词
      }
    }
    // 句首大写的普通词存成小写（全大写的缩写保持原样）
    if (/^[A-Z][a-z'-]+$/.test(word) && !popup.fromNote)
      word = word.toLowerCase()
    await options.addWord({ word, meaning, pos })
    popup.addedAs = word
  }
  const translatePopupEl = ref<HTMLElement | null>(null)
  const popupStyle = ref({ left: '0px', top: '0px' })
  let translateSeq = 0
  let translateAbort: AbortController | null = null

  /** 卡片定位：默认贴在锚点下方，水平夹在视口内；下方放不下就翻到上方。 */
  function adjustPopupPosition() {
    const popup = translatePopup.value
    const el = translatePopupEl.value
    if (!popup || !el)
      return
    const anchor = popup.anchor
    const width = Math.min(320, window.innerWidth - 16)
    let left = Math.min(Math.max(anchor.left, 8), Math.max(8, window.innerWidth - width - 8))
    let top = anchor.bottom + 8
    const h = el.offsetHeight
    const w = el.offsetWidth
    if (w > 0)
      left = Math.min(Math.max(left, 8), Math.max(8, window.innerWidth - w - 8))
    if (top + h > window.innerHeight - 8) {
      top = anchor.top - h - 8
      if (top < 8)
        top = 8
    }
    popupStyle.value = { left: `${left}px`, top: `${top}px` }
  }
  // 内容变化（加载中 → 释义/翻译）会改变卡片高度，重新定位
  watch(
    () => [
      translatePopup.value?.meaning,
      translatePopup.value?.loading,
      translatePopup.value?.error,
    ],
    () => {
      if (translatePopup.value)
        nextTick(adjustPopupPosition)
    },
  )

  function closeTranslatePopup() {
    translateSeq++
    translateAbort?.abort()
    translateAbort = null
    translatePopup.value = null
    const sel = window.getSelection()
    if (sel)
      sel.removeAllRanges()
  }

  /** “翻译成中文”按钮：走 AI，失败时留按钮可重试（选中句子和单词 AI 重试共用）。 */
  async function runAITranslate() {
    const popup = translatePopup.value
    if (!popup)
      return
    const seq = ++translateSeq
    translateAbort?.abort()
    translateAbort = new AbortController()
    popup.loading = true
    popup.error = ''
    popup.showTranslateButton = false
    try {
      const result = await translateWithAI(popup.source, translateAbort.signal)
      if (seq !== translateSeq)
        return
      popup.meaning = result
      popup.loading = false
    }
    catch (e) {
      if (seq !== translateSeq)
        return
      popup.loading = false
      popup.error = e instanceof Error
        ? e.message
        : '翻译失败，请重试'
      popup.showTranslateButton = true
    }
  }

  function rectToAnchor(rect: DOMRect): TranslatePopupState['anchor'] {
    return {
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      right: rect.right,
    }
  }

  /** 点词查义：文章注释 → 本站词库 → AI（自动走，不用再点）。 */
  async function openWordPopup(word: string, notes: LookupNote[], rect: DOMRect) {
    const seq = ++translateSeq
    translateAbort?.abort()
    translateAbort = new AbortController()
    const lower = word.toLowerCase()
    const popup = reactive<TranslatePopupState>({
      source: word,
      kind: 'word',
      phonetic: options.phoneticOf(word),
      pos: '',
      meaning: '',
      loading: true,
      error: '',
      showTranslateButton: false,
      anchor: rectToAnchor(rect),
    })
    translatePopup.value = popup
    nextTick(adjustPopupPosition)
    // 1. 文章注释（最贴合本文）
    const note = notes.find(n => n.word.toLowerCase().trim() === lower)
    if (note) {
      if (seq !== translateSeq)
        return
      popup.source = note.word
      popup.fromNote = true
      popup.pos = note.pos
      popup.meaning = note.meaning
      popup.loading = false
      return
    }
    // 2. 本站词库（免费、即时；首次查词时懒加载全部章节建索引）
    try {
      const vocab = await lookupVocabularyMeaning(word)
      if (seq !== translateSeq)
        return
      if (vocab) {
        popup.pos = vocab.pos
        popup.meaning = vocab.meaning
        popup.loading = false
        return
      }
    }
    catch {
      // 词库加载失败不阻塞，继续走 AI
    }
    // 3. AI 翻译（词库没有的词）
    if (seq !== translateSeq)
      return
    try {
      const result = await translateWithAI(word, translateAbort.signal)
      if (seq !== translateSeq)
        return
      popup.meaning = result
      popup.loading = false
    }
    catch (e) {
      if (seq !== translateSeq)
        return
      popup.loading = false
      popup.error = e instanceof Error
        ? e.message
        : '翻译失败，请重试'
      popup.showTranslateButton = true
    }
  }

  function openSelectionPopup(text: string, rect: DOMRect) {
    const trimmed = text.trim().replace(/\s+/g, ' ')
    if (!trimmed)
      return
    translateSeq++
    translateAbort?.abort()
    translateAbort = null
    translatePopup.value = {
      source: trimmed.length > 2000
        ? trimmed.slice(0, 2000)
        : trimmed,
      kind: 'selection',
      phonetic: '',
      pos: '',
      meaning: '',
      loading: false,
      error: '',
      showTranslateButton: true,
      anchor: rectToAnchor(rect),
    }
    nextTick(adjustPopupPosition)
  }

  /** 点中单词：用点击坐标找所在单词，并返回单词的包围盒做卡片锚点。 */
  function wordAtPoint(x: number, y: number): { word: string, rect: DOMRect } | null {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node, offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const caret = doc.caretPositionFromPoint?.(x, y)
    // L4：Firefox 点在元素边界时可能返回非文本 offsetNode，此时改用 caretRangeFromPoint，
    // 而不是直接返回 null（旧代码 caret 非空就不再回退）。
    const useCaret = !!caret && caret.offsetNode.nodeType === Node.TEXT_NODE
    const range = useCaret
      ? null
      : doc.caretRangeFromPoint?.(x, y)
    const node = useCaret ? caret!.offsetNode : range?.startContainer
    if (!node || node.nodeType !== Node.TEXT_NODE)
      return null
    const text = node.textContent ?? ''
    const offset = useCaret ? caret!.offset : range!.startOffset
    const isLetter = (i: number) => i >= 0 && i < text.length && /[A-Z]/i.test(text[i])
    // 点在字母上才算点中单词（点在空格/标点上不触发）
    if (!isLetter(offset) && !isLetter(offset - 1))
      return null
    let start = offset
    while (start > 0 && /[A-Z']/i.test(text[start - 1])) start--
    let end = offset
    while (end < text.length && /[A-Z']/i.test(text[end])) end++
    const word = text.slice(start, end).replace(/^'+|'+$/g, '')
    if (!/^[A-Z]+(?:'[A-Z]+)?$/i.test(word))
      return null
    const wordRange = document.createRange()
    wordRange.setStart(node, start)
    wordRange.setEnd(node, end)
    const rect = wordRange.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0))
      return null
    return { word, rect }
  }

  function onPassageClick(e: MouseEvent, notes: LookupNote[]) {
    // 有选区时不处理点词（选区走翻译分支）
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed)
      return
    const hit = wordAtPoint(e.clientX, e.clientY)
    if (!hit)
      return
    openWordPopup(hit.word, notes, hit.rect)
  }

  /** 选区所在文章的注释（双击选词时也要先查文章注释）。 */
  function articleNotesForNode(node: Node | null): LookupNote[] {
    const el = node instanceof Element
      ? node
      : node?.parentElement
    const container = el?.closest?.('[data-article]')
    const key = container?.getAttribute('data-article') ?? ''
    return options.notesForArticle(key)
  }

  let selectionTimer: ReturnType<typeof setTimeout> | null = null
  watch(options.resetOn, () => {
    if (selectionTimer)
      clearTimeout(selectionTimer)
    selectionTimer = null
    closeTranslatePopup()
  }, { flush: 'sync' })

  function onSelectionChange() {
    if (selectionTimer)
      clearTimeout(selectionTimer)
    selectionTimer = setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed)
        return
      const text = sel.toString().trim()
      if (text.length < 2 || text.length > 2000)
        return
      // 只处理正文选区（不含注释列表/题目）
      const anchor = sel.anchorNode
      if (!anchor)
        return
      const el = anchor instanceof Element
        ? anchor
        : anchor.parentElement
      const passage = el?.closest('.passage-text')
      const range = sel.rangeCount > 0
        ? sel.getRangeAt(0)
        : null
      if (!passage || !range || !passage.contains(range.commonAncestorContainer))
        return
      const rect = range?.getBoundingClientRect()
      if (!rect || (rect.width === 0 && rect.height === 0))
        return
      // 单词选区（双击）直接给释义，不用再点翻译
      if (/^[A-Z]+(?:'[A-Z]+)?$/i.test(text)) {
        openWordPopup(text, articleNotesForNode(anchor), rect)
        return
      }
      openSelectionPopup(text, rect)
    }, 400)
  }

  /** 点在卡片外就关掉（点在正文单词上时，onPassageClick 会紧接着打开新卡片）。 */
  function onDocumentClickCapture(e: MouseEvent) {
    if (!translatePopup.value)
      return
    const el = translatePopupEl.value
    if (el && el.contains(e.target as Node))
      return
    closeTranslatePopup()
  }
  /** 滚动后锚点单词移位，卡片跟着关掉（卡片内滚动不关）。 */
  function onWindowScroll(e: Event) {
    if (!translatePopup.value)
      return
    const el = translatePopupEl.value
    if (el && el.contains(e.target as Node))
      return
    closeTranslatePopup()
  }

  onMounted(() => {
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('click', onDocumentClickCapture, true)
    window.addEventListener('scroll', onWindowScroll, { capture: true, passive: true })
  })
  onUnmounted(() => {
    document.removeEventListener('selectionchange', onSelectionChange)
    document.removeEventListener('click', onDocumentClickCapture, true)
    window.removeEventListener('scroll', onWindowScroll, true)
    if (selectionTimer)
      clearTimeout(selectionTimer)
    translateSeq++
    translateAbort?.abort()
  })

  return {
    translatePopup,
    translatePopupEl,
    popupStyle,
    addPopupWord,
    closeTranslatePopup,
    runAITranslate,
    openWordPopup,
    openSelectionPopup,
    wordAtPoint,
    onPassageClick,
  }
}
