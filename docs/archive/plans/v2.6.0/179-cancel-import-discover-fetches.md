---
status: implemented
created: 2026-08-21
completed: 2026-08-22
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/179
milestone: ""
owner: unassigned
workstream: refresh
sequence: null
depends_on:
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/173
release_requirement: ""
released_in: 2.6.0
implementation: 8892e9b
---

# Cancel OPML and Discover feed fetching

## Problem and user value

The global refresh workflow exposes a Stop action in the sidebar and All feeds
refresh area, but fetching started by OPML import and Discover Add actions does
not participate in that lifecycle. Users can see ongoing work without a way to
stop it, especially when Discover Add all starts a large batch.

## Agreed behavior

- OPML import, Discover Add single, and Discover Add all use the shared global
  cancellable operation contract alongside normal global refresh.
- Stop cancels active requests where supported, prevents queued requests from
  starting, and prevents late results from mutating state.
- Existing registrations and successfully committed results remain; feeds not
  yet registered or processed are not applied after cancellation.
- Existing fetch concurrency limits remain unchanged.
- Cancellation is silent, while genuine failures retain existing reporting.
- Only one global operation may own the spinner and Stop control at a time.
- The global operation remains owned by the plugin when a modal or Discover
  view closes, and stale cleanup cannot change a newer operation's UI state.

## Acceptance criteria

1. OPML import exposes the global spinner and Stop action while fetching.
2. Discover Add single exposes the same Stop action and cancellation behavior.
3. Discover Add all exposes the same Stop action, cancels active work, and
   halts queued work.
4. Stop checks cancellation before each queued request and propagates the
   shared abort signal to supported request paths.
5. Results completed before Stop remain persisted and visible; late results
   cannot mutate feed data or completion state.
6. Cancellation does not create an additional fetch error or error notice.
7. Stop clears the active operation and restores the normal refresh control
   only after cleanup settles; a new operation cannot be hidden by stale
   cleanup.
8. Duplicate/already-followed Discover feeds are filtered before queueing.
9. Existing normal refresh behavior remains unchanged when Stop is unused.
10. Focused regression tests cover OPML, Discover single, Discover all, queue
    cancellation, partial completion, cancellation races, UI lifecycle, and
    modal/view teardown.

## Implementation direction

- Reuse the cancellation coordinator and global progress state introduced by
  the existing global refresh implementation; do not create a second spinner
  or Stop state.
- Trace OPML import and Discover follow/add paths to the shared fetch boundary,
  passing the operation signal and operation identity through queue and commit
  seams.
- Keep feed registration and fetch-result commit boundaries explicit so partial
  work survives while unprocessed work is discarded.
- Guard all finalizers and UI updates with operation identity checks.
- Add behavior-level tests under the matching `test_files/unit/` directories,
  using jsdom and the repository Obsidian stubs.

## Affected surfaces and risk

- Affected: `main.ts`, OPML import, Discover add flows, shared fetch/refresh
  services, sidebar/global progress UI, and matching unit tests.
- Risk: high. This crosses shared orchestration, persistence, asynchronous
  cancellation, and multiple user-facing entry points.
- Non-goals: individual feed-row refresh cancellation, new retry behavior, or
  rolling back feeds already registered before Stop.

## Validation and manual checks

- Follow Red -> Green -> Refactor with focused regression tests first.
- Run ESLint for every changed TypeScript file, `npm run check:platform`,
  TypeScript checking, focused tests, the full unit suite for this shared
  orchestration change, and `npm run build`.
- Manually verify OPML import, Discover Add single, Discover Add all, active
  and queued cancellation, partial persistence, silent cancellation, modal
  dismissal, sidebar Stop behavior, and starting a new operation after cleanup.

## Delivered validation

- Focused regression tests: 3 files, 24 tests passed.
- Platform compatibility audit passed.
- Changed-file ESLint passed.
- Full unit suite and production build were completed successfully.

## Lifecycle

The implementation is complete and is archived as unreleased pending release
cut.
