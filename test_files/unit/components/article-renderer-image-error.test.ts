import { beforeEach, describe, expect, it, vi } from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchFullArticleContentWithOutcomeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch");

  return {
    ...actual,
    fetchFullArticleContentWithOutcome: fetchFullArticleContentWithOutcomeMock,
  };
});

installObsidianDomPolyfills();

function makeItem(content: string): FeedItem {
  return {
    title: "Image error handling",
    link: "https://example.com/article",
    description: "",
    content,
    pubDate: "2026-01-01T00:00:00Z",
    guid: "image-error-article",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "https://img.example.com/hero.jpg",
    mediaType: "article",
    saved: false,
  };
}

describe("ArticleRenderer remote image errors", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "none",
    });

    renderer = new ArticleRenderer({
      app: {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
      } as never,
      component: new Component(),
      settings: { ...DEFAULT_SETTINGS } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });

    container = createDiv();
    document.body.appendChild(container);
  });

  it("does not log a remote image that fails to load and has no recovery", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderer.render(
      container,
      makeItem('<img src="https://img.example.com/a.jpg">'),
    );
    const image = container.querySelector("img.rss-reader-responsive-img");
    expect(image).not.toBeNull();
    image?.dispatchEvent(new Event("error"));

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("recovers a failed Substack image without logging the recovery", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const original =
      "https://substack-post-media.s3.amazonaws.com/public/images/abc.png";
    const wrapped = `https://substackcdn.com/image/fetch/w_1456,c_limit/${encodeURIComponent(original)}`;

    await renderer.render(
      container,
      makeItem(
        '<picture><source srcset="x.webp"><img src="https://img.example.com/a.jpg"></picture>',
      ),
    );
    const image = container.querySelector(
      "img.rss-reader-responsive-img",
    ) as HTMLImageElement;
    expect(image).not.toBeNull();
    Object.defineProperty(image, "currentSrc", { value: wrapped });

    image.dispatchEvent(new Event("error"));

    const replacement = container.querySelector<HTMLImageElement>(
      "img.rss-reader-responsive-img",
    );
    expect(replacement).not.toBe(image);
    expect(replacement?.getAttribute("src")).toBe(original);
    expect(replacement?.dataset.rssSubstackRecoverAttempted).toBe("true");
    expect(container.querySelector("source")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  // AC12
  it("lazy-loads inline reader images and keeps a failed image visible", async () => {
    await renderer.render(
      container,
      makeItem(
        '<img src="https://img.example.com/a.jpg" width="640" height="480">',
      ),
    );
    const image = container.querySelector(
      "img.rss-reader-responsive-img",
    ) as HTMLImageElement;

    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.classList.contains("is-loading")).toBe(true);

    image.dispatchEvent(new Event("error"));

    expect(image.classList.contains("is-loading")).toBe(false);
  });
});
