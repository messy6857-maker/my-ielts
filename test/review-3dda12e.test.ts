import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
// Regression tests for the six defects reproduced against commit 3dda12e.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('3dda12e regressions', () => {
  it('does not recursively quarantine recovery copies while scanning timer records', async () => {
    localStorage.setItem('myielts_device_id', 'fixture-device')
    localStorage.setItem('myielts_study_time_v1_fixture-device', 'null')
    const original = Storage.prototype.setItem
    let recoveryWrites = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes('__recovery')) {
        recoveryWrites++
        // Bound the reproduction instead of exhausting the browser's real quota.
        if (recoveryWrites > 5) throw new DOMException('fixture limit', 'QuotaExceededError')
      }
      original.call(this, key, value)
    })
    const { useStudyTimer } = await import('../src/composables/useStudyTimer')
    wrappers.push(mount({ setup() { useStudyTimer().start(); return () => null } }))
    const copies = Object.keys(localStorage).filter(key => key.includes('__recovery'))
    expect(copies).toHaveLength(1)
  })

  it('validates mock history items before exposing them to the UI', async () => {
    localStorage.setItem('myielts_mock_history_v1', '[null]')
    const History = (await import('../src/pages/mock/history.vue')).default
    const errors = vi.fn()
    const wrapper = mount(History, { global: { config: { errorHandler: errors } } })
    wrappers.push(wrapper)
    expect(errors).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('还没有模考记录')
  })

  it('syncs a writing draft while its countdown keeps running', async () => {
    vi.useFakeTimers()
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    const { useSync } = await import('../src/composables/useSync')
    const { useEssayDraft } = await import('../src/composables/useEssayDraft')
    const { useDeadlineCountdown } = await import('../src/composables/useDeadlineCountdown')
    const { ref } = await import('vue')
    useAuth().currentUser.value = 'alice'
    setToken('fixture', 'alice')
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)
    useSync().ensureWired()
    wrappers.push(mount({ setup() {
      const text = ref('')
      const clock = useDeadlineCountdown(() => {})
      const draft = useEssayDraft(1, text, clock.secondsLeft)
      draft.open('fixture', 1200)
      text.value = 'A draft that should reach the cloud during a timed writing session.'
      clock.start(1200)
      return () => null
    } }))
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
  })

  it('accepts writing-practice mistakes without invalidating the entire mistake dataset', async () => {
    const Page = (await import('../src/pages/writing/index.vue')).default
    const { useMistakes } = await import('../src/composables/useStudyData')
    useMistakes().addMistake('vocabulary', { key: 'vocabulary:fixture', title: 'fixture' })
    const wrapper = mount(Page, { global: { stubs: { TaskOne: true, TaskTwo: true } } })
    wrappers.push(wrapper)
    const button = (text: string) => wrapper.findAll('button').find(b => b.text().includes(text))!
    await button('开始练习').trigger('click')
    await button('对照答案').trigger('click')
    await button('没写对').trigger('click')
    await nextTick()
    const { parseStudyValue } = await import('../src/utils/studySchema')
    const raw = localStorage.getItem('myielts_mistakes_v1')!
    let valid = true
    try { parseStudyValue('mistakes_v1', raw) }
    catch { valid = false }
    const { useAuth } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'other'
    useAuth().currentUser.value = null
    expect({ valid, visibleMistakes: useMistakes().totalCount.value }).toEqual({ valid: true, visibleMistakes: 2 })
  })

  it('cancels delayed mistake removal when leaving the old account page', async () => {
    vi.useFakeTimers()
    const { useAuth } = await import('../src/composables/useAuth')
    const { useMistakes } = await import('../src/composables/useStudyData')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    const store = useMistakes()
    store.addMistake('vocabulary', { key: 'vocabulary:fixture', title: 'fixture' })
    const guest = [{ key: 'vocabulary:fixture', module: 'vocabulary', title: 'fixture', detail: '', count: 1, firstAt: 1, lastAt: 1 }]
    localStorage.setItem('myielts_mistakes_v1', JSON.stringify(guest))
    const Page = (await import('../src/pages/mistakes.vue')).default
    const wrapper = mount(Page)
    wrappers.push(wrapper)
    const button = (text: string) => wrapper.findAll('button').find(b => b.text().includes(text))!
    await button('开始复习').trigger('click')
    await wrapper.find('input').setValue('fixture')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    auth.currentUser.value = null
    wrapper.unmount()
    wrappers.pop()
    await vi.advanceTimersByTimeAsync(800)
    expect(store.mistakes.value).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('myielts_mistakes_v1')!)).toHaveLength(1)
  })

  it('does not let a cancelled microphone request override a fresh Part 2 retry', async () => {
    let allow!: (stream: MediaStream) => void
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => new Promise(resolve => { allow = resolve })) } })
    const Part2 = (await import('../src/pages/speaking/PartTwoPractice.vue')).default
    const card = (await import('../src/pages/speaking/part2')).PART2_CARDS[0]
    const wrapper = mount(Part2, { props: { card }, global: { stubs: { AIGradeSpeaking: true } } })
    wrappers.push(wrapper)
    const button = (text: string) => wrapper.findAll('button').find(b => b.text().includes(text))!
    await button('开始 1 分钟准备').trigger('click')
    await button('提前开始陈述').trigger('click')
    await button('结束陈述').trigger('click')
    await button('再练一次').trigger('click')
    expect(wrapper.text()).toContain('开始 1 分钟准备')
    allow({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream)
    await flushPromises()
    await nextTick()
    expect(wrapper.text()).toContain('开始 1 分钟准备')
  })
})
