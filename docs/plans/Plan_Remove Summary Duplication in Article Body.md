## Plan: Remove Summary Duplication in Article Body

Apply a low-risk deduplication fix in rendering so summary content is not shown both as a callout and as main body when the underlying HTML differs only by encoding/formatting. Keep parser fallback behavior unchanged for feed compatibility.

**Status**

Completed 2026-04-22. All original and follow-on regressions resolved; 17/17 tests passing.

Implemented scope:

- Strengthened HTML equivalence normalization in renderer paths so encoded-vs-decoded equivalent content is treated as the same visible text.
- Expanded fetched full-article cleanup in renderer and reader view to handle a second real-world failure mode discovered during implementation: lead icon/media blocks and duplicated lead summary/dek content surviving in fetched article bodies.
- Preserved parser behavior; no feed-parser fallback semantics were changed.

Attempted outcome:

- Feed description callouts still render when description and body are genuinely distinct.
- Focused regression tests show encoded-vs-decoded equivalent content no longer renders twice in the specific modeled cases.
- Focused regression tests show feed-provided hero images win over fetched lead icon/media images in the specific modeled cases.
- Focused regression tests show short lead-in kicker text and duplicated lead summary text are removed from fetched article bodies in the specific modeled cases.

Actual current outcome:

- All known repros resolved across both renderer paths.
- Skip-to-content links are stripped in full-article mode.
- Anchor-wrapped duplicate lead images are removed when feed hero already exists.
- Duplicate caption/credit blocks adjacent to removed lead media are cleaned up.
- The `rss-reader-description-callout` is preserved in all tested cases.
- 17/17 regression tests pass across both renderer suites.

**Steps**

1. Completed: confirmed dedupe branch behavior in src/components/article-renderer.ts and src/views/reader-view.ts, and verified parser fallback paths in src/services/feed-parser.ts remained reference-only.
2. Completed: added focused RED regression tests for duplicate-summary scenarios, including encoded-vs-decoded equivalence and fetched full-article Ars-style lead-stack cases.
3. Completed: proved RED by running the new/updated tests and capturing failing assertions before production changes.
4. Completed: implemented the initial GREEN fix by strengthening isEquivalentHtml normalization in src/components/article-renderer.ts.
5. Completed: mirrored the equivalence fix in src/views/reader-view.ts.
6. Completed: expanded renderer-only cleanup after RED cases exposed a second bug in fetched full-article rendering. The implementation now attempts to strip duplicated lead summary blocks, short lead-in kickers, and early lead media from fetched article bodies while preserving feed hero images.
7. Completed: ran targeted tests and narrow lint/diagnostic validation on touched files.
8. Completed: second round of fixes on 2026-04-22 resolved the remaining live repros.
   - Added inline SVG stripping (gated on full-article fetch path) to `populateArticleHtml` in both renderer paths.
   - Replaced the early-exit-on-zero guard in `stripDuplicateLeadContentFromDocument` with a fast path (direct-children scan, original logic) and a new slow path that queries `header p, header div` descendants — fixing the Readability single-root-wrapper case where only 1 direct body child existed.
   - Added two new regression tests to `reader-view-duplication.test.ts`: SVG stripping and Readability-nested description dedup.
   - All 9 tests in the duplication suite pass.
9. Completed: third-pass fixes on 2026-04-22 resolved the follow-on Ars-style lead-stack regression.
   - Added skip-link removal (gated on full-article fetch path): `a[href^="#"]` elements with skip-related text/class/aria attributes.
   - Expanded `removeLeadImageElement` to handle `<a>`-wrapped responsive images, using canonical URL comparison ignoring size suffixes.
   - Added caption/credit dedup helpers targeting `figcaption`, `[id*="caption"]`, and short credit paragraphs in the lead region.
   - Extended `reader-view-duplication.test.ts` with 3 new tests (skip-link, anchor-wrapped hero, caption/credit); extended `article-renderer-summary-dedupe.test.ts` with parity fixtures.
   - All 17 tests pass across both suites.

**Relevant files**

- src/components/article-renderer.ts — updated isEquivalentHtml, main-body cleanup, hero precedence, and duplicate lead-content stripping.
- src/views/reader-view.ts — aligned dedupe and fetched-body cleanup behavior with article-renderer.
- src/services/feed-parser.ts — reference only; no behavior change was made.
- test_files/unit/components/article-renderer-summary-dedupe.test.ts — added regression coverage for equivalence and Ars-style fetched-body duplication.
- test_files/unit/views/reader-view-duplication.test.ts — added matching reader-view regression coverage.
- test_files/unit/views/reader-view-duplication.test.ts — extend with new fixture covering skip-link + anchor-wrapped duplicate hero + duplicate caption/credit.
- test_files/unit/components/article-renderer-summary-dedupe.test.ts — add parity fixture for the same shape.

