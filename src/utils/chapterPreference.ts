import { accountKey } from './storage'

/**
 * Read a preferred chapter id for the current account.
 * Falls back to the bare legacy key (pre-namespaced) when the scoped key is empty.
 */
export function readChapterPreference(
  base: string,
  chapters: string[],
  user: string | null,
  fallback = chapters[0] ?? '',
): string {
  const scoped = localStorage.getItem(accountKey(base, user))
  const legacy = localStorage.getItem(base)
  const value = scoped ?? legacy
  return chapters.includes(value ?? '') ? value! : fallback
}

/** Persist a chapter preference under the account-scoped key. */
export function writeChapterPreference(
  base: string,
  chapter: string,
  user: string | null,
) {
  try {
    localStorage.setItem(accountKey(base, user), chapter)
  }
  catch {
    /* quota / private mode: preference is best-effort */
  }
}
