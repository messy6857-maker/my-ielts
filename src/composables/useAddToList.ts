import type { ListEntry, WordList } from '../utils/wordLists'
import { shallowRef, ref, watch } from 'vue'
import { loadWordLists } from '../utils/loadStudyCards'
import { addEntriesToList, entryId, readLists, setTargetList, targetListId } from '../utils/wordLists'
import { useAuth } from './useAuth'

// 把阅读里遇到的词加进“我的词表”：加到哪个词表可以选（记住上次选的），没有词表时自动建“我的词单”。
export function useAddToList() {
  const { currentUser } = useAuth()
  const lists = shallowRef<WordList[]>(readLists())
  const target = ref(targetListId(lists.value))
  let seq = 0
  async function refresh() {
    const mine = ++seq
    const owner = currentUser.value
    let next: WordList[]
    try {
      next = await loadWordLists()
    }
    catch {
      // 网站词库没加载出来（旧词单搬不了）：先用已有的词表
      next = readLists()
    }
    if (mine !== seq || owner !== currentUser.value)
      return
    lists.value = next
    target.value = targetListId(next)
  }
  function choose(id: string) {
    target.value = id
    setTargetList(id)
  }
  /** 这个词已经在选中的词表里了 */
  function has(word: string) {
    const id = entryId(word)
    return !!lists.value.find(l => l.id === target.value)?.words.some(w => entryId(w.word) === id)
  }
  async function add(entry: ListEntry) {
    const owner = currentUser.value
    await refresh()
    if (owner !== currentUser.value)
      return
    const id = lists.value.some(l => l.id === target.value)
      ? target.value
      : ''
    addEntriesToList(id, [entry])
    lists.value = readLists()
    target.value = targetListId(lists.value)
  }
  watch(currentUser, () => {
    lists.value = readLists()
    target.value = targetListId(lists.value)
    refresh()
  })
  refresh()
  return { lists, target, choose, has, add }
}
