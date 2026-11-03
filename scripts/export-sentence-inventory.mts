import timings from '../src/pages/listening/sentence-timings.json'
import { transcriptSentenceEntries } from '../src/utils/text'
import fs from 'node:fs'
const mods: Record<string, any> = {}
for (const cam of [18,19,20,21]) {
  for (const t of [1,2,3,4]) {
    const id = `cam${cam}-test${t}`
    const m = await import(`../src/pages/mock/${id}-listening-transcript.ts`)
    const key = Object.keys(m).find(k => k.endsWith('ListeningTranscript'))!
    mods[id] = m[key]
  }
}
const report: any[] = []
const counts: Record<string, number> = {}
const inventory: any = {}
for (const [test, mod] of Object.entries(mods)) {
  for (const part of ['part1', 'part2', 'part3', 'part4']) {
    const entries = transcriptSentenceEntries(mod[part])
    const arr = (timings as any)[`${test}-${part}`]
    inventory[`${test}-${part}`] = {
      audio: `mock/${test}-listening-${part}.mp3`,
      sentences: entries.map((e, i) => ({
        text: e.text,
        display: e.display,
        speaker: e.speaker,
        old: arr?.[i] ?? null,
      })),
    }
    entries.forEach((e, i) => {
      const st = arr?.[i]?.[2] ?? 'missing'
      counts[st] = (counts[st] || 0) + 1
      if (st === 'tts')
        report.push({ key: `${test}-${part}`, i, text: e.text, display: e.display, old: arr[i] })
    })
  }
}
console.log(JSON.stringify(counts))
fs.mkdirSync('/tmp/align', { recursive: true })
fs.writeFileSync('/tmp/align/tts-sentences.json', JSON.stringify(report, null, 2))
fs.writeFileSync('/tmp/align/inventory.json', JSON.stringify(inventory))
console.log('tts', report.length, 'parts', Object.keys(inventory).length,
  'sentences', Object.values(inventory).reduce((a: any, b: any) => a + b.sentences.length, 0))
