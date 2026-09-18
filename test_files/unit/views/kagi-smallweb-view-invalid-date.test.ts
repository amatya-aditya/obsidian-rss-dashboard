import { describe, it, expect } from "vitest";
import {
  KagiSmallwebView,
  RSS_SMALLWEB_VIEW_TYPE,
} from "../../../src/views/kagi-smallweb-view";
import type RssDashboardPlugin from "../../../main";
import type { WorkspaceLeaf } from "obsidian";

interface SmallwebEntry {
  postTitle: string;
  postUrl: string;
  blogName: string;
  blogUrl: string;
  updatedAt: Date;
  excerpt: string;
  domain: string;
}

type KagiSmallwebViewInternals = {
  parseSmallwebAtomFeed: (xmlText: string) => SmallwebEntry[];
  smallwebFeedUpdatedAt: Date | null;
};

function createView(): KagiSmallwebView {
  const leaf = { app: {} } as unknown as WorkspaceLeaf;
  const plugin = {} as RssDashboardPlugin;
  return new KagiSmallwebView(leaf, plugin);
}

function getInternals(view: KagiSmallwebView): KagiSmallwebViewInternals {
  return view as unknown as KagiSmallwebViewInternals;
}

function buildFeed(feedUpdated: string, entryUpdated: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <updated>${feedUpdated}</updated>
  <entry>
    <title>Post title</title>
    <link rel="alternate" href="https://example.com/post" />
    <author><name>Example Author</name></author>
    <updated>${entryUpdated}</updated>
    <summary>Some summary text.</summary>
  </entry>
</feed>`;
}

describe("KagiSmallwebView invalid-date guard", () => {
  it("sanity-checks the view type identifier", () => {
    expect(RSS_SMALLWEB_VIEW_TYPE).toBe("rss-smallweb-view");
  });

  it("falls back to null / now() for a malformed updated timestamp without throwing", () => {
    const view = createView();
    const internals = getInternals(view);
    const xml = buildFeed("not-a-real-date", "also-not-a-date");

    let entries: SmallwebEntry[] = [];
    expect(() => {
      entries = internals.parseSmallwebAtomFeed(xml);
    }).not.toThrow();

    expect(internals.smallwebFeedUpdatedAt).toBeNull();

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(Number.isNaN(entry.updatedAt.getTime())).toBe(false);

    // Entry-level fallback is "now" — confirm it's recent rather than the
    // unparseable string leaking through as an Invalid Date.
    const diffMs = Math.abs(Date.now() - entry.updatedAt.getTime());
    expect(diffMs).toBeLessThan(5000);

    // The fallback value must never throw when later formatted.
    expect(() => entry.updatedAt.toISOString()).not.toThrow();
  });

  it("parses a valid Atom updated timestamp exactly as before", () => {
    const view = createView();
    const internals = getInternals(view);
    const feedUpdated = "2026-01-15T10:30:00Z";
    const entryUpdated = "2026-01-14T08:00:00Z";
    const xml = buildFeed(feedUpdated, entryUpdated);

    const entries = internals.parseSmallwebAtomFeed(xml);

    expect(internals.smallwebFeedUpdatedAt).toEqual(new Date(feedUpdated));
    expect(entries).toHaveLength(1);
    expect(entries[0].updatedAt).toEqual(new Date(entryUpdated));
  });
});
