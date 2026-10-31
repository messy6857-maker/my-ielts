import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  hasPendingGuestMigration,
  useAuth,
} from '../src/composables/useAuth'
import { setToken } from '../src/composables/syncClient'
import { useSync } from '../src/composables/useSync'
import {
  accountKey,
  entryKey,
  readRecord,
  saveEnvelope,
  saveRecord,
  storageFailures,
} from '../src/utils/storage'
import {
  studyDay,
  useMistakes,
} from '../src/composables/useStudyData'
import { analyzeEssay } from '../src/pages/writing/task1/grader'
import {
  emergencyWritingDrafts,
  saveDraft,
} from '../src/utils/drafts'

const auth = useAuth()
const wrappers: any[] = []
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  storageFailures.value = []
  auth.currentUser.value = null
  auth.currentUser.value = 'alice'
  setToken('local-test', 'alice')
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function page(Page: any) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Page }],
  })
  await router.push('/')
  await router.isReady()
  const w = mount(Page, {
    global: {
      plugins: [router],
      stubs: {
        ReadingTabs: true,
        ListeningTabs: true,
        AIGradePanel: true,
        TaskChart: true,
        TheHeader: true,
        TheFooter: true,
        RouterView: true,
      },
    },
  })
  wrappers.push(w)
  await flushPromises()
  const s = (w.vm as any).$.setupState
  for (let i = 0; s.loading && i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    await flushPromises()
  }
  return { s, w, router }
}
function show(Page: any) {
  const w = mount(Page, {
    global: {
      stubs: {
        RouterLink: true,
        ReadingTabs: true,
        ListeningTabs: true,
        AIGradePanel: true,
        TaskChart: true,
        ModelEssayView: true,
      },
    },
  })
  wrappers.push(w)
  return w
}
function seedExam(kind: string, session = 'other', attempt = 'shared') {
  const prefix = accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')
  const key = `${prefix}__session_${session}`
  localStorage.setItem(
    key,
    JSON.stringify({
      version: 1,
      kind,
      testId: 'cam21-test1',
      attemptId: attempt,
      answers: { Q1: 'original' },
      timeLeft: 400,
      updatedAt: Date.now(),
    }),
  )
  return { prefix, key }
}
async function retire(Page: any, kind: string) {
  const { prefix, key } = seedExam(kind)
  const { s, w } = await page(Page)
  s.recovery.selectDraft(key)
  s.startTest()
  s.answers.Q1 = 'latest before retirement'
  localStorage.setItem(`${prefix}__completed_shared`, '{}')
  return { s, w, prefix, key }
}
async function mockPage(kind: string) {
  return kind === 'reading'
    ? (await import('../src/pages/mock/reading-test.vue')).default
    : (await import('../src/pages/mock/listening-test.vue')).default
}

it.each(['reading', 'listening'])(
  '%s unselected foreign draft shows a fresh-start hint instead of a plain start button',
  async (kind) => {
    seedExam(kind)
    const { s, w } = await page(await mockPage(kind))
    expect(s.recovery.draft.value).toBeNull()
    expect(s.recovery.availableDrafts.value).toHaveLength(1)
    expect(w.html()).toContain('已有草稿未选')
    expect(w.html()).not.toContain('继续所选作答')
  },
)

it.each(['reading', 'listening'])(
  '%s retired banner survives dismissing the generic notice',
  async (kind) => {
    const { s, w } = await retire(await mockPage(kind), kind)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: `${seedExam(kind).prefix}__completed_shared`,
      }),
    )
    await nextTick()
    expect(s.recovery.retired.value).toBe(true)
    expect(s.recovery.retiredMessage.value).toContain('恢复副本')
    expect(s.recovery.error.value).toBe('')
    expect(w.html()).toContain('本次作答已在另一页签提交或放弃')
    s.recovery.dismissNotice()
    await nextTick()
    expect(w.html()).toContain('本次作答已在另一页签提交或放弃')
  },
)

