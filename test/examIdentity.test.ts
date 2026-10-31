import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createContext, runInContext } from 'node:vm'
import { expect, it } from 'vitest'

it('two documents with cloned sessionStorage still receive different exam draft namespaces', () => {
  const source = readFileSync('src/utils/examDrafts.ts', 'utf8')
  const code = source
    .slice(
      source.indexOf('let documentId'),
      source.indexOf('export function examAttemptId'),
    )
    .replace('export function', 'function')
  const document = () =>
    createContext({
      crypto: { randomUUID },
      sessionStorage: { getItem: () => 'same-copied-writer' },
      performance: { getEntriesByType: () => [{ type: 'reload' }] },
    })
  const first = document()
  const second = document()
  runInContext(code, first)
  runInContext(code, second)
  const a = runInContext('examSessionId()', first)
  const b = runInContext('examSessionId()', second)
  expect(a).not.toBe(b)
  expect(runInContext('examSessionId()', first)).toBe(a)
})
