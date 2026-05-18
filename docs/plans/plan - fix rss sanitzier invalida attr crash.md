## Plan: Fix RSS Sanitizer Invalid Attribute Crash

Patch the rich HTML sanitizer so malformed attribute names (for example `src\":\"https:` from malformed Substack markup) are ignored instead of throwing, then add regression tests using the provided feed pattern to ensure reader body rendering continues for affected feeds.

This plan now also records the follow-on investigation into the Astral Codex / Substack image-rendering bug that persisted after the sanitizer crash fix. The sanitizer crash is fixed and covered by tests; the user-reported broken-image issue in the live plugin remains unresolved at the end of this session.

## TDD Approach

Using **red-green TDD methodology**:

1. **RED**: Write failing tests that expose the current crash with malformed attributes
2. **GREEN**: Implement minimal fix to make tests pass
3. **REFACTOR**: Clean up implementation if needed

**Steps**

### Phase 1: RED (Failing Tests)

1. Add failing unit test in [test_files/unit/utils/safe-html.test.ts](test_files/unit/utils/safe-html.test.ts) for Substack malformed attribute (`src\":\"https:` pattern):
   - Verify test currently throws `InvalidCharacterError` or similar
   - Test should check: no exception, valid attributes preserved, downstream nodes still render
2. Verify test fails with current implementation

### Phase 2: GREEN (Minimal Implementation)

3. Add `isValidAttributeName()` function in [src/utils/safe-html.ts](src/utils/safe-html.ts) to validate HTML attribute names (reject quotes, whitespace, control chars, JSON fragments)
4. Update `copySafeAttributes()` to:
   - Call `isValidAttributeName()` before generic `setAttribute` calls
   - Wrap generic attribute setting in try-catch to drop unsettable attributes silently
   - Preserve allowlist behavior for `href`, `src`, `poster`, `srcset`
5. Run tests to verify they pass (RED → GREEN)

### Phase 3: Coverage & Verification

6. Add reader-path regression test (if needed) to ensure rendered body stays non-empty with malformed attributes
7. Run full sanitizer and reader test suites
8. Manual verification with `https://www.astralcodexten.com/feed` in Reader view

**Relevant files**

- [src/utils/safe-html.ts](src/utils/safe-html.ts) — ✅ IMPLEMENTED: Added `isValidAttributeName()` validation and try-catch in `copySafeAttributes()` to handle malformed attributes gracefully.
- [test_files/unit/utils/safe-html.test.ts](test_files/unit/utils/safe-html.test.ts) — ✅ REGRESSION TESTS: Added malformed-attribute crash coverage, downstream DOM continuity assertions, strict-mode regression coverage, and Substack `srcset` handling regressions.
- [src/components/article-renderer.ts](src/components/article-renderer.ts) — ✅ MODIFIED AGAIN: Added custom-domain Substack feed-content preference based on rich feed-markup signatures after renderer-path investigation.
- [src/views/reader-view.ts](src/views/reader-view.ts) — ✅ MODIFIED AGAIN: Mirrored the same custom-domain Substack feed-content preference logic used in `ArticleRenderer`.
- [test_files/unit/components/article-renderer-summary-dedupe.test.ts](test_files/unit/components/article-renderer-summary-dedupe.test.ts) — ✅ ADDED: Renderer regressions for Substack media preservation, lead-media stripping, and custom-domain Substack feed-content preference.
- [test_files/unit/views/reader-view-duplication.test.ts](test_files/unit/views/reader-view-duplication.test.ts) — ✅ ADDED: ReaderView parity regression for custom-domain Substack feed-content preference.
- [src/styles/reader.css](src/styles/reader.css) — ✅ INSPECTED: No obvious CSS rule was found that would hide `picture` / `figure` / responsive images for the Substack wrapper structure under test.
- [docs/archive/astralcodex.txt](docs/archive/astralcodex.txt) — ✅ REFERENCE: Used as the real-world Astral Codex / Substack fixture for malformed rich HTML and broken-image follow-up debugging.

**Verification Results**

