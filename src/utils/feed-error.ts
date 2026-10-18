import type { Feed } from "../types/types";
import { isFeedImportFailed } from "./feed-import-status";

/**
 * One feed's stored failure messages, split by kind. A feed holds at most one
 * of each, and either may be absent.
 */
export interface FeedErrorDetail {
  feedTitle: string;
  feedUrl: string;
  /** The most recent failed fetch, or null. */
  refreshError: string | null;
  /** The most recent failed background import, or null. */
  importError: string | null;
}

/** Label for a refresh failure on every surface that names the kind. */
export const REFRESH_FAILURE_LABEL = "Refresh failed";

/** Label for an import failure on every surface that names the kind. */
export const IMPORT_FAILURE_LABEL = "Import failed";

/** Fallback text when an import failed without recording a message. */
const IMPORT_FAILURE_FALLBACK = "Background import failed";

/**
 * How long one feed error message may be where it is shown inline (the sidebar
 * badge's name, the dashboard's single-feed status). The stored message is
 * never capped; only its display is.
 */
export const FEED_ERROR_INLINE_LIMIT = 80;

/** The feed's stored refresh failure (`lastFetchError`), or null. */
export function getRefreshFailure(feed: Feed): string | null {
  return feed.lastFetchError ? feed.lastFetchError : null;
}

/**
 * The feed's stored import failure, or null. `isFeedImportFailed` is the
 * shared signal for a failed or timed-out import (the sidebar's warning badge
 * and the re-import action read it too); a missing or blank message falls back
 * to a generic one so a feed that failed still reads as failing (GH #1140).
 */
export function getImportFailure(feed: Feed): string | null {
  if (!isFeedImportFailed(feed)) return null;
  const message = feed.importError?.trim();
  return message ? message : IMPORT_FAILURE_FALLBACK;
}

/** Whether the feed currently holds a refresh failure and/or an import failure. */
export function hasFeedError(feed: Feed): boolean {
  return getRefreshFailure(feed) !== null || getImportFailure(feed) !== null;
}

/** The kind and message a feed's most prominent feed error shows as. */
export function getFeedErrorSummary(
  feed: Feed,
): { label: string; message: string } | null {
  const refreshError = getRefreshFailure(feed);
  if (refreshError) {
    return { label: REFRESH_FAILURE_LABEL, message: refreshError };
  }
  const importError = getImportFailure(feed);
  if (importError) {
    return { label: IMPORT_FAILURE_LABEL, message: importError };
  }
  return null;
}

/** Both of a feed's stored failures, in the shape the feed error dialog takes. */
export function getFeedErrorDetail(feed: Feed): FeedErrorDetail {
  return {
    feedTitle: feed.title,
    feedUrl: feed.url,
    refreshError: getRefreshFailure(feed),
    importError: getImportFailure(feed),
  };
}

/**
 * Shortens a message for an inline surface. The message itself is stored in
 * full; only the badge name and the status-bar segment cap it.
 */
export function capFeedErrorMessage(
  message: string,
  limit = FEED_ERROR_INLINE_LIMIT,
): string {
  const trimmed = message.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

/**
 * The diagnostic block the dialog's copy action puts on the clipboard: the
 * feed's identity, then each stored failure by kind. No timestamps, because no
 * uniform one exists across the two kinds.
 */
export function formatFeedErrorDiagnostic(detail: FeedErrorDetail): string {
  const lines = [`Feed: ${detail.feedTitle}`, `URL: ${detail.feedUrl}`];
  if (detail.refreshError) {
    lines.push(formatFeedErrorLine(REFRESH_FAILURE_LABEL, detail.refreshError));
  }
  if (detail.importError) {
    lines.push(formatFeedErrorLine(IMPORT_FAILURE_LABEL, detail.importError));
  }
  return lines.join("\n");
}

/**
 * The sidebar badge's accessible name and tooltip source: the kind, the capped
 * message, and the offer to open the dialog.
 *
 * The full stop before the action is added only when the message does not
 * already end with sentence punctuation, so a stored message that ends in `.`
 * does not read as `..` and a capping ellipsis does not read as `....`.
 */
export function formatFeedErrorBadgeLabel(feed: Feed): string | null {
  const summary = getFeedErrorSummary(feed);
  if (!summary) return null;
  const message = capFeedErrorMessage(summary.message);
  const terminator = /[.!?]$/.test(message) ? "" : ".";
  return `${summary.label}: ${message}${terminator} Show details`;
}

/**
 * `Kind: message`, the one-line form shared by every inline surface that shows
 * a single feed error.
 */
export function formatFeedErrorLine(
  label: string,
  message: string,
  capped = false,
): string {
  return `${label}: ${capped ? capFeedErrorMessage(message) : message}`;
}
