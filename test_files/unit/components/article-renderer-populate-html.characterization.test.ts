// Characterization (#1667): pins what ArticleRenderer.populateArticleHtml does
// to the HTML it appends, before the preparation block moves to its own module.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  DEFAULT_SETTINGS,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

interface PopulateInternals {
  populateArticleHtml(
    container: HTMLElement,
    rawHtml: string,
    baseUrl: string,
    fallbackHeroUrl?: string,
    title?: string,
    heroSlot?: HTMLElement,
    stripTopHeadline?: boolean,
    feedDescriptionHtml?: string,
  ): void;
}

const LONG_A =
  "The first substantial paragraph of the fetched article runs well past one hundred and twenty characters so it marks the body start.";
const LONG_B =
  "A second substantial paragraph keeps the fetched article above the two hundred character threshold for meaningful content.";

describe("ArticleRenderer.populateArticleHtml", () => {
  let settings: RssDashboardSettings;
  let renderer: ArticleRenderer;

  beforeEach(() => {
    document.body.empty();
    settings = structuredClone(DEFAULT_SETTINGS);
    renderer = new ArticleRenderer({
      app: {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
      } as never,
      component: new Component(),
      settings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });
  });

  function populate(
    html: string,
    baseUrl: string,
    extra: {
      fallbackHeroUrl?: string;
      title?: string;
      heroSlot?: HTMLElement;
      stripTopHeadline?: boolean;
      feedDescriptionHtml?: string;
    } = {},
  ): HTMLElement {
    const container = createDiv();
    (renderer as unknown as PopulateInternals).populateArticleHtml(
      container,
      html,
      baseUrl,
      extra.fallbackHeroUrl,
      extra.title,
      extra.heroSlot,
      extra.stripTopHeadline,
      extra.feedDescriptionHtml,
    );
    return container;
  }

  it("appends nothing for empty HTML", () => {
    const container = populate("", "https://example.com/a");
    expect(container.childNodes).toHaveLength(0);
  });

  it("resolves relative links and images against the base url, skipping missing attributes", () => {
    const container = populate(
      '<p><a href="rel.html">b</a> <a>none</a> <img src="pic.jpg"> <img alt="nosrc"></p>',
      "https://example.com/dir/page",
    );
    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors[0]?.getAttribute("href")).toBe(
      "https://example.com/dir/rel.html",
    );
    expect(anchors[1]?.hasAttribute("href")).toBe(false);
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs[0]?.getAttribute("src")).toBe(
      "https://example.com/dir/pic.jpg",
    );
    expect(imgs[1]?.hasAttribute("src")).toBe(false);
  });

  it("leaves relative urls unresolved without a base url", () => {
    const container = populate(
      '<p><a href="/path">a</a><img src="p.jpg"></p>',
      "",
    );
    expect(container.querySelector("a")?.hasAttribute("href")).toBe(false);
  });

  it("falls back to the unprepared HTML when the base url is invalid", () => {
    const container = populate(
      '<p><a href="https://x.example/z">z</a> keep</p>',
      "not a url",
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://x.example/z",
    );
    expect(container.textContent).toContain("keep");
  });

  it("promotes lazy image sources", () => {
    const container = populate(
      '<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="https://img.example.com/real.jpg"></p>',
      "https://example.com/",
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.example.com/real.jpg",
    );
  });

  it("removes Substack expand and restack controls", () => {
    const container = populate(
      '<div class="image-link-expand">x</div><button class="restack-image">r</button><button class="view-image">v</button><p>body</p>',
      "https://example.com/",
    );
    expect(container.querySelector(".image-link-expand")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("body");
  });

  it("strips aria-label and tooltip attributes", () => {
    const container = populate(
      '<p><span aria-label="a" data-tooltip="t" data-tooltip-position="top" data-tooltip-delay="1">hi</span></p>',
      "https://example.com/",
    );
    const span = container.querySelector("span");
    expect(span?.hasAttribute("aria-label")).toBe(false);
    expect(span?.hasAttribute("data-tooltip")).toBe(false);
    expect(span?.hasAttribute("data-tooltip-position")).toBe(false);
    expect(span?.hasAttribute("data-tooltip-delay")).toBe(false);
    expect(span?.textContent).toBe("hi");
  });

  it("classes every image as responsive", () => {
    const container = populate(
      '<p><img src="https://a.example/1.jpg"><img src="https://a.example/2.jpg"></p>',
      "https://example.com/",
    );
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs).toHaveLength(2);
    expect(
      imgs.every((i) => i.classList.contains("rss-reader-responsive-img")),
    ).toBe(true);
  });

  describe("hero slot", () => {
    it("shows the fallback hero with the title as alt, and removes a matching lead image", () => {
      const slot = createDiv();
      const container = populate(
        `<p><img src="https://img.example.com/hero.jpg"></p><p>${LONG_A}</p>`,
        "https://example.com/",
        {
          fallbackHeroUrl: "https://img.example.com/hero.jpg",
          title: "My title",
          heroSlot: slot,
        },
      );
      const hero = slot.querySelector("img.rss-reader-fallback-hero");
      expect(hero?.getAttribute("src")).toBe(
        "https://img.example.com/hero.jpg",
      );
      expect(hero?.getAttribute("alt")).toBe("My title");
      expect(container.querySelector("img")).toBeNull();
    });

    it("uses the first body image when there is no fallback hero, with the default alt", () => {
      const slot = createDiv();
      const container = populate(
        `<p><img src="https://img.example.com/first.jpg"></p><p>${LONG_A}</p>`,
        "https://example.com/",
        { heroSlot: slot },
      );
      const hero = slot.querySelector("img.rss-reader-fallback-hero");
      expect(hero?.getAttribute("src")).toBe(
        "https://img.example.com/first.jpg",
      );
      expect(hero?.getAttribute("alt")).toBe("Hero image");
      expect(container.querySelector("img")).toBeNull();
    });

    it("keeps a body image that differs from the fallback hero", () => {
      const slot = createDiv();
      const container = populate(
        '<p><img src="https://img.example.com/other.jpg"></p>',
        "https://example.com/",
        {
          fallbackHeroUrl: "https://img.example.com/hero.jpg",
          heroSlot: slot,
        },
      );
      expect(slot.querySelector("img")?.getAttribute("src")).toBe(
        "https://img.example.com/hero.jpg",
      );
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://img.example.com/other.jpg",
      );
    });

    it("adds no hero when there is neither a fallback nor a body image", () => {
      const slot = createDiv();
      populate("<p>text only</p>", "https://example.com/", { heroSlot: slot });
      expect(slot.childElementCount).toBe(0);
    });

    it("leaves a slot that already has content alone", () => {
      const slot = createDiv();
      slot.createSpan({ text: "existing" });
      const container = populate(
        '<p><img src="https://img.example.com/first.jpg"></p>',
        "https://example.com/",
        { fallbackHeroUrl: "https://img.example.com/hero.jpg", heroSlot: slot },
      );
      expect(slot.childElementCount).toBe(1);
      expect(slot.querySelector("img")).toBeNull();
      expect(container.querySelector("img")).not.toBeNull();
    });
  });

  describe("stripTopHeadline", () => {
    it("runs the fetched-article cleanup", () => {
      const container = populate(
        `<nav><a href="/">Home</a></nav><h1>Page headline</h1><p>${LONG_A}</p><p>${LONG_B}</p>`,
        "https://example.com/",
        { stripTopHeadline: true },
      );
      expect(container.querySelector("nav")).toBeNull();
      expect(container.querySelector("h1")).toBeNull();
      expect(container.textContent).toContain(LONG_A);
    });

    it("leaves navigation and headings alone when off", () => {
      const container = populate(
        `<nav><a href="/">Home</a></nav><h1>Page headline</h1><p>${LONG_A}</p>`,
        "https://example.com/",
      );
      expect(container.querySelector("nav")).not.toBeNull();
      expect(container.querySelector("h1")?.textContent).toBe("Page headline");
    });
  });

  describe("highlights", () => {
    it("marks matching words in the content when enabled for content", () => {
      settings.highlights = {
        ...settings.highlights,
        enabled: true,
        highlightInContent: true,
        words: [
          {
            id: "w1",
            text: "needle",
            color: "#ff0000",
            enabled: true,
            wholeWord: true,
            caseSensitive: false,
            createdAt: 0,
          },
        ],
      };
      const container = populate(
        "<p>a needle here</p>",
        "https://example.com/",
      );
      expect(container.querySelector("mark.rss-highlight")).not.toBeNull();
    });

    it("does not mark words when content highlighting is off", () => {
      const container = populate(
        "<p>a needle here</p>",
        "https://example.com/",
      );
      expect(container.querySelector("mark.rss-highlight")).toBeNull();
    });
  });
});
