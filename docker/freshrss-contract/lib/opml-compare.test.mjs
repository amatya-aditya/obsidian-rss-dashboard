import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFreshRssOpml, findOpmlEntriesByUrlFragment } from "./opml-compare.mjs";

// Modeled on FreshRSS's real export shape (app/views/helpers/export/opml.phtml
// via marienfressinaud/LibOpml): every category outline wraps a nested list
// of feed outlines, and feed outlines carry frss:* namespaced attributes
// this harness must ignore rather than choke on.
const SAMPLE_FRESHRSS_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0" xmlns:frss="https://freshrss.org/opml">
  <head>
    <title>FreshRSS</title>
    <dateCreated>Wed, 03 Jun 2026 00:00:00 +0000</dateCreated>
  </head>
  <body>
    <outline text="Articles">
      <outline text="Contract Feed D" title="Contract Feed D" type="rss" xmlUrl="http://fixture-server:8081/feed-d.xml" htmlUrl="https://fixture.test/feed-d/"/>
    </outline>
    <outline text="Category E">
      <outline text="Contract Feed E" title="Contract Feed E" type="rss" xmlUrl="http://fixture-server:8081/feed-e.xml" htmlUrl="https://fixture.test/feed-e/" frss:priority="main"/>
    </outline>
  </body>
</opml>
`;

test("parseFreshRssOpml extracts feed entries with their enclosing category", () => {
  const entries = parseFreshRssOpml(SAMPLE_FRESHRSS_OPML);
  assert.equal(entries.length, 2);

  const feedD = entries.find((entry) => entry.url.includes("feed-d.xml"));
  assert.ok(feedD);
  assert.equal(feedD.title, "Contract Feed D");
  assert.equal(feedD.category, "Articles");

  const feedE = entries.find((entry) => entry.url.includes("feed-e.xml"));
  assert.ok(feedE);
  assert.equal(feedE.title, "Contract Feed E");
  assert.equal(feedE.category, "Category E");
});

test("parseFreshRssOpml ignores frss:* namespaced attributes without breaking parsing", () => {
  const entries = parseFreshRssOpml(SAMPLE_FRESHRSS_OPML);
  const feedE = entries.find((entry) => entry.url.includes("feed-e.xml"));
  assert.ok(feedE, "the frss:priority attribute on the feed-e outline must not break parsing");
});

test("parseFreshRssOpml decodes XML entities in attribute values", () => {
  const xml = `<opml><body><outline text="Cat &amp; Dog"><outline title="Feed &quot;A&quot;" xmlUrl="http://x/a.xml"/></outline></body></opml>`;
  const entries = parseFreshRssOpml(xml);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Feed "A"');
  assert.equal(entries[0].category, "Cat & Dog");
});

test("parseFreshRssOpml treats a feed outline with no enclosing category as uncategorized", () => {
  const xml = `<opml><body><outline title="Top Level Feed" xmlUrl="http://x/top.xml"/></body></opml>`;
  const entries = parseFreshRssOpml(xml);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, null);
});

test("parseFreshRssOpml returns one entry per duplicate-collapsed URL, never two for one outline", () => {
  const entries = parseFreshRssOpml(SAMPLE_FRESHRSS_OPML);
  const urls = entries.map((entry) => entry.url);
  assert.equal(new Set(urls).size, urls.length);
});

test("findOpmlEntriesByUrlFragment matches by fixture-server file name, not exact string equality", () => {
  const entries = parseFreshRssOpml(SAMPLE_FRESHRSS_OPML);
  const matches = findOpmlEntriesByUrlFragment(entries, "feed-e.xml");
  assert.equal(matches.length, 1);
  assert.equal(findOpmlEntriesByUrlFragment(entries, "does-not-exist.xml").length, 0);
});
