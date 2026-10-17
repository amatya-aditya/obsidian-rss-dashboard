/**
 * What a background import says to a screen reader (#1308, WCAG 2.2 4.1.3).
 *
 * The background import queue reports one message per batch — never per feed —
 * so a batch in which a dozen feeds fail still produces a single announcement,
 * matching the refresh announcement's one-message-per-event discipline. The
 * message travels on the same workspace event and per-view live region as the
 * refresh announcements, so there is no second announcement mechanism.
 *
 * The refresh run tally deliberately excludes import failures: an import
 * failure is not a refresh-run event, so `RefreshRunTally` never counts one and
 * the refresh completion wording does not claim to cover them.
 *
 * A cancelled batch reports nothing. The queue skips its drain callback when
 * the run was cancelled — the same gate the completion Notice already uses — so
 * an import the user stopped is a documented silence rather than an omission.
 */

/** Totals one background import batch settles with, for its one message. */
export interface ImportBatchSummary {
  /** Feeds the batch processed, successes included. */
  processedCount: number;
  /** Feeds whose import settled as failed. */
  failed: number;
  /** Feeds whose import settled as timed out. */
  timedOut: number;
  /**
   * The most recently recorded per-feed import error, shown as the message's
   * reason. Several feeds can fail for different reasons, so it represents the
   * batch rather than every feed.
   */
  lastError?: string;
}

/** Whether a settled batch has anything to report beyond its completion. */
export function hasImportFailures(summary: ImportBatchSummary): boolean {
  return summary.failed > 0 || summary.timedOut > 0;
}

function feedsPhrase(count: number, verb: string): string {
  return `${count} ${count === 1 ? "feed" : "feeds"} ${verb}`;
}

/**
 * The one failure message a settled batch reports, to the Notice and the
 * announcement alike, so both surfaces state the same counts. It names how many
 * feeds failed and timed out, and the reason recorded for the batch.
 */
export function importBatchFailureMessage(summary: ImportBatchSummary): string {
  const parts: string[] = [];
  if (summary.timedOut > 0) {
    parts.push(feedsPhrase(summary.timedOut, "timed out"));
  }
  if (summary.failed > 0) parts.push(feedsPhrase(summary.failed, "failed"));
  const reason = summary.lastError ? ` Last error: ${summary.lastError}.` : "";
  return `Background import finished: ${parts.join(", ")}.${reason}`;
}
