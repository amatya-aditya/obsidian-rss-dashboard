import type { FeedParseOptions, ParsedFeed } from "./types.js";
import { EmptyFeedError } from "./feed-errors.js";

export function assertParsedFeedHasEntries(
  parsed: ParsedFeed,
  options?: FeedParseOptions,
): void {
  if (!options?.allowEmpty && parsed.items.length === 0) {
    throw new EmptyFeedError();
  }
}
