# Code audit fixes — 2026-10-26

Based on master `259071dfeb5ca7679ac6ce2f8a67a560280abf9d`.

## Correctness

- Stop login synchronization on failed/malformed cloud reads. Check initial
  uploads and commit the new token/session only after successful synchronization.
- Keep existing storage keys compatible with the server; use exact module suffix
  validation to separate names such as `alice` and `alice_bob`. Validate imports
  before writing, exclude credentials, and roll back failed storage batches.
- Keep cached deck watchers in an independent effect scope so leaving a page
  does not silently disable persistence or account switching.
- Restore portable, versioned backup export/import with overwrite confirmation,
  account scoping, malformed-file checks and quota-error rollback.
- Reject over-selected/invalid multi-select answers, limit UI selections, and
  retain partial credit for valid answer counts.
- Notify automatic sync on mock-history saves and clears; persist explicit empty
  lists for clears. Separate visitor history from the real username `guest` and
  migrate only unambiguous legacy visitor data.
- Dispose recording streams, speech recognition, timers and Blob URLs on scope
  destruction, including permission requests resolving after unmount.
- Route programmatic audio through a managed player registry with scope cleanup;
  share URL resolution across Pages deployments and native builds.
- Validate all AI score/comment/correction fields and cached grades. Normalize
  Task 2 advice as well as scores, abort expired/unmounted requests, and discard
  stale responses when the essay or account changes.
- Fix listening-179 audio paths and validate the final practice item before
  attempting to advance to a nonexistent next row.

## Low-risk maintenance/performance

- Load daily reading archives by selected date, with loading/retry states and
  stale-response protection. The daily page chunk drops from 148.02 kB to
  12.63 kB in the local source build (4.60 kB gzip, archive chunks separate).
  This is a bundle-size comparison, not a measured end-to-end speed claim.
- Clone only the selected vocabulary chapter instead of the entire dictionary.
- Exclude uppercase-named component files from generated page routes.
- Remove ambiguous recorder/study-clock auto-import names, clean write-session
  timers, and refresh histories when switching accounts.
- Align pnpm to 8.6.10 and use Node 22 in deployment CI. Run tests, typecheck,
  critical-module lint and build before deployment; do not deploy PR builds.

## Verification

- 85 tests pass across 11 files: the original 43 plus 42 regression/lifecycle/UI
  cases. Network, AI and microphone behavior in tests uses local mocks.
- Typecheck passes; critical-module lint passes with two intentional native
  confirmation-dialog warnings. The existing full-repository lint baseline still
  includes large generated-data/style findings and is not presented as clean.
- Production source build passes. Large vocabulary/example chunks remain; their
  data-layout migration is intentionally outside this focused reliability patch.
- Local built-app browser smoke checks: home, daily reading and writing; no
  observed console errors on those views.

Local audit used a sparse checkout without large `public` media or Android assets.
Source build checks therefore do not replace full deployed-media/APK testing.
The VPS server implementation is not in this repository; server-side access
checks, cross-device conflict/version semantics and real AI/audio services still
require integration verification. Existing per-user study keys are not renamed.

Run the normal gates with:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run
pnpm run typecheck
pnpm run lint:critical
pnpm run build
```
