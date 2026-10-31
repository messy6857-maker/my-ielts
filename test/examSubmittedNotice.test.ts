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
  timeLeft = ref(3600)
  testId = ref('cam21-test3')
  const Page = defineComponent({
    setup() {
      const recovery = useExamRecovery({
        kind: 'reading',
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
  return (w.vm as any).recovery
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

function answerOneAndSubmitEarly(recovery: any) {
  expect(recovery.begin()).toBe(true)
  answers.value = { Q1: 'dust' }
  recovery.saveFlush()
  const result = recovery.submitResult({
    id: 'cam21-test3',
    label: '剑21 Test 3',
    kind: 'reading',
    score: 2.5,
    total: 40,
    band: 5,
  })
  expect(result?.saved).toBe(true)
  // 回到开始屏：与 loadTest 一致，started/submitted 复位后刷新。
  started.value = false
  submitted.value = false
  recovery.refresh()
  return recovery
}

it('答 1 题提前交卷后，开始屏显示该条已交卷记录', () => {
  const recovery = answerOneAndSubmitEarly(mountRecovery())
  expect(recovery.submittedDrafts.value.length).toBe(1)
  expect(recovery.submittedDrafts.value[0].answers).toEqual({ Q1: 'dust' })
  expect(recovery.submittedDrafts.value[0].testId).toBe('cam21-test3')
})

it('已交卷记录不在可选草稿列表里', () => {
  const recovery = answerOneAndSubmitEarly(mountRecovery())
  expect(recovery.availableDrafts.value).toEqual([])
  expect(recovery.draft.value).toBeNull()
})

it('clear() 不删除已交卷快照', () => {
  const recovery = mountRecovery()
  expect(recovery.begin()).toBe(true)
  answers.value = { Q1: 'dust' }
  recovery.saveFlush()
  recovery.markSubmitted()
  recovery.clear()
  recovery.refresh()
  expect(recovery.submittedDrafts.value.length).toBe(1)
})
