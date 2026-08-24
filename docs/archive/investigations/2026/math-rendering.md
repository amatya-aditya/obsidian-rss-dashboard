# Bug Report: MathJax Rendering & Saving Failure in RSS Dashboard

## 1. Current Description
Mathematical formulas embedded in RSS feeds are still rendering as plaintext in the Obsidian RSS Dashboard plugin, even after the first math rendering/saving pipeline fix.

Confirmed live failing source:

- Feed: `https://math.stackexchange.com/feeds`
- Example body excerpt:

```markdown
Let $f:\Delta\to\Delta$ be a continuous map such that $f(\Delta')\subseteq\Delta'$ for every facet of $\Delta$. How does one show that $f$ is surjective, via Sperner's lemma?

**Sperner's lemma.** If $\varphi:\mathcal{K}'\to\mathcal{K}$ is a simplicial map where $\mathcal{K}$ consists of faces of a simplex $\Delta$, such that $a\in\text{st}(\varphi(a))$ for every vertex $a$ of $\mathcal{K}'$, then there exists (odd number of) simplex $\Delta'\in\mathcal{K}'$ with $\varphi(\Delta') = \Delta$.
```

Observed behavior:

1. **Reader View UI**: formulas such as `$f:\Delta\to\Delta$`, `$\varphi:\mathcal{K}'\to\mathcal{K}$`, and `$\Delta'$` appear as raw plaintext instead of Obsidian-rendered MathJax.
2. **Saved Articles**: prior fixes targeted Markdown preservation, but UI rendering remains visibly broken in the live Obsidian environment.

## 2. Previous Implementation Fixes Already Applied

### A. Original DOM Text-Node Parsing
Initial fix in `src/utils/math-rendering.ts`:

- Added `processMathElements(container)`.
- Used a `TreeWalker` over text nodes.
- Matched raw dollar math with regex:

```ts
/(\$\$[\s\S]+?\$\$|\$(?!\s)[^$]+?(?<!\s)\$)/g
```

- Replaced matched text with Obsidian `renderMath(latex, display)` output wrapped in:

```html
<span class="math" data-math="RAW_LATEX">...</span>
```

- Called `finishRenderMath()` after replacements.

### B. Turndown Escape Prevention
Initial fix in `src/services/article-saver.ts`:

- Added a Turndown rule for `span.math` and `span.math-container`.
- Returned `data-math` / text content directly so underscores and dollar delimiters would not be escaped or collapsed.

### C. Template Replacement Safety
Initial fix in `src/services/article-saver.ts` and `src/services/web-viewer-integration.ts`:

- Replaced direct replacement of `{{content}}` with replacer-function form:

```ts
.replace(/{{content}}/g, () => content)
```

This prevents JavaScript replacement tokens like `$$` from collapsing display math delimiters.

## 3. Second Implementation Pass Already Applied

The following additional fix was implemented after reviewing this report:

### A. Async, Mounted DOM Math Rendering
`src/utils/math-rendering.ts` now:

- Makes `processMathElements(container)` async.
- Uses `container.ownerDocument || activeDocument` instead of always using `activeDocument`.
- Calls `await finishRenderMath()` after replacements.
- Exports `scheduleProcessMathElements(container)`, which waits one animation frame, checks `container.isConnected`, then calls `processMathElements(container)`.

Call sites updated:

- `src/views/reader-view.ts`
  - Reader title math uses `scheduleProcessMathElements(articleTitleEl)`.
  - Reader article body math uses `scheduleProcessMathElements(container)`.
- `src/components/article-renderer.ts`
  - Inline reader title/body math use `scheduleProcessMathElements(...)`.

### B. Shared Markdown Math Protection
`src/utils/math-rendering.ts` now also exports:

- `protectMathForMarkdown(html: string)`
- `addMathTurndownRule(turndownService)`

`protectMathForMarkdown`:

- Parses HTML with `DOMParser`.
- Normalizes existing `span.math` / `span.math-container` nodes into `span.math[data-math]`.
- Walks raw text nodes outside `code`, `pre`, `script`, `style`, and `.math`.
- Protects raw math before Turndown by wrapping matches in `span.math[data-math]`.
- Supports:
  - `$...$`
  - `$$...$$`
  - `\(...\)`
  - `\[...\]`

