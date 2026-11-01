import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import { useExamRecovery } from '../src/composables/useExamRecovery'
import { saveMockRecord } from '../src/composables/useMockHistory'

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

it('markSubmitted 两写之间配额耗尽时，clear() 补写已交卷快照而非删除', () => {
  const recovery = mountRecovery()
  expect(recovery.begin()).toBe(true)
  answers.value = { Q1: 'dust' }
  recovery.saveFlush()
  const attemptId = recovery.draft.value.attemptId
  expect(attemptId).toBeTruthy()
  // 交卷记录已落盘（submitResult 里 saveMockRecord 先于 markSubmitted 成功），
  // 但 markSubmitted 的第二次写（submitted 快照）因配额耗尽失败：草稿仍是未交卷态。
  expect(saveMockRecord({
    id: 'cam21-test3',
    label: '剑21 Test 3',
    kind: 'reading',
    score: 2.5,
    total: 40,
    band: 5,
    attemptId,
  })).toBe(true)
  expect(recovery.clear()).toBe(true)
  started.value = false
  submitted.value = false
  recovery.refresh()
  expect(recovery.submittedDrafts.value.length).toBe(1)
  expect(recovery.submittedDrafts.value[0].answers).toEqual({ Q1: 'dust' })
})

it('补写失败时 clear() 保留原草稿不删除', () => {
  // 本 harness 的 jsdom localStorage 无法被赋值/spyOn/defineProperty 劫持，
  // 故不用字面配额抛错模拟；改以草稿损坏（补写解析抛错）覆盖同一保留分支：
  // history 已有该 attempt、补写失败时 clear() 不得删稿。
  const recovery = mountRecovery()
  expect(recovery.begin()).toBe(true)
  answers.value = { Q1: 'dust' }
  recovery.saveFlush()
  const attemptId = recovery.draft.value.attemptId
  expect(saveMockRecord({
    id: 'cam21-test3',
    label: '剑21 Test 3',
    kind: 'reading',
    score: 2.5,
    total: 40,
    band: 5,
    attemptId,
  })).toBe(true)
  const draftKey = Object.keys(localStorage).find(
    k => k.includes('mock_draft_v1_reading_cam21-test3__session_'),
  )!
  localStorage.setItem(draftKey, '{corrupted')
  expect(recovery.clear()).toBe(true)
  expect(localStorage.getItem(draftKey)).toBe('{corrupted')
  // 退役标记在，损坏草稿不会再进入可选列表被误恢复续做。
  started.value = false
  submitted.value = false
  recovery.refresh()
  expect(recovery.submittedDrafts.value).toEqual([])
  expect(recovery.availableDrafts.value).toEqual([])
})
