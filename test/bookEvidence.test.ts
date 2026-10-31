import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import sources from '../docs/evidence/reading-options/sources.json'

for (const excerpt of sources.excerpts) {
  it(`source evidence integrity: ${excerpt.file}`, () => {
    const bytes = readFileSync(`docs/evidence/reading-options/${excerpt.file}`)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      excerpt.imageSha256,
    )
    expect(excerpt.pdfSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(excerpt.pdfPage).toBeGreaterThan(0)
  })
}