Call sites updated:

- `src/services/article-saver.ts`
  - Registers shared math Turndown rule.
  - Runs `protectMathForMarkdown(normalized)` before Turndown.
- `src/views/reader-view.ts`
  - Registers shared math Turndown rule on its local `TurndownService`.
  - Runs `protectMathForMarkdown(normalizedSaveHtml)` before local Reader-save Turndown.

### C. Tests Added / Updated

Regression coverage now includes:

- Raw inline `$a_1$` stays `$a_1$`.
- Raw display `$$b_2$$` stays `$$b_2$$`.
- Existing `span.math[data-math]` and `span.math-container` preserve original math.
- Math inside `code` and `pre` is not transformed.
- Reader save path preserves raw math from `currentFullContent`.
- `processMathElements` tests are async and assert `finishRenderMath()` is called.

Verification after the second pass:

- `npm.cmd --prefix "...obsidian-rss-dashboard" run lint` passed.
- `npm.cmd --prefix "...obsidian-rss-dashboard" run test:unit` passed:
  - 181 test files
  - 1561 tests

## 4. Third Implementation Pass: MathJax Readiness Gate

The direct `renderMath()` calls produced repeated live errors:

```text
ReferenceError: MathJax is not defined
```

To avoid calling Obsidian's renderer before its runtime was available,
`scheduleProcessMathElements(container)` was extended to:

- wait for the reader container to attach;
- detect an actual math candidate before doing work;
- check `MathJax` on the container's owning window, with `activeWindow` as the
  popout-safe fallback;
- retry the readiness check 30 times at 100 ms intervals (about 3 seconds);
- leave source math untouched and issue one warning if MathJax never appears.

Related hardening and maintenance changes:

- `span.math-container` is excluded from the raw text-node walk after the
  explicit legacy-span pass, preventing a failed legacy formula from being
  attempted twice in one run.
- The scheduler returns `Promise<void>` and its four intentionally
  fire-and-forget reader call sites use `void` so lint can distinguish them
  from accidentally dropped promises.
- Unit coverage now tests detached-container retry and delayed MathJax
  availability. Focused tests, ESLint, platform compatibility, and TypeScript
  checks passed at the time of this change.

## 5. Current Live State: Readiness Gate Exhausts

The latest live console output is:

```text
[RSS Dashboard] MathJax did not become available; left math unrendered.
```

This is emitted only after the math-candidate check passes and the full retry
budget is exhausted. Therefore the current failure is no longer an uncaught
`renderMath()` exception or a short DOM-attachment race: **the expected
MathJax global does not become available on the target Reader window.** The
fallback deliberately leaves the raw LaTeX visible, so the original rendering
bug remains unresolved.

The readiness gate is not a final fix and should not be extended with more
blind polling. It merely prevents a burst of `ReferenceError` messages while
making the missing runtime state explicit.

## 6. Online Research and Evidence-Based Candidate

Research completed before proposing another code change:

- Obsidian's official API declarations expose `renderMath(source, display)` and
  `finishRenderMath()`; the latter is documented as flushing MathJax styling.
  They do **not** document an initialization contract or a supported way to
  load a missing MathJax runtime. See the
  [official API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).