✅ **Phase 1 (RED)**: Wrote 4 failing tests that exposed `InvalidCharacterError` crash
✅ **Phase 2 (GREEN)**: Implemented minimal fix—all tests now pass
✅ **Phase 3 (Regression Testing)**: Targeted sanitizer, `ArticleRenderer`, and `ReaderView` suites passed after each change
✅ **Attribute Validation**: `isValidAttributeName()` correctly rejects quotes, whitespace, control chars
✅ **Defensive Fallback**: Try-catch wrapping prevents DOM truncation from single bad attribute
✅ **Content Preservation**: Valid attributes (href, src, srcset, alt) preserved; malformed attrs silently dropped
✅ **Downstream DOM**: Multiple malformed attributes no longer truncate subsequent content nodes
✅ **CDN Reachability Check**: A representative Astral Codex / Substack image URL returned HTTP 200 with `Content-Type: image/jpeg` and no redirects
⚠️ **Live Bug Status**: Despite passing regressions and focused validation, the user still reports that images do not load for the same Astral Codex article in the actual plugin UI

## Session Continuation: Astral Codex Image Bug

### What was completed this session

1. Confirmed the original sanitizer crash fix remained in place and moved debugging closer to the live rendering path.
2. Added and validated sanitizer regressions for malformed Substack attributes and browser-safe `srcset` fallback behavior.
3. Added renderer regressions to ensure Substack `picture` / `img` blocks remain renderable and are not removed by lead-media stripping.
4. Inspected the reader/article CSS path and did not find an obvious rule hiding Substack image wrappers.
5. Verified a representative `substackcdn.com/image/fetch/...` asset responds successfully over the network.
6. Identified that custom-domain Substack hosts such as `www.astralcodexten.com` were not treated as feed-content-preferred hosts, so the plugin could fetch source-page HTML through Readability instead of using the richer RSS payload.
7. Added focused RED regressions for custom-domain Substack behavior in both `ArticleRenderer` and `ReaderView`, then implemented a markup-based feed-content preference rule and got those tests passing.

### Attempts tried during this session

1. **Sanitizer hardening**
   - Added `isValidAttributeName()` and defensive `setAttribute` handling in `safe-html.ts`.
   - Outcome: fixed the crash, but did not resolve the user-reported broken-image bug by itself.
2. **`srcset` handling for Substack URLs**
   - First attempted to preserve comma-rich Substack `srcset` candidates.
   - Then changed approach to drop `srcset` entries whose URL token contains commas and rely on the plain `src` fallback.
   - Outcome: sanitizer and renderer tests passed, but the user still reported missing images in the real article.
3. **Lead-media stripping hypothesis**
   - Investigated `stripLeadMediaBeforeContent()` and related helpers in `ArticleRenderer` / `ReaderView`.
   - Added a regression proving non-duplicate early Substack image blocks survive before the first substantial paragraph.
   - Outcome: hypothesis falsified in tests.
4. **CSS / hidden DOM hypothesis**
   - Inspected `src/styles/reader.css` around `.rss-reader-article-content img` and `.rss-reader-responsive-img`.
   - Outcome: no obvious CSS rule was found that should hide or collapse the tested image structure.
5. **Network / CDN failure hypothesis**
   - Performed a header check against a representative Astral Codex image URL.
   - Outcome: hypothesis falsified for the tested URL; the CDN asset is reachable.
6. **Custom-domain Substack feed-content preference**
   - Added a rule to prefer feed content when the item contains strong Substack rich-markup signatures such as `data-component-name="Image2ToDOM"`, `image-link image2 is-viewable-img`, or `substackcdn.com/image/fetch/`.
   - Added passing regressions in both renderer paths.
   - Outcome: logic is covered by tests, but the live bug still persists according to the user.

### Current blocker

The remaining gap is that automated tests now cover the previously suspected sanitizer, `srcset`, lead-media, and custom-domain feed-preference branches, but the actual Obsidian plugin still reportedly fails to display images for the Astral Codex article. That means the unresolved bug likely depends on a live-only layer not reproduced in the current unit tests, such as:

1. a parser-to-storage-to-render interaction using the real feed item shape rather than hand-built HTML fragments,
2. a runtime Obsidian/WebView DOM behavior difference not represented in the test environment,
3. a mismatch between the real article payload used in-app and the fixture assumptions used in tests,
4. another post-sanitization or post-render mutation step not yet instrumented.

