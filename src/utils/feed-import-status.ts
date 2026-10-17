import type { Feed } from "../types/types";

/**
 * Whether a feed's most recent background import failed or timed out, so the
 * sidebar can show its warning badge and the feed can offer a re-import. A
 * pending or in-flight import is not a failure.
 * @param {Feed} feed Feed to inspect
 * @returns {boolean} true when the feed's last import failed or timed out
 */
export function isFeedImportFailed(feed: Feed): boolean {
  return feed.importStatus === "failed" || feed.importStatus === "timed_out";
}