it.each(['reading', 'listening'])(
  '%s leaving a retired attempt shows a retained-copy notice on the start screen',
  async (kind) => {
    const { s, w } = await retire(await mockPage(kind), kind)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: `${seedExam(kind).prefix}__completed_shared`,
      }),
    )
    await nextTick()
    s.recovery.leaveRetired()
    await nextTick()
    expect(s.started).toBe(false)
    expect(s.recovery.retainedNotice.value).toContain('恢复副本已保留')
    expect(w.html()).toContain('恢复副本已保留')
    expect(
      s.recovery.availableDrafts.value.some(
        (d: any) => d.answers.Q1 === 'latest before retirement',
      ),
    ).toBe(true)
    s.recovery.dismissRetainedNotice()
    await nextTick()
    expect(w.html()).not.toContain('恢复副本已保留')
  },
)

it.each(['reading', 'listening'])(
  '%s account switch during retirement reports the saved recovery copy, not a save failure',
  async (kind) => {
    const { s } = await retire(await mockPage(kind), kind)
    auth.currentUser.value = 'bob'
    await nextTick()
    expect(s.recovery.retired.value).toBe(true)
    expect(s.recovery.error.value).toContain('恢复副本')
    expect(s.recovery.error.value).not.toContain('保存失败')
  },
)

it('a retired draft that cannot save never claims success or a safe departure', async () => {
  const { s } = await retire(
    (await import('../src/pages/mock/reading-test.vue')).default,
    'reading',
  )
  const set = Storage.prototype.setItem
  const failing = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (this: Storage, k: string, value: string) {
      if (k.includes('__recovery_'))
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, k, value)
    })
  expect(s.recovery.saveFlush()).toBe(false)
  expect(s.recovery.retired.value).toBe(true)
  expect(s.recovery.error.value).toContain('保存失败')
  expect(s.recovery.error.value).not.toContain('安全离开')
  expect(s.recovery.retiredMessage.value).toContain('保存失败')
  s.recovery.leaveRetired()
  expect(s.started).toBe(true)
  failing.mockRestore()
})

it.each(['reading', 'listening'])(
  '%s submitted snapshots are visible but not offered as resumable',
  async (kind) => {
    localStorage.setItem(
      `${accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')}__session_seed`,
      JSON.stringify({
        version: 1,
        kind,
        testId: 'cam21-test1',
        answers: { Q1: 'submitted answer' },
        timeLeft: 100,
        submitted: true,
        updatedAt: Date.now(),
      }),
    )
    const { s, w } = await page(await mockPage(kind))
    expect(s.recovery.draft.value).toBeNull()
    expect(s.recovery.availableDrafts.value).toHaveLength(0)
    expect(s.recovery.submittedDrafts.value).toHaveLength(1)
    expect(w.html()).toContain('已有交卷记录')
  },
)

it('attributed mistake rows never say the activity is undistinguished', () => {
  const mistakes = useMistakes()
  const day = studyDay()
  const base = {
    title: 'atmosphere',
    detail: 'n. air',
    count: 1,
    epoch: '',
    firstAt: 1,
    lastAt: 1,
    days: { [day]: 1 },
  }
  saveRecord(
    'mistake_parts_v2',
    'vocabulary:1|legacy',
    { ...base, key: 'vocabulary:1', module: 'vocabulary' },
    'alice',
  )
  mistakes.addMistake('flashcard', { key: 'flashcard:1', title: 'atmosphere' })
  mistakes.addMistake('vocabulary', { key: 'spelling:1', title: 'atmosphere' })
  expect(
    mistakes.mistakes.value.find(m => m.key === 'legacy-vocabulary:1')
      ?.detail,
  ).toContain('活动来源未区分')
  mistakes.assignLegacyActivity('legacy-vocabulary:1', 'flashcard')
  const merged = mistakes.mistakes.value.find(m => m.key === 'flashcard:1')!
  expect(merged.count).toBe(2)
  expect(merged.detail).toContain('归属已确认')
  expect(merged.detail).not.toContain('未区分')
  expect(
    mistakes.mistakes.value.find(m => m.key === 'spelling:1')?.count,
  ).toBe(1)
  expect(
    mistakes.mistakes.value.some(m => m.key === 'legacy-vocabulary:1'),
  ).toBe(false)
})

