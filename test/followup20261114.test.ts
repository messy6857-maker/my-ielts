import { beforeEach, expect, it, vi } from 'vitest'
import {
  aiSettingsKey,
  claimLegacyAISettings,
  discardLegacyAISettings,
  getAISettings,
  hasAISettings,
  legacyAISettingsInfo,
  saveAISettings,
} from '../src/composables/useAISettings'
import { useAuth } from '../src/composables/useAuth'
import {
  alertDialog,
  confirmDialog,
  dialogQueue,
  registerDialogHost,
  settleDialog,
} from '../src/composables/useDialog'
import { currentBand, getMockHistory, saveMockRecord } from '../src/composables/useMockHistory'
import { isStudyKey } from '../src/utils/storage'

const auth = useAuth()
beforeEach(() => {
  localStorage.clear()
  auth.currentUser.value = 'alice'
  vi.restoreAllMocks()
})

function aiSettings(apiKey: string) {
  return {
    baseUrl: 'https://api.openai.com/v1',
    apiKey,
    model: 'gpt-4o-mini',
  }
}

it('aI settings are kept per account and never treated as study data', () => {
  saveAISettings(aiSettings('sk-alice'))
  expect(getAISettings().apiKey).toBe('sk-alice')
  auth.currentUser.value = 'bob'
  expect(hasAISettings()).toBe(false)
  saveAISettings(aiSettings('sk-bob'))
  auth.currentUser.value = null
  expect(hasAISettings()).toBe(false)
  auth.currentUser.value = 'alice'
  expect(getAISettings().apiKey).toBe('sk-alice')
  for (const user of ['alice', 'bob', null])
    expect(isStudyKey(aiSettingsKey(user))).toBe(false)
})

it('the old shared AI setting is not given to anyone until it is claimed', () => {
  localStorage.setItem('myielts_ai_settings_v1', JSON.stringify(aiSettings('sk-old-1234')))
  // 读设置不会把旧 Key 自动归给当前身份，也不会删掉旧数据
  expect(hasAISettings()).toBe(false)
  auth.currentUser.value = null
  expect(hasAISettings()).toBe(false)
  expect(legacyAISettingsInfo()).toEqual({ keyTail: '1234', baseUrl: 'https://api.openai.com/v1' })
  // 认领后只归认领者，旧数据删除
  auth.currentUser.value = 'bob'
  expect(claimLegacyAISettings()).toBe(true)
  expect(getAISettings().apiKey).toBe('sk-old-1234')
  expect(localStorage.getItem('myielts_ai_settings_v1')).toBeNull()
  expect(legacyAISettingsInfo()).toBeNull()
  auth.currentUser.value = 'alice'
  expect(hasAISettings()).toBe(false)
  expect(claimLegacyAISettings()).toBe(false)
})

it('the old shared AI setting can be deleted without claiming it', () => {
  localStorage.setItem('myielts_ai_settings_v1', JSON.stringify(aiSettings('sk-old-1234')))
  discardLegacyAISettings()
  expect(legacyAISettingsInfo()).toBeNull()
  expect(hasAISettings()).toBe(false)
})

it('mock history shows bands from the current conversion tables', () => {
  saveMockRecord({
    id: 'cam21-test1',
    label: 'L',
    kind: 'listening',
    score: 32,
    total: 40,
    band: 7,
  })
  saveMockRecord({
    id: 'cam21-test1',
    label: 'R',
    kind: 'reading',
    score: 19,
    total: 40,
    band: 5,
  })
  const bands = Object.fromEntries(getMockHistory().map(r => [r.kind, r.band]))
  expect(bands).toEqual({ listening: 7.5, reading: 5.5 })
  expect(currentBand({
    id: 'x',
    label: 'x',
    kind: 'reading',
    score: Number.NaN,
    total: 40,
    band: 6,
    date: '',
  })).toBe(6)
})

it('dialogs fall back to native boxes when no dialog host is mounted', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
  expect(await confirmDialog('sure?')).toBe(true)
  await alertDialog('note')
  expect(confirm).toHaveBeenCalledWith('sure?')
  expect(alert).toHaveBeenCalledWith('note')
})

it('dialogs resolve through the in-app host when it is mounted', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  const off = registerDialogHost()
  const first = confirmDialog('first?', { danger: true })
  const second = confirmDialog('second?')
  expect(dialogQueue.value.map(d => d.message)).toEqual(['first?', 'second?'])
  expect(dialogQueue.value[0].danger).toBe(true)
  settleDialog(dialogQueue.value[0].id, 'confirm')
  expect(await first).toBe(true)
  off()
  expect(await second).toBe(false)
  expect(dialogQueue.value).toEqual([])
  expect(confirm).not.toHaveBeenCalled()
})