**Work Attempted**

1. Added renderer-path text equivalence normalization for encoded-vs-decoded HTML and whitespace differences.
2. Added Ars-style RED regressions covering:
   - duplicated summary/dek in fetched full-article body
   - feed hero vs fetched lead icon/media precedence
   - short lead-in kicker text before the real article body
3. Patched main-body rendering to pass feed description HTML into fetched-body cleanup while leaving the callout path intact.
4. Added duplicate-lead stripping helpers that try to:
   - normalize visible text including quote normalization
   - remove a top-level block that matches the feed description text
   - remove short lead-in blocks immediately before that matched block
   - remove early lead media when a feed hero exists
5. Mirrored the same implementation in both article-renderer and reader-view.
6. Validated the touched code with focused tests, eslint, and diagnostics.

**Verification**

1. Completed RED proof: targeted regression tests failed before the fetched-body cleanup change.
2. Completed GREEN proof: re-ran the same focused suite after the code changes and all tests passed.
3. Verified encoded-vs-decoded equivalent content renders once rather than as both callout and body.
4. Verified genuinely distinct description/content still renders as callout + body.
5. Verified Ars-style fetched full articles keep feed hero images, remove lead icon/media from the body, and strip duplicated lead summary/kicker content from the body.
6. Ran `npx vitest run test_files/unit/components/article-renderer-summary-dedupe.test.ts test_files/unit/views/reader-view-duplication.test.ts` with 13/13 tests passing.
7. Ran `npx eslint src/components/article-renderer.ts src/views/reader-view.ts` with no output.
8. Checked diagnostics for the 4 touched files and found no errors.
9. Post-implementation user verification confirmed the live issue is resolved.
10. Second-round fixes passed all 9 tests in `reader-view-duplication.test.ts`.
11. Completed: third-pass verification for the follow-on regression.

- RED fixtures added for skip-link + anchor-wrapped lead-image + caption/credit shape.
- GREEN confirmed after targeted cleanup updates in both renderer paths.
- `rss-reader-description-callout` verified intact.
- Section kicker text preserved (intentional non-change).
- `npx vitest run` on both suites: 17/17 passed.
- User live verification confirmed fix effective.

**Difficulties Encountered**

1. The focused test fixtures were narrower than the real failing HTML returned in the live app. They modeled a top-level `<figure>/<img> + <p>kicker + <p>duplicate summary` structure, but the live issue still shows a rendered SVG/icon and duplicated summary after the cleanup.
2. The lead-media cleanup currently targets early `img/figure/picture` patterns before the first substantial paragraph. The live icon may be arriving through a different structure, such as:
   - nested wrappers that are not top-level body children
   - inline SVG or icon markup rather than an `<img>` tag
   - site chrome preserved by Readability in a form not covered by the current heuristics
3. The duplicate-summary cleanup currently looks for an exact normalized text match on a top-level block before the first substantial paragraph. The live duplicate may be surviving because it is:
   - nested deeper than the current top-level child scan
   - concatenated with other text/content instead of isolated in a single block
   - represented with punctuation/markup differences that still evade the current normalization
4. The work validated successfully in focused automated tests, but those tests did not faithfully capture the exact live DOM/readability output for the reported Ars examples.
5. Manual live verification happened after the code changes, so the test model and implementation were already biased toward a simplified repro instead of the exact fetched HTML that still fails.

**Decisions**

- Chosen approach: rendering dedupe fix (recommended), not parser fallback removal.
- Included scope: dedupe behavior in renderer paths + regression tests, later expanded to fetched full-article lead-content cleanup after real feed repros showed the minimal equivalence fix was insufficient on its own.
- Excluded scope: parser fallback semantics and feed ingestion model changes.
- Rationale: parser fallback supports feeds with summary-only payloads; removing it risks empty bodies.

**Current Assessment**

- Completed. All repros across original and follow-on cases are resolved in both renderer paths.
- 17/17 regression tests pass. No TypeScript or lint errors in touched files.
- User confirmed live fix effective on 2026-04-22.

**Further Considerations**

1. Optional follow-up: centralize HTML equivalence logic in a shared utility to prevent drift between article-renderer and reader-view.
2. Optional follow-up: add telemetry/debug logging for dedupe decisions behind a dev flag when diagnosing feed-specific anomalies.
3. Guardrail for next pass: keep cleanup constrained to full-article mode and lead-stack region only; avoid global removals that could strip legitimate body content.
