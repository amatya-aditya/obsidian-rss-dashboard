// Characterization (#983 slice 1): pins how the inline reader cleans up
// fetched article HTML before its private helpers move onto the shared
// reader-html-cleanup utils. Read-only during the migration.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const LONG_A =
  "The first substantial paragraph of the fetched article runs well past one hundred and twenty characters so it marks the body start.";
const LONG_B =
  "A second substantial paragraph keeps the fetched article above the two hundred character threshold for meaningful content.";
const DESCRIPTION =
  "A feed summary sentence that the publisher repeats as the article lead.";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Feed title",
    link: "https://example.com/article",
    description: "",
    content: "<p>Short RSS body.</p>",
    pubDate: "2026-01-01T00:00:00Z",
    guid: "cleanup-article",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ArticleRenderer fetched-article HTML cleanup", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();
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

  afterEach(() => {
    document.body.empty();
  });

  async function renderFetched(
    fetchedHtml: string,
    item: FeedItem,
  ): Promise<HTMLElement> {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: fetchedHtml,
      failureType: "none",
    });
    await renderer.render(container, item);
    const toggle = container.querySelector<HTMLButtonElement>(
      ".rss-reader-content-toggle",
    );
    expect(toggle).not.toBeNull();
    toggle?.click();
    const versions = container.querySelectorAll<HTMLElement>(
      ".rss-reader-content-version",
    );
    const full = versions[versions.length - 1];
    if (!full) throw new Error("fetched version not rendered");
    return full;
  }

  it("strips navigation chrome, skip links, the top headline and inline svgs", async () => {
    const full = await renderFetched(
      `<nav><a href="/">Home</a><a href="/news">News</a></nav>
       <ol class="crumbs"><li><a href="/">Home</a></li><li><a href="/news">News</a></li></ol>
       <a href="#main" class="skip-link">Skip to content</a>
       <h1>Fetched headline from the page</h1>
       <p>${LONG_A}<svg><path d="M0 0"></path></svg></p>
       <p>${LONG_B}</p>`,
      makeItem(),
    );
    const body = full.querySelector(".rss-reader-article-content");

    expect(body?.querySelector("nav")).toBeNull();
    expect(body?.querySelector("ol")).toBeNull();
    expect(body?.textContent).not.toContain("Skip to content");
    expect(body?.querySelector("h1")).toBeNull();
    expect(body?.querySelector("svg")).toBeNull();
    expect(body?.textContent).toContain(LONG_A);
    expect(body?.textContent).toContain(LONG_B);
    // The page h1 becomes the displayed title.
    expect(full.querySelector(".rss-reader-item-title")?.textContent).toBe(
      "Fetched headline from the page",
    );
  });

  it("removes the duplicated feed description and its short lead-in", async () => {
    const full = await renderFetched(
      `<p>By Staff</p>
       <p>${DESCRIPTION}</p>
       <p>${LONG_A}</p>
       <p>${LONG_B}</p>`,
      makeItem({ description: `<p>${DESCRIPTION}</p>` }),
    );
    const body = full.querySelector(".rss-reader-article-content");

    expect(
      full.querySelector(".rss-reader-description-callout")?.textContent,
    ).toContain(DESCRIPTION);
    expect(body?.textContent).not.toContain(DESCRIPTION);
    expect(body?.textContent).not.toContain("By Staff");
    expect(body?.textContent).toContain(LONG_A);
  });

  it("keeps a description nested in the article header (pinned)", async () => {
    const full = await renderFetched(
      `<div><header><p>${DESCRIPTION}</p></header>
       <p>${LONG_A}</p><p>${LONG_B}</p></div>`,
      makeItem({ description: `<p>${DESCRIPTION}</p>` }),
    );
    const body = full.querySelector(".rss-reader-article-content");

    expect(body?.textContent).toContain(DESCRIPTION);
    expect(body?.textContent).toContain(LONG_A);
  });

  it("removes lead media and credit captions ahead of the body when a hero is set", async () => {
    const full = await renderFetched(
      `<figure><img src="https://img.example.com/other.jpg"></figure>
       <div><img src="https://img.example.com/hero-800x600.jpg"><span>Pic</span></div>
       <figure><figcaption>Photo credit: Jane Doe</figcaption></figure>
       <p>Photo credit: Jane Doe</p>
       <p>${LONG_A}</p>
       <p>${LONG_B}</p>
       <figure><img src="https://img.example.com/body.jpg"><figcaption>Photo credit: later</figcaption></figure>`,
      makeItem({ coverImage: "https://img.example.com/hero.jpg" }),
    );
    const body = full.querySelector(".rss-reader-article-content");
    const bodySrcs = Array.from(body?.querySelectorAll("img") ?? []).map(
      (img) => img.getAttribute("src"),
    );

    expect(
      full.querySelector(".rss-reader-hero-slot img")?.getAttribute("src"),
    ).toBe("https://img.example.com/hero.jpg");
    expect(bodySrcs).toEqual(["https://img.example.com/body.jpg"]);
    // Pinned: the caption figure goes, the matching paragraph stays.
    expect(body?.querySelector("figcaption")?.textContent).toBe(
      "Photo credit: later",
    );
    expect(body?.querySelector("p")?.textContent).toBe(
      "Photo credit: Jane Doe",
    );
  });

  it("drops the first body image when it matches the hero ignoring a size suffix", async () => {
    const full = await renderFetched(
      `<p>${LONG_A}</p>
       <figure><img src="https://IMG.example.com/Hero-1024x768.jpg"></figure>
       <p>${LONG_B}</p>`,
      makeItem({ coverImage: "https://img.example.com/hero.jpg" }),
    );
    const body = full.querySelector(".rss-reader-article-content");

    expect(body?.querySelector("img")).toBeNull();
    expect(body?.querySelector("figure")).toBeNull();
  });

  it("keeps the body intact for RSS content", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "none",
    });
    await renderer.render(
      container,
      makeItem({
        content: `<nav><a href="/">Home</a></nav><h1>Kept headline</h1><p>${LONG_A}</p>`,
      }),
    );
    const body = container.querySelector(".rss-reader-article-content");

    expect(body?.querySelector("nav")).not.toBeNull();
    expect(body?.querySelector("h1")?.textContent).toBe("Kept headline");
  });

  it("hides a description callout that is only an ellipsis", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "none",
    });
    await renderer.render(
      container,
      makeItem({ description: "<p>[…]</p>", content: `<p>${LONG_A}</p>` }),
    );

    expect(
      container.querySelector(".rss-reader-description-callout"),
    ).toBeNull();
  });

  it("shows a meaningful description callout beside distinct content", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "none",
    });
    await renderer.render(
      container,
      makeItem({ description: "<p>Distinct</p>", content: `<p>${LONG_A}</p>` }),
    );

    expect(
      container.querySelector(".rss-reader-description-callout")?.textContent,
    ).toContain("Distinct");
  });
});
