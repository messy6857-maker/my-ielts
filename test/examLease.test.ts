import { afterEach, beforeEach, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import { useExamRecovery } from '../src/composables/useExamRecovery'

const wrappers: any[] = []

function mountRecovery() {
  const started = ref(true)
  const submitted = ref(false)
  const answers = ref<Record<string, string>>({})
  const timeLeft = ref(3600)
  const testId = ref('cam21-test3')
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

function seedForeignDraft(leaseAgeMs: number) {
  const key = 'myielts_mock_draft_v1_reading_cam21-test3__session_other'
  localStorage.setItem(key, JSON.stringify({
    version: 1,
    kind: 'reading',
    testId: 'cam21-test3',
    attemptId: 'other-attempt',
    answers: { Q1: 'other' },
    timeLeft: 100,
    updatedAt: Date.now(),
  }))
  localStorage.setItem(
    'myielts_local_exam_session:other',
    String(Date.now() - leaseAgeMs),
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useAuth().currentUser.value = null
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  localStorage.clear()
  sessionStorage.clear()
})

it('后台节流节拍（60 秒前的心跳）仍判为活跃副本', () => {
  seedForeignDraft(60000)
  const recovery = mountRecovery()
  expect(recovery.availableDrafts.value).toHaveLength(1)
  expect(recovery.availableDrafts.value[0].activeElsewhere).toBe(true)
})

it('90 秒前的租约仍判过期，不把已死副本误判为活跃', () => {
  seedForeignDraft(90000)
  const recovery = mountRecovery()
  expect(recovery.availableDrafts.value).toHaveLength(1)
  expect(recovery.availableDrafts.value[0].activeElsewhere).toBe(false)
})

it('回可见时立即补一次本页签心跳', () => {
  const recovery = mountRecovery()
  expect(recovery).toBeTruthy()
  const leaseKey = Object.keys(localStorage).find(
    k => k.startsWith('myielts_local_exam_session:')
      && !k.endsWith(':other'),
  )!
  expect(leaseKey).toBeDefined()
  localStorage.setItem(leaseKey, String(Date.now() - 60000))
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(
    Math.abs(Date.now() - Number(localStorage.getItem(leaseKey))),
  ).toBeLessThan(5000)
})
