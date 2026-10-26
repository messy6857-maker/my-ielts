import type { VueWrapper } from '@vue/test-utils'
import type { MistakeItem } from '../src/composables/useStudyData'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wrappers: VueWrapper[] = []
const item = (key = 'vocabulary:1', count = 1, lastAt = 100): MistakeItem => ({ key, module: 'vocabulary', title: key, detail: '', count, firstAt: 1, lastAt })
beforeEach(() => { vi.resetModules(); localStorage.clear(); sessionStorage.clear() })
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.doUnmock('@capacitor/core'); vi.doUnmock('../src/composables/useSingleAudio') })
async function store<T>(base: string, empty: () => T) {
  const { createAccountData } = await import('../src/composables/useAccountData')
  let result!: ReturnType<typeof createAccountData<T>>
  wrappers.push(mount({ setup() { result = createAccountData(base, empty); return () => null } }))
  return result
}
function mockLocks() {
  // Preserve request serialization to test queued compactors as in Web Locks.
  let tail = Promise.resolve<unknown>(undefined)
  const nav = Object.create(navigator)
  Object.defineProperty(nav, 'locks', { configurable: true, value: { request: vi.fn((_name, _options, cb) => {
    const next = tail.then(cb); tail = next.catch(() => {}); return next
  }) } })
  vi.stubGlobal('navigator', nav)
}

describe('per-entry study persistence', () => {
  const schedule = { ease: 2.5, interval: 1, dueAt: 100, reps: 1, lapses: 0 }
  it.each(['sr_vocabulary_v1', 'listening179_sr_v1', 'reading538_sr_v1', 'progress_v1'])('merges independent writes to %s before storage events', async base => {
    const a = await store<Record<string, unknown>>(base, () => ({})); const b = await store<Record<string, unknown>>(base, () => ({}))
    const value = base === 'progress_v1' ? { done: 1, total: 2, updatedAt: 1 } : schedule
    a.state.value.a = value; a.flush()
    b.state.value.b = value; b.flush()
    expect(Object.keys((await store<Record<string, unknown>>(base, () => ({}))).state.value).sort()).toEqual(['a', 'b'])
  })
  it.each(['reading_mastered_v1', 'writing_mastered_v1', 'flashcard_checkin_v1'])('keeps additions and deletions to %s from stale pages', async base => {
    const x = base === 'flashcard_checkin_v1' ? '2026-10-20' : 'a'; const y = base === 'flashcard_checkin_v1' ? '2026-10-21' : 'b'
    localStorage.setItem(`myielts_${base}`, JSON.stringify([x]))
    const a = await store<string[]>(base, () => []); const b = await store<string[]>(base, () => [])
    a.state.value = []; a.flush()
    b.state.value.push(y); b.flush()
    expect((await store<string[]>(base, () => [])).state.value).toEqual([y])
  })
  it('refreshes external changes while retaining unsaved local records', async () => {
    const a = await store<Record<string, unknown>>('sr_vocabulary_v1', () => ({})); const b = await store<Record<string, unknown>>('sr_vocabulary_v1', () => ({}))
    b.state.value.b = schedule
    a.state.value.a = schedule; a.flush()
    window.dispatchEvent(new StorageEvent('storage', { key: 'myielts_sr_vocabulary_v1', storageArea: localStorage }))
    expect(Object.keys(b.state.value).sort()).toEqual(['a', 'b']); b.flush()
  })
  it('does not merge another account entries into this account', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'alice'
    const a = await store<Record<string, unknown>>('sr_vocabulary_v1', () => ({})); a.state.value.a = schedule; a.flush()
    useAuth().currentUser.value = 'alice_bob'
    expect(a.state.value).toEqual({}); a.state.value.b = schedule; a.flush()
    expect(JSON.parse(localStorage.getItem('myielts_u_alice_sr_vocabulary_v1')!)).toHaveProperty('a')
    expect(a.state.value).not.toHaveProperty('a')
  })
  it('exports materialized records and lets old backup tables replace entry tombstones', async () => {
    const a = await store<string[]>('reading_mastered_v1', () => [])
    a.state.value.push('a'); a.flush()
    const { collectBackupData, importBackup } = await import('../src/composables/useBackup')
    const backup = collectBackupData()
    expect(JSON.parse(backup.data.reading_mastered_v1)).toEqual(['a'])
    expect(Object.keys(backup.data).some(k => k.includes('__entry_'))).toBe(false)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const old = { app: 'my-ielts', version: 1, data: { reading_mastered_v1: JSON.stringify(['old']) } }
    expect((await importBackup({ size: 100, text: async () => JSON.stringify(old) } as File)).ok).toBe(true)
    expect((await store<string[]>('reading_mastered_v1', () => [])).state.value).toEqual(['old'])
  })
})

