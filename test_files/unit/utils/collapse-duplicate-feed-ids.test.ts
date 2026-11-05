import { describe, expect, it } from "vitest";
import { collapseDuplicateFeedIds } from "../../../src/utils/collapse-duplicate-feed-ids";
import type { Feed } from "../../../src/types/types";

function feed(title: string, feedId?: string, completedAt?: number): Feed {
  return {
    title,
    url: `https://example.com/${title}.xml`,
    folder: "Uncategorized",
    items: [],
    lastUpdated: 0,
    ...(feedId ? { feedId } : {}),
    ...(completedAt === undefined
      ? {}
      : { lastRefreshAttemptCompletedAt: completedAt }),
  };
}

const titles = (feeds: Feed[]): string[] => feeds.map((f) => f.title);

describe("collapseDuplicateFeedIds", () => {
  it("leaves a list with no repeated feedId alone and reports nothing dropped", () => {
    const feeds = [feed("a", "1"), feed("b", "2")];

    expect(collapseDuplicateFeedIds(feeds)).toEqual([]);
    expect(titles(feeds)).toEqual(["a", "b"]);
  });

  it("keeps the latest-refreshed of three copies in the first copy's slot", () => {
    const feeds = [
      feed("old", "dup", 1),
      feed("mid", "other"),
      feed("new", "dup", 9),
      feed("older", "dup", 5),
    ];

    const dropped = collapseDuplicateFeedIds(feeds);

    expect(titles(feeds)).toEqual(["new", "mid"]);
    expect(dropped).toEqual([
      {
        feedId: "dup",
        url: "https://example.com/old.xml",
        keptCompletedAt: 9,
        droppedCompletedAt: 1,
      },
      {
        feedId: "dup",
        url: "https://example.com/older.xml",
        keptCompletedAt: 9,
        droppedCompletedAt: 5,
      },
    ]);
  });

  it("collapses two separate duplicated feedIds independently", () => {
    const feeds = [
      feed("a1", "a", 1),
      feed("b1", "b", 2),
      feed("a2", "a", 3),
      feed("b2", "b", 1),
    ];

    collapseDuplicateFeedIds(feeds);

    expect(titles(feeds)).toEqual(["a2", "b1"]);
  });

  it("keeps the first listed on a tie, and a timestamped copy over one without", () => {
    const tie = [feed("first", "x", 4), feed("second", "x", 4)];
    const mixed = [feed("never", "y"), feed("ran", "y", 0)];

    collapseDuplicateFeedIds(tie);
    collapseDuplicateFeedIds(mixed);

    expect(titles(tie)).toEqual(["first"]);
    expect(titles(mixed)).toEqual(["ran"]);
  });

  it("never groups feeds that have no feedId", () => {
    const feeds = [feed("a"), feed("b")];

    expect(collapseDuplicateFeedIds(feeds)).toEqual([]);
    expect(titles(feeds)).toEqual(["a", "b"]);
  });
});