### Recommended handoff focus

1. Reproduce from the actual `astralcodex.txt` feed payload end-to-end instead of fragment-only regressions.
2. Capture the live DOM after render inside Obsidian and compare it against the DOM produced by the unit tests.
3. Instrument the decision tree that chooses between feed content and fetched Readability content for the failing item.
4. Inspect whether Obsidian runtime, lazy-loading, CSP, or subsequent DOM cleanup mutates the surviving image nodes.

**Decisions**

- Include: generic sanitizer hardening (cross-feed) rather than host-specific Substack branching.
- Include: regression tests that model malformed attributes directly in sanitizer fixtures.
- Include: markup-based feed-content preference for Substack-rich custom-domain items as an attempted mitigation, because custom domains do not match `*.substack.com` host heuristics.
- Exclude: relaxing URL safety policy (`javascript:` blocking, strict href/src gates) because this bug is exception-safety, not URL policy.
- Exclude: parser/pipeline rewrites in ReaderView; fix remains localized to sanitizer attribute handling.
- Exclude for this session: any additional behavioral fix attempt beyond documentation, because the user requested a documentation-only handoff.

**Further Considerations**

1. Decide whether to allow namespaced attributes (for example `xlink:href`) in rich mode. Recommendation: keep blocked unless explicitly required by a validated feed, to minimize attack surface.
2. Consider optional internal debug metric/count for dropped malformed attributes (dev-only) to aid future feed forensics without impacting runtime UI.
3. Add one end-to-end regression that starts from the real Astral Codex feed/XML fixture and follows parser → stored `FeedItem` → renderer/view DOM, since current passing regressions may still be too synthetic.

---

## Session 3: Root Cause Found — `sanitizeCDATA` Entity Corruption

### Root cause

Deep tracing of the real `astralcodex.txt` feed payload identified the actual root cause — **not** the sanitizer HTML attribute rewriting fixed earlier:

`getTextContent()` in `FeedParser` calls `sanitizeCDATA()` which unconditionally called `decodeHtmlEntities()` on the entire HTML string from `content:encoded`. This converts `&quot;` → `"` inside attribute values. The Astral Codex / Substack format stores JSON metadata in `data-attrs` attributes with all internal quotes encoded as `&quot;`:

```xml
<img data-attrs="{&quot;src&quot;:&quot;https://s3.amazonaws.com/...&quot;}" src="https://..." />
```

After `decodeHtmlEntities`, this becomes broken HTML:

```html
<img data-attrs="{"src":"https://s3.amazonaws.com/..."}" src="https://..." />
```

When `populateArticleHtml()` later parses this string with `DOMParser("text/html")`, the HTML5 parser sees `data-attrs="{"` and terminates the attribute at the inner double-quote. The `src` attribute survives because it appears before `data-attrs` in the markup and does not use `&quot;` entities.

### Cloudinary URL research

The `$s_!wKWJ!` segment in Substack CDN URLs is **not a security token**. It is a Cloudinary named transformation variable (`$s_` = variable, `!wKWJ!` = named transformation reference). Cloudinary signed URLs use the distinct `/s--ABCDEFGH--/` (HMAC) format. Named transformations are public and do not expire. The underlying S3 URL is percent-encoded in the CDN URL path tail.

In markdown context, Obsidian's link parser truncates URLs at `!` (this is the obsidian-clipper #450/#468 issue). This does **not** affect our plugin's HTML `<img src>` attribute, which is set via `setAttribute()` and retains the full URL.

### Fix implemented

Added `isHtml: boolean = false` parameter to `sanitizeCDATA()` and `getTextContent()`:

- When `isHtml = true`: CDATA markers are stripped, but `decodeHtmlEntities()` and whitespace collapse are skipped. The downstream `DOMParser("text/html")` handles entity decoding correctly.
- Plain-text callers (title, author, description, etc.) unchanged — continue to decode entities.
- HTML callers updated: `content:encoded`, `encoded`, and Atom `content`.

### Instrumentation added

