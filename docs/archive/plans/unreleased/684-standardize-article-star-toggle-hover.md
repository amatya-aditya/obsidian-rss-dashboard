---
status: implemented
created: 2026-10-01
completed: 2026-10-02
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/684"
implementation: "https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/690"
---

# Standardize Article Star Toggle Hover Styling

## Summary

Make article star toggles look and behave consistently across RSS Dashboard,
using the dashboard's filled yellow starred icon as the shared reference. The
dashboard's circular button background is dashboard-specific and stays in
place. Hovering a star toggle should darken its outline, including in dashboard
views where the outline currently does not respond like the Reader's.

## Problem and User Value

The star toggle has separate styling in dashboard article actions and the
Reader. The dashboard has a filled yellow star and a circular background, while
the Reader has its own action-button treatment. The dashboard star also lacks
the darker outline on hover that users expect from the Reader. Inconsistent
feedback makes the same article action feel different across views.

## Proposed Behavior

- Standardize the appearance and hover feedback of every article star toggle:
  dashboard card, list, and feed views; the dashboard inline Reader; and the
  dedicated Reader view.
- Preserve the dashboard's filled yellow starred icon and non-muted active
  color.
- Preserve the circular background on dashboard article controls. Do not apply
  it to Reader controls or change dashboard button geometry as part of this fix.
- Darken the star outline on hover consistently while preserving the starred
  yellow fill.
- Keep keyboard focus behavior and touch hit-area sizing outside this styling
  change; the pre-existing findings are tracked separately in #688 and #689.
- Exclude star icons whose meaning is not toggling an article's starred state,
  such as navigation filters and context-menu icons.

## Acceptance Criteria

1. All article star toggles use the same starred and unstarred icon treatment
   and state colors across dashboard and Reader views.
2. A starred article displays a filled yellow star with a non-muted active
   color.
3. Hovering any article star toggle darkens the star outline; the starred fill
   remains yellow.
4. Dashboard star buttons retain their existing circular background and
   geometry. Reader button geometry remains appropriate to its action toolbar.
5. Keyboard focus and touch interaction remain usable in desktop and mobile
   layouts.
6. Star icons for filters, menus, and other non-toggle purposes retain their
   current styling.

## Implementation Direction

Inspect and consolidate the article-star state and hover rules in:

- `src/styles/articles.css`
- `src/styles/card-view.css`
- `src/styles/reader.css`

Verify the corresponding rendered controls in `src/components/article-list/`
and `src/views/reader-view.ts` and `src/views/dashboard-view.ts`. Prefer shared
state and hover styling with context-specific dashboard background and sizing.
Do not introduce `!important`; resolve selector conflicts with scoped
specificity consistent with repository CSS rules.

## Validation

Automated checks completed:

- Red step: the new stylesheet contract test failed on the dashboard's
  hard-coded starred color and missing hover outline rule; the dashboard-circle
  preservation check passed.
- Green step: focused article-star, article-action, and Reader toolbar tests
  passed (3 files, 15 tests).
- `npm run check:css-scope` passed.
- `npm run check:important` passed.
- `npm run build` passed, including lint, type checks, test types, compliance,
  and production bundle generation.

Manual fixture-vault validation completed on 2026-10-02 through CDP; every
action was verified against `.fixture-vault/` before interacting. Dashboard
card, list, and feed views plus inline and dedicated Reader were checked in
dark and light surfaces. Starred and unstarred states, the darkened hover
outline with yellow fill preserved, and dashboard-only circular backgrounds
matched the contract. Test state was restored afterward. Keyboard inspection
found the Reader star is skipped by Tab because it is a non-focusable `div`;
this separate bug is tracked in #688. Coarse-pointer inspection at 390px found
the dashboard star hit target is 40px wide by 44px high; this separate sizing
bug is tracked in #689.

## Non-Goals and Risks

- No changes to star persistence, article state, hotkeys, context menus, or
  filtering.
- No changes to the dashboard's circular background or button geometry.
- CSS selector precedence may cause the active-state color to override hover
  feedback; validate both starred and unstarred hover states.

## Dependencies and Release

No dependencies are known. GitHub issue #684 has no milestone. Recommend
`vNext` only if this work is later scheduled into the release backlog; this
visual polish is not currently a release commitment.

## Risk

Low. The change only adjusts article-star CSS across dashboard and Reader
surfaces; it does not change persistence, article state, lifecycle behavior, or
platform APIs.

## Assumptions

- "All instances" means article-star toggle controls in every article view,
  not every decorative or navigational star icon.
- The dashboard's filled yellow starred icon is the preferred shared active
  state; its circular button background remains dashboard-specific.
