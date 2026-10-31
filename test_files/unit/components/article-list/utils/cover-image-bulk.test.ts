// The bulk cover-image fetch behind the header button (#1702): which cards a
// page offers it, how many requests run at once, what a cancel leaves behind,
// and the one sentence that reports the run.
import { describe, expect, it, vi } from "vitest";
import {
  BULK_COVER_IMAGE_CONCURRENCY,
  describeBulkCoverImageResult,
  runBulkCoverImageFetch,
  selectBulkCoverImageTargets,
} from "../../../../../src/components/article-list/utils/cover-image-bulk";
import type { FeedItem } from "../../../../../src/types/types";

const AVAILABLE = {
  hasFetcher: true,
  hasRestorer: true,
  showCoverImage: true,
};

function article(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    guid: "guid",
    title: "Title",
    link: "https://example.com/a",
    pubDate: "2026-01-01T00:00:00.000Z",
    description: "",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
    ...overrides,
  };
}

function articles(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, index) =>
    article({ guid: `g${index}`, link: `https://example.com/${index}` }),
  );
}

describe("selectBulkCoverImageTargets", () => {
  it("picks cards with no cover and cards that only have the feed's cover", () => {
    const none = article({ guid: "none" });
    const feedCover = article({
      guid: "feed",
      coverImage: "https://img.example.com/feed.jpg",
    });

    expect(
      selectBulkCoverImageTargets([none, feedCover], AVAILABLE).map(
        (a) => a.guid,
      ),
    ).toEqual(["none", "feed"]);
  });

  it("skips a card that already holds a fetched cover", () => {
    const fetched = article({
      guid: "fetched",
      coverImage: "https://page.example.com/hero.jpg",
      coverImageFromPage: true,
    });

    expect(selectBulkCoverImageTargets([fetched], AVAILABLE)).toEqual([]);
  });

  it("skips a card whose link is not an http(s) page", () => {
    const mail = article({ guid: "mail", link: "mailto:someone@example.com" });

    expect(selectBulkCoverImageTargets([mail], AVAILABLE)).toEqual([]);
  });

  it("selects nothing while cover images are hidden or the dashboard cannot fetch", () => {
    const cards = articles(2);

    expect(
      selectBulkCoverImageTargets(cards, {
        ...AVAILABLE,
        showCoverImage: false,
      }),
    ).toEqual([]);
    expect(
      selectBulkCoverImageTargets(cards, { ...AVAILABLE, hasFetcher: false }),
    ).toEqual([]);
  });
});

describe("runBulkCoverImageFetch", () => {
  it("fetches every target and reports how many stored a cover", async () => {
    const targets = articles(5);
    const fetchOne = vi.fn(async (a: FeedItem) => a.guid !== "g1");

    const result = await runBulkCoverImageFetch({
      targets,
      fetchOne,
      signal: new AbortController().signal,
    });

    expect(fetchOne).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      attempted: 5,
      fetched: 4,
      notStarted: 0,
      cancelled: false,
    });
  });

  it("never has more than three fetches in flight", async () => {
    expect(BULK_COVER_IMAGE_CONCURRENCY).toBe(3);
    let inFlight = 0;
    let peak = 0;
    const fetchOne = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Yield so the other workers get to start before this one finishes.
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return true;
    });

    await runBulkCoverImageFetch({
      targets: articles(10),
      fetchOne,
      signal: new AbortController().signal,
    });

    expect(peak).toBe(3);
    expect(fetchOne).toHaveBeenCalledTimes(10);
  });

  it("counts a fetch that throws as a failure and keeps going", async () => {
    const fetchOne = vi.fn(async (a: FeedItem) => {
      if (a.guid === "g0") throw new Error("network down");
      return true;
    });

    const result = await runBulkCoverImageFetch({
      targets: articles(4),
      fetchOne,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      attempted: 4,
      fetched: 3,
      notStarted: 0,
      cancelled: false,
    });
  });

  it("stops starting new fetches after a cancel and lets the running ones finish", async () => {
    const controller = new AbortController();
    const finish: Array<() => void> = [];
    const started: string[] = [];
    const fetchOne = vi.fn(
      (a: FeedItem) =>
        new Promise<boolean>((resolve) => {
          started.push(a.guid);
          finish.push(() => resolve(true));
        }),
    );

    const run = runBulkCoverImageFetch({
      targets: articles(8),
      fetchOne,
      signal: controller.signal,
    });
    expect(started).toEqual(["g0", "g1", "g2"]);

    controller.abort();
    finish.forEach((resolve) => resolve());
    const result = await run;

    expect(started).toEqual(["g0", "g1", "g2"]);
    expect(result).toEqual({
      attempted: 3,
      fetched: 3,
      notStarted: 5,
      cancelled: true,
    });
  });

  it("starts nothing when it is cancelled before it begins", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchOne = vi.fn(async () => true);

    const result = await runBulkCoverImageFetch({
      targets: articles(3),
      fetchOne,
      signal: controller.signal,
    });

    expect(fetchOne).not.toHaveBeenCalled();
    expect(result).toEqual({
      attempted: 0,
      fetched: 0,
      notStarted: 3,
      cancelled: true,
    });
  });
});

describe("describeBulkCoverImageResult", () => {
  it("reports a clean run in one short sentence", () => {
    expect(
      describeBulkCoverImageResult({
        attempted: 20,
        fetched: 20,
        notStarted: 0,
        cancelled: false,
      }),
    ).toBe("Fetched 20 of 20 cover images.");
  });

  it("counts the cards that had no image or could not be fetched", () => {
    expect(
      describeBulkCoverImageResult({
        attempted: 20,
        fetched: 14,
        notStarted: 0,
        cancelled: false,
      }),
    ).toBe(
      "Fetched 14 of 20 cover images. 6 had no image or could not be fetched.",
    );
  });

  it("says a stopped run stopped and how many cards it left alone", () => {
    expect(
      describeBulkCoverImageResult({
        attempted: 3,
        fetched: 2,
        notStarted: 5,
        cancelled: true,
      }),
    ).toBe(
      "Stopped. Fetched 2 of 3 cover images. 1 had no image or could not be fetched. 5 not started.",
    );
  });

  it("uses the singular for one cover image", () => {
    expect(
      describeBulkCoverImageResult({
        attempted: 1,
        fetched: 1,
        notStarted: 0,
        cancelled: false,
      }),
    ).toBe("Fetched 1 of 1 cover image.");
  });
});
