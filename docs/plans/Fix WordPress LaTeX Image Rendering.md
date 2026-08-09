# Render WordPress Formula Images as Native LaTeX

## Summary

WordPress embeds formula source in images such as `latex.php?latex=...`. Decode
that source and render it through the existing Obsidian MarkdownRenderer/MathJax
lifecycle instead of displaying the remote bitmap. Keep the original image as
the render-failure fallback and continue excluding formula images from cover and
hero roles.

## Key Changes

- Recognize formulas by an exact `latex` class token or a `/latex.php` URL with
  a `latex` query parameter. Decode query source first and use `alt` only as a
  fallback, with a 16,384-character safety limit.
- Extend the shared math pipeline to render recognized images as inline or
  display MathJax. A formula is display math when explicitly delimited or when
  it is the sole meaningful child of a paragraph, div, or figure.
- Preserve the original image node while rendering so it can be restored if
  MathJax fails. Stored feed HTML remains unchanged and needs no migration.
- Convert recognized images to Obsidian Markdown math delimiters (`$...$` or
  `$$...$$`) when saving an article.
- Centralize ordered media-candidate resolution for parsing, Card/Feed previews,
  Reader heroes, saved-article heroes, and formula-bearing lead-block guards.
- Retain intrinsic image CSS only for the fallback image state.

## Interfaces and Compatibility

- No settings, persisted schemas, or public APIs change.
- Reader display and saved Markdown are in scope; dashboard article-body formula
  rendering is not.
- Unsupported WordPress TeX restores the original image on screen.
- Existing stale formula-valued media fields are filtered at render time and
  corrected on refresh.

## Verification

- Cover percent encoding, `+` spaces, HTML entities, `alt` fallback, invalid
  input, length limiting, and ordinary images.
- Verify inline/display native rendering, theme-aware MathJax output, render
  failure fallback, and saved Markdown conversion.
- Verify formula images never become covers or heroes, later real images remain
  eligible, and formula-bearing lead blocks survive cleanup.
- Run focused regressions, the full unit suite, ESLint, platform checks,
  TypeScript `noEmit`, the repository build, and final artifact inspection.

## Assumptions

- Obsidian MathJax supports the WordPress TeX subset in the supplied fixture.
- The two Reader implementations remain separate, but share math and media
  policy helpers.
- Unrelated worktree changes remain untouched.