Added `onerror` console logging to each `<img>` element rendered by `article-renderer.ts`. Open **Developer Tools** (Ctrl+Shift+I in Obsidian) to see the actual HTTP/CSP error for any image that still fails after this fix.

### Status after this session

| File                                                 | Status                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `src/services/feed-parser.ts`                        | ✅ FIXED — `sanitizeCDATA` / `getTextContent` with `isHtml` parameter |
| `src/components/article-renderer.ts`                 | ✅ INSTRUMENTED — `onerror` logging on img elements                   |
| `test_files/unit/services/feed-parser.test.ts`       | ✅ 3 regression tests added; all 73 tests pass                        |
| `docs/development/substack-cdata-entity-encoding.md` | ✅ Created — developer reference for this bug pattern                 |

⚠️ **Image display status**: The `src` URL is correctly present in the DOM after this fix. The `onerror` handler will surface the actual network/CSP failure reason if images still do not render in the live Obsidian environment.

---

## Session 4: Live 404 Diagnosis — Deleted Cloudinary Named Transformations

### New finding

The `onerror` instrumentation confirmed the failure cause. The browser console reports:

```
$s_!YDr_!:1   Failed to load resource: the server responded with a status of 404 ()
$s_!wKWJ!:1   Failed to load resource: the server responded with a status of 404 ()
$s_!SA5R!:1   Failed to load resource: the server responded with a status of 404 ()
```

The resource URLs that 404 are the Cloudinary named transformation CDN URLs — e.g.:

```
https://substackcdn.com/image/fetch/$s_!wKWJ!,w_1456,.../https%3A%2F%2F...s3...
```

The named transformations `YDr_`, `wKWJ`, and `SA5R` have been **deleted or renamed** on Substack's Cloudinary account. Requests to any URL containing these transformation tokens return HTTP 404. The browser labels each failing resource by the first path segment of its URL, which is why the console shows `$s_!YDr_!:1` as the "filename".

### Implications

- The entity-corruption fix (Session 3) was correct and necessary — it ensures the `src` attribute is fully present in the DOM. Without it the URL would have been broken before even making a network request.
- The 404 failure is purely a CDN/Substack-side issue: named transformations were removed. The plugin has no control over this.
- The underlying S3 source URL is encoded in the CDN path tail (percent-encoded after the last `/`). Decoding it gives a direct `https://substack-post-media.s3.amazonaws.com/...` URL that is publicly accessible and does not depend on any named transformation.

### Root cause of remaining failure

Cloudinary named transformations referenced in the `src` attribute (`$s_!TOKEN!`) no longer exist on Substack's Cloudinary account, causing HTTP 404 on every image request using those URLs.

### Proposed fix direction (not yet implemented)

When a Substack CDN URL containing `$s_!TOKEN!` returns 404, or proactively at parse time, rewrite the URL to use the S3 source URL extracted from the percent-encoded path tail:

1. **At parse time** (preferred): In `FeedParser`, after extracting `content:encoded`, detect `src` attributes whose value matches the pattern `https://substackcdn.com/image/fetch/.../<percent-encoded-url>` and rewrite them to the decoded source URL before storing the `FeedItem`.
2. **At render time** (fallback): In `article-renderer.ts`, use the `onerror` handler (already in place) to swap `img.src` to a fallback derived from the encoded tail if the CDN URL 404s.

Both approaches require percent-decoding the path tail of the Cloudinary fetch URL to recover the original S3 URL.

**Example transformation:**

```
Before: https://substackcdn.com/image/fetch/$s_!wKWJ!,w_1456,c_limit/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ffoo.png
After:  https://substack-post-media.s3.amazonaws.com/public/images/foo.png
```

### Status

- ✅ Entity corruption fix: complete and tested
- ✅ Instrumentation: `onerror` handler confirmed the 404 failure
- ❌ 404 URL rewrite: **not yet implemented** — requires implementation by the next agent

---

## Session 5: Parse-Time Rewrite Implemented and Validated

### What changed

