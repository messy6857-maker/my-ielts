# Study data reliability fixes — 2026-10-26

Based on master `e5f8b1fb1158cb187e9a65e2f915a1fa79471ca0`.

This follow-up addresses all seven confirmed findings from the additional audit:

1. Track local revisions during uploads, drain newer snapshots before reporting
   success, serialize automatic/manual/logout uploads per credential, and ignore
   results belonging to a previous account.
2. Validate module data before importing an entire backup/cloud batch. Protect
   stored mistakes, progress, vocabulary schedules, daily counters, mastered
   items and writing histories with validated fallback reads. Accept normalized
   and legacy Task 2 AI cache fields.
3. Bind timer writes to their original account and settle timers before the
   logout upload. Stop active sessions when changing accounts.
4. Split running study time at local midnight so yesterday's accumulated total
   cannot be re-labelled as today's time.
5. Share daily-goal logic between vocabulary and keyword decks, refresh cached
   counters at midnight/on visibility changes, and preserve account boundaries
   when midnight and an account switch coincide.
6. Cancel delayed typing advances on edits, reset, chapter/account changes and
   unmount; validate the original word and input before advancing.
7. Migrate timer data using a rollback-safe write-and-remove batch. A failed
   replacement write no longer removes the untouched legacy record.

## Validation

- Original 85 tests plus 10 finding regressions, 16 lifecycle/schema cases and
  32 mock-test data structure checks: 143 tests pass across 14 files.
- Typecheck, expanded critical-module lint and production source build pass.
- Critical lint retains two existing native-confirm warnings.
- Local built-page smoke checks: home, typing and vocabulary flashcard pages
  render with the expected navigation, daily-goal and timer controls.
- Mock-test structure checks cover unique IDs, answer-option bounds and a
  40-point maximum across all 16 reading/listening test pairs; they do not
  independently verify answers against the source books.

Tests simulate network, time, storage errors and media. This source-only local
snapshot excludes large public media and Android assets. Real cross-device
server conflict semantics, microphone permissions, deployed media and APK
behavior still require integration verification. Existing storage keys remain
compatible with the sync server. Dependency major-version upgrades and large
vocabulary data-layout changes are separate from these reliability fixes.

Run:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run
pnpm run typecheck
pnpm run lint:critical
pnpm run build
```
