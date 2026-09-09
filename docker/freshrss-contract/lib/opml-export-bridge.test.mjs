/**
 * Docker-free test for `opml-export-bridge.mjs`. This only exercises
 * esbuild compilation and the real `generateFreshRssSubscriptionOpml`
 * function's behavior -- no Docker daemon, no network beyond compiling a
 * local TypeScript file, so it runs as part of this repository's ordinary
 * (non-Docker) `npm run test:freshrss-fixtures` validation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFreshRssOpmlExportModule } from "./opml-export-bridge.mjs";

function fixtureFeed(overrides = {}) {
  return {
    title: "Contract Feed E",
    url: "http://fixture-server:8081/feed-e.xml",
    folder: "Category E",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
}

test("loadFreshRssOpmlExportModule compiles the real production OPML export module", async () => {
  const mod = await loadFreshRssOpmlExportModule();
  assert.equal(typeof mod.generateFreshRssSubscriptionOpml, "function");
  assert.equal(typeof mod.escapeFreshRssCategorySegment, "function");
});

test("generateFreshRssSubscriptionOpml produces a categorized outline for the OPML round-trip fixture", async () => {
  const { generateFreshRssSubscriptionOpml } = await loadFreshRssOpmlExportModule();
  const { opml, warnings } = generateFreshRssSubscriptionOpml([fixtureFeed()]);

  assert.equal(warnings.length, 0);
  assert.match(opml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(opml, /<outline text="Category E" title="Category E">/);
  assert.match(
    opml,
    /<outline text="Contract Feed E" title="Contract Feed E" type="rss" xmlUrl="http:\/\/fixture-server:8081\/feed-e\.xml"\/>/,
  );
});

test("generateFreshRssSubscriptionOpml collapses a duplicate feed URL and reports one warning", async () => {
  const { generateFreshRssSubscriptionOpml } = await loadFreshRssOpmlExportModule();
  const { opml, warnings } = generateFreshRssSubscriptionOpml([
    fixtureFeed({ title: "Contract Feed E" }),
    fixtureFeed({ title: "Contract Feed E Duplicate" }),
  ]);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Duplicate feed URL collapsed/);
  const occurrences = opml.split("feed-e.xml").length - 1;
  assert.equal(occurrences, 1, "the duplicate URL must appear exactly once in the generated OPML");
  assert.match(opml, /Contract Feed E/);
  assert.ok(!opml.includes("Contract Feed E Duplicate"));
});

test("loadFreshRssOpmlExportModule caches compilation across calls", async () => {
  const first = await loadFreshRssOpmlExportModule();
  const second = await loadFreshRssOpmlExportModule();
  assert.equal(first, second);
});
