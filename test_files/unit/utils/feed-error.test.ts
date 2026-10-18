import { describe, expect, it } from "vitest";
import type { Feed } from "../../../src/types/types";
import {
  FEED_ERROR_INLINE_LIMIT,
  capFeedErrorMessage,
  formatFeedErrorBadgeLabel,
  formatFeedErrorDiagnostic,
  getFeedErrorDetail,
  getFeedErrorSummary,
  getImportFailure,
  getRefreshFailure,
  hasFeedError,
} from "../../../src/utils/feed-error";

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: "https://example.com/feed.xml",
    folder: "News",
    items: [],
    lastUpdated: 0,
    mediaType: "article",
    ...overrides,
  };
}

describe("feed error kinds", () => {
  it("reports a refresh failure only from lastFetchError", () => {
    expect(getRefreshFailure(createFeed())).toBeNull();
    expect(getRefreshFailure(createFeed({ lastFetchError: "HTTP 500" }))).toBe(
      "HTTP 500",
    );
  });

  it("reports an import failure for a failed or timed-out import", () => {
    expect(
      getImportFailure(
        createFeed({ importStatus: "failed", importError: "HTTP 500" }),
      ),
    ).toBe("HTTP 500");
    expect(
      getImportFailure(
        createFeed({ importStatus: "timed_out", importError: "Timed out" }),
      ),
    ).toBe("Timed out");
  });

  it("still reports an import failure when the failure recorded no message", () => {
    expect(getImportFailure(createFeed({ importStatus: "failed" }))).toBe(
      "Background import failed",
    );
  });

  it("treats an empty or blank import message as no message, so the badge and the count agree", () => {
    // A background import can record `new Error("")`: importStatus is still
    // "failed", so the feed must read as failing rather than as unbadged.
    expect(
      getImportFailure(createFeed({ importStatus: "failed", importError: "" })),
    ).toBe("Background import failed");
    expect(
      getImportFailure(
        createFeed({ importStatus: "timed_out", importError: "   " }),
      ),
    ).toBe("Background import failed");
    expect(
      hasFeedError(createFeed({ importStatus: "failed", importError: "" })),
    ).toBe(true);
    expect(
      getFeedErrorSummary(
        createFeed({ importStatus: "failed", importError: "" }),
      ),
    ).toEqual({
      label: "Import failed",
      message: "Background import failed",
    });
  });

  it("ignores an import status that is not a failure", () => {
    expect(getImportFailure(createFeed({ importStatus: "processing" }))).toBe(
      null,
    );
    expect(getImportFailure(createFeed({ importStatus: "completed" }))).toBe(
      null,
    );
  });
});

describe("hasFeedError", () => {
  it("is true for either kind and false for a feed that only has no articles", () => {
    expect(hasFeedError(createFeed())).toBe(false);
    expect(hasFeedError(createFeed({ lastFetchError: "HTTP 500" }))).toBe(true);
    expect(
      hasFeedError(createFeed({ importStatus: "failed", importError: "boom" })),
    ).toBe(true);
    expect(
      hasFeedError(
        createFeed({ importStatus: "timed_out", importError: "slow" }),
      ),
    ).toBe(true);
  });

  it("is true for a feed holding both kinds", () => {
    expect(
      hasFeedError(
        createFeed({
          lastFetchError: "HTTP 500",
          importStatus: "failed",
          importError: "boom",
        }),
      ),
    ).toBe(true);
  });
});

describe("getFeedErrorSummary", () => {
  it("prefers the refresh failure and falls back to the import failure", () => {
    expect(
      getFeedErrorSummary(
        createFeed({
          lastFetchError: "HTTP 500",
          importStatus: "failed",
          importError: "boom",
        }),
      ),
    ).toEqual({ label: "Refresh failed", message: "HTTP 500" });
    expect(
      getFeedErrorSummary(
        createFeed({ importStatus: "timed_out", importError: "slow" }),
      ),
    ).toEqual({ label: "Import failed", message: "slow" });
    expect(getFeedErrorSummary(createFeed())).toBeNull();
  });
});

