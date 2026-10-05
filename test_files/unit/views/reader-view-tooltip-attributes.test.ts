import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { ReaderLightbox } from "../../../src/components/reader-lightbox";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type ReaderViewInternals = {
  contentEl: HTMLElement;
  readingContainer: HTMLElement;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

describe("ReaderView tooltip attribute stripping", () => {
  let readerView: ReaderView;
  let mockApp: {
    workspace: {
      getLeavesOfType: ReturnType<typeof vi.fn>;
      setActiveLeaf: ReturnType<typeof vi.fn>;
      revealLeaf: ReturnType<typeof vi.fn>;
    };
    vault: {
      getAbstractFileByPath: ReturnType<typeof vi.fn>;
    };
  };
  let mockLeaf: MockLeaf;
  let mockSettings: RssDashboardSettings;

  beforeEach(async () => {
    mockApp = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn(),
      },
    };
    mockLeaf = new MockLeaf(mockApp);
    mockSettings = { ...DEFAULT_SETTINGS, useWebViewer: false };

    readerView = new ReaderView(
      mockLeaf as never,
      mockSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).contentEl = createDiv();
    await readerView.onOpen();
  });

  it("removes aria-label/data-tooltip attributes from embedded article HTML", async () => {
    const item: FeedItem = {
      title: "Tooltip Sanitization Test",
      link: "https://aeon.co/test-article",
      description:
        '<nav aria-label="Breadcrumbs"><a href="/crumbs" data-tooltip="Breadcrumbs">crumbs</a></nav>',
      content:
        '<main aria-label="Article body" data-tooltip-position="top" data-tooltip-delay="1"><p>Hello</p></main>',
      pubDate: new Date().toISOString(),
      guid: "tooltip-1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "",
      mediaType: "article",
      saved: false,
    };

    await readerView.displayItem(item);

    const readingContainer = getInternals(readerView).readingContainer;
    const articleContent = readingContainer.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );
    const descriptionContent = readingContainer.querySelector<HTMLElement>(
      ".rss-reader-description",
    );

    expect(articleContent).toBeTruthy();
    expect(descriptionContent).toBeTruthy();

    expect(articleContent?.querySelector("[aria-label]")).toBeNull();
    expect(descriptionContent?.querySelector("[aria-label]")).toBeNull();

    expect(articleContent?.querySelector("[data-tooltip]")).toBeNull();
    expect(descriptionContent?.querySelector("[data-tooltip]")).toBeNull();
    expect(articleContent?.querySelector("[data-tooltip-position]")).toBeNull();
    expect(articleContent?.querySelector("[data-tooltip-delay]")).toBeNull();

    const descriptionLink =
      descriptionContent?.querySelector<HTMLAnchorElement>("a");
    expect(descriptionLink?.getAttribute("href")).toBe(
      "https://aeon.co/crumbs",
    );
  });

  it("shows useful alt text and the filename while preserving the image name and description", async () => {
    const item: FeedItem = {
      title: "Tooltip Image Test",
      link: "https://aeon.co/test-article",
      description: "",
      content:
        '<p><img src="/images/scene%20one.jpg?size=small" alt="A useful scene"></p><p>Article text.</p>',
      pubDate: new Date().toISOString(),
      guid: "tooltip-image-1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "https://images.example.test/cover.jpg",
      mediaType: "article",
      saved: false,
    };

    await readerView.displayItem(item);

    const image = getInternals(readerView).readingContainer.querySelector(
      ".rss-reader-article-content img",
    );
    expect(image?.getAttribute("aria-label")).toBe(
      "A useful scene — scene one.jpg",
    );
    const name = image?.getAttribute("aria-labelledby");
    const description = image?.getAttribute("aria-describedby");
    expect(name && getInternals(readerView).readingContainer.querySelector(`#${name}`)?.textContent).toBe(
      "A useful scene",
    );
    expect(description && getInternals(readerView).readingContainer.querySelector(`#${description}`)?.textContent).toBe(
      "scene one.jpg",
    );
    expect(image?.getAttribute("alt")).toBe("A useful scene");
  });

  it("keeps decorative image filenames out of assistive text and gives lightbox images keyboard access", async () => {
    const item: FeedItem = {
      title: "Decorative Image Test",
      link: "https://aeon.co/test-article",
      description: "",
      content:
        '<p><img src="https://images.example.test/decoration.jpg" alt=""></p><p>Article text.</p>',
      pubDate: new Date().toISOString(),
      guid: "tooltip-image-2",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "https://images.example.test/cover.jpg",
      mediaType: "article",
      saved: false,
    };

    await readerView.displayItem(item);

    const image = getInternals(readerView).readingContainer.querySelector<HTMLImageElement>(
      ".rss-reader-article-content img",
    );
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("aria-label")).toBe("decoration.jpg");
    expect(image?.getAttribute("aria-labelledby")).not.toBeNull();
    const controlName = image?.getAttribute("aria-labelledby");
    expect(controlName && getInternals(readerView).readingContainer.querySelector(`#${controlName}`)?.textContent).toBe(
      "Open image in lightbox",
    );
    expect(image?.getAttribute("aria-describedby")).toBeNull();
    expect(image?.getAttribute("role")).toBe("button");
    expect(image?.getAttribute("tabindex")).toBe("0");

    const tooltipHost = image?.closest(".rss-reader-image-tooltip-host");
    const focusTooltip = tooltipHost?.querySelector(".rss-reader-image-focus-tooltip");
    expect(focusTooltip?.textContent).toBe("decoration.jpg");
    expect(focusTooltip?.getAttribute("aria-hidden")).toBe("true");

    const openLightbox = vi
      .spyOn(ReaderLightbox.prototype, "open")
      .mockImplementation(() => {});
    for (const key of ["Enter", " "]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      image?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(openLightbox).toHaveBeenCalledTimes(2);
    openLightbox.mockRestore();
  });

  it("uses a useful filename as the accessible name when alt is absent", async () => {
    const item: FeedItem = {
      title: "Missing Alt Test",
      link: "https://aeon.co/test-article",
      description: "",
      content:
        '<p><img src="https://images.example.test/accessible-name.jpg"></p><p>Article text.</p>',
      pubDate: new Date().toISOString(),
      guid: "tooltip-image-missing-alt",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "https://images.example.test/cover.jpg",
      mediaType: "article",
      saved: false,
    };

    await readerView.displayItem(item);

    const image = getInternals(readerView).readingContainer.querySelector(
      ".rss-reader-article-content img",
    );
    expect(image?.hasAttribute("alt")).toBe(false);
    const name = image?.getAttribute("aria-labelledby");
    expect(name && getInternals(readerView).readingContainer.querySelector(`#${name}`)?.textContent).toBe(
      "accessible-name.jpg",
    );
    expect(image?.getAttribute("aria-describedby")).toBeNull();
  });

  it("does not add non-lightbox images to the keyboard order", async () => {
    const item: FeedItem = {
      title: "Inline Formula Test",
      link: "https://aeon.co/test-article",
      description: "",
      content:
        '<p><img class="latex" src="https://aeon.co/latex.php?latex=x" alt="x squared"></p><p>Article text.</p>',
      pubDate: new Date().toISOString(),
      guid: "tooltip-image-3",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "",
      mediaType: "article",
      saved: false,
    };

    await readerView.displayItem(item);

    const image = getInternals(readerView).readingContainer.querySelector("img.latex");
    expect(image?.getAttribute("tabindex")).toBeNull();
    expect(image?.getAttribute("role")).toBeNull();
  });
});
