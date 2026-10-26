import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const grade = {
  scores: { ta: 6, cc: 6, lr: 6, gra: 6, overall: 6 },
  comments: { ta: 'task', cc: 'cohesion', lr: 'lexical', gra: 'grammar' },
  corrections: [],
  suggestion: 'fixture',
}

async function enableAI() {
  const { useAuth } = await import('../src/composables/useAuth')
  const { setToken } = await import('../src/composables/syncClient')
  const { saveAISettings } = await import('../src/composables/useAISettings')
  useAuth().currentUser.value = 'alice'
  setToken('fixture')
  saveAISettings({ baseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' })
}

function aiResponse() {
  return { ok: true, status: 200, json: async () => ({ ok: true, data: { choices: [{ message: { content: JSON.stringify(grade) } }] } }) }
}

describe('AI panel lifecycle', () => {
  it('renders a validated response and persists it under the original account', async () => {
    await enableAI()
    vi.stubGlobal('fetch', vi.fn(async () => aiResponse()))
    const Panel = (await import('../src/pages/writing/AIGradePanel.vue')).default
    const wrapper = mount(Panel, { props: { task: 'task1', question: 'fixture', essay: Array(25).fill('word').join(' ') }, global: { stubs: { RouterLink: true } } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('AI 预估总分')
    const keys = Object.keys(localStorage).filter(key => key.includes('_aigrade_v1_'))
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain('myielts_u_alice_')
    expect(JSON.parse(localStorage.getItem(keys[0])!).scores.overall).toBe(6)
    wrapper.unmount()
  })

  it('discards a response when the essay changes while the request is in flight', async () => {
    await enableAI()
    let finish!: (value: ReturnType<typeof aiResponse>) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => {
      finish = resolve
    })))
    const Panel = (await import('../src/pages/writing/AIGradePanel.vue')).default
    const wrapper = mount(Panel, { props: { task: 'task1', question: 'fixture', essay: Array(25).fill('old').join(' ') }, global: { stubs: { RouterLink: true } } })
    await wrapper.find('button').trigger('click')
    await wrapper.setProps({ essay: Array(25).fill('new').join(' ') })
    finish(aiResponse())
    await flushPromises()
    expect(Object.keys(localStorage).filter(key => key.includes('_aigrade_v1_'))).toEqual([])
    expect(wrapper.text()).not.toContain('AI 预估总分')
    wrapper.unmount()
  })

  it('ignores a corrupt cached grade instead of crashing the panel', async () => {
    await enableAI()
    const text = 'task1|fixture|fixture'
    let hash = 0
    for (let i = 0; i < text.length; i++)
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
    localStorage.setItem(`myielts_u_alice_aigrade_v1_${hash.toString(36)}`, '{"scores":{"overall":6}}')
    const Panel = (await import('../src/pages/writing/AIGradePanel.vue')).default
    const errors = vi.fn()
    const wrapper = mount(Panel, { props: { task: 'task1', question: 'fixture', essay: 'fixture' }, global: { stubs: { RouterLink: true }, config: { errorHandler: errors } } })
    expect(errors).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('开始 AI 批改')
    wrapper.unmount()
  })

  it('aborts timed-out AI requests and clears the timeout', async () => {
    vi.useFakeTimers()
    await enableAI()
    vi.stubGlobal('fetch', vi.fn((_: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error('fixture aborted')), { once: true })
    })))
    const { gradeEssayWithAI } = await import('../src/composables/useAISettings')
    const pending = gradeEssayWithAI('task1', 'fixture', Array(25).fill('word').join(' ')).catch(e => e as Error)
    await vi.advanceTimersByTimeAsync(90000)
    expect((await pending as Error).message).toContain('超时')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Account-specific views', () => {
  it('clears displayed mock history immediately when switching account', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'alice'
    localStorage.setItem('myielts_u_alice_mock_history_v1', JSON.stringify([{ id: 'fixture', label: 'Private Alice Record', kind: 'reading', score: 1, total: 40, band: 2.5, date: '2026-10-26T00:00:00Z' }]))
    const History = (await import('../src/pages/mock/history.vue')).default
    const wrapper = mount(History)
    expect(wrapper.text()).toContain('Private Alice Record')
    useAuth().currentUser.value = 'bob'
    await nextTick()
    expect(wrapper.text()).not.toContain('Private Alice Record')
    wrapper.unmount()
  })

  it('lazy daily reading settles on the last selected date', async () => {
    const modules = import.meta.glob<{ default: { newsReadings: { title: string }[] } }>('../src/pages/reading/daily/[0-9]*.json')
    const dates = Object.keys(modules).sort()
    const latest = dates[dates.length - 1]
    const expected = (await modules[latest]()).default.newsReadings[0].title
    const Daily = (await import('../src/pages/reading/daily.vue')).default
    const wrapper = mount(Daily, { global: { stubs: { RouterLink: true } } })
    const select = wrapper.find('select')
    await select.setValue(dates[0].match(/(\d{4}-\d{2}-\d{2})\.json$/)![1])
    await select.setValue(latest.match(/(\d{4}-\d{2}-\d{2})\.json$/)![1])
    await vi.dynamicImportSettled()
    await flushPromises()
    expect(wrapper.text()).toContain(expected)
    wrapper.unmount()
  })
})