describe('mistake journal and checkpoints', () => {
  it('uses monotonic display timestamps while merging signed deltas', async () => {
    const { mergeMistakes, writeMistakes, readMistakes } = await import('../src/utils/mistakeStorage')
    const before = [item('a', 5, 100)]; const latest = [item('a', 6, 300)]
    const result = mergeMistakes(latest, before, [item('a', 6, 200)])
    expect(result[0]).toMatchObject({ count: 7, lastAt: 300 })
    const key = 'myielts_mistakes_v1'; localStorage.setItem(key, JSON.stringify(before))
    expect(writeMistakes(key, before, [item('a', 3, 200)])).toBe(true)
    expect(readMistakes(key)[0].count).toBe(3)
  })
  it('retains a committed operation if the compatibility-cache write fails', async () => {
    const { writeMistakes, readMistakes } = await import('../src/utils/mistakeStorage')
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (k === 'myielts_mistakes_v1') throw new DOMException('quota', 'QuotaExceededError')
      set.call(this, k, v)
    })
    expect(writeMistakes('myielts_mistakes_v1', [], [item()])).toBe(true)
    expect(readMistakes('myielts_mistakes_v1')[0].count).toBe(1)
  })
  it('compacts repeated errors and a deletion without resurrecting old state', async () => {
    mockLocks()
    const { writeMistakes, readMistakes, compactMistakes } = await import('../src/utils/mistakeStorage')
    const key = 'myielts_mistakes_v1'
    for (let count = 1; count <= 200; count++) { expect(writeMistakes(key, readMistakes(key), [item('a', count)])).toBe(true); await Promise.resolve() }
    expect(readMistakes(key)[0].count).toBe(200)
    expect(writeMistakes(key, readMistakes(key), [])).toBe(true)
    await compactMistakes(key, true)
    expect(Object.keys(localStorage).filter(k => k.includes('__op_'))).toHaveLength(0)
    expect(readMistakes(key)).toEqual([])
    expect(Object.keys(localStorage).reduce((sum, k) => sum + k.length + localStorage.getItem(k)!.length, 0)).toBeLessThan(5000)
    expect(writeMistakes(key, [item('a', 200)], [item('a', 200), item('b')])).toBe(true)
    expect(readMistakes(key).map(m => m.key)).toEqual(['b'])
  })
  it('migrates legacy operations, skips already covered records and keeps late writes', async () => {
    mockLocks()
    const { compactMistakes, readMistakes, writeMistakes } = await import('../src/utils/mistakeStorage')
    const key = 'myielts_mistakes_v1'; const oldKey = `${key}__op_old`
    const old = JSON.stringify({ key: 'a', item: item('a', 6), seed: item('a', 5), delta: 1, at: 10 })
    localStorage.setItem(key, JSON.stringify([item('a', 5)])); localStorage.setItem(oldKey, old)
    expect(await compactMistakes(key, true)).toBe(true)
    localStorage.setItem(oldKey, old) // A checkpoint is durable even if GC was interrupted.
    expect(readMistakes(key)[0].count).toBe(6)
    expect(writeMistakes(key, [item('a', 5)], [item('a', 6)])).toBe(true)
    expect(readMistakes(key)[0].count).toBe(7)
    await compactMistakes(key, true)
    expect(readMistakes(key)[0].count).toBe(7)
  })
  it('preserves a write arriving between checkpoint persistence and old-key removal', async () => {
    mockLocks()
    const { writeMistakes, readMistakes, compactMistakes } = await import('../src/utils/mistakeStorage')
    const key = 'myielts_mistakes_v1'
    writeMistakes(key, [], [item('a')])
    const set = Storage.prototype.setItem; let injected = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      set.call(this, k, v)
      if (k === `${key}__checkpoint` && !injected) { injected = true; writeMistakes(key, [item('a')], [item('a', 2), item('b')]) }
    })
    await compactMistakes(key, true)
    expect(readMistakes(key).map(m => [m.key, m.count]).sort()).toEqual([['a', 2], ['b', 1]])
  })
  it('keeps both actors increments through serialized compactions', async () => {
    mockLocks()
    const a = await import('../src/utils/mistakeStorage')
    vi.resetModules()
    const b = await import('../src/utils/mistakeStorage')
    const key = 'myielts_mistakes_v1'; const baseline = [item('a', 5)]
    localStorage.setItem(key, JSON.stringify(baseline))
    a.writeMistakes(key, baseline, [item('a', 6)])
    b.writeMistakes(key, baseline, [item('a', 6)])
    await Promise.all([a.compactMistakes(key, true), b.compactMistakes(key, true)])
    expect(a.readMistakes(key)[0].count).toBe(7)
    a.writeMistakes(key, [item('a', 6)], [item('a', 7)])
    expect(b.readMistakes(key)[0].count).toBe(8)
    await b.compactMistakes(key, true)
    expect(a.readMistakes(key)[0].count).toBe(8)
  })
  it('keeps the complete journal if checkpoint persistence fails', async () => {
    mockLocks()
    const { writeMistakes, readMistakes, compactMistakes } = await import('../src/utils/mistakeStorage')
    const key = 'myielts_mistakes_v1'; writeMistakes(key, [], [item()])
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (k === `${key}__checkpoint`) throw new DOMException('quota', 'QuotaExceededError')
      set.call(this, k, v)
    })
    expect(await compactMistakes(key, true)).toBe(false)
    expect(Object.keys(localStorage).filter(k => k.includes('__op_'))).toHaveLength(1)
    expect(readMistakes(key)[0].count).toBe(1)
  })
  it('exports a compact table and restores an old backup over a checkpoint', async () => {
    mockLocks()
    const { writeMistakes, compactMistakes } = await import('../src/utils/mistakeStorage')
    const key = 'myielts_mistakes_v1'; writeMistakes(key, [], [item()]); await compactMistakes(key, true)
    const { collectBackupData, importBackup } = await import('../src/composables/useBackup')
    const data = collectBackupData().data
    expect(Object.keys(data)).toEqual(['mistakes_v1']); expect(JSON.parse(data.mistakes_v1)[0].count).toBe(1)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const backup = { app: 'my-ielts', version: 1, data: { mistakes_v1: JSON.stringify([item('restored', 5)]) } }
    await importBackup({ size: 100, text: async () => JSON.stringify(backup) } as File)
    expect(localStorage.getItem(`${key}__checkpoint`)).toBeNull()
    expect((await import('../src/utils/mistakeStorage')).readMistakes(key)[0].key).toBe('restored')
  })
})

