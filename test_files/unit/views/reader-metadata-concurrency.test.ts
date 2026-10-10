import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import { App, Component, TFile } from "../../stubs/obsidian";
import { ArticleSaver } from "../../../src/services/article-saver";
import { DEFAULT_SETTINGS, type FeedItem } from "../../../src/types/types";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/utils/full-article-fetch", async () => ({
  ...(await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch")),
  fetchFullArticleContentWithOutcome: fetchMock,
}));

function item(id: string): FeedItem {
  return {
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    description: "<p>Short feed blurb</p>",
    content: "",
    pubDate: "2026-10-06",
    guid: id,
    feedTitle: "Example",
    feedUrl: "https://example.com/feed",
    coverImage: "",
  };
}

function result(id: string): FullArticleFetchResult {
  return {
    content: `<p>${"A substantial opening paragraph which differs from the publisher summary. ".repeat(5)}</p>`,
    failureType: "none",
    pageMetadata: {
      metaDescription: `Unique publisher summary of article ${id}, with enough detail to pass the description guard.`,
      ogDescription: "",
      twitterDescription: "",
      htmlLang: id === "A" ? "en" : "fr",
      metaAuthor: `Author ${id}`,
      jsonLdAuthors: [],
      microdataAuthors: [],
      relAuthors: [],
      readabilityExcerpt: "",
      canonicalUrl: `https://example.com/canonical-${id}`,
    },
  };
}