- A matching report from an Obsidian plugin developer shows the same
  `MathJax is not defined` failure when using `renderMath()` plus
  `finishRenderMath()` in a custom `ItemView`.
  [Obsidian Forum report](https://forum.obsidian.md/t/console-error-mathjax-is-not-defined/79494)
- Community custom-view examples use `MarkdownRenderer.render(app, markdown,
  element, sourcePath, component)` with a managed render component. This
  invokes Obsidian's normal Markdown rendering pipeline instead of calling the
  MathJax helper directly. [Example discussion](https://forum.obsidian.md/t/how-do-i-get-page-links-to-work-within-html-my-plugin-renders/81991/3)

### Candidate to validate, not yet implemented

Replace the direct `renderMath()` path with a narrowly scoped
`MarkdownRenderer.render()` experiment for one sanitized math fragment. Supply
the real `App`, an appropriate source path, and a component whose lifecycle
owns the rendered fragment. This is a plausible solution because it delegates
MathJax setup to the same renderer used by native Markdown views, but it is
not yet proven for this plugin.

Do **not** run the whole RSS article through `MarkdownRenderer` as a quick
workaround. The article is already sanitized HTML and changing its complete
rendering pipeline could alter links, embeds, styles, or lifecycle behavior.
First demonstrate that one inline and one display fragment render correctly in
the live Reader view, then design the smallest safe integration.

## 7. Required Live Investigation Before a New Fix

1. In the failing Reader view, record the values of:
   - `typeof container.ownerDocument.defaultView?.MathJax`
   - `typeof activeWindow.MathJax`
   - whether `span.math-container`, `span.math`, or `mjx-container` exists
     before and after the scheduler runs.
2. Create a temporary, isolated proof of concept that calls
   `MarkdownRenderer.render()` for `$f:\\Delta\\to\\Delta$` and a display
   formula using a properly managed component.
3. Compare that result with direct `renderMath()` in the exact same Reader
   container.
4. Only if the Markdown renderer succeeds, thread the required app/component
   lifecycle through the math utility and add a regression test for that
   contract. If it also fails, preserve the diagnostic evidence and escalate
   as an Obsidian API/runtime issue rather than adding more regex or timer
   changes.

## 8. Earlier Suspected Failure Modes Still Worth Checking

### A. The visible Reader content may not be the container being processed
The scheduled helper may be running on a container that is later replaced, cleared, re-rendered, or hidden. Unit tests do not currently verify the live Reader lifecycle with the same DOM churn as Obsidian.

Investigation target:

- Add temporary logging around `scheduleProcessMathElements` / `processMathElements`:
  - container class/name
  - `container.isConnected`
  - text length
  - math match count
  - before/after `innerText` snippets
  - number of inserted `span.math`

### B. The regex may fail on Math StackExchange's exact parsed feed text
The example contains many apostrophes/primes and backslashes:

- `$\Delta'$`
- `$\varphi:\mathcal{K}'\to\mathcal{K}$`
- `$\text{st}(\varphi(a))$`

The current regex should match these in plain JS, but the live feed may contain HTML entities, escaped backslashes, smart quotes, zero-width characters, or converted text that differs from the copied plaintext.

Investigation target:

- Inspect the exact stored `FeedItem.description` / `FeedItem.content` for the Math StackExchange article before rendering.
- Confirm whether dollar signs are literal `$`, escaped `\$`, entity encoded, stripped, or split across text nodes/elements.

### C. Obsidian `renderMath()` may not be enough for non-Markdown custom views
The plugin is manually creating DOM nodes in a custom view. Obsidian's `renderMath()` behavior may depend on Markdown renderer context, a mounted Markdown post processor lifecycle, or CSS/assets not available for custom DOM-created elements.

Investigation target:

- Compare the output of `renderMath("f:\\Delta\\to\\Delta", false)` in the live view:
  - Does it return an element?
  - What tag/classes does it return?
  - Does the element appear in DOM but remain visually plaintext?
  - Does `finishRenderMath()` resolve or reject?

### D. The function may never be called in the failing Reader route
There are multiple reader/open/save/content paths in this plugin:

- `src/views/reader-view.ts`
- `src/components/article-renderer.ts`
- possible mobile/inline/sidebar routes
- web viewer paths

The failing Math StackExchange feed may be rendered through a path that does not use `renderArticleContent()` or `ArticleRenderer.renderContent()`.

Investigation target:

- Trace the exact UI route for the failing article.
- Confirm which class renders it and whether `scheduleProcessMathElements()` runs.

### E. CSS may hide or neutralize rendered MathJax
If `renderMath()` inserts MathJax nodes, the CSS may show raw source text or fail to style `mjx-container`.

Investigation target:

- Inspect the live DOM:
  - Are `span.math` wrappers present?
  - Are `mjx-container` elements present?
  - Are raw `$...$` text nodes still present after processing?
  - Are MathJax elements present but hidden, display-inline incorrectly, or missing styles?

## 9. Prompt For Higher-Capability LLM / New Context Window

Use this prompt in a fresh context:

```markdown
We need debug, not blindly patch, a persistent MathJax rendering bug in an Obsidian plugin.

Repo: `C:\Obsidian\Obsidian_Main\.obsidian\plugins\obsidian-rss-dashboard`

Bug:
Math formulas from `https://math.stackexchange.com/feeds` still render as plaintext in the Reader UI. Example raw content:

Let $f:\Delta\to\Delta$ be a continuous map such that $f(\Delta')\subseteq\Delta'$ for every facet of $\Delta$. How does one show that $f$ is surjective, via Sperner's lemma?

**Sperner's lemma.** If $\varphi:\mathcal{K}'\to\mathcal{K}$ is a simplicial map where $\mathcal{K}$ consists of faces of a simplex $\Delta$, such that $a\in\text{st}(\varphi(a))$ for every vertex $a$ of $\mathcal{K}'$, then there exists (odd number of) simplex $\Delta'\in\mathcal{K}'$ with $\varphi(\Delta') = \Delta$.

Current implementation already tried:

1. `src/utils/math-rendering.ts`
   - `processMathElements(container)` walks text nodes and replaces `$...$`, `$$...$$`, `\(...\)`, `\[...\]` with Obsidian `renderMath(latex, display)`.
   - It wraps rendered math in `span.math[data-math]`.
   - It is async and awaits `finishRenderMath()`.
   - It uses `container.ownerDocument || activeDocument`.
   - `scheduleProcessMathElements(container)` waits for attachment, then checks the owning window for `MathJax` for about 3 seconds before it calls `renderMath()`.
   - Live observation: that readiness check expires. The current fallback leaves raw math in place and logs `MathJax did not become available; left math unrendered.`

2. Call sites:
   - `src/views/reader-view.ts` uses `scheduleProcessMathElements()` for title and article body.
   - `src/components/article-renderer.ts` uses `scheduleProcessMathElements()` for title and article body.

3. Saving:
   - `protectMathForMarkdown(html)` protects raw math before Turndown.
   - `addMathTurndownRule()` is shared by ArticleSaver and ReaderView Turndown instances.
   - Save-related tests pass.

4. Verification:
   - `npm run lint` passes.
   - `npm run test:unit` passes: 181 files, 1561 tests.

But live Obsidian still shows Math StackExchange math as plaintext because the MathJax runtime does not become available to the custom Reader renderer.

Please investigate with repo inspection first. Do not assume the regex is the only issue. Determine the real live-rendering failure point and propose/implement the smallest robust fix.

Key questions:

- Is `scheduleProcessMathElements()` actually called for the failing Math StackExchange Reader UI route?
- Does it run on the DOM container that remains visible, or is that container later replaced?
- What is the exact `FeedItem.description` / `FeedItem.content` string from the Math StackExchange feed before rendering?
- Are dollar math sequences split across DOM text nodes after `sanitizeAndAppendHtml()`?
- Does a single sanitized fragment render through `MarkdownRenderer.render()` with a real lifecycle component in this exact custom view?
- Does `renderMath()` produce a real MathJax element in the same container once compared with the Markdown renderer?
- Are `span.math` or `mjx-container` elements present in the live DOM after processing?
- Does `finishRenderMath()` resolve successfully in live Obsidian?
- Is CSS causing rendered math to look like plaintext?

Useful files:

- `src/utils/math-rendering.ts`
- `src/views/reader-view.ts`
- `src/components/article-renderer.ts`
- `src/utils/safe-html.ts`
- `src/services/feed-parser/feed-parser-class.ts`
- `src/services/article-saver.ts`
- `test_files/unit/utils/math-rendering.test.ts`
- `test_files/unit/services/article-saver.test.ts`
- `test_files/unit/views/reader-view-focus-dashboard.test.ts`

Recommended first move:

Do not add another retry. Make the isolated `MarkdownRenderer.render()` proof of concept for one sanitized inline formula and one display formula in the live Reader view, managed by a real component. Compare it with direct `renderMath()` and retain the DOM/runtime observations. Only then decide whether the smallest safe fix is a fragment-level Markdown renderer integration or an upstream runtime/API issue.
```

## 10. Do Not Repeat These Assumptions

- Do not assume green jsdom tests prove live Obsidian rendering works.
- Do not assume `data-math` saving preservation fixes UI rendering.
- Do not assume the Math StackExchange feed content exactly matches copied browser text.
- Do not apply another regex-only fix until the live DOM and route are confirmed.
- Do not treat the readiness gate as a working MathJax initialization strategy;
  the latest live warning proves that it does not initialize the runtime.

## 11. Investigation Outcome and Implemented Fix (2026-08-07)

Repository tracing established the live failure point:

- Both visible Reader routes call math processing: `ReaderView` for the
  standalone Reader and `ArticleRenderer` for the dashboard's inline Reader.
- Each call targets the title/body element that remains in the visible DOM
  until the next article render. There is no later replacement of that body
  element in the same render pass.
- The Atom parser decodes StackExchange summaries into HTML containing intact
  `span.math-container` elements. When an Atom entry has no separate
  `<content>`, `FeedItem.content` and `FeedItem.description` receive the same
  HTML string.
- `sanitizeAndAppendHtml(..., { mode: "rich" })` preserves each formula as a
  single text node inside its `span.math-container`; it does not split the
  dollar delimiters across DOM nodes.
- No plugin CSS hides math. The only added `mjx-container` rule restores normal
  line height inside Reader content.

The unsupported step was the direct MathJax path. Live Obsidian had already
shown that `renderMath()` could throw `ReferenceError: MathJax is not defined`,
while the later `ownerWindow.MathJax` readiness gate never became true. The
window global is not a documented readiness contract for Obsidian's math API.

The implementation now renders only detected formulas through
`MarkdownRenderer.render()` and supplies the owning `ItemView` as the real
lifecycle component. The surrounding sanitized RSS article is not passed
through the Markdown renderer. A successful fragment is normalized to
`span.math[data-math]` containing an `mjx-container`; a rejected or incomplete
fragment restores the original raw text or `span.math-container` losslessly.
The old MathJax-global polling, direct `renderMath()`, and `finishRenderMath()`
path have been removed.

Automated coverage now verifies the exact Atom HTML shape, intact DOM text
nodes after rich sanitization, fragment rendering without a window-level
`MathJax` global, inline/display output containing `mjx-container`, lifecycle
arguments, and lossless failure restoration. A manual Obsidian reload remains
the final live-runtime confirmation; automated jsdom tests do not claim that
confirmation.

## 12. Final Outcome

The final fix moved away from direct `renderMath()` polling and from trying to
cache rendered HTML in feed storage.

- Reader and dashboard math now render through an isolated
  `MarkdownRenderer.render()` path for sanitized fragments, using the owning
  `ItemView` and a real lifecycle component so Obsidian's Markdown pipeline can
  initialize MathJax correctly.
- Rendered math is cached only in memory for the current plugin session and
  document context. It is intentionally not written into feed JSON or article
  storage because the output depends on the active Obsidian/MathJax runtime
  and the owning document.
- Title cards are now scheduled through the same math rendering path, so raw
  LaTeX no longer remains visible in `.rss-dashboard-article-title` after the
  dashboard renders.
- The implementation also preserves the raw article/title source alongside the
  rendered DOM so search and reopen behavior stay stable.

Implementation notes:

- `src/utils/math-rendering.ts` owns the fragment rendering and in-memory
  cache.
- `src/views/reader-view.ts` and `src/components/article-renderer.ts` pass the
  real lifecycle component for Reader content.
- `src/views/dashboard-view.ts` wires title card elements into the same math
  rendering helper.
- `src/components/article-list.ts` preserves the raw title source for search.

Validation completed after the fix:

- `npm run lint`
- `npm run check:platform`
- `npm run test:unit`
- `npm run build`

The original tracking issue is
[GitHub issue #162](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/162).
