import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findContentToggle } from "../test-reader-toggle-helpers";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import { App, Component } from "../../stubs/obsidian";
import { DEFAULT_SETTINGS, type FeedItem } from "../../../src/types/types";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";
import {
  RESTRICTED_ARTICLE_BANNER,
  RESTRICTED_ARTICLE_REASON,
} from "../../../src/utils/full-article-fetch";

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
      ogImage: "",
      twitterImage: "",
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

describe("ArticleRenderer request-local fetch outcomes", () => {
  async function setup() {
    const app = App.createMock();
    // Metadata writes only: the remembered fetch failure (#1110) and the
    // persisted restricted flag (#1249) are asserted in the fetch-failure and
    // restricted-banner tests.
    const updates = vi.fn();
    const recordMetadataUpdate = (
      entry: FeedItem,
      patch: Partial<FeedItem>,
      rerender?: boolean,
    ) => {
      if (
        !("fullContentFetchFailure" in patch) &&
        !("restrictedReason" in patch)
      )
        updates(entry, patch, rerender);
    };
    const settings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
      corsProxyEnabled: false,
    };
    const renderer = new ArticleRenderer({
      app: app as never,
      component: new Component() as never,
      settings,
      onArticleSave: vi.fn(),
      onArticleUpdate: recordMetadataUpdate,
    });
    const container = createDiv();
    document.body.append(container);
    return {
      render: (entry: FeedItem) => renderer.render(container, entry),
      updates,
      container,
    };
  }

  describe.each(["A then B", "B then A"])("completion order: %s", (order) => {
    describe.each(["A", "B"])("restricted article: %s", (restrictedId) => {
      it.each([
        ["empty unrestricted result", { content: "", failureType: "none" }],
        ["network failure", { content: "", failureType: "network" }],
        ["full content", { ...result("other"), pageMetadata: undefined }],
        [
          "restricted result with full content",
          {
            ...result("other"),
            failureType: "restricted",
            pageMetadata: undefined,
          },
        ],
      ] satisfies [string, FullArticleFetchResult][])(
        "ignores stale restrictions and preserves the current RSS body beside %s",
        async (_label, otherResult) => {
          const harness = await setup();
          const first = deferFetch();
          const second = deferFetch();
          const a = item("A");
          const b = item("B");
          const other = restrictedId === "A" ? b : a;
          // A successful body clears a prior restriction; a restricted
          // outcome remains a failure even when it includes some content.
          if (otherResult.content) other.restrictedReason = "Old restriction";
          const restrictedResult: FullArticleFetchResult = {
            content: "",
            failureType: "restricted",
          };
          const resultA = restrictedId === "A" ? restrictedResult : otherResult;
          const resultB = restrictedId === "B" ? restrictedResult : otherResult;
          const pendingA = harness.render(a);
          const pendingB = harness.render(b);
          // Both helpers finish before either render continuation resumes.
          if (order === "A then B") {
            first.resolve(resultA);
            second.resolve(resultB);
          } else {
            second.resolve(resultB);
            first.resolve(resultA);
          }
          await Promise.all([pendingA, pendingB]);

          expect(fetchMock).toHaveBeenCalledTimes(2);
          expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            a.link,
            b.link,
          ]);
          expect(a.restrictedReason).toBe(
            restrictedId === "B" && otherResult.content
              ? "Old restriction"
              : undefined,
          );
          const currentIsRestricted =
            restrictedId === "B" || otherResult.failureType === "restricted";
          expect(b.restrictedReason).toBe(
            currentIsRestricted ? RESTRICTED_ARTICLE_REASON : undefined,
          );
          const banners = harness.container.querySelectorAll(
            ".rss-reader-paywall-banner",
          );
          expect(banners).toHaveLength(currentIsRestricted ? 1 : 0);
          if (currentIsRestricted) {
            expect(banners[0]?.textContent).toContain(
              restrictedId === "A" && otherResult.content
                ? "Old restriction"
                : RESTRICTED_ARTICLE_BANNER,
            );
            expect(banners[0]?.querySelector("a")?.getAttribute("href")).toBe(
              b.link,
            );
          }
          expect(harness.container.textContent).toContain("Short feed blurb");
          expect(harness.container.textContent).not.toContain(
            "A substantial opening paragraph",
          );
          expect(findContentToggle(harness.container)?.textContent).toBe(
            restrictedId === "A" &&
              otherResult.content &&
              otherResult.failureType === "none"
              ? "Show fetched content"
              : undefined,
          );
          expect(harness.updates).not.toHaveBeenCalled();
        },
      );
    });

    it("preserves the fetch error boundary beside a restricted article", async () => {
      const harness = await setup();
      const first = deferFetch();
      const second = deferFetch();
      const a = item("A");
      const b = item("B");
      const pendingA = harness.render(a);
      const pendingB = harness.render(b);
      const error = new Error("Unexpected fetch failure");
      const check = expect(pendingA).resolves.toBeUndefined();
      const restrictedResult: FullArticleFetchResult = {
        content: "",
        failureType: "restricted",
      };
      if (order === "A then B") {
        first.reject(error);
        second.resolve(restrictedResult);
      } else {
        second.resolve(restrictedResult);
        first.reject(error);
      }
      await Promise.all([check, pendingB]);

      expect(a.restrictedReason).toBeUndefined();
      expect(b.restrictedReason).toBe(RESTRICTED_ARTICLE_REASON);
      const banners = harness.container.querySelectorAll(
        ".rss-reader-paywall-banner",
      );
      expect(banners).toHaveLength(1);
      expect(banners[0]?.textContent).toContain(RESTRICTED_ARTICLE_BANNER);
      expect(banners[0]?.querySelector("a")?.getAttribute("href")).toBe(b.link);
      expect(harness.updates).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["an item with no link", { link: "" }],
    [
      "feed content with Substack markup",
      { content: '<img src="https://substackcdn.com/image/fetch/x.png">' },
    ],
  ])(
    "does not borrow a restriction when the next article needs no fetch: %s",
    async (_label, overrides) => {
      const harness = await setup();
      fetchMock.mockResolvedValueOnce({
        content: "",
        failureType: "restricted",
      });
      await harness.render(item("B"));
      const a = { ...item("A"), ...overrides };
      await harness.render(a);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(a.restrictedReason).toBeUndefined();
      expect(
        harness.container.querySelector(".rss-reader-paywall-banner"),
      ).toBeNull();
    },
  );

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
    "persists each article metadata when overlapping fetches resolve together: %s",
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
      expect(harness.updates).toHaveBeenCalledWith(
        a,
        expectedMetadata("A"),
        false,
      );
      expect(harness.updates).toHaveBeenCalledTimes(2);
      expect(harness.updates).toHaveBeenCalledWith(
        b,
        expectedMetadata("B"),
        false,
      );
      const firstWrite = b.metadataFetchedAt;
      fetchMock.mockResolvedValueOnce(result("B"));
      await harness.render(b);
      expect(b).toMatchObject(expectedMetadata("B"));
      expect(b.metadataFetchedAt).toBe(firstWrite);
      expect(harness.updates).toHaveBeenCalledTimes(2);
    },
  );

  it("persists a late result on its original article without changing the current display", async () => {
    const harness = await setup();
    const first = deferFetch();
    fetchMock.mockResolvedValueOnce(result("B"));
    const a = item("A");
    const b = item("B");
    const pendingA = harness.render(a);
    await harness.render(b);
    const currentDisplay = harness.container.innerHTML;
    first.resolve(result("A"));
    await pendingA;
    expect(harness.container.innerHTML).toBe(currentDisplay);
    expect(harness.updates).toHaveBeenCalledWith(
      a,
      expectedMetadata("A"),
      false,
    );
    expect(a).toMatchObject(expectedMetadata("A"));
    expect(b).toMatchObject(expectedMetadata("B"));
    expect(harness.updates).toHaveBeenCalledTimes(2);
    expect(harness.updates).toHaveBeenCalledWith(
      b,
      expectedMetadata("B"),
      false,
    );
  });

  it.each([
    ["metadata-free full content", { ...result("A"), pageMetadata: undefined }],
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
      // A remembered network failure waits for "Try again" (#1110).
      delete a.fullContentFetchFailure;
      fetchMock.mockResolvedValueOnce(result("A"));
      await harness.render(a);
      expect(a).toMatchObject(expectedMetadata("A"));
    },
  );

  it.each([
    ["an item with no link", { link: "" }],
    [
      "feed content with Substack markup",
      { content: '<img src="https://substackcdn.com/image/fetch/x.png">' },
    ],
  ])(
    "does not reuse prior metadata when a subsequent article needs no fetch: %s",
    async (_label, overrides) => {
      const harness = await setup();
      fetchMock.mockResolvedValueOnce(result("B"));
      await harness.render(item("B"));
      const a = { ...item("A"), content: result("A").content, ...overrides };
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
    const check = expect(pendingA).resolves.toBeUndefined();
    first.reject(error);
    await check;
    expect(a.metadataFetchedAt).toBeUndefined();
    expect(a.canonicalUrl).toBeUndefined();
    expect(b).toMatchObject(expectedMetadata("B"));
    expect(harness.updates).toHaveBeenCalledTimes(1);
  });
});
