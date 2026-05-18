## Plan: Fix RSS Sanitizer Invalid Attribute Crash

Patch the rich HTML sanitizer so malformed attribute names (for example `src\":\"https:` from malformed Substack markup) are ignored instead of throwing, then add regression tests using the provided feed pattern to ensure reader body rendering continues for affected feeds.

**Steps**

1. Confirm sanitizer failure boundary in [src/utils/safe-html.ts](src/utils/safe-html.ts) by tracing `copySafeAttributes` fallback attribute copy and how exceptions bubble through `sanitizeAndAppendNode` and `sanitizeAndAppendHtml`.
2. Add a strict attribute-name gate in `copySafeAttributes` before generic `setAttribute` to allow only valid HTML attribute names and reject malformed names containing quotes/whitespace/control chars/JSON fragments. Preserve current allowlist behavior for `href`, `src`, `poster`, and `srcset`. _blocks step 3_
3. Add defensive fallback around generic attribute setting (drop invalid/unsettable attributes rather than throw) so one bad attribute cannot truncate the entire remaining article DOM subtree. _depends on step 2_
4. Add unit regression coverage in [test_files/unit/utils/safe-html.test.ts](test_files/unit/utils/safe-html.test.ts):
   1. malformed attribute-name case representative of Substack payload corruption (`src\":\"https:` pattern) does not throw and does not produce invalid attributes.
   2. sanitizer still preserves valid rich HTML structure and continues rendering downstream nodes after malformed attributes.
   3. existing URL-safety behavior for `href/src/srcset` remains unchanged.
5. Add/adjust reader-path regression assertion in existing reader tests (if available) to ensure the rendered article body remains non-empty when content includes malformed attributes in otherwise valid rich markup. _parallel with step 4 if tests are independent_
6. Run targeted verification suites for sanitizer and reader rendering, then run a manual feed check with `https://www.astralcodexten.com/feed` in Reader view to verify no console `InvalidCharacterError` and full body visibility.

**Relevant files**

- `c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/utils/safe-html.ts` — implement attribute-name validation and non-throwing generic attribute copy.
- `c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/utils/safe-html.test.ts` — add malformed-attribute regression tests and continuity assertions.
- `c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/article-renderer.ts` — verify this render path remains compatible since it calls `sanitizeAndAppendHtml` for rich content.
- `c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/reader-view.ts` — verify reader path behavior and add/adjust regression coverage if test fixture exists.
- `c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/docs/archive/astralcodex.txt` — reference fixture for malformed rich HTML shapes from Substack.

**Verification**

1. Run sanitizer unit tests: targeted `safe-html` test file and confirm new malformed-attribute tests pass.
2. Run reader/article rendering unit tests touching `ReaderView`/`ArticleRenderer` to confirm no regressions in rendering, banners, or image behavior.
3. Manual reproduce with Astral Codex feed item: verify console no longer logs `InvalidCharacterError` from `copySafeAttributes` and article body text/images render.
4. Spot-check another rich feed previously affected by sanitizer regressions (for example Ars-style rich markup) to ensure no behavior regression.

**Decisions**

- Include: generic sanitizer hardening (cross-feed) rather than host-specific Substack branching.
- Include: regression tests that model malformed attributes directly in sanitizer fixtures.
- Exclude: relaxing URL safety policy (`javascript:` blocking, strict href/src gates) because this bug is exception-safety, not URL policy.
- Exclude: parser/pipeline rewrites in ReaderView; fix remains localized to sanitizer attribute handling.

**Further Considerations**

1. Decide whether to allow namespaced attributes (for example `xlink:href`) in rich mode. Recommendation: keep blocked unless explicitly required by a validated feed, to minimize attack surface.
2. Consider optional internal debug metric/count for dropped malformed attributes (dev-only) to aid future feed forensics without impacting runtime UI.
