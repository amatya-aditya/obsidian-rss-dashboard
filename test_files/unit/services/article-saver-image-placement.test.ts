import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { ArticleSaver } from "../../../src/services/article-saver";
import * as fetchHelpers from "../../../src/utils/fetch-helpers";

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test Article",
    link: "https://example.com/article",
    description: "<p>Desc</p>",
    pubDate: "2024-01-01T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    ...overrides,
  };
}

// A template that places {{image}} itself decides where the image goes, as
// Web Clipper's does: the saver must not also lead {{content}} with a hero.
describe("ArticleSaver - {{image}} in the note body replaces the hero lead", () => {
  const COVER = "https://img.example.com/cover.jpg?quality=85&w=640";
  const PAGE_IMAGE = "https://page.example.com/og.jpg?resize=1200,630";
  const IMAGE_TEMPLATE = "![]({{image}})\n\n{{content}}";

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function createSaver(
    app: App,
    overrides: Partial<ArticleSavingSettings> = {},
  ): ArticleSaver {
    return new ArticleSaver(
      app,
      {
        addSavedTag: false,
        defaultFolder: "",
        defaultTemplate: IMAGE_TEMPLATE,
        includeFrontmatter: false,
        frontmatterTemplate: "",
        saveVersion: "rss",
        fetchTimeout: 30_000,
        savedTemplates: [],
        ...overrides,
      },
      "https://proxy/?url=",
    );
  }

  async function readSaved(
    app: App,
    file: TFile | null | undefined,
  ): Promise<string> {
    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    return app.vault.read(file);
  }

  it("writes the image once for an RSS content save", async () => {
    const app = App.createMock();
    const item = createItem({
      coverImage: COVER,
      image: "https://img.example.com/feed-own.jpg?resize=1200,630",
      content: "<p>Body.</p>",
    });

    const written = await readSaved(
      app,
      await createSaver(app).saveArticle(item),
    );

    expect(written).toBe(`![](${COVER})\n\nBody.`);
  });

  it("writes the image once for a Fetched content save", async () => {
    const app = App.createMock();
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "<p>Fetched body.</p>",
      failureType: "none",
      pageImage: PAGE_IMAGE,
    });
    const item = createItem({ coverImage: COVER });

    const written = await readSaved(
      app,
      await createSaver(app, {
        saveVersion: "fetched",
      }).saveArticleWithFullContent(item),
    );

    expect(written).toContain(`![](${COVER})`);
    expect(written).toContain("Fetched body.");
    expect(written).not.toContain("Hero image");
    expect(written).not.toContain(PAGE_IMAGE);
  });

  it("keeps the hero lead when the article has no image for {{image}} to fill", async () => {
    const app = App.createMock();
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "<p>Fetched body.</p>",
      failureType: "none",
      pageImage: PAGE_IMAGE,
    });
    // No cover, image, iTunes image or enclosure: {{image}} is empty, so the
    // page's own image must still lead the note rather than leaving it bare.
    const item = createItem({ coverImage: "" });

    const written = await readSaved(
      app,
      await createSaver(app, {
        saveVersion: "fetched",
      }).saveArticleWithFullContent(item),
    );

    expect(written).toContain(`![Hero image](${PAGE_IMAGE})`);
    expect(written).toContain("Fetched body.");
  });

  it("writes the image once when the Reader hands over fetched HTML", async () => {
    const app = App.createMock();
    const item = createItem({ coverImage: COVER, pageImage: PAGE_IMAGE });

    const written = await readSaved(
      app,
      await createSaver(app, {
        saveVersion: "fetched",
      }).saveArticleWithContentPolicy(item, undefined, undefined, undefined, {
        fetchAttempted: true,
        fetchedHtml: "<p>Reader body.</p>",
      }),
    );

    expect(written).toContain(`![](${COVER})`);
    expect(written).toContain("Reader body.");
    expect(written).not.toContain("Hero image");
  });

  it("writes the image once when a failed fetch falls back to RSS content", async () => {
    const app = App.createMock();
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({ content: "", failureType: "network" });
    const item = createItem({
      coverImage: COVER,
      content: "<p>Feed body.</p>",
    });

    const written = await readSaved(
      app,
      await createSaver(app, {
        saveVersion: "fetched",
      }).saveArticleWithFullContent(item),
    );

    expect(written).toContain(`![](${COVER})`);
    expect(written).toContain("Feed body.");
    expect(written).not.toContain("Hero image");
  });

  it("reads {{image}} from the saved template a save was given", async () => {
    const app = App.createMock();
    const item = createItem({ coverImage: COVER, content: "<p>Body.</p>" });

    const written = await readSaved(
      app,
      await createSaver(app, { defaultTemplate: "{{content}}" }).saveArticle(
        item,
        undefined,
        undefined,
        undefined,
        { id: "image", name: "Image", template: IMAGE_TEMPLATE },
      ),
    );

    expect(written).toBe(`![](${COVER})\n\nBody.`);
  });

  it("reads {{image}} from a custom template in place of the default", async () => {
    const app = App.createMock();
    const item = createItem({ coverImage: COVER, content: "<p>Body.</p>" });

    const written = await readSaved(
      app,
      await createSaver(app, { defaultTemplate: "{{content}}" }).saveArticle(
        item,
        undefined,
        IMAGE_TEMPLATE,
      ),
    );

    expect(written).toBe(`![](${COVER})\n\nBody.`);
  });

  it("leaves the in-content copy of the image out of an RSS content save", async () => {
    const app = App.createMock();
    const item = createItem({
      coverImage: COVER,
      content:
        '<p>Intro.</p><img src="https://img.example.com/cover.jpg?lossy" alt="Cover"><p>Body.</p>',
    });

    const written = await readSaved(
      app,
      await createSaver(app).saveArticle(item),
    );

    expect(written).toBe(`![](${COVER})

Intro.

Body.`);
  });

  it("leaves the in-content copy of the image out of a Fetched content save", async () => {
    const app = App.createMock();
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<p>Intro.</p><img src="https://img.example.com/cover.jpg?lossy"><p>Fetched body.</p>',
      failureType: "none",
    });
    const item = createItem({ coverImage: COVER });

    const written = await readSaved(
      app,
      await createSaver(app, {
        saveVersion: "fetched",
      }).saveArticleWithFullContent(item),
    );

    expect(written).toContain(`![](${COVER})`);
    expect(written).toContain("Fetched body.");
    expect(written).not.toContain("cover.jpg?lossy");
  });

  it("leaves the in-content copy of the image out of the fetch-failure fallback", async () => {
    const app = App.createMock();
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({ content: "", failureType: "network" });
    const item = createItem({
      coverImage: COVER,
      content:
        '<img src="https://img.example.com/cover.jpg?lossy"><p>Feed body.</p>',
    });

    const written = await readSaved(
      app,
      await createSaver(app, {
        saveVersion: "fetched",
      }).saveArticleWithFullContent(item),
    );

    expect(written).toContain("Feed body.");
    expect(written).not.toContain("cover.jpg?lossy");
  });

  it("keeps the in-content copy of the image when the template never names {{image}}", async () => {
    const app = App.createMock();
    const item = createItem({
      coverImage: COVER,
      content:
        '<p>Intro.</p><img src="https://img.example.com/cover.jpg?lossy" alt="Cover"><p>Body.</p>',
    });

    const written = await readSaved(
      app,
      await createSaver(app, { defaultTemplate: "{{content}}" }).saveArticle(
        item,
      ),
    );

    expect(written).toContain(
      "![Cover](https://img.example.com/cover.jpg?lossy)",
    );
  });

  it("keeps the hero lead when the template never names the image", async () => {
    const app = App.createMock();
    const item = createItem({ coverImage: COVER, content: "<p>Body.</p>" });

    const written = await readSaved(
      app,
      await createSaver(app, { defaultTemplate: "{{content}}" }).saveArticle(
        item,
      ),
    );

    expect(written).toBe(`![Hero image](${COVER})\n\nBody.`);
  });

  it("keeps the hero lead when {{image}} is only a frontmatter property", async () => {
    const app = App.createMock();
    const item = createItem({ coverImage: COVER, content: "<p>Body.</p>" });

    const written = await readSaved(
      app,
      await createSaver(app, {
        defaultTemplate: "---\ncover: {{image}}\n---\n\n{{content}}",
      }).saveArticle(item),
    );

    expect(written).toBe(
      `---\ncover: ${COVER}\n---\n\n![Hero image](${COVER})\n\nBody.`,
    );
  });

  it("still leads a video item with its native embed", async () => {
    const app = App.createMock();
    const videoId = "z9TFdTqkbPk";
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const item = createItem({
      mediaType: "video",
      videoId,
      coverImage: COVER,
      content: "<p>The video description.</p>",
    });

    const written = await readSaved(
      app,
      await createSaver(app).saveArticle(item),
    );

    expect(written).toBe(
      `![](${COVER})\n\n![](${watchUrl})\n\n[Watch on YouTube](${watchUrl})\n\nThe video description.`,
    );
  });
});