it('unmarked divergence objects are treated as needing selection and backfilled', async () => {
  const chapter = '01_自然地理'
  saveEnvelope(entryKey('vocabulary_spell_v2', `${chapter}|1`, 'alice'), {
    __ielts: 2,
    stamp: [0, 'legacy'],
    value: { text: 'aple', alternatives: ['aple', 'apple'] },
  })
  const Page = (await import('../src/pages/vocabulary/index.vue')).default
  const { s, w } = await page(Page)
  const item = s.refVocabulary[chapter].words[0][0]
  expect(item.spellValue).toBe('')
  expect(item.spellAlternatives).toHaveLength(2)
  expect(
    (readRecord('vocabulary_spell_v2', `${chapter}|1`, 'alice') as any)
      .requiresSelection,
  ).toBe(true)
  expect(w.text()).toContain('请到拼写练习选择保留哪一个')
}, 15000)

it('bare writing drafts are restored even when an emergency draft wins display', async () => {
  const { TASK1_PROMPTS } = await import(
    '../src/pages/writing/task1/prompts'
  )
  const promptId = TASK1_PROMPTS[0].id
  const bareKey = 'myielts_u_alice_task1_draft_v1'
  const Page = (await import('../src/pages/writing/task1/TaskOne.vue')).default
  localStorage.setItem(
    bareKey,
    JSON.stringify({ promptId, text: 'bare draft text', secondsLeft: 1200 }),
  )
  const w = show(Page)
  await flushPromises()
  await nextTick()
  expect((w.vm as any).$.setupState.essayText).toBe('bare draft text')
  saveDraft('task1', 'alice', { promptId, text: 'bare draft text', secondsLeft: 1200 })
  expect(localStorage.getItem(bareKey)).toBeNull()
})

it('emergency drafts keep priority while bare drafts still migrate on save', async () => {
  const { TASK1_PROMPTS } = await import(
    '../src/pages/writing/task1/prompts'
  )
  const promptId = TASK1_PROMPTS[0].id
  const bareKey = 'myielts_u_alice_task1_draft_v1'
  const emergencyKey = JSON.stringify(['task1', 'alice'])
  emergencyWritingDrafts.delete(emergencyKey)
  localStorage.setItem(
    bareKey,
    JSON.stringify({ promptId, text: 'bare draft text', secondsLeft: 1200 }),
  )
  emergencyWritingDrafts.set(emergencyKey, {
    promptId,
    text: 'emergency text',
    secondsLeft: 1100,
  })
  const Page = (await import('../src/pages/writing/task1/TaskOne.vue')).default
  const w = show(Page)
  await flushPromises()
  await nextTick()
  expect((w.vm as any).$.setupState.essayText).toBe('emergency text')
  saveDraft('task1', 'alice', { promptId, text: 'emergency text', secondsLeft: 1100 })
  expect(localStorage.getItem(bareKey)).toBeNull()
  emergencyWritingDrafts.delete(emergencyKey)
})

it.each([
  'Sales rose as the percentage and the share increased.',
  'Sales rose as incomes and costs grew.',
  'Sales rose as the percentage increased.',
  'The chart shows that sales rose.',
])('coordinated subjects and object clauses still count: %s', (sentence) => {
  expect(analyzeEssay(sentence).complexRatio).toBe(1)
})

it.each([
  'Sales rose as a percentage and costs fell.',
  'Sales rose as a level and costs fell.',
  'Sales rose as an amount and costs fell.',
  'Sales rose as a number and costs fell.',
  'Sales rose as a total and costs fell.',
  'Sales rose as a figure and costs fell.',
  'Sales rose as a percentage of sales and costs fell.',
])('measure phrases do not cross into unrelated predicates: %s', (sentence) => {
  expect(analyzeEssay(sentence).complexRatio).toBe(0)
})

it('blocked guest records stay blocked after a later successful pull, and the account record wins', async () => {
  const authApi = useAuth()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, username: 'alice', token: 'token' }),
        }
      }
      throw new Error('offline')
    }),
  )
  expect((await authApi.login('alice', 'password', true)).ok).toBe(true)
  expect(hasPendingGuestMigration('alice')).toBe(true)
  saveRecord('progress_v1', 'reading', { done: 4, total: 10 }, null)
  saveRecord('progress_v1', 'reading', { done: 9, total: 10 }, 'alice')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
    })),
  )
  expect(await useSync().pullNow()).toBe(true)
  expect(hasPendingGuestMigration('alice')).toBe(false)
  expect(readRecord('progress_v1', 'reading', 'alice')).toEqual(
    expect.objectContaining({ done: 9 }),
  )
  expect(readRecord('progress_v1', 'reading', null)).toEqual(
    expect.objectContaining({ done: 4 }),
  )
})
