import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveFeedFetchPlan,
  resolveFetchedFirst,
  runFeedFirstDisplay,
  type FeedFirstDisplayOptions,
} from "../../../src/components/reader-feed-first";
import type { ArticleContentFirst, FeedItem } from "../../../src/types/types";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";
import { findContentToggle } from "../test-reader-toggle-helpers";

const LONG = "word ".repeat(100);
const OK: FullArticleFetchResult = {
  content: `<p>${LONG}</p>`,
  failureType: "none",
};

function feeds(choice?: ArticleContentFirst) {
  return [{ url: "https://example.com/feed", articleContentFirst: choice }];
}

describe("resolveFetchedFirst", () => {
  const item = { feedUrl: "https://example.com/feed" };

  it.each([
    [undefined, false, false],
    [undefined, true, true],
    ["rss", true, false],
    ["fetched", false, true],
  ] as const)(
    "feed %s with global %s resolves to %s",
    (choice, global, out) => {
      expect(resolveFetchedFirst(feeds(choice), item, global)).toBe(out);
    },
  );

  it("follows the global toggle when the article has no current feed", () => {
    expect(resolveFetchedFirst([], item, true)).toBe(true);
    expect(resolveFetchedFirst(feeds("rss"), { feedUrl: "" }, false)).toBe(
      false,
    );
  });
});

describe("resolveFeedFetchPlan with fetched first", () => {
  it("fetches eagerly even for Substack-rich feed content", () => {
    expect(resolveFeedFetchPlan(true, true, false, false)).toBe("onDemand");
    expect(resolveFeedFetchPlan(true, true, false, true)).toBe("eager");
  });

  it("keeps the skip and no-link outcomes whatever the setting", () => {
    expect(resolveFeedFetchPlan(false, false, false, true)).toBe("display");
    expect(resolveFeedFetchPlan(true, false, true, true)).toBe("display");
  });
});

describe("fetched first display", () => {
  afterEach(() => {
    activeDocument.body.empty();
  });

  function setup(overrides: Partial<FeedFirstDisplayOptions> = {}) {
    let resolveFetch!: (result: FullArticleFetchResult) => void;
    const container = activeDocument.body.createDiv();
    const options: FeedFirstDisplayOptions = {
      container,
      item: { link: "https://example.com/a" } as FeedItem,
      feedContent: "<p>feed</p>",
      fetchedFirst: true,
      renderVersion: (el, version, content) => {
        el.createDiv({ text: `${version}:${content}` });
      },
      onSelectVersion: vi.fn(),
      hasMeaningfulContent: (html) => html.length > 20,
      onVersions: vi.fn(),
      fetch: () =>
        new Promise<FullArticleFetchResult>((resolve) => {
          resolveFetch = resolve;
        }),
      persistMetadata: vi.fn(),
      persistPageImage: vi.fn(),
      rememberOutcome: vi.fn(() => false),
      isCurrent: () => true,
      persistRestrictedReason: vi.fn(),
      renderRestrictedBanner: vi.fn(),
      renderFetchFailureBanner: vi.fn(),
      ...overrides,
    };
    const done = runFeedFirstDisplay(options);
    return { container, options, done, settle: (r = OK) => resolveFetch(r) };
  }

  async function settled(
    s: ReturnType<typeof setup>,
    result?: FullArticleFetchResult,
  ) {
    s.settle(result);
    await s.done;
  }

  it("switches to the fetched version when nothing has been read", async () => {
    const s = setup();
    await settled(s);

    expect(s.container.textContent).toContain("full:");
    expect(s.container.textContent).not.toContain("rss:");
    expect(findContentToggle(s.container)?.textContent).toBe(
      "Show RSS content",
    );
    expect(s.options.onSelectVersion).toHaveBeenCalledWith("full", OK.content);
  });

  it("returns to RSS content from the toggle and does not remember it", async () => {
    const s = setup();
    await settled(s);
    findContentToggle(s.container)?.click();

    expect(s.container.textContent).toContain("rss:");
    expect(findContentToggle(s.container)?.textContent).toBe(
      "Show fetched content",
    );
  });

  it("does not switch when the rule is RSS first", async () => {
    const s = setup({ fetchedFirst: false });
    await settled(s);

    expect(s.container.textContent).toContain("rss:");
    expect(findContentToggle(s.container)?.textContent).toBe(
      "Show fetched content",
    );
  });

  it("stays on RSS content after the reader scrolls past a line", async () => {
    const s = setup();
    s.container.scrollTop = 60;
    s.container.dispatchEvent(new Event("scroll"));
    await settled(s);

    expect(s.container.textContent).toContain("rss:");
    expect(findContentToggle(s.container)?.textContent).toBe(
      "Show fetched content",
    );
  });

  it("switches after a scroll that stays under the threshold", async () => {
    const s = setup();
    s.container.scrollTop = 10;
    s.container.dispatchEvent(new Event("scroll"));
    await settled(s);

    expect(s.container.textContent).toContain("full:");
  });

  it("stays on RSS content after a navigation key", async () => {
    const s = setup();
    activeDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    await settled(s);

    expect(s.container.textContent).toContain("rss:");
  });

  it("ignores a lone modifier key", async () => {
    const s = setup();
    activeDocument.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift" }),
    );
    await settled(s);

    expect(s.container.textContent).toContain("full:");
  });

  it("stays on RSS content after a click", async () => {
    const s = setup();
    s.container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settled(s);

    expect(s.container.textContent).toContain("rss:");
  });

  it("stays on RSS content after the reader selects text", async () => {
    const s = setup();
    const text = s.container.querySelector("div div") as HTMLElement;
    const range = activeDocument.createRange();
    range.selectNodeContents(text);
    const selection = activeDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    activeDocument.dispatchEvent(new Event("selectionchange"));
    await settled(s);

    expect(s.container.textContent).toContain("rss:");
    selection?.removeAllRanges();
  });

  it("does not switch for a failed fetch", async () => {
    const s = setup();
    await settled(s, { content: "", failureType: "network" });

    expect(s.container.textContent).toContain("rss:");
    expect(s.container.textContent).not.toContain("full:");
  });

  it("stops listening once the display is disposed", async () => {
    const versions: { current?: { dispose(): void } } = {};
    const s = setup({ onVersions: (v) => (versions.current = v) });
    versions.current?.dispose();
    activeDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    s.settle();

    await expect(s.done).resolves.toBeNull();
  });

  it("stops listening after a failed fetch", async () => {
    const s = setup();
    const spy = vi.spyOn(s.container, "removeEventListener");
    await settled(s, { content: "", failureType: "network" });

    expect(spy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
