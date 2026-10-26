import type { VueWrapper } from '@vue/test-utils'
import type { MistakeItem } from '../src/composables/useStudyData'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const wrappers: VueWrapper[] = []
beforeEach(() => { vi.resetModules(); localStorage.clear(); sessionStorage.clear() })
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.doUnmock('../src/pages/mock/cam21-test1-listening') })
const item = (key: string, count = 1): MistakeItem => ({ key, module: 'vocabulary', title: key, detail: '', count, firstAt: 1, lastAt: 1 })
async function mistakes() {
  const { createAccountData } = await import('../src/composables/useAccountData')
  let store!: ReturnType<typeof createAccountData<MistakeItem[]>>
  wrappers.push(mount({ setup() { store = createAccountData<MistakeItem[]>('mistakes_v1', () => []); return () => null } }))
  return store
}
async function daily() {
  const { createDailyCounter } = await import('../src/composables/useDailyCounter')
  let store!: ReturnType<typeof createDailyCounter>
  wrappers.push(mount({ setup() { store = createDailyCounter('flashcard'); return () => null } }))
  return store
}
describe('concurrent account data', () => {
  it('keeps mistakes from both pages even before storage events arrive', async () => {
    const a = await mistakes(); const b = await mistakes()
    a.state.value.push(item('a')); a.flush()
    b.state.value.push(item('b')); b.flush()
    expect((await mistakes()).state.value.map(m => m.key).sort()).toEqual(['a', 'b'])
  })
  it('adds both increments to an existing mistake without counting the seed twice', async () => {
    localStorage.setItem('myielts_mistakes_v1', JSON.stringify([item('a', 5)]))
    const a = await mistakes(); const b = await mistakes()
    a.state.value[0].count++; a.flush()
    b.state.value[0].count++; b.flush()
    expect((await mistakes()).state.value[0].count).toBe(7)
  })
  it('does not resurrect a deletion when a stale page adds another mistake', async () => {
    localStorage.setItem('myielts_mistakes_v1', JSON.stringify([item('a')]))
    const a = await mistakes(); const b = await mistakes()
    a.state.value = []; a.flush()
    b.state.value.push(item('b')); b.flush()
    expect((await mistakes()).state.value.map(m => m.key)).toEqual(['b'])
  })
  it('merges external changes while retaining unsaved local increments', async () => {
    localStorage.setItem('myielts_mistakes_v1', JSON.stringify([item('a')]))
    const a = await mistakes(); const b = await mistakes()
    b.state.value[0].count++
    a.state.value.push(item('b')); a.flush()
    window.dispatchEvent(new StorageEvent('storage', { key: 'myielts_mistakes_v1', storageArea: localStorage }))
    b.flush()
    expect((await mistakes()).state.value.find(m => m.key === 'a')?.count).toBe(2)
    expect((await mistakes()).state.value).toHaveLength(2)
  })
  it('rolls back a failed operation batch and retries an increment exactly once', async () => {
    const a = await mistakes()
    a.state.value.push(item('a'))
    const set = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (k === 'myielts_mistakes_v1') throw new DOMException('fixture quota', 'QuotaExceededError')
      set.call(this, k, v)
    })
    a.flush()
    expect(Object.keys(localStorage).filter(k => k.includes('__op_'))).toHaveLength(0)
    spy.mockRestore(); a.flush()
    expect((await mistakes()).state.value[0].count).toBe(1)
  })
  it('counts distinct words across pages and deduplicates the same word', async () => {
    const a = await daily(); const b = await daily()
    a.recordNewWord('a'); b.recordNewWord('b'); b.recordNewWord('a')
    expect((await daily()).dailyCount.value).toBe(2)
  })
  it('retains a legacy daily count and adds each page contribution once', async () => {
    const { studyDate } = await import('../src/utils/studyDate')
    localStorage.setItem('myielts_flashcard_daily_new_v1', JSON.stringify({ date: studyDate(), count: 20 }))
    const a = await daily(); const b = await daily()
    a.recordNewWord(); b.recordNewWord()
    expect((await daily()).dailyCount.value).toBe(22)
  })
  it('round-trips the new mistake and counter records through portable backup', async () => {
    const a = await mistakes(); a.state.value.push(item('a')); a.flush()
    const d = await daily(); d.recordNewWord('a')
    const { collectBackupData, importBackup } = await import('../src/composables/useBackup')
    const backup = collectBackupData()
    localStorage.clear()
    expect((await importBackup({ size: 100, text: async () => JSON.stringify(backup) } as File)).ok).toBe(true)
    expect((await mistakes()).state.value[0].count).toBe(1)
    expect((await daily()).dailyCount.value).toBe(1)
  })
  it('lets an old backup replace new operation records', async () => {
    const a = await mistakes(); a.state.value.push(item('new')); a.flush()
    const { importBackup } = await import('../src/composables/useBackup')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const backup = { app: 'my-ielts', version: 1, data: { mistakes_v1: JSON.stringify([item('old')]) } }
    expect((await importBackup({ size: 100, text: async () => JSON.stringify(backup) } as File)).ok).toBe(true)
    expect((await mistakes()).state.value.map(m => m.key)).toEqual(['old'])
  })
})

