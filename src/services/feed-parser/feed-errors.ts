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
