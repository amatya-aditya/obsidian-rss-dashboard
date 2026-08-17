import type { Feed } from "../types/types";

export const FEED_REFRESH_DISABLED_INTERVAL = -1;
const MINUTE_MS = 60 * 1000;

export const REFRESH_INTERVAL_PRESETS = [
  0, 5, 10, 15, 30, 60, 120, 240, 480, 720, 1440,
];

export function isPresetRefreshInterval(value: number): boolean {
  return REFRESH_INTERVAL_PRESETS.includes(value);
}

export function getPerFeedRefreshIntervalDropdownValue(value: number): string {
  if (value === FEED_REFRESH_DISABLED_INTERVAL) {
    return String(FEED_REFRESH_DISABLED_INTERVAL);
  }

  if (isPresetRefreshInterval(value)) {
    return String(value);
  }

  return "custom";
}

/** Returns the automatic refresh interval for one feed, or null when it is off. */
export function getEffectiveRefreshIntervalMinutes(
  feed: Pick<Feed, "scanInterval" | "excludeFromRefresh">,
  globalIntervalMinutes: number,
): number | null {
  if (feed.excludeFromRefresh === true || feed.scanInterval === -1) {
    return null;
  }

  if (
    feed.scanInterval !== undefined &&
    (!Number.isFinite(feed.scanInterval) || feed.scanInterval < 0)
  ) {
    return null;
  }

  const requestedInterval =
    typeof feed.scanInterval === "number" && feed.scanInterval > 0
      ? feed.scanInterval
      : globalIntervalMinutes;

  return Number.isFinite(requestedInterval) && requestedInterval > 0
    ? requestedInterval
    : null;
}

/** Derives a feed's next automatic refresh time without persisting it. */
export function getNextRefreshDueAt(
  feed: Pick<
    Feed,
    "scanInterval" | "excludeFromRefresh" | "lastRefreshAttemptCompletedAt"
  >,
  globalIntervalMinutes: number,
): number | null {
  const intervalMinutes = getEffectiveRefreshIntervalMinutes(
    feed,
    globalIntervalMinutes,
  );
  if (intervalMinutes === null) {
    return null;
  }

  const completedAt = feed.lastRefreshAttemptCompletedAt;
  if (!Number.isFinite(completedAt) || !completedAt || completedAt < 0) {
    return 0;
  }

  return completedAt + intervalMinutes * MINUTE_MS;
}

/** Returns eligible feeds that are due at the supplied timestamp. */
export function getDueFeeds(
  feeds: Feed[],
  globalIntervalMinutes: number,
  now: number,
): Feed[] {
  return feeds.filter((feed) => {
    const dueAt = getNextRefreshDueAt(feed, globalIntervalMinutes);
    return dueAt !== null && dueAt <= now;
  });
}
