---
status: implemented
completed: 2026-08-21
released_in: 2.6.0
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/175
implementation: ""
---

# Fix Independent Dashboard Preview Display Settings

## Status and scope

- **Classification:** Bug fix.
- **Risk:** Medium. The existing shared display preferences affect two dashboard
  renderers and their settings UI, but require no persistence migration, new
  network domain, or parser change.
- **Canonical issue:** [#175](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/175).
- **Milestone:** `vNext`, **Required**.
- **Affected surfaces:** Dashboard Card View, Feed View, and Display settings.
- **Unaffected surfaces:** List View, Reader View, Discover, feed refresh and
  parsing, and persisted article metadata.

## Problem and user value

The existing **Show cover images** and **Show summary** preferences are stored
but ignored by the dashboard Card and Feed renderers. Both preview elements are
therefore always produced, and the cover-image setting description incorrectly
claims a Reader View scope.

Users need independent control over dashboard preview imagery and text. Turning
off cover-image previews must avoid their dashboard-only URL resolution and
remote image loading, while leaving preview summaries available when requested.

## Domain language

- A **cover-image preview** is the article image in a dashboard Card or Feed
  preview region; it is not a Reader image.
- A **preview summary** is the article excerpt in a Card overlay or summary-only
  preview, or in a Feed item's text region.

## Proposed behavior

Both preferences apply immediately after the user changes them: save the value
and rerender the active dashboard in either Card or Feed view.

| Show cover images | Show summary | Dashboard result |
| --- | --- | --- |
| On | On | Cover-image preview plus summary overlay in Card View; cover-image preview plus preview summary in Feed View. |
| On | Off | Cover-image preview only; Card View retains the image on hover. |
| Off | On | Preview summary only. |
| Off | Off | Neither preview element is produced. |

When **Show cover images** is off, Card and Feed renderers must not call their
dashboard preview-image resolver and must not create an image or Feed blur
background element. This does not remove, rewrite, or prevent parsing of the
stored `coverImage` or `image` fields.

When **Show summary** is off, Card View must not create a summary overlay or a
summary-only fallback, including after a cover-image load error. Feed View must
not create its preview summary. The setting must not affect cover-image
visibility.

Update the cover-images setting description to: **"Display cover-image previews
in dashboard card and feed views. Turning this off reduces remote image loading
and can improve browsing performance."**

## Acceptance criteria

1. Card View implements all four preference combinations in the behavior table.
2. Feed View implements all four preference combinations in the behavior table.
3. With cover images disabled, neither renderer resolves a dashboard
   cover-image URL or creates image/blur preview elements.
4. With summaries disabled, neither renderer produces a preview summary;
   Card View also suppresses summary-only fallback after an image error.
5. Changing either preference saves it and immediately rerenders an active
   dashboard in Card or Feed view.
6. Existing image source precedence remains unchanged when cover images are
   enabled: Card View prefers `coverImage`, then `image`; Feed View prefers
   `image`, then `coverImage`.
7. List View, Reader View, Discover, feed parsing, refresh behavior, and
   stored image metadata remain unchanged.
8. The cover-images setting description accurately identifies its dashboard
   scope and the remote-loading/performance benefit.
9. In Card View, an image-only preview does not reveal the summary surface on
   hover; the cover image remains visible.

## Implementation direction

1. Add focused failing jsdom tests in the existing Card and Feed view test
   suites. Cover each combination, resolver non-invocation when imagery is off,
   and Card's broken-image fallback behavior.
2. Gate `resolveArticlePreviewImage` and all cover-image DOM creation behind
   `settings.display.showCoverImage`; keep existing candidate precedence.
3. Gate `getArticlePreviewSummaryText` and all preview-summary DOM creation
   behind `settings.display.showSummary`.
4. Update the Display settings handlers to rerender the active dashboard for
   both dashboard view styles after saving either preference, and correct the
   cover-images description.
5. Preserve owning-document and Obsidian DOM-helper conventions. No CSS change
   is expected except for scoping the Card hover reveal to cover containers that
   have a summary.

Likely files:

- `src/components/article-list/views/card-view.ts`
- `src/components/article-list/views/feed-view.ts`
- `src/settings/tabs/display-settings-tab.ts`
- `test_files/unit/components/article-list/views/card-view.test.ts`
- `test_files/unit/components/article-list/views/feed-view.test.ts`
- A focused settings-tab test if no existing behavior-level rerender seam can
  cover the handlers.

## Validation

- Passed focused Card View, Feed View, and Display settings tests (34 tests).
- Passed `npm run check:platform`.
- Passed `npm run build`, including compliance checks, ESLint, and TypeScript
  checking.
- Passed `npm run test:unit` (190 files, 1,687 tests).
- `git status --short` reported only the expected implementation, test,
  changelog, plan, and domain-language changes; the build created no unexpected
  tracked artifacts.

Manual checks passed locally on 2026-08-21, including visual inspection of the
four preference combinations and the image-only Card hover state.

## Manual checks

- In Card View and Feed View, verify all four preference combinations with an
  article that has both a cover image and a summary.
- Verify summary-only behavior with an article lacking an image and with a
  deliberately broken image URL.
- Toggle each preference while its affected dashboard view is open and confirm
  the result updates immediately.
- With cover images on and summaries off, hover a Card View cover image and
  confirm it remains visible without a blank preview surface.
- Confirm no preview image or blur-background request is initiated after cover
  images are disabled, using desktop developer tools when available.
- Verify desktop, mobile, popout, light-theme, and dark-theme dashboard views.
- Confirm Reader, List, and Discover behavior remains unchanged.

## Non-goals and risks

- No change to feed parsing, image URL persistence, cache, or refresh requests.
- No change to Reader, List, or Discover imagery and summaries.
- No new settings, migrations, dependencies, CSS policy changes, or image
  source-selection rules.
- Browser image loading is lazy and asynchronous; verification must prove that
  disabled dashboard previews do not add image or background elements, rather
  than attempting to retract requests already started before a toggle.

## Changelog and lifecycle

After implementation and validation, add one concise **Unreleased -> Fixes**
entry with the canonical issue link, archive this plan under
`docs/archive/plans/unreleased/`, and update the archive catalog and inbound
links.
