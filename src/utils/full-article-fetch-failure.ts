import type { FeedItem } from "../types/types";
import type { FullArticleFetchResult } from "./fetch-helpers";

export const FETCH_FAILURE_TIMEOUT_TEXT =
  "Couldn't load the full article: the page timed out.";
export const FETCH_FAILURE_NETWORK_TEXT =
  "Couldn't load the full article: the page could not be loaded.";
export const FETCH_FAILURE_TRY_AGAIN_TEXT = "Try again";
export const FETCH_FAILURE_OPEN_IN_BROWSER_TEXT = "Open in browser";

/** A remembered failure stops the auto-fetch for this long (#1110). */
export const FETCH_FAILURE_TTL_MS = 24 * 60 * 60 * 1000;

export type FullContentFetchFailure = NonNullable<
  FeedItem["fullContentFetchFailure"]
>;

/**
 * The failure to remember for an article (#1110), or undefined when the result
 * is not one worth remembering. Restricted pages have their own banner and
 * `restrictedReason`; a success or an empty-but-clean result is not a failure.
 */
export function buildFetchFailureRecord(
  result: FullArticleFetchResult,
  now: number = Date.now(),
): FullContentFetchFailure | undefined {
  if (result.failureType !== "network") return undefined;
  // A thrown error says nothing about the page, so it is not remembered.
  if (result.failureReason === "unexpected") return undefined;
  // Offline says nothing about the page either; the next open should retry.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return undefined;
  }
  return {
    reason: result.failureReason === "timeout" ? "timeout" : "network",
    at: now,
  };
}

/** True while the article's remembered failure is recent enough to honor. */
export function hasActiveFetchFailure(
  item: FeedItem,
  now: number = Date.now(),
): boolean {
  const failure = item.fullContentFetchFailure;
  return Boolean(failure) && now - (failure?.at ?? 0) < FETCH_FAILURE_TTL_MS;
}

type PersistFailurePatch = (patch: Partial<FeedItem>) => void;

/**
 * Applies a finished fetch to the article's failure memory: a network failure
 * is recorded, any other answer clears an earlier record. Returns the record when
 * one was written.
 */
export function applyFetchOutcome(
  item: FeedItem,
  result: FullArticleFetchResult,
  persist: PersistFailurePatch,
): FullContentFetchFailure | undefined {
  const failure = buildFetchFailureRecord(result);
  if (failure) {
    item.fullContentFetchFailure = failure;
    persist({ fullContentFetchFailure: failure });
    return failure;
  }
  // Only a real answer from the page (content or a restricted response)
  // supersedes an old failure; an empty body or a thrown error keeps it.
  const answered =
    result.failureType === "restricted" ||
    (result.failureType === "none" && result.content.trim().length > 0);
  if (item.fullContentFetchFailure && answered) {
    clearFetchFailure(item, persist);
  }
  return undefined;
}

export function clearFetchFailure(
  item: FeedItem,
  persist: PersistFailurePatch,
): void {
  item.fullContentFetchFailure = undefined;
  persist({ fullContentFetchFailure: undefined });
}

export function describeFetchFailure(failure: FullContentFetchFailure): string {
  return failure.reason === "timeout"
    ? FETCH_FAILURE_TIMEOUT_TEXT
    : FETCH_FAILURE_NETWORK_TEXT;
}

/**
 * Banner shown on an article whose full-content fetch failed earlier (#1110).
 * The reader does not fetch such an article on open; "Try again" re-fetches.
 */
export function renderFetchFailureBanner(
  container: HTMLElement,
  item: FeedItem,
  onTryAgain: () => void,
): void {
  const failure = item.fullContentFetchFailure;
  if (!failure || !hasActiveFetchFailure(item)) return;
  // The remembered failure is newer than any stored paywall flag and is the
  // one with an action, so it replaces the paywall banner (#1110).
  container
    .querySelectorAll(".rss-reader-paywall-banner")
    .forEach((paywall) => paywall.remove());
  // One banner per view, however many render paths ask for it.
  if (container.querySelector(".rss-reader-fetch-failure-banner")) return;
  const banner = container.createDiv({
    cls: "rss-reader-inline-banner rss-reader-fetch-failure-banner",
  });
  banner.createDiv({
    cls: "rss-reader-fetch-failure-banner-text",
    text: describeFetchFailure(failure),
  });
  const actions = banner.createDiv({
    cls: "rss-reader-fetch-failure-banner-actions",
  });
  const tryAgain = actions.createEl("button", {
    cls: "rss-reader-fetch-failure-try-again",
    text: FETCH_FAILURE_TRY_AGAIN_TEXT,
    attr: { type: "button" },
  });
  tryAgain.addEventListener("click", () => {
    // One retry at a time: the fetch can take the full timeout (#1110).
    tryAgain.disabled = true;
    tryAgain.setText("Trying again…");
    onTryAgain();
  });
  if (item.link) {
    const openLink = actions.createEl("a", {
      cls: "rss-reader-fetch-failure-open-link",
      text: FETCH_FAILURE_OPEN_IN_BROWSER_TEXT,
      href: item.link,
    });
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
  }
}
