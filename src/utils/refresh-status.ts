import type { Feed } from "../types/types";
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
  failingCount: number;
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

/** Resolves refresh coverage independently from article filters or visible items. */
export function getRefreshStatus(input: RefreshStatusInput): RefreshStatus {
  const excludedCount = input.feeds.filter(
    (feed) => feed.excludeFromRefresh === true,
  ).length;
  const eligibleFeeds = input.feeds.filter(
    (feed) => feed.excludeFromRefresh !== true,
  );
  const isFeedScope = input.scope === "feed";
  const coverageFeeds = isFeedScope ? input.feeds : eligibleFeeds;
  const isApplicable = isFeedScope ? input.feeds.length > 0 : eligibleFeeds.length > 0;
  const activeFeedUrls = input.activeFeedUrls ?? new Set<string>();
  const completionLabel = input.scope === "all" ? "Last global refresh" : "Last checked";

  let resolvedCompletionAt: number | null;
  if (!isApplicable) {
    resolvedCompletionAt = null;
  } else if (input.scope === "all") {
    const globalCompletionAt = input.globalCompletionAt;
    resolvedCompletionAt =
      Number.isFinite(globalCompletionAt) && globalCompletionAt && globalCompletionAt > 0
        ? globalCompletionAt
        : 0;
  } else if (coverageFeeds.some((feed) => completionAt(feed) === 0)) {
    resolvedCompletionAt = 0;
  } else {
    resolvedCompletionAt = Math.min(...coverageFeeds.map(completionAt));
  }

  const automaticOffCount = eligibleFeeds.filter(
    (feed) =>
      getEffectiveRefreshIntervalMinutes(feed, input.globalIntervalMinutes) === null,
  ).length;
  const nextDueTimes = eligibleFeeds
    .map((feed) => getNextRefreshDueAt(feed, input.globalIntervalMinutes))
    .filter((dueAt): dueAt is number => dueAt !== null);

  return {
    scope: input.scope,
    isApplicable,
    completionAt: resolvedCompletionAt,
    completionLabel,
    eligibleCount: eligibleFeeds.length,
    excludedCount,
    failingCount: coverageFeeds.filter((feed) => Boolean(feed.lastFetchError)).length,
    refreshingCount: coverageFeeds.filter((feed) => activeFeedUrls.has(feed.url)).length,
    automaticOffCount,
    neverCheckedCount: coverageFeeds.filter((feed) => completionAt(feed) === 0).length,
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

  return new Intl.DateTimeFormat(undefined, detailed
    ? {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZoneName: "short",
      }
    : {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp);
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
        ? "Last attempt failed"
        : `Feeds currently failing: ${status.failingCount}`,
    );
  }
  return segments;
}
