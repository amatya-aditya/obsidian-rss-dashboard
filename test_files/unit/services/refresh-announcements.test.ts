import { describe, expect, it } from "vitest";
import {
  RefreshRunTally,
  refreshFailedMessage,
  refreshFinishedMessage,
  refreshStartedMessage,
  refreshStoppedMessage,
  shouldAnnounceFinish,
} from "../../../src/services/refresh-announcements";

describe("refresh announcement messages", () => {
  it("names what is being refreshed", () => {
    expect(refreshStartedMessage("3 feeds")).toBe("Refreshing 3 feeds.");
    expect(refreshStartedMessage("Daily News")).toBe("Refreshing Daily News.");
  });

  it("states the article count, including none and one", () => {
    const base = { failed: 0, timedOut: 0 };
    expect(refreshFinishedMessage({ ...base, newArticles: 0 })).toBe(
      "Refresh finished: no new articles.",
    );
    expect(refreshFinishedMessage({ ...base, newArticles: 1 })).toBe(
      "Refresh finished: 1 new article.",
    );
    expect(refreshFinishedMessage({ ...base, newArticles: 12 })).toBe(
      "Refresh finished: 12 new articles.",
    );
  });

  it("appends timeouts and failures, singular and plural", () => {
    expect(
      refreshFinishedMessage({ newArticles: 4, timedOut: 1, failed: 2 }),
    ).toBe(
      "Refresh finished: 4 new articles, 1 feed timed out, 2 feeds failed.",
    );
    expect(
      refreshFinishedMessage({ newArticles: 0, timedOut: 0, failed: 1 }),
    ).toBe("Refresh finished: no new articles, 1 feed failed.");
  });

  it("reports a stop and a failure", () => {
    expect(refreshStoppedMessage()).toBe("Refresh stopped.");
    expect(refreshFailedMessage(new Error("boom"))).toBe(
      "Refresh failed: boom",
    );
    expect(refreshFailedMessage("oops")).toBe("Refresh failed: Unknown error");
  });
});

describe("RefreshRunTally", () => {
  it("adds up articles and counts failed, thrown and timed-out feeds", () => {
    const tally = new RefreshRunTally();

    tally.recordFeed({ newArticles: 2, failed: false });
    tally.recordFeed({ newArticles: 0, failed: true });
    tally.recordThrown(new Error("boom"));
    tally.recordThrown(new Error("Timed out"));
    tally.recordThrown("not an error");

    expect(tally).toMatchObject({ newArticles: 2, failed: 3, timedOut: 1 });
  });
});

describe("shouldAnnounceFinish", () => {
  const empty = { newArticles: 0, failed: 0, timedOut: 0 };

  it("always announces a run the user can see", () => {
    expect(shouldAnnounceFinish(empty, false)).toBe(true);
  });

  it("keeps a quiet run silent unless it found articles or errors", () => {
    expect(shouldAnnounceFinish(empty, true)).toBe(false);
    expect(shouldAnnounceFinish({ ...empty, newArticles: 1 }, true)).toBe(true);
    expect(shouldAnnounceFinish({ ...empty, failed: 1 }, true)).toBe(true);
    expect(shouldAnnounceFinish({ ...empty, timedOut: 1 }, true)).toBe(true);
  });
});
