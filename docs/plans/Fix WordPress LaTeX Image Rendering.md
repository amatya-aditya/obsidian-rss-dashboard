# Fix WordPress LaTeX Image Rendering

## Summary

WordPress formula images are currently mistaken for article media: the parser stores the first <img class="latex"> as coverImage/image, cards
stretch it into cover boxes, and both reader implementations promote it to a full-width hero. Preserve these formulas as inline images at their
intrinsic proportions while excluding them from all cover and hero selection.

## Key Changes

- Add a shared internal formula-image predicate that recognizes the latex class and WordPress-style /latex.php?latex=... URLs, including URL-only
  detection for previously stored articles.

- Update RSS parsing and cover extraction to skip formula images, continue searching for the next eligible image, and avoid retaining an old
  formula URL during feed refresh.

- Apply the same filtering defensively in card view, feed view, standalone Reader, and inline Reader so stale stored values immediately stop
  appearing as covers or heroes without a data migration.

- Ensure reader hero extraction and lead-media cleanup ignore formula images, leaving them in their original article position while still
  allowing a later genuine image to become the hero.

- Add scoped reader CSS for LaTeX images: intrinsic width, automatic height, inline alignment, no cover-style margins or rounding, and a max-
  width: 100% safeguard for unusually long equations.

- Rebuild distributable JavaScript/CSS carefully while preserving the unrelated existing worktree changes.

## Interfaces and Compatibility

- No user-facing settings, persisted schemas, or public API changes.
- Add only internal image-classification helpers.
- Existing stored feeds require no migration; render-time filtering handles stale formula-valued media fields, while subsequent refreshes correct
  those fields at ingestion.

- Add a compact WordPress RSS fixture derived from docs/temp/terencetau.xml; leave the supplied file untouched.
- Verify parsing preserves formula markup in article content but does not assign it to image or coverImage.
- Verify extraction skips a formula-only image and selects a later genuine image when present.
- Verify card and feed layouts render summary-only previews instead of covers for formula-valued stored media.
- Verify both reader routes create no formula hero, retain the inline formula image, and can still promote a later genuine image.
- Verify formula-only blocks are not removed by full-article lead-media cleanup.
- Run focused regression tests, then npm run test:unit, npm run lint, npm run check:platform, TypeScript with npm exec -- tsc --noEmit
  --skipLibCheck, the repository build, and git status --short to detect unexpected generated files.

## Assumptions

- WordPress formula images remain image-based rather than being converted to MathJax.
- Formula images are excluded only from media/hero roles; their source, srcset, alt, and article placement remain intact.
- Normal images, tracking-pixel rejection, image precedence, and existing hero deduplication behavior remain unchanged.
