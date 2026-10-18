// Characterization (#983 slice 1): pins how the inline reader cleans up
// fetched article HTML. The four private helpers this file was written around
// moved onto the shared `reader-html-cleanup` and `substack-image-url` utils in
// #1238, so these cases now pin the shared behavior; none of them changed.
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
    // The page h1 becomes the displayed title. It sits at element index 9, the
    // last index the shared title extractor accepts, so this stays the title
    // now that the inline reader uses that extractor (#1238).
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

  it("removes a description paragraph directly under a single root wrapper", async () => {
    // Readability returns the article inside one root element, so the wrapper's
    // blocks are hoisted before the body-child scans run (#1304).
    const full = await renderFetched(
      `<div id="readability-page-1"><p>By Staff</p>
       <p>${DESCRIPTION}</p><p>${LONG_A}</p><p>${LONG_B}</p></div>`,
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

  it("removes a description nested in an article header inside the fetched wrapper", async () => {
    // The article must not open with the description, or the callout is hidden
    // and the duplicate intro deliberately stays (#247); "By Staff" keeps the
    // body distinct so the callout shows and the lead is stripped.
    const full = await renderFetched(
      `<div id="readability-page-1"><p>By Staff</p>
       <header><p>${DESCRIPTION}</p></header>
       <p>${LONG_A}</p><p>${LONG_B}</p></div>`,
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
    expect(body?.querySelector("figcaption")?.textContent).toBe(
      "Photo credit: later",
    );
    // The caption figure goes with lead media; its matching paragraph goes too.
    expect(body?.querySelector("p")?.textContent).toBe(LONG_A);
  });

  it("strips lead media inside a single root wrapper exactly as unwrapped", async () => {
    const full = await renderFetched(
      `<div id="readability-page-1"><figure><img src="https://img.example.com/other.jpg"></figure>
       <p>${LONG_A}</p><p>${LONG_B}</p></div>`,
      makeItem({ coverImage: "https://img.example.com/hero.jpg" }),
    );
    const body = full.querySelector(".rss-reader-article-content");

    expect(body?.querySelector("figure")).toBeNull();
    expect(body?.querySelector("img")).toBeNull();
    expect(body?.textContent).toContain(LONG_A);
    expect(
      full.querySelector(".rss-reader-hero-slot img")?.getAttribute("src"),
    ).toBe("https://img.example.com/hero.jpg");
  });

  it("pairs the lead credit inside a single root wrapper, as unwrapped (#1305)", async () => {
    const credit = "Photo credit: Jane Doe";
    const otherCredit = "Photo credit: John Roe";
    const full = await renderFetched(
      `<div id="readability-page-1"><figure><figcaption>${credit}</figcaption></figure>
       <p>${credit}</p>
       <p>${otherCredit}</p>
       <p>${LONG_A}</p>
       <p>${credit}</p></div>`,
      makeItem({ coverImage: "https://img.example.com/hero.jpg" }),
    );
    const body = full.querySelector(".rss-reader-article-content");
    const paragraphs = Array.from(body?.querySelectorAll("p") ?? []).map((p) =>
      p.textContent?.trim(),
    );

    // The caption's figure goes with lead media, the credit repeated above the
    // body goes with it, a differing credit stays, and the repeat after the body
    // stays because it is not ahead of the body start.
    expect(body?.querySelector("figure")).toBeNull();
    expect(paragraphs).toEqual([otherCredit, LONG_A, credit]);
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

  it("leaves RSS content wrapped in one root element untouched", async () => {
    // The fetched-content cleanup, and the wrapper hoist with it, is gated on
    // the strip flag (#1304); RSS content renders as it arrives.
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "none",
    });
    await renderer.render(
      container,
      makeItem({
        description: `<p>${DESCRIPTION}</p>`,
        content: `<div><p>${DESCRIPTION}</p><p>${LONG_A}</p></div>`,
      }),
    );
    const body = container.querySelector(".rss-reader-article-content");

    expect(body?.querySelector("div")).not.toBeNull();
    expect(body?.textContent).toContain(DESCRIPTION);
    expect(body?.textContent).toContain(LONG_A);
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