function deferFetch() {
  let resolve!: (value: FullArticleFetchResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<FullArticleFetchResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  fetchMock.mockReturnValueOnce(promise);
  return { resolve, reject };
}

function expectedMetadata(id: string) {
  return {
    canonicalUrl: `https://example.com/canonical-${id}`,
    publisherDescription: result(id).pageMetadata?.metaDescription,
    language: id === "A" ? "en" : "fr",
    languageSource: "page",
    authors: [`Author ${id}`],
    metadataFetchedAt: expect.any(Number),
  };
}

beforeEach(() => fetchMock.mockReset());
afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

describe.each(["ReaderView", "ArticleRenderer"])(
  "%s fetched metadata ownership",
  (surface) => {
    async function setup() {
      const app = App.createMock();
      const updates = vi.fn();
      const settings = {
        ...DEFAULT_SETTINGS,
        useWebViewer: false,
        corsProxyEnabled: false,
      };
      if (surface === "ReaderView") {
        const leaf = { app, detach: vi.fn() };
        const view = new ReaderView(
          leaf as never,
          settings,
          {
            saveArticle: vi.fn(),
            checkSavedFileExists: vi.fn().mockReturnValue(true),
          } as never,
          vi.fn(),
          updates,
        );
        (view as unknown as { contentEl: HTMLElement }).contentEl = createDiv();
        await view.onOpen();
        return {
          render: (entry: FeedItem) => view.displayItem(entry),
          updates,
        };
      }
      const renderer = new ArticleRenderer({
        app: app as never,
        component: new Component() as never,
        settings,
        onArticleSave: vi.fn(),
        onArticleUpdate: updates,
      });
      const container = createDiv();
      document.body.append(container);
      return {
        render: (entry: FeedItem) => renderer.render(container, entry),
        updates,
      };
    }

    it("persists each article's own metadata during sequential navigation", async () => {
      const harness = await setup();
      fetchMock
        .mockResolvedValueOnce(result("A"))
        .mockResolvedValueOnce(result("B"));
      const a = item("A");
      const b = item("B");
      await harness.render(a);
      await harness.render(b);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(a.link);
      expect(fetchMock.mock.calls[1]?.[0]).toBe(b.link);
      expect(a).toMatchObject(expectedMetadata("A"));
      expect(b).toMatchObject(expectedMetadata("B"));
      expect(harness.updates).toHaveBeenCalledWith(
        a,
        expectedMetadata("A"),
        false,
      );
      expect(harness.updates).toHaveBeenCalledWith(
        b,
        expectedMetadata("B"),
        false,
      );
    });

    it.each(["A then B", "B then A"])(
      "persists each article's own metadata when overlapping fetches resolve together: %s",
      async (order) => {
        const harness = await setup();
        const first = deferFetch();
        const second = deferFetch();
        const a = item("A");
        const b = item("B");
        const pendingA = harness.render(a);
        const pendingB = harness.render(b);
        // Resolve both before yielding: both fetch helpers finish before rendering resumes.
        if (order === "A then B") {
          first.resolve(result("A"));
          second.resolve(result("B"));
        } else {
          second.resolve(result("B"));
          first.resolve(result("A"));
        }
        await Promise.all([pendingA, pendingB]);
        expect(a).toMatchObject(expectedMetadata("A"));
        expect(b).toMatchObject(expectedMetadata("B"));
        expect(harness.updates).toHaveBeenCalledTimes(2);
        expect(harness.updates).toHaveBeenCalledWith(
          a,
          expectedMetadata("A"),
          false,
        );
        expect(harness.updates).toHaveBeenCalledWith(
          b,
          expectedMetadata("B"),
          false,
        );
        const firstWrite = a.metadataFetchedAt;
        fetchMock.mockResolvedValueOnce(result("A"));
        await harness.render(a);
        expect(a).toMatchObject(expectedMetadata("A"));
        expect(a.metadataFetchedAt).toBe(firstWrite);
        expect(harness.updates).toHaveBeenCalledTimes(2);
      },
    );

    it("keeps a late result's metadata on its original article after newer navigation finishes", async () => {
      const harness = await setup();
      const first = deferFetch();
      fetchMock.mockResolvedValueOnce(result("B"));
      const a = item("A");
      const b = item("B");
      const pendingA = harness.render(a);
      await harness.render(b);
      first.resolve(result("A"));
      await pendingA;
      expect(a).toMatchObject(expectedMetadata("A"));
      expect(b).toMatchObject(expectedMetadata("B"));
      expect(harness.updates).toHaveBeenCalledWith(
        a,
        expectedMetadata("A"),
        false,
      );
      expect(harness.updates).toHaveBeenCalledWith(
        b,
        expectedMetadata("B"),
        false,
      );
    });

    it.each([
      [
        "metadata-free full content",
        { ...result("A"), pageMetadata: undefined },
      ],
      ["short content", { ...result("A"), content: "<p>Too short</p>" }],
      ["network failure", { content: "", failureType: "network" }],
      ["restricted failure", { content: "", failureType: "restricted" }],
    ] satisfies [string, FullArticleFetchResult][])(
      "does not borrow metadata or set a timestamp for %s during overlapping loads",
      async (_label, firstResult) => {
        const harness = await setup();
        const first = deferFetch();
        const second = deferFetch();
        const a = item("A");
        const b = item("B");
        const pendingA = harness.render(a);
        const pendingB = harness.render(b);
        first.resolve(firstResult);
        second.resolve(result("B"));
        await Promise.all([pendingA, pendingB]);
        expect(a.metadataFetchedAt).toBeUndefined();
        expect(a.canonicalUrl).toBeUndefined();
        expect(a.publisherDescription).toBeUndefined();
        expect(a.language).toBeUndefined();
        expect(a.authors).toBeUndefined();
        expect(b).toMatchObject(expectedMetadata("B"));
        expect(harness.updates).toHaveBeenCalledTimes(1);
        expect(harness.updates).toHaveBeenCalledWith(
          b,
          expectedMetadata("B"),
          false,
        );
        // A failed or metadata-free fetch must leave a later valid fetch able to write.
        fetchMock.mockResolvedValueOnce(result("A"));
        await harness.render(a);
        expect(a).toMatchObject(expectedMetadata("A"));
      },
    );

    it.each(["", "https://news.kagi.com/story"])(
      "does not reuse prior metadata when a subsequent article needs no fetch: %s",
      async (link) => {
        const harness = await setup();
        fetchMock.mockResolvedValueOnce(result("B"));
        await harness.render(item("B"));
        const a = { ...item("A"), link, content: result("A").content };
        await harness.render(a);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(a.metadataFetchedAt).toBeUndefined();
        expect(a.canonicalUrl).toBeUndefined();
        expect(harness.updates).toHaveBeenCalledTimes(1);
      },
    );

    it("retains the first persisted metadata when the same article is fetched again", async () => {
      const harness = await setup();
      fetchMock
        .mockResolvedValueOnce(result("A"))
        .mockResolvedValueOnce(result("B"));
      const a = item("A");
      await harness.render(a);
      const firstWrite = a.metadataFetchedAt;
      await harness.render(a);
      expect(a).toMatchObject(expectedMetadata("A"));
      expect(a.metadataFetchedAt).toBe(firstWrite);
      expect(harness.updates).toHaveBeenCalledTimes(1);
    });

    it("preserves error handling without borrowing another result's metadata", async () => {
      const harness = await setup();
      const first = deferFetch();
      fetchMock.mockResolvedValueOnce(result("B"));
      const a = item("A");
      const b = item("B");
      const pendingA = harness.render(a);
      await harness.render(b);
      const error = new Error("Unexpected fetch failure");
      const check =
        surface === "ReaderView"
          ? expect(pendingA).rejects.toThrow(error)
          : expect(pendingA).resolves.toBeUndefined();
      first.reject(error);
      await check;
      expect(a.metadataFetchedAt).toBeUndefined();
      expect(a.canonicalUrl).toBeUndefined();
      expect(b).toMatchObject(expectedMetadata("B"));
      expect(harness.updates).toHaveBeenCalledTimes(1);
    });
  },
);

describe("ReaderView fetched metadata and saved content", () => {
  it("saves the current short fetch without borrowing metadata from an overlapping article", async () => {
    const app = App.createMock();
    const settings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
      corsProxyEnabled: false,
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        saveFullContent: true,
        defaultTemplate: "{{content}}",
        includeFrontmatter: false,
      },
    };
    const updates = vi.fn();
    const saver = new ArticleSaver(app as never, settings.articleSaving);
    const view = new ReaderView(
      { app, detach: vi.fn() } as never,
      settings,
      saver,
      vi.fn(),
      updates,
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = createDiv();
    await view.onOpen();
    const a = item("A");
    const b = {
      ...item("B"),
      content: `<p>${"Long feed body for article B. ".repeat(20)}</p>`,
    };
    const first = deferFetch();
    const second = deferFetch();
    const pendingA = view.displayItem(a);
    const pendingB = view.displayItem(b);
    first.resolve(result("A"));
    second.resolve({
      ...result("B"),
      content: "<p>Short fetched body for article B.</p>",
    });
    await Promise.all([pendingA, pendingB]);

    expect(a).toMatchObject(expectedMetadata("A"));
    expect(b.metadataFetchedAt).toBeUndefined();
    expect(updates).toHaveBeenCalledWith(a, expectedMetadata("A"), false);
    const readingContainer = (
      view as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    expect(readingContainer.textContent).toContain(
      "Long feed body for article B.",
    );
    expect(readingContainer.textContent).not.toContain(
      "Short fetched body for article B.",
    );

    await view.actionSaveCurrentArticle();

    const saved = app.vault.getAbstractFileByPath(b.savedFilePath ?? "");
    expect(saved).toBeInstanceOf(TFile);
    if (!(saved instanceof TFile))
      throw new Error("Expected a saved article file");
    const written = await app.vault.read(saved);
    expect(written).toContain("Short fetched body for article B.");
    expect(written).not.toContain("Long feed body for article B.");
    expect(written).not.toContain("A substantial opening paragraph");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a).toMatchObject(expectedMetadata("A"));
    expect(b.canonicalUrl).toBeUndefined();
  });
});