1. Implemented parse-time rewriting in `FeedParser` so HTML extracted from `content:encoded` rewrites Substack CDN `img[src]` URLs of the form `https://substackcdn.com/image/fetch/.../<percent-encoded-url>` to the decoded S3 source URL before the item content is stored.
2. Added focused parser regressions for:
   - a minimal Substack `content:encoded` fixture, and
   - the real Astral Codex archived payload wrapped in a minimal valid RSS fixture.
3. Confirmed the narrow parser suite passed after the change.

### Files touched

- `src/services/feed-parser.ts` — added parse-time Substack `img[src]` rewrite in the HTML sanitize path.
- `test_files/unit/services/feed-parser.test.ts` — added regression coverage for minimal and real-world Astral Codex feed payloads.

### Validation

- ✅ `npx vitest run test_files/unit/services/feed-parser.test.ts` passed (`75/75`)
- ✅ editor diagnostics on the touched parser files reported no errors

### Outcome

The parser now stores decoded S3 image URLs in `item.content` for the covered test fixtures. However, the user still reported live Obsidian 404s after deleting and re-adding the feed, so the parser-only rewrite was insufficient.

---

## Session 6: Renderer / ReaderView Rewrite Implemented and Bundle Rebuilt

### What changed

1. Added a shared utility module `src/utils/substack-image-url.ts` to normalize Substack Cloudinary fetch URLs by decoding the percent-encoded tail back to the S3 source URL.
2. Applied that normalizer in both renderers so runtime HTML is rewritten even if Substack CDN URLs survive into the UI through non-parser paths:
   - `ArticleRenderer.populateArticleHtml()`
   - `ReaderView.populateArticleHtml()`
3. Extended the render-time normalization to:
   - `img[src]`
   - `img[srcset]`
   - `source[srcset]`
   - `a[href]` image wrappers
   - fallback hero images / `coverImage`
   - duplicate-image comparison keys used by hero/lead-media logic
4. Updated the relevant renderer and ReaderView regressions to expect decoded S3 URLs rather than preserved `substackcdn.com/image/fetch/...` URLs.
5. Rebuilt the plugin bundle with `node esbuild.config.mjs production` so `main.js` reflects the latest code.

### Files touched

- `src/utils/substack-image-url.ts` — added shared runtime URL normalizer helpers.
- `src/components/article-renderer.ts` — normalize Substack image URLs in rendered HTML and hero handling.
- `src/views/reader-view.ts` — ReaderView parity for the same runtime normalization.
- `test_files/unit/components/article-renderer-summary-dedupe.test.ts` — updated renderer regressions for decoded S3 URLs.
- `test_files/unit/views/reader-view-duplication.test.ts` — updated ReaderView expectations and added fetched-content rewrite coverage.

### Validation

- ✅ `npx vitest run test_files/unit/components/article-renderer-summary-dedupe.test.ts test_files/unit/views/reader-view-duplication.test.ts` passed (`22/22`)
- ✅ `npx eslint src/utils/substack-image-url.ts src/components/article-renderer.ts src/views/reader-view.ts test_files/unit/components/article-renderer-summary-dedupe.test.ts test_files/unit/views/reader-view-duplication.test.ts` passed
- ✅ `npx tsc --noEmit --skipLibCheck` passed
- ✅ `node esbuild.config.mjs production` completed and updated `main.js`
- ⚠️ `npm run build` still fails earlier in the repo on unrelated pre-existing lint issues outside this change (`safe-html.ts`, `feed-parser.test.ts`, `safe-html.test.ts`)

### Outcome

Despite the parse-time rewrite, render-time rewrite, passing focused regressions, and rebuilt bundle, the user still reports that live Obsidian rendering requests the old Cloudinary transformation URLs and receives the same 404s.

---

## Session 7: Latest Live Verification and Current Status

### Latest user-reported console output

The user still reports repeated 404s for Cloudinary named-transformation URLs after the parser rewrite, renderer rewrite, feed re-add, and bundle rebuild:

```text
$s_!YDr_!:1 Failed to load resource: the server responded with a status of 404 ()
$s_!wKWJ!:1 Failed to load resource: the server responded with a status of 404 ()
$s_!SA5R!:1 Failed to load resource: the server responded with a status of 404 ()
$s_!bpU5!:1 Failed to load resource: the server responded with a status of 404 ()
$s_!FIVM!:1 Failed to load resource: the server responded with a status of 404 ()
$s_!U54w!:1 Failed to load resource: the server responded with a status of 404 ()
$s_!7bDq!:1 Failed to load resource: the server responded with a status of 404 ()
```