it('cleans only expired daily parts for the current account and keeps totals', async () => {
  const { cleanupDailyParts, readDailyParts, dailyTotal } = await import('../src/utils/dailyStorage')
  const key = 'myielts_u_alice_flashcard_daily_new_v1'
  const part = (date: string) => JSON.stringify({ date, seed: 0, count: 1, words: [], createdAt: 1 })
  localStorage.setItem(`${key}__part_old`, part('2026-10-01'))
  localStorage.setItem(`${key}__part_recent`, part('2026-10-25'))
  localStorage.setItem(`${key}__part_today`, part('2026-10-26'))
  localStorage.setItem('myielts_u_alice_bob_flashcard_daily_new_v1__part_old', part('2026-10-01'))
  cleanupDailyParts(key, 'flashcard_daily_new_v1', '2026-10-26')
  expect(localStorage.getItem(`${key}__part_old`)).toBeNull()
  expect(localStorage.getItem(`${key}__part_recent`)).not.toBeNull()
  expect(localStorage.getItem('myielts_u_alice_bob_flashcard_daily_new_v1__part_old')).not.toBeNull()
  const data = readDailyParts(key, 'flashcard_daily_new_v1', '2026-10-26')
  expect(dailyTotal([...data.parts.values()], data.fallback)).toBe(1)
})

