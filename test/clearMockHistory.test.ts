import { beforeEach, expect, it } from 'vitest'
import { useAuth } from '../src/composables/useAuth'
import {
  clearMockHistory,
  getMockHistory,
  saveMockRecord,
} from '../src/composables/useMockHistory'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useAuth().currentUser.value = null
})

function seedDraft(key: string, value: Record<string, unknown>) {
  localStorage.setItem(key, JSON.stringify(value))
}
function draft(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: 'reading',
    testId: 'cam21-test3',
    answers: { Q1: 'a' },
    timeLeft: 100,
    updatedAt: Date.now(),
    ...overrides,
  }
}

it('清记录同步清除本账号已交卷快照，但不动进行中草稿与他人快照（B3）', () => {
  expect(saveMockRecord({
    id: 'cam21-test3',
    label: '剑21 Test 3',
    kind: 'reading',
    score: 2.5,
    total: 40,
    band: 5,
  })).toBe(true)
  seedDraft(
    'myielts_mock_draft_v1_reading_cam21-test3__session_s1',
    draft({ submitted: true }),
  )
  seedDraft(
    'myielts_mock_draft_v1_reading_cam21-test3__session_s1__submitted_abc',
    draft({ submitted: true }),
  )
  seedDraft(
    'myielts_mock_draft_v1_reading_cam21-test3__session_s2',
    draft(),
  )
  seedDraft(
    'myielts_mock_draft_v1_reading_cam21-test3__session_s2__recovery_r1',
    draft(),
  )
  seedDraft(
    'myielts_u_alice_mock_draft_v1_reading_cam21-test3__session_s9',
    draft({ submitted: true }),
  )
  clearMockHistory()
  expect(getMockHistory()).toEqual([])
  expect(
    localStorage.getItem('myielts_mock_draft_v1_reading_cam21-test3__session_s1'),
  ).toBeNull()
  expect(
    localStorage.getItem('myielts_mock_draft_v1_reading_cam21-test3__session_s1__submitted_abc'),
  ).toBeNull()
  expect(
    localStorage.getItem('myielts_mock_draft_v1_reading_cam21-test3__session_s2'),
  ).not.toBeNull()
  expect(
    localStorage.getItem('myielts_mock_draft_v1_reading_cam21-test3__session_s2__recovery_r1'),
  ).not.toBeNull()
  expect(
    localStorage.getItem('myielts_u_alice_mock_draft_v1_reading_cam21-test3__session_s9'),
  ).not.toBeNull()
})

it('清记录前已不一致的旧快照（无对应记录）也会被清除（B3）', () => {
  expect(getMockHistory()).toEqual([])
  seedDraft(
    'myielts_mock_draft_v1_listening_cam19-test2__session_s1',
    draft({ kind: 'listening', testId: 'cam19-test2', submitted: true }),
  )
  clearMockHistory()
  expect(
    localStorage.getItem('myielts_mock_draft_v1_listening_cam19-test2__session_s1'),
  ).toBeNull()
})
