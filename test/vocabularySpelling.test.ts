import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import SpellingPage from '../src/pages/vocabulary/index.vue'
import vocabulary from '../src/pages/vocabulary/vocabulary'
import { readRecords } from '../src/utils/storage'

const CHAPTER = '01_自然地理'
const TOTAL = (vocabulary as any)[CHAPTER].words.flat().length
const wrappers: any[] = []

const auth = useAuth()
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  auth.currentUser.value = 'alice'
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: vi.fn(),
  })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  )
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

function mountSpelling() {
  const w = mount(SpellingPage, {
    attachTo: document.body,
    global: {
      stubs: { RouterLink: true },
    },
  })
  wrappers.push(w)
  return w
}

async function setTraining(w: any, on: boolean) {
  const label = w.findAll('label').find((l: any) => l.text().includes('练习模式'))
  expect(label).toBeTruthy()
  await label.find('input[type="checkbox"]').setChecked(on)
  await nextTick()
  // 章节词表是异步加载的：冷启动时等输入框真正渲染出来再继续
  if (!on)
    return
  for (let i = 0; !w.find('input[id="1"]').exists() && i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 10))
    await flushPromises()
  }
}

function statsText(w: any) {
  const p = w.findAll('p').find((el: any) => el.text().includes('个未完成'))
  return p
    ? p.text()
    : ''
}

function spellInput(w: any, id: number) {
  return w.find(`input[id="${id}"]`)
}

it('b1: 刷新后重开练习模式，统计立即恢复，不再显示 stale 0,0,0', async () => {
  let w: any = mountSpelling()
  await flushPromises()
  await setTraining(w, true)
  await spellInput(w, 1).setValue('atmosphere')
  await spellInput(w, 2).setValue('hydro')
  expect(statsText(w)).toBe(`${TOTAL - 2} 个未完成，1 个正确，1 个错误`)
  // 模拟刷新：卸载后重挂，localStorage 里的拼写记录保留。
  w.unmount()
  wrappers.pop()
  w = mountSpelling()
  await flushPromises()
  await setTraining(w, true)
  expect(statsText(w)).toBe(`${TOTAL - 2} 个未完成，1 个正确，1 个错误`)
})

it('b2: 完成练习后开关练习模式，完成着色复位', async () => {
  const w = mountSpelling()
  await flushPromises()
  await setTraining(w, true)
  await spellInput(w, 1).setValue('atmosphere')
  const finish: any = w.findAll('button').find((b: any) => b.text() === '完成练习')
  expect(finish).toBeTruthy()
  await finish.trigger('click')
  expect(spellInput(w, 1).classes()).toContain('bg-green-50')
  await setTraining(w, false)
  await setTraining(w, true)
  expect(spellInput(w, 1).classes()).not.toContain('bg-green-50')
  expect(spellInput(w, 1).classes()).not.toContain('bg-red-50')
})

it('b2: 完成练习后切章再切回，完成着色不再粘滞', async () => {
  const w = mountSpelling()
  await flushPromises()
  await setTraining(w, true)
  await spellInput(w, 1).setValue('atmosphere')
  const finish: any = w.findAll('button').find((b: any) => b.text() === '完成练习')
  await finish.trigger('click')
  expect(spellInput(w, 1).classes()).toContain('bg-green-50')
  const select = w.find('select')
  await select.setValue('02_植物研究')
  await select.setValue(CHAPTER)
  await nextTick()
  expect(spellInput(w, 1).classes()).not.toContain('bg-green-50')
  expect(spellInput(w, 1).classes()).not.toContain('bg-red-50')
})

it('b3: 仅空格输入不计正确、不持久化空格串', async () => {
  const w = mountSpelling()
  await flushPromises()
  await setTraining(w, true)
  const input = spellInput(w, 1)
  await input.setValue('   ')
  expect((input.element as HTMLInputElement).value).toBe('')
  expect(statsText(w)).toBe(`${TOTAL} 个未完成，0 个正确，0 个错误`)
  const map = readRecords('vocabulary_spell_v2', 'alice')
  expect(map[`${CHAPTER}|1`]).toBeUndefined()
})





it('o1: 完成练习后错词旁直接显示正确答案', async () => {
  const w = mountSpelling()
  await flushPromises()
  await setTraining(w, true)
  await spellInput(w, 1).setValue('atmospher')
  const finish: any = w.findAll('button').find((b: any) => b.text() === '完成练习')
  expect(finish).toBeTruthy()
  await finish.trigger('click')
  await nextTick()
  expect(w.text()).toContain('正确答案：atmosphere')
})

it('o2: 四个开关持久化，重新挂载后保持上次选择', async () => {
  const w = mountSpelling()
  await flushPromises()
  await setTraining(w, true)
  await nextTick()
  const stored = JSON.parse(
    localStorage.getItem('myielts_vocabulary_switches_v1') ?? 'null',
  )
  expect(stored?.training).toBe(true)
  w.unmount()
  const w2 = mountSpelling()
  await flushPromises()
  const label: any = w2.findAll('label').find((l: any) => l.text().includes('练习模式'))
  expect(label).toBeTruthy()
  expect((label.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
})