for (const [oldPath, newPath, file] of [['/ielts', '/listening/keyword', 'index'], ['/ielts/practice', '/listening/179practice', 'practice']]) {
  it(`redirects ${oldPath} to the maintained listening page`, async () => {
    const Legacy = file === 'index' ? (await import('../src/pages/ielts/index.vue')).default : (await import('../src/pages/ielts/practice.vue')).default
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: oldPath, component: Legacy }, { path: newPath, component: { template: '<p>maintained page</p>' } }] })
    await router.push(`${oldPath}?fixture=1`)
    wrappers.push(mount({ template: '<RouterView />' }, { global: { plugins: [router] } }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(newPath)
    expect(router.currentRoute.value.query.fixture).toBe('1')
  })
}
it('uses a dictionary fallback for chef while retaining available local clips', async () => {
  const { vocabularyWordAudio, vocabularyChapterAudio } = await import('../src/composables/useAudio')
  expect(vocabularyWordAudio('12_饮食健康', 'chef')).toBe('https://dict.youdao.com/dictvoice?audio=chef&type=1')
  expect(vocabularyWordAudio('12_饮食健康', 'bread')).toBe('vocabulary/audio/12_饮食健康/bread.mp3')
  expect(vocabularyChapterAudio('01_自然地理.mp3')).toContain('raw.githubusercontent.com/messy6857-maker/my-ielts/master/public/vocabulary/audio/01_')
})

it('loads a reading test without importing its listening dataset', async () => {
  const listening = vi.fn(() => { throw new Error('Listening should remain unloaded') })
  vi.doMock('../src/pages/mock/cam21-test1-listening', listening)
  const { loadMockTestPart } = await import('../src/pages/mock/registry')
  const result = await loadMockTestPart('cam21-test1', 'reading')
  expect(result.reading?.passages.length).toBeGreaterThan(0)
  expect(result.listening).toBeUndefined()
  expect(listening).not.toHaveBeenCalled()
})

it('stages audio for the web, excludes it from Android and preserves images', async () => {
  const { mkdtemp, mkdir, writeFile, readdir, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { stagePublic } = await import('../scripts/stage-public.mjs')
  const root = await mkdtemp(join(tmpdir(), 'ielts-media-'))
  try {
    const source = join(root, 'public')
    await mkdir(join(source, 'mock'), { recursive: true })
    await writeFile(join(source, 'mock', 'clip.mp3'), 'fixture')
    await writeFile(join(source, 'mock', 'diagram.svg'), '<svg />')
    await writeFile(join(source, 'mock', 'audacity_tags.txt'), 'maintenance fixture')
    await stagePublic(source, join(root, 'web'), false, false)
    await stagePublic(source, join(root, 'android'), true, false)
    expect((await readdir(join(root, 'web', 'mock'))).sort()).toEqual(['clip.mp3', 'diagram.svg'])
    expect(await readdir(join(root, 'android', 'mock'))).toEqual(['diagram.svg'])
    await expect(stagePublic(source, join(root, 'incomplete'), false)).rejects.toThrow('发布资源缺失')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('switches grammar diagrams with the manual theme instead of embedding the SVG', async () => {
  const Grammar = (await import('../src/pages/grammar/index.vue')).default
  const { isDark } = await import('../src/composables/dark')
  isDark.value = false
  const wrapper = mount(Grammar)
  wrappers.push(wrapper)
  expect(wrapper.find('svg').exists()).toBe(false)
  expect(decodeURI(wrapper.find('img').attributes('src') ?? '')).toContain('雅思语法.svg')
  isDark.value = true
  await wrapper.vm.$nextTick()
  expect(decodeURI(wrapper.find('img').attributes('src') ?? '')).toContain('雅思语法-dark.svg')
})
