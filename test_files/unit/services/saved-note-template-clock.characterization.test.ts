import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import { ArticleSaver } from "../../../src/services/article-saver";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { createWebViewerIntegrationHarness } from "./web-viewer-integration-harness";

const START = new Date(2026, 9, 5, 14, 59, 59, 999);
const END = new Date(START.getTime() + 1);
const FRONTMATTER = '---\niso: "{{isoDateTime}}"\ntime: "{{saveTime24}}"\n---';
const BODY = "{{isoDateTime}}|{{saveTime24}}|{{content}}";

function item(pubDate: string): FeedItem {
  return {
    title: "Clock contract",
    link: "https://example.com/clock",
    guid: "clock",
    pubDate,
    description: "<p>Body</p>",
    feedTitle: "Feed",
    feedUrl: "https://example.com/rss",
    coverImage: "",
    tags: [],
    read: false,
    starred: false,
  };
}

function settings(): ArticleSavingSettings {
  return {
    defaultFolder: "",
    defaultTemplate: BODY,
    frontmatterTemplate: FRONTMATTER,
    includeFrontmatter: true,
    addSavedTag: false,
    saveFullContent: false,
    fetchTimeout: 30000,
    savedTemplates: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.empty();
});

describe("saved-note clock compatibility", () => {
  it.each(["", "not-a-date"])(
    "ArticleSaver resolves %j separately after body preparation",
    async (pubDate) => {
      const parse = DOMParser.prototype.parseFromString;
      vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(
        function (this: DOMParser, text, type) {
          // HTML preparation spans a minute boundary before the body's date is read.
          vi.setSystemTime(END);
          return parse.call(this, text, type);
        },
      );
      const app = App.createMock();
      const saver = new ArticleSaver(app, settings());
      const file = await saver.saveArticle(item(pubDate));
      expect(file).toBeInstanceOf(TFile);
      if (!file) throw new Error("Save failed");
      expect(await app.vault.read(file)).toBe(
        `---\niso: "${START.toISOString()}"\ntime: "14:59"\n---\n${END.toISOString()}|15:00|<p>Body</p>`,
      );
    },
  );

  it("ArticleSaver reads the body save time after HTML preparation even with a valid publication date", async () => {
    const parse = DOMParser.prototype.parseFromString;
    vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(
      function (this: DOMParser, text, type) {
        vi.setSystemTime(END);
        return parse.call(this, text, type);
      },
    );
    const app = App.createMock();
    const file = await new ArticleSaver(app, settings()).saveArticle(
      item("2024-01-01T00:00:00.000Z"),
    );
    if (!file) throw new Error("Save failed");
    expect(await app.vault.read(file)).toBe(
      '---\niso: "2024-01-01T00:00:00.000Z"\ntime: "14:59"\n---\n2024-01-01T00:00:00.000Z|15:00|<p>Body</p>',
    );
  });

  it.each(["", "not-a-date"])(
    "Web Viewer resolves %j independently for frontmatter and body",
    async (pubDate) => {
      const iso = Date.prototype.toISOString;
      vi.spyOn(Date.prototype, "toISOString").mockImplementation(function (
        this: Date,
      ) {
        const result = iso.call(this);
        vi.setSystemTime(END);
        return result;
      });
      const h = createWebViewerIntegrationHarness({ settings: settings() });
      try {
        const file = await h.integration.saveArticle(
          item(pubDate),
          "",
          BODY,
          true,
        );
        if (!file) throw new Error("Save failed");
        expect(await h.app.vault.read(file)).toBe(
          `---\niso: "${iso.call(START)}"\ntime: "15:00"\n---\n${iso.call(END)}|15:00|<p>Body</p>`,
        );
      } finally {
        h.cleanup();
      }
    },
  );
});
