/** Shared source of truth for persisted mistake modules, labels and TS types. */
export const MISTAKE_MODULE_LABEL = {
  vocabulary: '词汇拼写',
  typing: '打字练习',
  listening: '听力 179',
  reading: '阅读 538',
  writing: '写作翻译',
} as const
export type MistakeModule = keyof typeof MISTAKE_MODULE_LABEL
export function isMistakeModule(value: unknown): value is MistakeModule {
  return typeof value === 'string' && Object.hasOwn(MISTAKE_MODULE_LABEL, value)
}
