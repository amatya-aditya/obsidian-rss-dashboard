# ADR 0044: Reopen the Last Closed Main Reader on Swipe

> See the [ADR index](README.md) for how to read and browse project decisions.

## Status

accepted

## Date

2026-11-16

## Context and problem

On Android, a right swipe from a Main Reader currently returns to the dashboard
while leaving the Reader tab open. The dashboard's left swipe can only reactivate
that attached tab, so it cannot restore the article after the Reader has been
closed. Earlier behavior in [Issue #1793](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1793)
intentionally kept the Reader leaf attached to support the return gesture.

The follow-up in [Issue #1803](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1803)
changes that interaction: returning should close the Reader, while swipe-left
should still give the user a way back to the article.

## Decision

When a Main Reader closes, remember its article for the current plugin session.
The most recently closed Main Reader replaces the previous remembered article,
regardless of which close route was used. A right swipe from Main Reader returns
to its dashboard and closes that Reader. A left swipe on the dashboard opens the
remembered article in a new Main Reader tab, with a new return path to the
dashboard. If the article is unavailable, swipe-left does nothing and shows no
error. Inline and sidebar swipe behavior remains unchanged.

## Consequences

### Benefits

- Returning to the dashboard closes the Reader tab, matching the Reader back
  button.
- The user can reopen the article after the original Reader leaf has detached.
- Remembering one article keeps the gesture a simple one-step return rather than
  adding a navigation history.

### Trade-offs

- Only the most recently closed Main Reader can be reopened; earlier closed
  Readers are not available through this gesture.
- The remembered article is lost when the plugin session ends.
- When the article can no longer be reopened, the gesture provides no feedback.

## Considered options

### Keep the Reader tab attached

This preserves the original leaf as a return target, but conflicts with the
desired behavior of closing the Reader on swipe-right and fails once the leaf is
closed by another route.

### Keep a stack of closed Readers

A history would allow multiple swipe-left actions to visit older articles, but
the issue asks for the last closed article and does not define history controls
or limits. A single remembered article keeps the gesture bounded and predictable.

### Remember one article for the session (chosen)

This supports the requested close-and-reopen loop without persisting navigation
state or changing existing inline and sidebar gestures.

## Related

- [GitHub Issue #1793](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1793)
- [GitHub Issue #1803](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1803)
