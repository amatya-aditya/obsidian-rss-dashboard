import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import { App, Component } from "../../stubs/obsidian";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type Tag,
} from "../../../src/types/types";
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
  "%s feed-first article presentation",
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
        const container = createDiv();
        (view as unknown as { contentEl: HTMLElement }).contentEl = container;
        await view.onOpen();
        return {
          render: (entry: FeedItem) => view.displayItem(entry),
          updates,
          container,
          close: () => view.onClose(),
          setTags: (entry: FeedItem, tags: Tag[]) =>
            view.applyExternalUpdate(entry.guid, { tags }, entry.feedUrl),
          setFont: () =>
            (
              view as unknown as { applyReaderHeadlineFont(font: string): void }
            ).applyReaderHeadlineFont("serif"),
          scroll: () =>
            container.querySelector<HTMLElement>(".rss-reader-content")!,
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
        container,
        close: () => {
          container.remove();
        },
        setTags: (entry: FeedItem, tags: Tag[]) => {
          entry.tags = tags;
          renderer.setVideoTags(tags);
        },
        setFont: undefined,
        scroll: () => container,
      };
    }

    it("renders RSS immediately and offers fetched content only after an explicit switch", async () => {
      const harness = await setup();
      const pending = deferFetch();
      const article = item("A");
      const opening = harness.render(article);
      expect(harness.container.textContent).toContain("Short feed blurb");
      expect(
        harness.container.querySelector('[role="status"]')?.textContent,
      ).toContain("Fetching article content");
      pending.resolve(result("A"));
      await opening;
      expect(harness.container.textContent).not.toContain(
        "A substantial opening paragraph",
      );
      const toggle = harness.container.querySelector<HTMLButtonElement>(
        ".rss-reader-content-toggle",
      )!;
      expect(toggle.textContent).toBe("Show fetched content");
      expect(
        harness.container.querySelector('[role="status"]')?.textContent,
      ).toBe("Fetched content ready. RSS content is still shown.");
      harness.scroll().scrollTop = 140;
      toggle.click();
      expect(harness.container.textContent).toContain(
        "A substantial opening paragraph",
      );
      expect(harness.scroll().scrollTop).toBe(0);
      expect(
        harness.container.querySelector('[role="status"]')?.textContent,
      ).toBe("Showing fetched content.");
      harness.scroll().scrollTop = 280;
      toggle.click();
      expect(harness.container.textContent).not.toContain(
        "A substantial opening paragraph",
      );
      expect(harness.scroll().scrollTop).toBe(140);
      toggle.click();
      expect(harness.scroll().scrollTop).toBe(280);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(article.content).toBe("");
      expect(article.description).toBe("<p>Short feed blurb</p>");
    });

    it.each(["network", "restricted"] as const)(
      "keeps RSS readable after %s failure",
      async (failureType) => {
        const harness = await setup();
        const pending = deferFetch();
        const opening = harness.render(item("A"));
        pending.resolve({ content: "", failureType });
        await opening;
        expect(harness.container.textContent).toContain("Short feed blurb");
        expect(
          harness.container.querySelector('[role="status"]')?.textContent,
        ).not.toContain("Fetching");
        expect(
          harness.container.querySelector(".rss-reader-content-toggle"),
        ).toBeNull();
      },
    );

    it("shows a static placeholder for an empty feed and clears it after failure", async () => {
      const harness = await setup();
      const pending = deferFetch();
      const opening = harness.render({ ...item("A"), description: "" });
      expect(
        harness.container.querySelector(".rss-reader-content-placeholder"),
      ).not.toBeNull();
      pending.resolve({ content: "", failureType: "network" });
      await opening;
      expect(harness.container.textContent).toContain("Could not fetch");
      expect(
        harness.container.querySelector(".rss-reader-content-placeholder"),
      ).toBeNull();
    });

    it("persists late metadata without changing the display after newer navigation", async () => {
      const harness = await setup();
      const first = deferFetch();
      const second = deferFetch();
      const a = item("A");
      const b = item("B");
      const firstOpen = harness.render(a);
      const secondOpen = harness.render(b);
      second.resolve(result("B"));
      await secondOpen;
      first.resolve(result("A"));
      await firstOpen;
      expect(harness.container.textContent).not.toContain("Article A");
      expect(a).toMatchObject(expectedMetadata("A"));
      expect(b).toMatchObject(expectedMetadata("B"));
      expect(harness.updates).toHaveBeenCalledTimes(2);
    });

    it("updates tags in both cached versions", async () => {
      const harness = await setup();
      fetchMock.mockResolvedValueOnce(result("A"));
      const article = {
        ...item("A"),
        tags: [{ name: "Old tag", color: "#f00" }],
      };
      await harness.render(article);
      const toggle = harness.container.querySelector<HTMLButtonElement>(
        ".rss-reader-content-toggle",
      )!;
      toggle.click();
      harness.setTags(article, [{ name: "New tag", color: "#00f" }]);
      expect(harness.container.textContent).toContain("New tag");
      toggle.click();
      expect(harness.container.textContent).toContain("New tag");
      expect(harness.container.textContent).not.toContain("Old tag");
      harness.setTags(article, []);
      toggle.click();
      expect(harness.container.querySelector(".rss-reader-tags")).toBeNull();
    });

    it("keeps native toggle focus and remembers cached headline formatting", async () => {
      const harness = await setup();
      fetchMock.mockResolvedValueOnce(result("A"));
      await harness.render(item("A"));
      const toggle = harness.container.querySelector<HTMLButtonElement>(
        ".rss-reader-content-toggle",
      )!;
      expect(toggle.type).toBe("button");
      expect(
        harness.container
          .querySelector('[role="status"]')
          ?.getAttribute("aria-live"),
      ).toBe("polite");
      toggle.click();
      harness.setFont?.();
      toggle.click();
      if (harness.setFont) {
        expect(
          harness.container.querySelector<HTMLElement>(".rss-reader-item-title")
            ?.style.fontFamily,
        ).toBe("serif");
        toggle.click();
        expect(
          harness.container.querySelector<HTMLElement>(".rss-reader-item-title")
            ?.style.fontFamily,
        ).toBe("serif");
      }
    });

    it("clears a previous restricted notice after successful fetch without replacing RSS", async () => {
      const harness = await setup();
      const pending = deferFetch();
      const opening = harness.render({
        ...item("A"),
        restrictedReason: "Previously restricted",
      });
      expect(
        harness.container.querySelector(".rss-reader-paywall-banner"),
      ).not.toBeNull();
      pending.resolve(result("A"));
      await opening;
      expect(
        harness.container.querySelector(".rss-reader-paywall-banner"),
      ).toBeNull();
      expect(harness.container.textContent).toContain("Short feed blurb");
    });

    it("keeps the first metadata write while rejecting stale UI for the same article", async () => {
      const harness = await setup();
      const first = deferFetch();
      const second = deferFetch();
      const article = item("A");
      const firstOpen = harness.render(article);
      const secondOpen = harness.render(article);
      first.resolve(result("old"));
      await firstOpen;
      expect(article).toMatchObject(expectedMetadata("old"));
      const firstWrite = article.metadataFetchedAt;
      expect(
        harness.container.querySelector(".rss-reader-content-toggle"),
      ).toBeNull();
      second.resolve(result("new"));
      await secondOpen;
      expect(article).toMatchObject(expectedMetadata("old"));
      expect(article.metadataFetchedAt).toBe(firstWrite);
      expect(harness.updates).toHaveBeenCalledExactlyOnceWith(
        article,
        expectedMetadata("old"),
        false,
      );
    });

    it("keeps scroll and the exact RSS DOM on background completion", async () => {
      const harness = await setup();
      const pending = deferFetch();
      const opening = harness.render(item("A"));
      const rss = harness.container.querySelector(
        ".rss-reader-article-content",
      );
      harness.scroll().scrollTop = 125;
      pending.resolve(result("A"));
      await opening;
      expect(harness.scroll().scrollTop).toBe(125);
      expect(
        harness.container.querySelector(".rss-reader-article-content"),
      ).toBe(rss);
    });

    it("persists late metadata without updating the UI after close", async () => {
      const harness = await setup();
      const pending = deferFetch();
      const article = item("A");
      const opening = harness.render(article);
      await harness.close();
      pending.resolve(result("A"));
      await opening;
      expect(article).toMatchObject(expectedMetadata("A"));
      expect(harness.updates).toHaveBeenCalledExactlyOnceWith(
        article,
        expectedMetadata("A"),
        false,
      );
      expect(
        harness.container.querySelector(".rss-reader-content-toggle"),
      ).toBeNull();
    });
  },
);