describe("getFeedErrorDetail", () => {
  it("carries the feed identity and both kinds", () => {
    expect(
      getFeedErrorDetail(
        createFeed({
          title: "Broken feed",
          url: "https://broken.test/rss",
          lastFetchError: "HTTP 500",
          importStatus: "failed",
          importError: "boom",
        }),
      ),
    ).toEqual({
      feedTitle: "Broken feed",
      feedUrl: "https://broken.test/rss",
      refreshError: "HTTP 500",
      importError: "boom",
    });
  });
});

describe("formatFeedErrorBadgeLabel", () => {
  it("names the kind, the capped message, and the action", () => {
    expect(
      formatFeedErrorBadgeLabel(
        createFeed({ lastFetchError: "Request failed, status 429" }),
      ),
    ).toBe("Refresh failed: Request failed, status 429. Show details");
    expect(
      formatFeedErrorBadgeLabel(
        createFeed({ importStatus: "failed", importError: "boom" }),
      ),
    ).toBe("Import failed: boom. Show details");
  });

  it("does not double a full stop the message already ends with", () => {
    expect(
      formatFeedErrorBadgeLabel(
        createFeed({
          lastFetchError: "Request failed: the host could not be resolved.",
        }),
      ),
    ).toBe(
      "Refresh failed: Request failed: the host could not be resolved. Show details",
    );
    expect(
      formatFeedErrorBadgeLabel(createFeed({ lastFetchError: "Timed out!" })),
    ).toBe("Refresh failed: Timed out! Show details");
  });

  it("does not add a full stop after a capping ellipsis", () => {
    const label = formatFeedErrorBadgeLabel(
      createFeed({ lastFetchError: "A".repeat(200) }),
    );

    expect(label).toBe(`Refresh failed: ${"A".repeat(77)}... Show details`);
    expect(label?.includes("....")).toBe(false);
  });

  it("is null for a feed that is not failing", () => {
    expect(formatFeedErrorBadgeLabel(createFeed())).toBeNull();
  });
});

describe("capFeedErrorMessage", () => {
  it("leaves a message within the limit alone", () => {
    expect(capFeedErrorMessage("HTTP 500")).toBe("HTTP 500");
    expect(
      capFeedErrorMessage("A".repeat(FEED_ERROR_INLINE_LIMIT)),
    ).toHaveLength(FEED_ERROR_INLINE_LIMIT);
  });

  it("caps a longer message and marks the cut", () => {
    const capped = capFeedErrorMessage("A".repeat(200));

    expect(capped).toHaveLength(FEED_ERROR_INLINE_LIMIT);
    expect(capped.endsWith("...")).toBe(true);
  });

  it("trims the message before capping", () => {
    expect(capFeedErrorMessage("  HTTP 500  ")).toBe("HTTP 500");
  });
});

describe("formatFeedErrorDiagnostic", () => {
  it("names the feed, its URL and each kind it holds, refresh first", () => {
    expect(
      formatFeedErrorDiagnostic({
        feedTitle: "Broken feed",
        feedUrl: "https://broken.test/rss",
        refreshError: "HTTP 500",
        importError: "boom",
      }),
    ).toBe(
      [
        "Feed: Broken feed",
        "URL: https://broken.test/rss",
        "Refresh failed: HTTP 500",
        "Import failed: boom",
      ].join("\n"),
    );
  });

  it("leaves out a kind the feed does not hold", () => {
    expect(
      formatFeedErrorDiagnostic({
        feedTitle: "Import-only feed",
        feedUrl: "https://import.test/rss",
        refreshError: null,
        importError: "boom",
      }),
    ).toBe(
      [
        "Feed: Import-only feed",
        "URL: https://import.test/rss",
        "Import failed: boom",
      ].join("\n"),
    );
  });

  it("keeps a stored message in full, however long", () => {
    const longMessage = "A".repeat(300);
    const block = formatFeedErrorDiagnostic({
      feedTitle: "Long feed",
      feedUrl: "https://long.test/rss",
      refreshError: longMessage,
      importError: null,
    });

    expect(block).toContain(longMessage);
  });
});
