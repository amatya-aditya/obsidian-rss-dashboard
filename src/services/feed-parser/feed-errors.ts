export const EMPTY_FEED_ERROR_MESSAGE =
  "Feed is valid, but it currently has no items or entries to import.";

export class EmptyFeedError extends Error {
  constructor(message = EMPTY_FEED_ERROR_MESSAGE) {
    super(message);
    this.name = "EmptyFeedError";
  }
}

export function isEmptyFeedError(error: unknown): error is EmptyFeedError {
  return (
    error instanceof EmptyFeedError ||
    (error instanceof Error && error.name === "EmptyFeedError")
  );
}

export function getFeedErrorMessage(error: unknown): string {
  if (isEmptyFeedError(error)) {
    return EMPTY_FEED_ERROR_MESSAGE;
  }

  return error instanceof Error ? error.message : "Unknown error";
}

export function formatFeedParseNoticeMessage(
  error: unknown,
  prefix = "Error parsing feed",
): string {
  if (isEmptyFeedError(error)) {
    return EMPTY_FEED_ERROR_MESSAGE;
  }

  return `${prefix}: ${getFeedErrorMessage(error)}`;
}

/**
 * Extract a concise, user-readable error message from a feed refresh error.
 *
 * The raw error message may contain verbose context like:
 *   "Error parsing feed Some Feed (https://...): Error: Not a valid RSS/Atom feed"
 * This function strips that prefix and returns only the core reason:
 *   "Not a valid RSS/Atom feed"
 *
 * Examples:
 *   Error: Not a valid RSS/Atom feed  →  "Not a valid RSS/Atom feed"
 *   Error: Request failed, status 429  →  "Request failed, status 429"
 *   Error: Timed out  →  "Timed out"
 */
export function parseFetchErrorMessage(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  if (isEmptyFeedError(error)) {
    return EMPTY_FEED_ERROR_MESSAGE;
  }

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  // Strip leading "Error: " prefix if present (normalises thrown Error messages)
  const withoutPrefix = raw.replace(/^Error:\s*/i, "").trim();

  // The full message is kept. Two writers used to cap it differently, which
  // made "copy the whole error for debugging" untrue; display surfaces cap it
  // instead (see `capFeedErrorMessage`).
  return withoutPrefix || "Unknown error";
}