describe("feed-first Reader saving", () => {
  it("waits for the pending article cache, but not Web Viewer, without fetching twice", async () => {
    const app = App.createMock();
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.useWebViewer = true;
    settings.articleSaving.saveFullContent = true;
    const save = vi.fn().mockResolvedValue(null);
    const view = new ReaderView(
      { app, detach: vi.fn() } as never,
      settings,
      {
        saveArticleWithContentPolicy: save,
        checkSavedFileExists: vi.fn(),
      } as never,
      vi.fn(),
      vi.fn(),
    );
    const container = createDiv();
    (view as unknown as { contentEl: HTMLElement }).contentEl = container;
    await view.onOpen();
    const openInWebViewer = vi.fn().mockReturnValue(new Promise(() => {}));
    (
      view as unknown as { webViewerIntegration: unknown }
    ).webViewerIntegration = { openInWebViewer };
    const pending = deferFetch();
    const article = item("A");
    const opening = view.displayItem(article);
    const saving = view.actionSaveCurrentArticle();
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    pending.resolve(result("A"));
    await opening;
    await saving;
    expect(openInWebViewer).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(
      article,
      undefined,
      undefined,
      undefined,
      expect.objectContaining({
        fetchAttempted: true,
        fetchedHtml: result("A").content,
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Short feed blurb");
    await view.onClose();
  });
});
