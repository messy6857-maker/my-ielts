import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import { useExamRecovery } from '../src/composables/useExamRecovery'

const wrappers: any[] = []
let started: any
let submitted: any
let answers: any
let timeLeft: any
let testId: any

function mountRecovery() {
  started = ref(true)
  submitted = ref(false)
  answers = ref<Record<string, string>>({})
  timeLeft = ref(2400)
  testId = ref('cam21-test1')
  const Page = defineComponent({
    setup() {
      const recovery = useExamRecovery({
        kind: 'listening',
        testId,
        started,
        submitted,
        answers,
        timeLeft,
        pause: () => {},
        remaining: () => timeLeft.value,
      })
      return { recovery }
    },
    template: '<div />',
  })
  const w = mount(Page)
  wrappers.push(w)
  return w
}

function draftKeys() {
  return Object.keys(localStorage).filter(k => k.includes('mock_draft_v1_listening_cam21-test1'))
}
function draftValue() {
  const k = draftKeys()[0]
  return k ? JSON.parse(localStorage.getItem(k)!) : null
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useAuth().currentUser.value = null
  vi.useFakeTimers()
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

it('answers are debounced 300ms instead of written on every keystroke', async () => {
  mountRecovery()
  answers.value = { Q1: 'a' }
  await vi.advanceTimersByTimeAsync(100)
  expect(draftValue()).toBeNull()
  await vi.advanceTimersByTimeAsync(200)
  expect(draftValue()?.answers).toEqual({ Q1: 'a' })
})

it('pagehide still writes immediately without waiting for the debounce', async () => {
  mountRecovery()
  answers.value = { Q1: 'b' }
  window.dispatchEvent(new Event('pagehide'))
  expect(draftValue()?.answers).toEqual({ Q1: 'b' })
})

it('visibilitychange to hidden still writes immediately', async () => {
  mountRecovery()
  answers.value = { Q1: 'c' }
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(draftValue()?.answers).toEqual({ Q1: 'c' })
})

it('unmount still writes immediately', async () => {
  const w = mountRecovery()
  answers.value = { Q1: 'd' }
  w.unmount()
  wrappers.pop()
  expect(draftValue()?.answers).toEqual({ Q1: 'd' })
})
