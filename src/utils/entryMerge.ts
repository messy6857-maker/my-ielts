import { mergeDeletionEntries } from './retention'
import { mergeWriters } from './statsArchive'
import type { Envelope } from './storage'
import { compareStamp } from './storage'
import { mergeLegacy } from './legacyMerge'

/** Identical merge rules for cloud replies and manual restores. */
export function mergeEntry(
  base: string,
  previous: Envelope | undefined,
  incoming: Envelope,
): Envelope {
  if (!previous)
    return incoming
  const latest = compareStamp(previous, incoming) >= 0 ? previous : incoming
  if (!previous.deleted && !incoming.deleted) {
    if (base.startsWith('deletion_archive_v3__entry_')) {
      return {
        ...latest,
        value: {
          entries: mergeDeletionEntries(
            (previous.value as any)?.entries,
            (incoming.value as any)?.entries,
          ),
        },
      }
    }
    if (base.startsWith('stats_archive_v3__entry_')) {
      return {
        ...latest,
        value: {
          writers: mergeWriters(
            (previous.value as any)?.writers,
            (incoming.value as any)?.writers,
          ),
        },
      }
    }
    if (base.startsWith('checkin_years_v2__entry_')) {
      return {
        ...latest,
        value: [
          ...new Set([
            ...(Array.isArray(previous.value) ? previous.value : []),
            ...(Array.isArray(incoming.value) ? incoming.value : []),
          ]),
        ]
          .filter(x => Number.isInteger(x) && x >= 0 && x <= 365)
          .sort((a, b) => a - b),
      }
    }

    if (base === 'collection_retention_v3') {
      const cuts = { ...(previous.value as Record<string, string>) }
      for (const [table, cut] of Object.entries(
        (incoming.value as Record<string, string>) || {},
      )) {
        if (typeof cut === 'string' && cut > (cuts[table] || ''))
          cuts[table] = cut
      }
      return { ...latest, value: cuts }
    }
    if (base === 'archive_retention_v2') {
      const cuts = [
        (previous.value as any)?.cutoff,
        (incoming.value as any)?.cutoff,
      ].filter(
        c =>
          Array.isArray(c)
          && c.length === 3
          && Number.isFinite(c[0])
          && typeof c[1] === 'string'
          && typeof c[2] === 'string',
      )
      cuts.sort(
        (a, b) =>
          a[0] - b[0] || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]),
      )
      if (cuts.length)
        return { ...latest, value: { cutoff: cuts.at(-1) } }
    }
    if (previous.stamp[0] === 0 && incoming.stamp[0] === 0) {
      return {
        ...latest,
        value: mergeLegacy(
          base.split('__entry_')[0],
          previous.value,
          incoming.value,
        ),
      }
    }
  }
  return latest
}