it('filters both spellings/meanings and shows unavailable chapters explicitly', async () => {
  const Page = (await import('../src/pages/listening/corpus.vue')).default
  const w = mount(Page); wrappers.push(w)
  await w.find('input[type=search]').setValue('acknowledgment')
  expect(w.findAll('tbody tr')).toHaveLength(1)
  await w.find('input[type=search]').setValue('nonexistent-fixture')
  expect(w.text()).toContain('没有匹配')
  await w.find('select').setValue('Chapter3 特别名词')
  expect(w.text()).toContain('本章资料待补充')
})
it('plays the first spelling through encoded dictionary audio and reports failure', async () => {
  const play = vi.fn().mockResolvedValue(false)
  vi.doMock('../src/composables/useSingleAudio', () => ({ useAudioPlayer: () => ({ play }) }))
  const Page = (await import('../src/pages/listening/corpus.vue')).default
  const w = mount(Page); wrappers.push(w)
  await w.find('input[type=search]').setValue('annexe')
  await w.find('tbody a.i-carbon-volume-up-filled').trigger('click')
  await Promise.resolve(); await w.vm.$nextTick()
  expect(play).toHaveBeenCalledWith('https://dict.youdao.com/dictvoice?audio=annex&type=1')
  expect(w.find('[role=alert]').text()).toContain('发音加载失败')
})
it('uses local grammar assets on Android while retaining online audio routing', async () => {
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
  const Page = (await import('../src/pages/grammar/index.vue')).default
  const w = mount(Page); wrappers.push(w)
  expect(w.find('img').attributes('src')).not.toContain('github.io')
  const { resolveAudioUrl } = await import('../src/composables/useAudio')
  expect(resolveAudioUrl('179_audios/reserve.mp3')).toContain('github.io/my-ielts/179_audios/reserve.mp3')
})

it('validates chapter audio, diagrams and dataset images and rejects an incomplete tree index', async () => {
  const { requiredPublicFiles, validatePublicAssets } = await import('../scripts/stage-public.mjs')
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os')
  const required = await requiredPublicFiles(process.cwd())
  expect(required.filter(path => /^vocabulary\/audio\/[^/]+\.mp3$/.test(path))).toHaveLength(22)
  expect(required).toContain('grammar/雅思语法-dark.svg'); expect(required).toContain('mock/cam21-test2-part2-map.png')
  const root = await mkdtemp(join(tmpdir(), 'ielts-contract-'))
  try {
    await mkdir(join(root, 'public'))
    await expect(validatePublicAssets(join(root, 'public'), ['vocabulary/audio/01_自然地理.mp3'])).rejects.toThrow('发布资源缺失')
    const index = join(root, 'index.json')
    await writeFile(index, JSON.stringify({ treeSha: 'a'.repeat(40), files: {} }))
    await expect(validatePublicAssets(join(root, 'public'), ['vocabulary/audio/01_自然地理.mp3'], index)).rejects.toThrow('发布资源缺失')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
it('stages public assets through the bare Vite plugin for web and Android', async () => {
  const { publicAssetsPlugin } = await import('../scripts/stage-public.mjs')
  const { mkdtemp, mkdir, writeFile, access, rm } = await import('node:fs/promises')
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os')
  const root = await mkdtemp(join(tmpdir(), 'ielts-vite-public-'))
  try {
    for (const dir of ['public/grammar', 'src/data/vocabulary', 'src/pages/listening', 'src/pages/mock', 'src/pages/writing', 'src/pages/grammar']) await mkdir(join(root, dir), { recursive: true })
    await writeFile(join(root, 'src/pages/listening/listening179.json'), '[]')
    for (const p of ['.nojekyll', 'favicon.png', '404.svg', 'grammar/雅思语法.svg', 'grammar/雅思语法-dark.svg', 'grammar/雅思基础语法配套课程讲义.pdf', 'grammar/clip.mp3']) await writeFile(join(root, 'public', p), 'fixture')
    for (const mode of ['production', 'android']) {
      const plugin = publicAssetsPlugin()
      plugin.configResolved({ root, mode, build: { outDir: `dist-${mode}` } })
      await plugin.writeBundle()
      await expect(access(join(root, `dist-${mode}/grammar/雅思语法-dark.svg`))).resolves.toBeUndefined()
      const audio = access(join(root, `dist-${mode}/grammar/clip.mp3`))
      if (mode === 'android') await expect(audio).rejects.toThrow(); else await expect(audio).resolves.toBeUndefined()
    }
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
