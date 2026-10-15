import { setIcon } from "obsidian";
import type { Feed, FeedMetadata } from "../types/types";
import { getFeedErrorMessage } from "./feed-parser";
import { TIMED_OUT_MESSAGE } from "./feed-timeout";

// ── Cadence ──────────────────────────────────────────────────────────────────

/** Save/render pacing for one background import run, keyed off the queue size. */
export interface BackgroundImportCadence {
  saveEvery: number;
  renderEvery: number;
  shouldRenderDuringImport: boolean;
}

/**
 * Compute how often a background import should persist settings and refresh
 * the view, based on the total number of feeds in the run. Very large imports
 * skip mid-run renders entirely.
 * @param {number} totalFeeds Total number of feeds in the import run
 * @returns {BackgroundImportCadence} The save/render thresholds and the mid-run render flag
 */
export function computeBackgroundImportCadence(
  totalFeeds: number,
): BackgroundImportCadence {
  const saveEvery =
    totalFeeds >= 20000
      ? 200
      : totalFeeds >= 5000
        ? 100
        : totalFeeds >= 1000
          ? 25
          : 5;
  const renderEvery =
    totalFeeds >= 20000
      ? 500
      : totalFeeds >= 5000
        ? 150
        : totalFeeds >= 1000
          ? 40
          : 3;
  const shouldRenderDuringImport = totalFeeds < 5000;
  return { saveEvery, renderEvery, shouldRenderDuringImport };
}

// ── Status bar ───────────────────────────────────────────────────────────────

/**
 * Build the status bar item that shows background import progress: an icon and
 * an empty text span that later progress updates fill in.
 * @param {Function} addStatusBarItem Adds a new status bar item to the workspace
 * @returns {HTMLElement} The new status bar item
 */
export function createImportStatusBarItem(
  addStatusBarItem: () => HTMLElement,
): HTMLElement {
  const importStatusBarItem = addStatusBarItem();
  importStatusBarItem.textContent = "";
  const iconSpan = importStatusBarItem.createSpan({
    cls: "rss-dashboard-import-statusbar-icon",
  });
  setIcon(iconSpan, "rss");
  importStatusBarItem.createSpan({
    cls: "import-statusbar-text",
  });
  return importStatusBarItem;
}

// ── Completion ───────────────────────────────────────────────────────────────

/** Collaborators the completion step needs, supplied by the owning service. */
export interface BackgroundImportCompletionHooks {
  isCancelled: () => boolean;
  persist: () => Promise<void>;
  render: () => Promise<void>;
  onDrained: (processedCount: number) => void;
  processedCount: number;
}

/**
 * Success path of a drained import run, skipped entirely when the run was
 * cancelled: persist settings, render the view, then announce the drain.
 * @param {BackgroundImportCompletionHooks} hooks Current cancellation state, the persist/render callbacks, and the processed count
 * @returns {Promise<void>} Resolves once the persist, render, and drain callback have run
 */
export async function finishBackgroundImportRun(
  hooks: BackgroundImportCompletionHooks,
): Promise<void> {
  if (!hooks.isCancelled()) {
    await hooks.persist();
    await hooks.render();
    hooks.onDrained(hooks.processedCount);
  }
}

// ── Per-feed import ──────────────────────────────────────────────────────────

/** Collaborators the per-feed import needs, supplied by the owning service. */
export interface BackgroundImportFeedHooks {
  isCancelled: () => boolean;
  updateProgress: (currentFeedTitle: string) => void;
  parseFeed: (url: string) => Promise<Feed>;
  merge: (feedMetadata: FeedMetadata, parsedFeed: Feed) => Feed | null;
  onImported: (feed: Feed) => void;
  clearImportPending: (url: string) => void;
}

