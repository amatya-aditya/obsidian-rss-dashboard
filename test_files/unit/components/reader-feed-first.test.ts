import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runFeedFirstDisplay,
  visitReaderContent,
  type FeedFirstDisplayOptions,
} from "../../../src/components/reader-feed-first";
import type { ReaderContentVersions } from "../../../src/components/reader-content-versions";
import type { FeedItem } from "../../../src/types/types";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";
import { RESTRICTED_ARTICLE_REASON } from "../../../src/utils/full-article-fetch";
import { findContentToggle } from "../test-reader-toggle-helpers";

const LONG = "word ".repeat(100);

function setup(
  result: FullArticleFetchResult,
  overrides: Partial<FeedFirstDisplayOptions> = {},
) {
  const parent = activeDocument.body.createDiv();
  const container = parent.createDiv();
  const item = { link: "https://example.com/a" } as FeedItem;
  const options: FeedFirstDisplayOptions = {
    container,
    item,
    feedContent: "<p>feed</p>",
    renderVersion: (el, _version, content) => {
      el.createDiv({ text: content });
    },
    onSelectVersion: vi.fn(),
    hasMeaningfulContent: (html) => html.length > 20,
    onVersions: vi.fn(),
    fetch: () => Promise.resolve(result),
    persistMetadata: vi.fn(),
    rememberOutcome: vi.fn(() => false),
    isCurrent: () => true,
    onSettled: vi.fn(),
    persistRestrictedReason: vi.fn(),
    renderRestrictedBanner: vi.fn(),
    renderFetchFailureBanner: vi.fn(),
    ...overrides,
  };
  return { parent, container, item, options };
}

describe("runFeedFirstDisplay", () => {
  afterEach(() => {
    activeDocument.body.empty();
  });

  it("offers the fetched version once the fetch succeeds", async () => {
    const { container, options, item } = setup({
      content: `<p>${LONG}</p>`,
      failureType: "none",
    });
    item.restrictedReason = RESTRICTED_ARTICLE_REASON;

    await runFeedFirstDisplay(options);

    expect(findContentToggle(container)?.textContent).toBe(
      "Show fetched content",
    );
    expect(item.restrictedReason).toBeUndefined();
    expect(options.persistMetadata).toHaveBeenCalledTimes(1);
    expect(options.onSettled).toHaveBeenCalledTimes(1);
    expect(options.persistRestrictedReason).toHaveBeenCalledWith(undefined);
  });

  it("renders the restricted banner once and offers no toggle", async () => {
    const { container, options, item } = setup({
      content: "",
      failureType: "restricted",
    });

    await runFeedFirstDisplay(options);

    expect(item.restrictedReason).toBe(RESTRICTED_ARTICLE_REASON);
    expect(options.persistRestrictedReason).toHaveBeenCalledWith(
      RESTRICTED_ARTICLE_REASON,
    );
    expect(options.renderRestrictedBanner).toHaveBeenCalledTimes(1);
    expect(findContentToggle(container)).toBeNull();
  });

  it("persists the restricted flag only when the settled outcome changes it", async () => {
    const alreadyRestricted = setup({ content: "", failureType: "restricted" });
    alreadyRestricted.item.restrictedReason = RESTRICTED_ARTICLE_REASON;
    await runFeedFirstDisplay(alreadyRestricted.options);
    expect(
      alreadyRestricted.options.persistRestrictedReason,
    ).not.toHaveBeenCalled();

    const unchangedSuccess = setup({
      content: `<p>${LONG}</p>`,
      failureType: "none",
    });
    await runFeedFirstDisplay(unchangedSuccess.options);
    expect(
      unchangedSuccess.options.persistRestrictedReason,
    ).not.toHaveBeenCalled();
  });

  it("does not persist the restricted flag for a stale result", async () => {
    const stale = setup(
      { content: "", failureType: "restricted" },
      { isCurrent: () => false },
    );

    await runFeedFirstDisplay(stale.options);

    expect(stale.item.restrictedReason).toBeUndefined();
    expect(stale.options.persistRestrictedReason).not.toHaveBeenCalled();
  });

  it("skips the banner when one is already shown", async () => {
    const { container, options } = setup({
      content: "",
      failureType: "restricted",
    });
    container.createDiv({ cls: "rss-reader-paywall-banner" });

    await runFeedFirstDisplay(options);

    expect(options.renderRestrictedBanner).not.toHaveBeenCalled();
  });

  it("ignores a stale result but still persists its metadata", async () => {
    const { container, options } = setup(
      { content: `<p>${LONG}</p>`, failureType: "none" },
      { isCurrent: () => false },
    );

    const versions = await runFeedFirstDisplay(options);

    expect(versions).toBeNull();
    expect(options.persistMetadata).toHaveBeenCalledTimes(1);
    expect(options.onSettled).not.toHaveBeenCalled();
    expect(findContentToggle(container)).toBeNull();
  });

  it("remembers a stale failure but shows no banner for it (#1110)", async () => {
    const { options } = setup(
      { content: "", failureType: "network", failureReason: "timeout" },
      { isCurrent: () => false, rememberOutcome: vi.fn(() => true) },
    );

    await runFeedFirstDisplay(options);

    expect(options.rememberOutcome).toHaveBeenCalledTimes(1);
    expect(options.renderFetchFailureBanner).not.toHaveBeenCalled();
  });

  it("shows the failure banner only for a remembered failure (#1110)", async () => {
    const network: FullArticleFetchResult = {
      content: "",
      failureType: "network",
    };
    const remembered = setup(network, {
      rememberOutcome: vi.fn(() => true),
    });
    const forgotten = setup(network);

    await runFeedFirstDisplay(remembered.options);
    await runFeedFirstDisplay(forgotten.options);

    expect(remembered.options.renderFetchFailureBanner).toHaveBeenCalledTimes(
      1,
    );
    expect(forgotten.options.renderFetchFailureBanner).not.toHaveBeenCalled();
  });
});

describe("visitReaderContent", () => {
  it("visits the versions when present, else the fallback", () => {
    const visitor = vi.fn();
    const fallback = activeDocument.body.createDiv();
    const versions = {
      visitVersions: (fn: (el: HTMLElement) => void) => fn(fallback),
    } as unknown as ReaderContentVersions;

    visitReaderContent(versions, undefined, visitor);
    visitReaderContent(undefined, fallback, visitor);
    visitReaderContent(undefined, undefined, visitor);

    expect(visitor).toHaveBeenCalledTimes(2);
  });
});
