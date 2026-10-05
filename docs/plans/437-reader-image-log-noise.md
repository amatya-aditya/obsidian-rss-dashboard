---
status: in-progress
created: 2026-10-04
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/437
milestone: ""
owner: unassigned
workstream: ""
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Stop logging remote image load failures

**Risk:** Low. This changes console output in two render paths; it does not
change image recovery, rendering, persistence, or cross-platform behavior.

## Goal

Keep ordinary third-party image load failures from filling Obsidian's developer
console with plugin messages that duplicate Chromium's resource errors. A
remote image load failure is not, by itself, a plugin failure.

Obsidian's [plugin self-critique checklist](https://docs.obsidian.md/oo/plugin)
advises against unnecessary `console.log` calls and asks plugins to remove
testing logs that are not needed in production. This change applies that
console-noise guidance to the per-image `console.error` and recovery
`console.warn` described in #437; the checklist itself names `console.log`.

## Accepted contract

- Remove the per-image `console.error` from both the ReaderView and
  ArticleRenderer image error handlers.
- Remove the `console.warn` emitted when Substack image recovery succeeds.
- Preserve both handlers' Substack recovery and image rendering behavior.
- Keep both handlers behaviorally equivalent; do not extract a shared helper in
  this change.
- Keep #439 separate. Its YouTube embed fix changes sanitized article output,
  which #437 explicitly excludes.
- When an article has broken images, the plugin adds no image-load log lines;
  Chromium's own resource errors may still appear.

## Implementation and tests

- `src/views/reader-view.ts` and `src/components/article-renderer.ts`: both
  error handlers now call only their existing Substack recovery method.
- `test_files/unit/views/reader-view-article-render.characterization.test.ts`:
  assert that failed remote images and successful recovery add no plugin log
  messages while retaining the recovery behavior checks.
- `test_files/unit/components/article-renderer-image-error.test.ts`: cover the
  same no-log failure and recovery behavior through ArticleRenderer.

## Validation

- Focused reader and ArticleRenderer tests passed: 159 tests.
- GitHub Actions on PR #772 passed the coverage suite: 5,132 tests across 315 files.
- `npm run lint`, source and test TypeScript checks, `npm run check:platform`,
  `npm run check:architecture -- --base HEAD`, and `npm run build` passed.
- `npm run fixture:vault` prepared `.fixture-vault` from the successful build.
- Verified `.fixture-vault/.obsidian/plugins/rss-dashboard/main.js` exists.

## Manual test checklist

1. ✅ **Pass — build and install:** `npm run build`, then
   `npm run fixture:vault`; the build completed and
   `.fixture-vault/.obsidian/plugins/rss-dashboard/main.js` exists.
   **Route:** Script/CLI.
2. ⏭ **Hand-off — ArticleRenderer failure:** Set the fixture's reader location
   to `inline` and open “CDN image resizing.” The inline article rendered, but
   `document.querySelector(".rss-reader-responsive-img")` returned no element,
   so the ArticleRenderer image failure could not be triggered through this
   route. Its visible Cloudinary image was rendered as a separate hero image.
   **Route:** Obsidian UI. The fixture reader location was restored to `main`.
3. ✅ **Pass — ReaderView failure:** In ReaderView, set the hero image's `src`
   to `https://image-failure-test.invalid/image.jpg`. Expect Chromium's
   resource error and no RSS Dashboard image-load message.
   **Route:** Obsidian UI. DevTools reported `GET
   https://image-failure-test.invalid/image.jpg net::ERR_NAME_NOT_RESOLVED`
   after setting the existing `rss-reader-fallback-hero` image. No RSS
   Dashboard image-load log appeared. Reloading the fixture restored the
   original hero image.
4. ⏭ **Hand-off — Substack recovery:** In the disposable fixture vault, add
   the live feed `https://noahpinion.substack.com/feed` and open “Four eras of
   San Francisco tech culture,” the reproduction article from [#439]. In each
   render path, block `substackcdn.com/image/fetch/*` in DevTools before
   reloading. Expect no RSS Dashboard recovery warning/error and confirm the
   hero image, inline images, and captions remain visible after recovery.
   **Route:** Obsidian UI. Not run; requires adding the live feed, DevTools
   network blocking, and confirmation of recovered images and captions.

The fixture UI was available. The ReaderView failure produced only Chromium's
resource error; reloading restored its original hero image. The inline article
route opened, but no ArticleRenderer image target was available to fail. The
ArticleRenderer failure and Substack recovery checks remain user checks. The
fixture reader location was restored to `main`. The changed handler behavior
and recovery branches are covered by the focused jsdom tests in both render
paths.

The replacement change is prepared on `fix/437-reader-image-log-noise`, based on the current `dev` tip. The earlier `refactor/` PR passed its build after correcting escaped newlines in the remote file content, then correctly stopped at the characterization-test guard. This fix branch updates only the two image-log expectations that the behavior change invalidates. GitHub Actions on PR #772 passed build validation and all 5,132 tests across 315 files; the refactor-only guard was skipped on the `fix/` branch.

## Deferred work

The recognized YouTube embed transformation in #439 remains a separate bug fix
with its own sanitizer and rendering acceptance criteria.

[#439]: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/439