/**
 * Fetch and merge a single feed into settings, updating its `importStatus`
 * throughout (`processing` → `completed`/`failed`/`timed_out`/back to
 * `pending` if cancelled). Never throws — fetch and merge errors are caught
 * and recorded on `feedMetadata.importError` instead.
 * @param {FeedMetadata} feedMetadata Placeholder feed being imported; mutated in place with status/error
 * @param {BackgroundImportFeedHooks} hooks Current cancellation state and the parse/merge/record callbacks
 * @returns {Promise<void>} Resolves once the feed has been fetched (or has failed/timed out) and recorded
 */
export async function importBackgroundFeed(
  feedMetadata: FeedMetadata,
  hooks: BackgroundImportFeedHooks,
): Promise<void> {
  try {
    feedMetadata.importStatus = "processing";
    hooks.updateProgress(feedMetadata.title);

    const parsedFeed = await hooks.parseFeed(feedMetadata.url);
    const wasCancelled = hooks.isCancelled();
    if (!wasCancelled) {
      const importedFeed = hooks.merge(feedMetadata, parsedFeed);
      if (importedFeed) {
        hooks.onImported(importedFeed);
      }
      feedMetadata.importStatus = "completed";
    }
  } catch (error) {
    if (hooks.isCancelled()) {
      feedMetadata.importStatus = "pending";
      delete feedMetadata.importError;
    } else if (error instanceof Error && error.message === TIMED_OUT_MESSAGE) {
      feedMetadata.importStatus = "timed_out";
    } else {
      feedMetadata.importStatus = "failed";
    }
    if (!hooks.isCancelled()) {
      hooks.clearImportPending(feedMetadata.url);
      feedMetadata.importError = getFeedErrorMessage(
        error instanceof Error ? error : new Error(String(error)),
      );
      // Intentionally not rethrown: a single feed's fetch/parse failure must
      // not abort the rest of the batch. The error is logged for debugging
      // and recorded on the placeholder so the UI can surface it per-feed.
      console.error(
        `[RSS Dashboard] Background import failed for feed "${feedMetadata.url}": ${feedMetadata.importError}`,
      );
    }
  }
}

// ── Save / render cadence ────────────────────────────────────────────────────

/**
 * Whether a background import should persist settings after this many feeds.
 * @param {number} processedCount Feeds processed so far
 * @param {number} saveEvery Persist after every N processed feeds
 * @param {boolean} cancelled Whether the run was cancelled
 * @returns {boolean} true when settings should be saved now
 */
export function shouldPersistBackgroundImport(
  processedCount: number,
  saveEvery: number,
  cancelled: boolean,
): boolean {
  return !cancelled && processedCount % saveEvery === 0;
}

/**
 * Whether a background import should refresh the view after this many feeds.
 * @param {number} processedCount Feeds processed so far
 * @param {number} renderEvery Refresh after every N processed feeds
 * @param {boolean} shouldRenderDuringImport Whether mid-import renders are enabled at all
 * @param {boolean} cancelled Whether the run was cancelled
 * @returns {boolean} true when the view should be refreshed now
 */
export function shouldRenderBackgroundImport(
  processedCount: number,
  renderEvery: number,
  shouldRenderDuringImport: boolean,
  cancelled: boolean,
): boolean {
  return (
    shouldRenderDuringImport && !cancelled && processedCount % renderEvery === 0
  );
}

/** Minimum view interface the progress render needs. */
export interface BackgroundImportViewLike {
  render(): void;
  refreshSidebarOnly?: () => void;
}

/**
 * Refresh the dashboard for a mid-import progress update, preferring the
 * cheap sidebar-only refresh and falling back to a full render.
 * @param {BackgroundImportViewLike | null} view The active dashboard view, if any
 * @returns {void}
 */
export function renderBackgroundImportProgress(
  view: BackgroundImportViewLike | null,
): void {
  if (view) {
    if (typeof view.refreshSidebarOnly === "function") {
      view.refreshSidebarOnly();
    } else {
      view.render();
    }
  }
}
