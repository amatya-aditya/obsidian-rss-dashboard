import type { Feed } from "../types/types";
import {
  formatFeedErrorLine,
  getFeedErrorSummary,
  hasFeedError,
} from "./feed-error";
import {
  getEffectiveRefreshIntervalMinutes,
  getNextRefreshDueAt,
} from "./refresh-intervals";

export type RefreshStatusScope = "all" | "feed" | "aggregate";

export interface RefreshStatus {
  scope: RefreshStatusScope;
  isApplicable: boolean;
  completionAt: number | null;
  completionLabel: "Last global refresh" | "Last checked";
  eligibleCount: number;
  excludedCount: number;
  /**
   * Feeds currently holding a feed error (a refresh failure and/or an import
   * failure). A feed with both kinds counts once.
   */
  failingCount: number;
  /**
   * Single-feed scope only: the feed's inline feed error, `Refresh failed:
   * <message>` or `Import failed: <message>`, capped for display. Null in
   * every other scope and when the scoped feed is not failing.
   */
  failingMessage: string | null;
  refreshingCount: number;
  automaticOffCount: number;
  neverCheckedCount: number;
  nextDueAt: number | null;
}

export interface RefreshStatusInput {
  feeds: Feed[];
  globalIntervalMinutes: number;
  scope: RefreshStatusScope;
  globalCompletionAt?: number;
  activeFeedUrls?: ReadonlySet<string>;
}

function completionAt(feed: Feed): number {
  const completedAt = feed.lastRefreshAttemptCompletedAt;
  return Number.isFinite(completedAt) && completedAt && completedAt > 0
    ? completedAt
    : 0;
}

/**
 * The feeds a scope's refresh status covers. Feed scope covers exactly the
 * given feeds (an explicitly-opened feed is reported even when it is excluded
 * from global refresh); every other scope leaves the excluded feeds out.
 */
function getCoverageFeeds(feeds: Feed[], scope: RefreshStatusScope): Feed[] {
  return scope === "feed"
    ? feeds
    : feeds.filter((feed) => feed.excludeFromRefresh !== true);
}

/**
 * The in-scope feeds that hold a feed error, in the given order. The dialog's
 * list and `failingCount` are built from this one resolution, so a count and
 * its listing cannot disagree.
 */
export function getFailingFeeds(input: {
  feeds: Feed[];
  scope: RefreshStatusScope;
}): Feed[] {
  return getCoverageFeeds(input.feeds, input.scope).filter(hasFeedError);
}

/** Resolves refresh coverage independently from article filters or visible items. */
export function getRefreshStatus(input: RefreshStatusInput): RefreshStatus {
  const excludedCount = input.feeds.filter(
    (feed) => feed.excludeFromRefresh === true,
  ).length;
  const eligibleFeeds = input.feeds.filter(
    (feed) => feed.excludeFromRefresh !== true,
  );
  const isFeedScope = input.scope === "feed";
  const coverageFeeds = getCoverageFeeds(input.feeds, input.scope);
  const isApplicable = isFeedScope
    ? input.feeds.length > 0
    : eligibleFeeds.length > 0;
  const activeFeedUrls = input.activeFeedUrls ?? new Set<string>();
  const completionLabel =
    input.scope === "all" ? "Last global refresh" : "Last checked";

  let resolvedCompletionAt: number | null;
  if (!isApplicable) {
    resolvedCompletionAt = null;
  } else if (input.scope === "all") {
    const globalCompletionAt = input.globalCompletionAt;
    resolvedCompletionAt =
      Number.isFinite(globalCompletionAt) &&
      globalCompletionAt &&
      globalCompletionAt > 0
        ? globalCompletionAt
        : 0;
  } else if (coverageFeeds.some((feed) => completionAt(feed) === 0)) {
    resolvedCompletionAt = 0;
  } else {
    resolvedCompletionAt = Math.min(...coverageFeeds.map(completionAt));
  }

  const automaticOffCount = eligibleFeeds.filter(
    (feed) =>
      getEffectiveRefreshIntervalMinutes(feed, input.globalIntervalMinutes) ===
      null,
  ).length;
  const nextDueTimes = eligibleFeeds
    .map((feed) => getNextRefreshDueAt(feed, input.globalIntervalMinutes))
    .filter((dueAt): dueAt is number => dueAt !== null);
  // One resolution for the count and for the dialog's listing, so a count and
  // the feeds it names cannot disagree.
  const failingFeeds = getFailingFeeds(input);
  const failingFeed = failingFeeds[0] ?? null;
  const failingSummary =
    isFeedScope && failingFeed ? getFeedErrorSummary(failingFeed) : null;

  return {
    scope: input.scope,
    isApplicable,
    completionAt: resolvedCompletionAt,
    completionLabel,
    eligibleCount: eligibleFeeds.length,
    excludedCount,
    failingCount: failingFeeds.length,
    failingMessage: failingSummary
      ? formatFeedErrorLine(failingSummary.label, failingSummary.message, true)
      : null,
    refreshingCount: coverageFeeds.filter((feed) =>
      activeFeedUrls.has(feed.url),
    ).length,
    automaticOffCount,
    neverCheckedCount: coverageFeeds.filter((feed) => completionAt(feed) === 0)
      .length,
    nextDueAt: nextDueTimes.length > 0 ? Math.min(...nextDueTimes) : null,
  };
}

/** Formats a static, local timestamp. This intentionally does not schedule polling. */
export function formatRefreshStatusTime(
  timestamp: number | null,
  detailed = false,
): string {
  if (timestamp === null) return "Not applicable";
  if (timestamp <= 0) return "Not yet";

  return new Intl.DateTimeFormat(
    undefined,
    detailed
      ? {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        }
      : {
          dateStyle: "medium",
          timeStyle: "short",
        },
  ).format(timestamp);
}

export function getRefreshStatusSegments(status: RefreshStatus): string[] {
  const segments: string[] = [];
  if (status.refreshingCount > 0) {
    segments.push(
      status.refreshingCount === 1
        ? "In progress"
        : `Refreshing ${status.refreshingCount} feeds...`,
    );
  }
  if (status.failingCount > 0) {
    segments.push(
      status.scope === "feed"
        ? (status.failingMessage ?? "Refresh failed")
        : `Feeds currently failing: ${status.failingCount}`,
    );
  }
  return segments;
}
