import type { FeedItem } from "../types/types";
import type { FullArticleFetchResult } from "../utils/fetch-helpers";
import { RESTRICTED_ARTICLE_REASON } from "../utils/full-article-fetch";
import {
  ReaderContentVersions,
  type ReaderContentVersion,
} from "./reader-content-versions";

export interface FeedFirstDisplayOptions {
  container: HTMLElement;
  item: FeedItem;
  feedContent: string;
  /** Render one version of the article into `parent`. */
  renderVersion: (
    parent: HTMLElement,
    version: ReaderContentVersion,
    content: string,
  ) => void;
  /** Sync the caller's state when the toggle selects a version. */
  onSelectVersion: (
    version: ReaderContentVersion,
    fetchedContent: string,
  ) => void;
  hasMeaningfulContent: (html: string) => boolean;
  /** Runs right after the versions exist, before the fetch is awaited. */
  onVersions: (versions: ReaderContentVersions) => void;
  fetch: () => Promise<FullArticleFetchResult>;
  /** Runs for every settled fetch, even when the display went stale. */
  persistMetadata: (result: FullArticleFetchResult) => void;
  /**
   * The fetched page's own image, for the item the settled fetch belongs to
   * (#1342). Runs for every settled fetch too, even one whose body was empty,
   * because a restricted page's `<head>` still declares its hero.
   */
  persistPageImage: (result: FullArticleFetchResult) => void;
  /**
   * Runs for every settled fetch, even when the display went stale, so a
   * failure is remembered on its own item (#1110). True when one was recorded.
   */
  rememberOutcome: (result: FullArticleFetchResult) => boolean;
  isCurrent: () => boolean;
  /** Runs once the result is known to belong to the live display. */
  onSettled?: (result: FullArticleFetchResult) => void;
  /**
   * Persists the live article's restricted flag when the settled fetch changes
   * it (#1249). Current-only, like the display that owns the flag, so a stale
   * load never rewrites the stored value (#982).
   */
  persistRestrictedReason: (restrictedReason: string | undefined) => void;
  renderRestrictedBanner: () => void;
  /** Shows the remembered-failure banner with Try again (#1110). */
  renderFetchFailureBanner: () => void;
}

/**
 * Feed-first display shared by the inline and dedicated readers: show the
 * RSS version at once, fetch the article, then offer or fail the fetched one.
 * Returns the live versions whatever the fetch outcome (failed fetches
 * included), or null when the display went stale.
 */
export async function runFeedFirstDisplay(
  options: FeedFirstDisplayOptions,
): Promise<ReaderContentVersions | null> {
  const { container, item, feedContent } = options;
  let fetchedContent = "";
  const versions = new ReaderContentVersions(
    container,
    (parent, version) =>
      options.renderVersion(
        parent,
        version,
        version === "rss" ? feedContent : fetchedContent,
      ),
    (version) => options.onSelectVersion(version, fetchedContent),
    !options.hasMeaningfulContent(feedContent),
  );
  options.onVersions(versions);
  const result = await options.fetch();
  // Metadata belongs to the fetched item even after navigation or close.
  // Keep the substantial-body gate: a short extraction must not lock metadata.
  if (options.hasMeaningfulContent(result.content)) {
    options.persistMetadata(result);
  }
  // The page's own image is not body metadata: a restricted head declares one
  // even when nothing readable was extracted (#1342).
  if (result.pageImage) {
    options.persistPageImage(result);
  }
  const remembered = options.rememberOutcome(result);
  if (!options.isCurrent() || !versions.isActive()) return null;
  fetchedContent = result.content;
  options.onSettled?.(result);
  if (result.failureType === "none" && fetchedContent.trim().length > 0) {
    applyRestrictedReason(item, undefined, options.persistRestrictedReason);
    versions.ready();
  } else {
    if (result.failureType === "restricted") {
      applyRestrictedReason(
        item,
        RESTRICTED_ARTICLE_REASON,
        options.persistRestrictedReason,
      );
      if (!container.querySelector(".rss-reader-paywall-banner"))
        options.renderRestrictedBanner();
    } else if (remembered) {
      options.renderFetchFailureBanner();
    }
    versions.failed(result);
  }
  return versions;
}

/**
 * Applies the settled fetch's restricted flag to the live article, persisting
 * it only when it changed (#1249). The display owns this flag, so it runs for
 * the current article only; a stale load leaves the stored value alone (#982).
 */
function applyRestrictedReason(
  item: FeedItem,
  next: string | undefined,
  persist: (restrictedReason: string | undefined) => void,
): void {
  if (item.restrictedReason === next) return;
  item.restrictedReason = next;
  persist(next);
}

/**
 * Visit every cached version of the display; without versions, visit the
 * fallback container (the display has not gone feed-first).
 */
export function visitReaderContent(
  versions: ReaderContentVersions | undefined,
  fallback: HTMLElement | undefined,
  visitor: (container: HTMLElement) => void,
): void {
  if (versions) versions.visitVersions(visitor);
  else if (fallback) visitor(fallback);
}
