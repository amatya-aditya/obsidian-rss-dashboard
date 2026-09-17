# Test feeds

Real-world RSS/Atom/JSON Feed documents kept for manual QA and bug-hunting,
separate from the synthetic fixtures under `test_files/unit/**/fixtures/`.
A synthetic fixture is built to exercise one specific code path; a file here
is a real document that happened to expose a bug no synthetic fixture had
thought to cover. Whenever manual testing against a feed like this uncovers
something, it's worth keeping the source document around for the next round
of QA, or for a future regression test/fixture derived from it.

Not wired into the automated test suite — these are for manual verification
and as raw material when writing new fixtures/tests.

## Files

### `rss-2.0-sample.xml`

Source: https://www.rssboard.org/files/rss-2.0-sample.xml (the RSS Advisory
Board's own RSS 2.0 spec-compliance sample feed).

Used during manual QA of the first-seen-date fallback feature (#283/#293/
#294/#295, PR #296). Helped uncover:

- An item with `<pubDate>Fri, 06 May 1983 09:00:00 CST</pubDate>` rendered as
  an invalid date. Root cause: `Date.parse()` support for RFC 822's named
  timezone abbreviations (`CST`, `PST`, `EST`, etc.) is implementation-defined,
  not part of any ECMAScript standard, and can silently fail depending on the
  Chromium/V8 build. Fixed by normalizing named zones to an explicit UTC
  offset before parsing (`getPubDateMs` in
  `src/services/feed-parser/feed-retention.ts`).
- Two items with no `<pubDate>` at all, which surfaced that the reader header
  and the dashboard's card/list/feed date badges rendered the literal text
  "Invalid Date"/"Invalid date" for undated items instead of falling back to
  the article's first-seen date the way retention/sorting already did. Fixed
  in `article-renderer.ts`, `reader-view.ts`, and the three
  `article-list/views/*.ts` renderers.
- Two items with no `<title>` at all (only `<description>`/`<guid>`), and one
  item with no `<link>` — not yet investigated; worth a manual pass to
  confirm the existing `"Untitled"`/`"#"` fallbacks in `rss-parser.ts`
  behave sensibly for these end-to-end, not just at the parser layer.