The latest console also includes a fetch-path signal for a different Astral Codex item:

```text
[RSS Dashboard] Direct fetch returned blocked/empty response for https://www.astralcodexten.com/p/open-thread-434 (129227 chars). Attempting proxy...
[RSS Dashboard] No CORS proxy configured. Cannot retry blocked fetch.
```

There are also repeated `ResizeObserver loop completed with undelivered notifications` warnings, but those do not currently look like the root cause of the broken image requests.

### Current status

1. ✅ The original malformed-attribute sanitizer crash is fixed.
2. ✅ The `content:encoded` entity-corruption bug is fixed.
3. ✅ Parse-time Substack `img[src]` rewriting is implemented and covered by tests.
4. ✅ Render-time Substack `img/srcset/source/href/hero` rewriting is implemented and covered by tests.
5. ✅ The plugin bundle was rebuilt after the render-time rewrite.
6. ❌ The live Obsidian plugin still makes requests to `substackcdn.com/image/fetch/$s_!...` Cloudinary URLs and still receives 404s.

### What this means now

At this point the unresolved gap no longer looks like a simple absence of rewrite logic. Both parse-time and render-time rewrites exist, their focused regressions pass, and the runtime bundle was rebuilt, yet the live Obsidian plugin still requests Cloudinary transformation URLs. That leaves a broader investigative question: where, in the actual app flow, are the stale `substackcdn.com/image/fetch/...` URLs still entering or surviving?

Some plausible places this discrepancy could still be coming from are:

1. a runtime branch that bypasses the patched `populateArticleHtml()` paths,
2. stored or derived image fields other than `item.content` / `item.description` / `coverImage` that still contain `substackcdn.com/image/fetch/...`,
3. a WebViewer / webview / alternate reader path that uses raw HTML or raw URLs directly,
4. a stale in-memory or persisted item shape surviving re-add / refresh behavior,
5. a difference between the live failing article payload and the fixtures covered by the current unit tests.

### Exploratory handoff for a higher-capacity LLM

The most useful starting point may be to treat this as a runtime-observation problem rather than a missing-fix problem. The implementation history now suggests that the interesting question is not “how should Substack URLs be rewritten?” but “which live path is still producing the old URLs despite those rewrites existing?”

Useful angles that seem open:

1. Observing the actual `FeedItem` shape right before render, especially `content`, `description`, `coverImage`, `image`, and any first-image / hero-image derivations.
2. Determining which view or renderer path is truly active for the failing article in Obsidian, including whether feed content, fetched full-article content, ReaderView, ArticleRenderer, or a WebViewer-related path is the one that ultimately wins.
3. Comparing the live rendered DOM against what the unit tests imply should exist after normalization, with particular attention to `img[src]`, `img[srcset]`, `source[srcset]`, anchor `href`, and hero image `src`.
4. Looking for runtime code that still writes image URLs outside the patched normalizers, especially direct `createEl("img", ...)` calls, cover/hero extraction logic, WebViewer injection, or persistence/load transforms on `FeedItem`.
5. Reproducing against the exact live article currently failing rather than relying only on the archived `astralcodex.txt` sample or synthetic Substack fragments.
6. Exploring whether the separate fetch-path log for `open-thread-434` matters here, particularly if a blocked direct fetch or no-proxy fallback changes which HTML ends up rendered and preserves stale image URLs.

The main caution is simply that the next pass probably should not assume the rewrite logic is absent or obviously wrong. It may be more productive to let the live behavior reveal which branch is escaping the rewritten paths.

### Current handoff summary

- The rewrite logic has been implemented in both parse-time and render-time code paths and is covered by focused tests.
- The live plugin still emits Cloudinary named-transformation 404s, so the key unknown is now the specific live data/render path that still surfaces raw `substackcdn.com/image/fetch/...` URLs.
- The next investigation likely benefits more from runtime observation and fresh analysis than from assuming a predefined fix path.
