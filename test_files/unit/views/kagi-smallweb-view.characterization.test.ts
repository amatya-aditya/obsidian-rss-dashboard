import { describe, expect, it } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { KagiSmallwebView } from "../../../src/views/kagi-smallweb-view";

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

function parse(view: KagiSmallwebView, xml: string): SmallwebEntry[] {
  return (view as unknown as KagiSmallwebViewInternals).parseSmallwebAtomFeed(
    xml,
  );
}

describe("Kagi Smallweb Atom parser characterization", () => {
  it("prefers alternate links and summary text while preserving parsed entry fields", () => {
    const view = createView();
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <updated>2026-06-01T12:00:00Z</updated>
        <entry>
          <title>Post title</title>
          <link href="https://example.com/first" />
          <link rel="alternate" href="https://example.com/post" />
          <author><name>Example Author</name></author>
          <updated>2026-05-31T09:15:00Z</updated>
          <summary>&lt;p&gt;Summary &amp; details&lt;/p&gt;</summary>
          <content>&lt;p&gt;Content fallback&lt;/p&gt;</content>
        </entry>
      </feed>`;

    expect(parse(view, xml)).toEqual([
      {
        postTitle: "Post title",
        postUrl: "https://example.com/post",
        blogName: "Example Author",
        blogUrl: "https://example.com",
        updatedAt: new Date("2026-05-31T09:15:00Z"),
        excerpt: "Summary & details",
        domain: "example.com",
      },
    ]);
    expect(
      (view as unknown as KagiSmallwebViewInternals).smallwebFeedUpdatedAt,
    ).toEqual(new Date("2026-06-01T12:00:00Z"));
  });

  it("uses title, domain, first-link, and content fallbacks", () => {
    const view = createView();
    const xml = `<feed>
      <entry>
        <link href="https://fallback.example/path" />
        <content>&lt;strong&gt;  Content   text &lt;/strong&gt;</content>
      </entry>
    </feed>`;

    expect(parse(view, xml)).toMatchObject([
      {
        postTitle: "Untitled",
        postUrl: "https://fallback.example/path",
        blogName: "fallback.example",
        blogUrl: "https://fallback.example",
        excerpt: "Content text",
        domain: "fallback.example",
      },
    ]);
  });

  it("skips entries without a usable URL and accepts an empty feed", () => {
    const view = createView();
    const xml = `<feed>
      <entry><title>No link</title></entry>
      <entry><link href="not a URL" /></entry>
      <entry><link href="https://valid.example/post" /></entry>
    </feed>`;

    expect(parse(view, xml)).toHaveLength(1);
    expect(parse(view, "<feed />")).toEqual([]);
  });

  it("returns no entries for malformed XML without throwing", () => {
    const view = createView();

    expect(() => parse(view, "<feed><entry><title>unfinished")).not.toThrow();
    expect(parse(view, "<feed><entry><title>unfinished")).toEqual([]);
  });

  it("keeps 200-character excerpts intact and truncates longer excerpts", () => {
    const view = createView();
    const exact = "a".repeat(200);
    const longer = "b".repeat(201);
    const xml = `<feed>
      <entry><link href="https://exact.example/" /><summary>${exact}</summary></entry>
      <entry><link href="https://long.example/" /><summary>${longer}</summary></entry>
    </feed>`;

    expect(parse(view, xml).map((entry) => entry.excerpt)).toEqual([
      exact,
      `${"b".repeat(197)}...`,
    ]);
  });
});
