// Assembled from chapters/*.json for sync consumers (tests / legacy).
// App pages should prefer loadVocabulary.ts (per-chapter dynamic import).
const modules = import.meta.glob('./chapters/*.json', { eager: true })

const vocabulary = {}
for (const [path, mod] of Object.entries(modules)) {
  const name = path.slice('./chapters/'.length, -'.json'.length)
  vocabulary[name] = mod.default
}

export default vocabulary
