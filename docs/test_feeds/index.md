# Test feeds

A running reference list of real-world and reference RSS/Atom/JSON Feed
documents — some saved in this folder, some just linked live — kept for
manual QA and bug-hunting. Separate from the synthetic fixtures under
`test_files/unit/**/fixtures/`: a synthetic fixture is built to exercise one
specific code path; an entry here is a real feed that happened to expose (or
verify the fix for) a bug no synthetic fixture had thought to cover.

Not wired into the automated test suite — these are for manual verification
and as raw material when writing new fixtures/tests. Add to this list
whenever a feed proves useful for testing; it will grow over time.

**When you fix a bug this file documents, update its entry below** — mark it
completed and reference the bug/PR/commit that fixed it, so this file stays
an accurate record of what's confirmed-working vs. still-open.

## Saved feeds (in this folder)

### `rss-2.0-sample.xml`

Source: https://www.rssboard.org/files/rss-2.0-sample.xml (the RSS Advisory
Board's own RSS 2.0 spec-compliance sample feed).

Used during manual QA of the first-seen-date fallback feature (#283/#293/
#294/#295, PR #296). Helped uncover:

- **Fixed.** An item with `<pubDate>Fri, 06 May 1983 09:00:00 CST</pubDate>`
  rendered as an invalid date. Root cause: `Date.parse()` support for RFC
  822's named timezone abbreviations (`CST`, `PST`, `EST`, etc.) is
  implementation-defined, not part of any ECMAScript standard, and can
  silently fail depending on the Chromium/V8 build. Fixed by normalizing
  named zones to an explicit UTC offset before parsing (`getPubDateMs` in
  `src/services/feed-parser/feed-retention.ts`).
- **Fixed.** Two items with no `<pubDate>` at all, which surfaced that the
  reader header and the dashboard's card/list/feed date badges rendered the
  literal text "Invalid Date"/"Invalid date" for undated items instead of
  falling back to the article's first-seen date the way retention/sorting
  already did. Fixed in `article-renderer.ts`, `reader-view.ts`, and the
  three `article-list/views/*.ts` renderers.
- **Not yet investigated.** Two items with no `<title>` at all (only
  `<description>`/`<guid>`), and one item with no `<link>`. Worth a manual
  pass to confirm the existing `"Untitled"`/`"#"` fallbacks in
  `rss-parser.ts` behave sensibly for these end-to-end, not just at the
  parser layer.

### `heraldsun.rss`

Source: https://raw.githubusercontent.com/rbren/rss-parser/master/test/input/heraldsun.rss
(an RSS 0.92 test fixture from the `rbren/rss-parser` npm package's own test
suite, despite the filename).

- **Fixed.** Its items declare a channel-level `<pubDate>` but no item-level
  `<pubDate>` at all. Testing against this feed (alongside
  `rss-2.0-sample.xml`) surfaced that the reader/dashboard first-seen
  fallback was showing even with the **Use first-seen date for undated
  items** setting turned off — `resolveDisplayDate` ignored the setting
  entirely. Fixed by gating display the same way sort/retention already are.
- **Not yet fixed, pre-existing, unrelated to the first-seen-date work.** Its
  items also carry an incidental `<enclosure type="audio/mpeg">` on
  otherwise plain news items, and any item with an `audio/*` enclosure is
  classified as a podcast item (`isPodcast` in
  `src/services/feed-parser/feed-parser-class.ts`), regardless of whether
  the enclosure is the item's actual content. Needs a product decision on
  what should corroborate "this is really a podcast episode" beyond
  enclosure MIME type alone before fixing.

### `parse_feed_bytes_fuzzer-rss.xml`

Source: https://raw.githubusercontent.com/brave/brave-core/master/fuzzers/brave_news/corpus/parse_feed_bytes_fuzzer/rss.xml
(a seed corpus file from Brave's own RSS-parser fuzzer).

Purpose: a very minimal, plain, spec-clean RSS 2.0 feed with no dates, no
enclosures, no CDATA quirks — a baseline "does the simplest possible feed
still work" sanity check, useful for isolating whether a regression is
feed-specific or affects parsing generally.

## Reference feeds (not saved here — live URLs)

### https://github.blog/feed/

The de facto gold-standard real-world feed for general manual QA — large,
well-formed, actively maintained, broad variety of content and metadata.
Default choice when a change needs a "does this work against a normal,
healthy feed" check rather than a specific edge case.

### https://terrytao.wordpress.com/feed and https://math.stackexchange.com/feeds

Used historically to verify the MathJax rendering fix — both carry LaTeX
math notation in article content, making them the reference feeds for any
future math-rendering regression testing.
