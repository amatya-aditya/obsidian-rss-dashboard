---
status: implemented
completed: 2026-08-19
released_in: unreleased
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/173
implementation: ""
---

# Cancel global refresh

## Problem and user value

Global refresh can take a long time when one or more feeds are slow or
unreachable. The all-feeds control currently indicates that a multi-feed
refresh is active but does not let the user stop it. Users need an immediate,
predictable way to stop further work without losing feeds that have already
been fetched.

## Proposed behavior

- A global refresh can be cancelled regardless of whether it was started
  manually, during startup, or by the automatic global schedule, including
  when only one eligible feed remains after exclusions.
- While a global refresh is active, the All feeds row remains selectable and
  its refresh area becomes a progress row showing completed versus targeted
  feeds.
- The refresh/spinner affordance transforms into a clearly labeled red Stop
  action. It works with mouse hover/focus, touch, and keyboard interaction.
- Clicking Stop requests cancellation of queued and in-flight feed work.
- Feed updates committed before cancellation remain saved.
- A response that settles after cancellation is ignored, even when the
  underlying request cannot abort immediately.
- The interface returns to the normal All feeds state and shows a concise
  “Refresh stopped” notice.
- Direct single-feed, folder, selected-feed, due-subset, and failed-only
  refreshes are outside this control's cancellation scope.

## Acceptance criteria

1. Manual, startup, and automatic global refreshes expose the same Stop
   behavior while active.
2. Stop prevents queued feeds from being attempted and propagates cancellation
   to in-flight fetches where the platform supports it.
3. Results committed before Stop remain in settings/storage and are rendered.
4. Results settling after Stop do not mutate feed data or refresh completion
   timestamps.
5. The progress row reports meaningful completed/targeted state and does not
   prevent selecting All feeds.
6. The stop action has accessible name, focus behavior, keyboard behavior, and
   touch behavior equivalent to its pointer behavior.
7. Cancellation clears active refresh state, restores the normal control, and
   emits one concise user-facing notice without reporting cancellation as a
   network failure.
8. Existing refresh, timeout, retry-failed, status-indicator, and persistence
   behavior remains unchanged when cancellation is not requested.
9. An abort-triggered parser rejection does not set or persist
   `lastFetchError`; cancellation is not presented as a feed failure.
10. A global operation is cancellable even when it targets exactly one eligible
    feed, while a due-subset operation remains non-cancellable.

## Implementation direction

- Extend the centralized refresh orchestration in `main.ts` with cancellation
  state for every active global operation (including the one-feed path) and a
  cancellation boundary that prevents late results and abort errors from being
  committed.
- Thread a caller-owned abort signal through the multi-feed refresh path and
  feed parser fetch path, while retaining each feed's timeout handling.
- Expose enough observable global progress/cancellation state for
  `src/components/sidebar.ts` to render the progress row and a keyboard- and
  touch-operable Stop button.
- Update the owning styles in `src/styles/` with scoped progress, focus, touch,
  and destructive-state treatment; do not use `!important`.
- Extend the existing refresh pipeline and sidebar rendering tests under
  `test_files/unit/main/` and `test_files/unit/components/` with behavior-level
  coverage for cancellation, partial persistence, abort-error persistence, late
  responses, keyboard accessibility, one-feed global refreshes, due-subset
  exclusion, and row selection.

## Validation and manual checks

- Run focused refresh-pipeline and sidebar tests, then `npm run test:unit` if
  the shared refresh contract changes broadly.
- Run ESLint, `npm run check:platform`, and TypeScript checking/build validation
  for all implementation changes.
- Manually test desktop pointer and keyboard use, mobile/touch use, startup
  refresh, automatic refresh, a slow feed, a failed feed, and a batch with both
  completed and pending feeds.
- Verify popout behavior, partial data persistence, no late updates after Stop,
  and normal refresh completion when Stop is not used.

## Non-goals, risks, and sequencing

- This does not add cancellation to individual feed rows or introduce a new
  refresh workflow.
- Abort is cooperative and may not terminate every network operation
  immediately; the commit boundary is therefore required even when transport
  cancellation races.
- Progress totals must remain stable for the lifetime of a global operation so
  the user does not see a misleading denominator as feeds settle.
- Implement after the existing refresh-status and retry-failed work; reuse
  their active-state and refresh-pipeline seams rather than adding a parallel
  registry.

## Milestone recommendation

Recommend `vNext` as **Stretch**: this is a focused, user-visible improvement
to an existing refresh workflow, but it is not required for the current
refresh-status or scheduling foundations to function.

## Open assumptions

- “Global refresh” includes manual, startup, and automatic full eligible-feed
  operations, but not due-subset or other scoped batches.
- Stop means no post-cancellation feed mutation; already committed results are
  authoritative and are not rolled back.

## Review follow-up (2026-08-19)

Implementation review identified four release-blocking regressions: the Stop
action had to be keyboard-operable; aborted requests could not persist
`lastFetchError`; a global refresh with one eligible feed had to use the
cancellable path; and due-subset refreshes had to remain outside the
cancellation scope. These corrections were completed and validated under
Beads item `obsidian-rss-dashboard-gyj`, retaining GitHub issue #173 as their
canonical external reference.
