/**
 * What a feed refresh says to a screen reader (#842, WCAG 2.2 4.1.3).
 *
 * The refresh runner reports one message per user-meaningful event: a run
 * starting, a run finishing, a run stopped, or a run failing outright. It
 * never reports per feed, so a multi-feed refresh stays a handful of
 * announcements however many feeds it fetches. Each open dashboard view
 * listens for `REFRESH_ANNOUNCEMENT_EVENT` and writes the message to its own
 * live region.
 */

/** Workspace event carrying one announcement string. */
export const REFRESH_ANNOUNCEMENT_EVENT = "rss-dashboard:refresh-announcement";

/** The error text `FeedRefreshRunner` throws and the parser reports on timeout. */
const TIMED_OUT_MESSAGE = "Timed out";

export interface RefreshRunSummary {
  newArticles: number;
  failed: number;
  timedOut: number;
}

/** What one feed's refresh contributed to its run. */
export interface FeedRefreshOutcome {
  newArticles: number;
  failed: boolean;
}

/** Totals a run as its feeds settle, for the one message at the end. */
export class RefreshRunTally implements RefreshRunSummary {
  newArticles = 0;
  failed = 0;
  timedOut = 0;

  /** A feed whose fetch came back, with or without a recorded fetch error. */
  recordFeed(outcome: FeedRefreshOutcome): void {
    this.newArticles += outcome.newArticles;
    if (outcome.failed) this.failed += 1;
  }

  /** A feed whose fetch threw. */
  recordThrown(error: unknown): void {
    if (error instanceof Error && error.message === TIMED_OUT_MESSAGE) {
      this.timedOut += 1;
    } else {
      this.failed += 1;
    }
  }
}

export function refreshStartedMessage(label: string): string {
  return `Refreshing ${label}.`;
}

export function refreshStoppedMessage(): string {
  return "Refresh stopped.";
}

export function refreshFailedMessage(error: unknown): string {
  const reason = error instanceof Error ? error.message : "Unknown error";
  return `Refresh failed: ${reason}`;
}

function articlesPhrase(count: number): string {
  if (count === 0) return "no new articles";
  return `${count} new ${count === 1 ? "article" : "articles"}`;
}

function feedsPhrase(count: number, verb: string): string {
  return `${count} ${count === 1 ? "feed" : "feeds"} ${verb}`;
}

/** The finish message: the new-article count, then any failures. */
export function refreshFinishedMessage(summary: RefreshRunSummary): string {
  const parts = [articlesPhrase(summary.newArticles)];
  if (summary.timedOut > 0)
    parts.push(feedsPhrase(summary.timedOut, "timed out"));
  if (summary.failed > 0) parts.push(feedsPhrase(summary.failed, "failed"));
  return `Refresh finished: ${parts.join(", ")}.`;
}

/**
 * A quiet run is a background refresh of due feeds. It speaks only when it
 * has something to report, so a scheduled check that finds nothing does not
 * interrupt the listener every few minutes.
 */
export function shouldAnnounceFinish(
  summary: RefreshRunSummary,
  quiet: boolean,
): boolean {
  if (!quiet) return true;
  return summary.newArticles > 0 || summary.failed > 0 || summary.timedOut > 0;
}
