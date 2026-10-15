import { setIcon, Setting } from "obsidian";
import type {
  RssDashboardSettings,
  Feed,
  FeedMetadata,
  FeedIngestionCandidate,
  FeedIngestionOptions,
  FeedIngestionResult,
  Folder,
} from "../types/types";
import { OpmlManager } from "./opml-manager";
import {
  computeBackgroundImportCadence,
  createImportStatusBarItem,
  finishBackgroundImportRun,
  importBackgroundFeed,
  renderBackgroundImportProgress,
  shouldPersistBackgroundImport,
  shouldRenderBackgroundImport,
} from "./background-import-runner";
import {
  BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS,
  BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT,
  FEED_SOFT_TIMEOUT_MS,
  MAX_CONCURRENT_FETCHES,
  TIMED_OUT_MESSAGE,
} from "./feed-timeout";
import { globalFetchSemaphore } from "./feed-parser/fetch-semaphore";
import { setCssProps } from "../utils/platform-utils";

// ── Types ────────────────────────────────────────────────────────────────────

/** Minimum view interface required by BackgroundImportService */
interface DashboardViewLike {
  render(): void;
  refreshSidebarOnly?: () => void;
  refresh?: () => void;
}

/** Minimum feed-parser interface required by BackgroundImportService */
interface FeedParserLike {
  parseFeed(
    url: string,
    existingFeed?: Feed | null,
    options?: { signal?: AbortSignal },
  ): Promise<Feed>;
}

/**
 * Dependencies injected into BackgroundImportService.
 * @property {FeedParserLike} feedParser Parser used to fetch and parse feed content
 * @property {Function} getSettings Returns the live plugin settings object
 * @property {Function} getView Resolves the active dashboard view, if any
 * @property {Function} saveSettings Persists the current settings
 * @property {Function} ensureFolderExists Creates a folder (and ancestors) if missing
 * @property {Function} addStatusBarItem Adds a new status bar item to the workspace
 * @property {Function} [beginGlobalOperation] Starts a cancellable global operation and returns its abort signal, or null if one could not be started
 * @property {Function} [updateGlobalOperationProgress] Reports progress for the active global operation
 * @property {Function} [endGlobalOperation] Ends the active global operation
 * @property {Function} [isGlobalOperationCancelled] Returns true if the active global operation was cancelled
 * @property {Function} [onFeedImported] Called each time a queued feed finishes importing successfully
 * @property {Function} [onImportQueueDrained] Called once the background import queue finishes draining (unless the run was cancelled), with the number of feeds processed. Callers use this to surface a completion Notice — the service itself never shows one.
 */
export interface BackgroundImportServiceDeps {
  feedParser: FeedParserLike;
  getSettings: () => RssDashboardSettings;
  getView: () => Promise<DashboardViewLike | null>;
  saveSettings: () => Promise<void>;
  ensureFolderExists: (
    folder: string,
    opts: { saveSettings: boolean; refreshView: boolean },
  ) => Promise<boolean>;
  addStatusBarItem: () => HTMLElement;
  beginGlobalOperation?: (total: number) => AbortSignal | null;
  updateGlobalOperationProgress?: (completed: number, total: number) => void;
  endGlobalOperation?: () => Promise<void>;
  isGlobalOperationCancelled?: () => boolean;
  onFeedImported?: (feed: Feed) => void;
  onImportQueueDrained?: (processedCount: number) => void;
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * BackgroundImportService
 *
 * Encapsulates all background-import state and orchestration that was previously
 * scattered across RssDashboardPlugin. Extracted in Phase 3-D of the main.ts refactor.
 */
export class BackgroundImportService {
  private readonly feedParser: FeedParserLike;
  private readonly getSettings: () => RssDashboardSettings;
  private readonly getView: () => Promise<DashboardViewLike | null>;
  private readonly saveSettings: () => Promise<void>;
  private readonly ensureFolderExists: (
    folder: string,
    opts: { saveSettings: boolean; refreshView: boolean },
  ) => Promise<boolean>;
  private readonly addStatusBarItem: () => HTMLElement;
  private readonly beginGlobalOperation?: (total: number) => AbortSignal | null;
  private readonly updateGlobalOperationProgress?: (
    completed: number,
    total: number,
  ) => void;
  private readonly endGlobalOperation?: () => Promise<void>;
  private readonly isGlobalOperationCancelled?: () => boolean;
  private readonly onFeedImported?: (feed: Feed) => void;
  private readonly onImportQueueDrained?: (processedCount: number) => void;

  // ── State ──────────────────────────────────────────────────────────────────

  private importStatusBarItem: HTMLElement | null = null;
  public backgroundImportQueue: FeedMetadata[] = [];
  public isBackgroundImporting = false;
  private backgroundImportQueuedUrls = new Set<string>();
  private backgroundImportInFlightUrls = new Set<string>();
  private backgroundImportPendingIngestionUrls = new Set<string>();
  private backgroundImportProcessedCount = 0;
  private backgroundImportTotalCount = 0;
  private backgroundImportPersistMode:
    RssDashboardSettings["storageMode"] | null = null;
  private backgroundImportSignal: AbortSignal | null = null;
  private ownsGlobalOperation = false;

  /**
   * Creates a new BackgroundImportService instance
   * @param {BackgroundImportServiceDeps} deps Collaborators and callbacks the service needs to fetch feeds, persist settings, and coordinate with the dashboard view
   */
  constructor(deps: BackgroundImportServiceDeps) {
    this.feedParser = deps.feedParser;
    this.getSettings = deps.getSettings;
    this.getView = deps.getView;
    this.saveSettings = deps.saveSettings;
    this.ensureFolderExists = deps.ensureFolderExists;
    this.addStatusBarItem = deps.addStatusBarItem;
    this.beginGlobalOperation = deps.beginGlobalOperation;
    this.updateGlobalOperationProgress = deps.updateGlobalOperationProgress;
    this.endGlobalOperation = deps.endGlobalOperation;
    this.isGlobalOperationCancelled = deps.isGlobalOperationCancelled;
    this.onFeedImported = deps.onFeedImported;
    this.onImportQueueDrained = deps.onImportQueueDrained;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enqueue feeds for background import, skipping feeds already queued or in flight.
   * Starts processing the queue immediately if no import is currently running.
   * @param {Feed[]} feeds Feeds to add to the background import queue
   * @returns {void}
   */
  public startBackgroundImport(feeds: Feed[]): void {
    const queuedUrls = new Set(
      this.backgroundImportQueue.map((feed) => feed.url),
    );
    this.backgroundImportQueuedUrls = queuedUrls;
    const newQueueItems = feeds
      .filter(
        (feed) =>
          !queuedUrls.has(feed.url) &&
          !this.backgroundImportInFlightUrls.has(feed.url),
      )
      .map((feed) => ({
        ...feed,
        importStatus: "pending" as const,
      }));

    if (newQueueItems.length === 0) {
      return;
    }

    if (
      !this.isBackgroundImporting &&
      this.backgroundImportPersistMode === null
    ) {
      this.backgroundImportPersistMode = this.getSettings().storageMode;
    }

    this.backgroundImportQueue.push(...newQueueItems);
    for (const feed of newQueueItems) {
      this.backgroundImportQueuedUrls.add(feed.url);
    }
    this.backgroundImportTotalCount += newQueueItems.length;

    if (!this.isBackgroundImporting) {
      void this.processBackgroundImportQueue();
    }
  }

  /**
   * Queue the placeholders of an import that was interrupted before their
   * first fetch, such as by the plugin unloading, as a new global operation.
   * @returns {number} Number of feeds queued; 0 when none are pending or another global operation is running
   */
  public resumePendingImports(): number {
    const pendingFeeds = this.getSettings().feeds.filter(
      (feed) =>
        feed.importPending === true && !this.isFeedPendingImport(feed.url),
    );
    if (pendingFeeds.length === 0) return 0;

    if (this.beginGlobalOperation) {
      const signal = this.beginGlobalOperation(pendingFeeds.length);
      if (!signal) return 0;
      this.backgroundImportSignal = signal;
      this.ownsGlobalOperation = true;
    }
    this.startBackgroundImport(pendingFeeds);
    return pendingFeeds.length;
  }

  /**
   * Check whether a feed URL is anywhere in the background import pipeline —
   * pending ingestion, queued, or currently being fetched.
   * @param {string} url Feed URL to check
   * @returns {boolean} true if the feed is queued, in flight, or awaiting ingestion; false otherwise (including feeds that have completed or were never queued)
   */
  public isFeedPendingImport(url: string): boolean {
    return (
      this.backgroundImportPendingIngestionUrls.has(url) ||
      this.backgroundImportInFlightUrls.has(url) ||
      this.backgroundImportQueuedUrls.has(url)
    );
  }

  /**
   * Create placeholder feed entries for the given candidates, persist them to
   * settings, and queue them for background import. Candidates whose URL
   * already exists (either in settings or elsewhere in the candidate list)
   * are skipped. In "overwrite" mode, existing feeds and folders are replaced
   * before ingestion; otherwise new folders are merged into the existing set.
   * @param {FeedIngestionCandidate[]} candidates Feeds to ingest, keyed by URL
   * @param {FeedIngestionOptions} [options] Ingestion mode, folder merge data, progress callback, and whether to register a cancellable global operation
   * @returns {Promise<FeedIngestionResult>} Count of placeholders added, count of candidates skipped as duplicates, and the placeholder feeds that were queued (or refused: true if busy)
   * @throws {Error} If persisting the placeholder feeds via `saveSettings` fails
   */
  public async ingestFeedsForBackgroundImport(
    candidates: FeedIngestionCandidate[],
    options?: FeedIngestionOptions,
  ): Promise<FeedIngestionResult> {
    const mode = options?.mode || "update";
    const { toAdd, skippedCount } = this.partitionIngestionCandidates(
      candidates,
      mode,
    );

    if (options?.globalOperation && toAdd.length > 0) {
      const signal = this.beginGlobalOperation?.(toAdd.length);
      if (!signal) {
        return {
          addedCount: 0,
          skippedCount,
          queuedFeeds: [],
          refused: true,
        };
      }
      this.backgroundImportSignal = signal;
      this.ownsGlobalOperation = true;
    }

    let placeholders: Feed[] = [];
    try {
      const importPersistMode = this.getSettings().storageMode;
      if (mode === "overwrite") {
        this.getSettings().feeds = [];
      }
      this.applyImportFolders(mode, options?.folders);

      placeholders = await this.processCandidates(
        candidates,
        mode,
        options?.onProgress,
      );

      await this.saveSettingsWithMode(importPersistMode);
      const view = await this.getView();
      view?.refresh?.();

      this.backgroundImportPersistMode = importPersistMode;
      this.startBackgroundImport(placeholders);
    } catch (err) {
      await this.cleanupGlobalOperationOnError();
      throw err;
    } finally {
      for (const placeholder of placeholders) {
        this.backgroundImportPendingIngestionUrls.delete(placeholder.url);
      }
    }

    return {
      addedCount: placeholders.length,
      skippedCount,
      queuedFeeds: placeholders,
    };
  }

  private async cleanupGlobalOperationOnError(): Promise<void> {
    if (this.ownsGlobalOperation && this.endGlobalOperation) {
      this.ownsGlobalOperation = false;
      this.backgroundImportSignal = null;
      await this.endGlobalOperation();
    }
  }

  private async processCandidates(
    candidates: FeedIngestionCandidate[],
    mode: "update" | "overwrite",
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Feed[]> {
    const placeholders: Feed[] = [];
    const totalCandidates = candidates.length;
    const existingUrls =
      mode === "overwrite"
        ? new Set<string>()
        : new Set(this.getSettings().feeds.map((feed) => feed.url));
    const seenUrls = new Set<string>();
    let processedCount = 0;

    for (const candidate of candidates) {
      if (existingUrls.has(candidate.url) || seenUrls.has(candidate.url)) {
        processedCount += 1;
        onProgress?.(processedCount, totalCandidates);
        continue;
      }

      seenUrls.add(candidate.url);
      const placeholder = this.createPlaceholderFeed(candidate);
      placeholders.push(placeholder);
      this.getSettings().feeds.push(placeholder);
      this.backgroundImportPendingIngestionUrls.add(candidate.url);

      if (placeholder.folder) {
        await this.ensureFolderExists(placeholder.folder, {
          saveSettings: false,
          refreshView: false,
        });
      }

      processedCount += 1;
      onProgress?.(processedCount, totalCandidates);
    }

    return placeholders;
  }

  private partitionIngestionCandidates(
    candidates: FeedIngestionCandidate[],
    mode: "update" | "overwrite",
  ): { toAdd: FeedIngestionCandidate[]; skippedCount: number } {
    const existingUrls =
      mode === "overwrite"
        ? new Set<string>()
        : new Set(this.getSettings().feeds.map((feed) => feed.url));
    const seenUrls = new Set<string>();
    const toAdd: FeedIngestionCandidate[] = [];
    let skippedCount = 0;

    for (const candidate of candidates) {
      if (existingUrls.has(candidate.url) || seenUrls.has(candidate.url)) {
        skippedCount += 1;
      } else {
        seenUrls.add(candidate.url);
        toAdd.push(candidate);
      }
    }

    return { toAdd, skippedCount };
  }

  private applyImportFolders(
    mode: "update" | "overwrite",
    folders?: Folder[],
  ): void {
    if (!folders) {
      return;
    }
    if (mode === "overwrite") {
      this.getSettings().folders = folders;
    } else {
      this.getSettings().folders = OpmlManager.mergeFolders(
        this.getSettings().folders,
        folders,
      );
    }
  }

  // ── Private orchestration ──────────────────────────────────────────────────

  /**
   * Drain the background import queue with a bounded pool of concurrent
   * workers, sized and paced (save/render cadence) according to the total
   * queue size. Re-entrant: if an import is already running, calling this
   * again is a no-op — new items are picked up by the running loop. If the
   * queue grows again after draining, the loop restarts itself.
   * @returns {Promise<void>} Resolves once the queue has fully drained and the status bar item has been cleaned up
   */
  private async processBackgroundImportQueue(): Promise<void> {
    if (this.isBackgroundImporting || this.backgroundImportQueue.length === 0) {
      return;
    }

    this.isBackgroundImporting = true;

    if (!this.importStatusBarItem) {
      this.importStatusBarItem = createImportStatusBarItem(
        this.addStatusBarItem,
      );
    }

    const { saveEvery, renderEvery, shouldRenderDuringImport } =
      computeBackgroundImportCadence(this.backgroundImportTotalCount);
    const workerCount = Math.min(
      MAX_CONCURRENT_FETCHES,
      this.backgroundImportQueue.length,
    );
    const backgroundPromises: Promise<void>[] = [];

    try {
      await Promise.all(
        Array.from({ length: workerCount }, () =>
          this.processBackgroundImportWorker(
            saveEvery,
            renderEvery,
            shouldRenderDuringImport,
            backgroundPromises,
          ),
        ),
      );
      await Promise.all(backgroundPromises);

      await finishBackgroundImportRun({
        isCancelled: () => this.isGlobalOperationCancelled?.() ?? false,
        persist: () =>
          this.saveSettingsWithMode(this.getPersistModeForBackgroundImport()),
        render: async () => {
          const view = await this.getView();
          if (view) {
            view.render();
          }
        },
        onDrained: (processedCount) =>
          this.onImportQueueDrained?.(processedCount),
        processedCount: this.backgroundImportProcessedCount,
      });
    } finally {
      if (this.importStatusBarItem) {
        this.importStatusBarItem.remove();
        this.importStatusBarItem = null;
      }

      // Capture cancellation before endGlobalOperation() resets it below —
      // otherwise the restart guard would always see "not cancelled".
      const wasCancelled = this.isGlobalOperationCancelled?.() ?? false;

      if (wasCancelled && this.backgroundImportQueue.length > 0) {
        // A cancelled worker (see processBackgroundImportWorker) exits
        // without ever shifting its claimed feed off the queue. Left as-is,
        // those URLs would stay marked "pending import" in
        // backgroundImportQueuedUrls forever, which silently excludes them
        // from every future global refresh (RssDashboardPlugin's
        // getRefreshableFeeds() skips anything isFeedPendingImport() still
        // reports as queued). Drain them here so they go back to being
        // ordinary feeds, refreshable normally.
        for (const feedMetadata of this.backgroundImportQueue) {
          this.backgroundImportQueuedUrls.delete(feedMetadata.url);
        }
        this.backgroundImportQueue = [];
      }

      this.isBackgroundImporting = false;
      this.backgroundImportProcessedCount = 0;
      this.backgroundImportTotalCount = 0;
      this.backgroundImportInFlightUrls.clear();
      this.backgroundImportSignal = null;

      if (this.ownsGlobalOperation && this.endGlobalOperation) {
        await this.endGlobalOperation();
      }
      this.ownsGlobalOperation = false;

      if (this.backgroundImportQueue.length === 0) {
        this.backgroundImportPersistMode = null;
      }

      // Do not self-restart while cancelled: a cancelled worker returns without
      // shifting its feed off the queue, so restarting here would recurse
      // forever without ever draining the remaining items.
      if (this.backgroundImportQueue.length > 0 && !wasCancelled) {
        void this.processBackgroundImportQueue();
      }
    }
  }

  /**
   * One worker in the concurrent import pool: repeatedly acquires a fetch
   * semaphore slot, shifts the next feed off the queue, and imports it. If a
   * feed's import exceeds the soft timeout, the worker moves on without
   * waiting for it — the still-running import is tracked in
   * `backgroundPromises` so the caller can await it before finishing. Exits
   * once the queue is empty or the operation is aborted/cancelled.
   * @param {number} saveEvery Persist settings after every N processed feeds
   * @param {number} renderEvery Refresh the view after every N processed feeds
   * @param {boolean} shouldRenderDuringImport Whether to refresh the view mid-import at all (disabled for very large imports)
   * @param {Promise<void>[]} backgroundPromises Accumulator for in-flight imports that outlived the soft timeout
   * @returns {Promise<void>} Resolves once this worker has no more queue items to claim
   */
  private async processBackgroundImportWorker(
    saveEvery: number,
    renderEvery: number,
    shouldRenderDuringImport: boolean,
    backgroundPromises: Promise<void>[] = [],
  ): Promise<void> {
    while (true) {
      await globalFetchSemaphore.acquire();

      if (
        this.backgroundImportSignal?.aborted ||
        this.isGlobalOperationCancelled?.()
      ) {
        globalFetchSemaphore.release();
        return;
      }

      const feedMetadata = this.backgroundImportQueue.shift();
      if (!feedMetadata) {
        globalFetchSemaphore.release();
        return;
      }
      this.backgroundImportQueuedUrls.delete(feedMetadata.url);

      const importPromise = this.processBackgroundImportFeed(
        feedMetadata,
        saveEvery,
        renderEvery,
        shouldRenderDuringImport,
      ).finally(() => {
        globalFetchSemaphore.release();
      });

      const softTimeout = this.waitForSoftTimeout(
        this.backgroundImportSignal ?? undefined,
      );
      const winner = await Promise.race([
        importPromise.then(() => "fetch" as const),
        softTimeout.promise,
      ]);
      softTimeout.cancel();

      if (winner === "timeout") {
        backgroundPromises.push(importPromise);
      }
      if (winner === "cancelled") return;
    }
  }

  /**
   * Whether the current background import run is cancelled, by either the
   * global operation's abort signal or the tracker's cancellation flag. Gates
   * the merge, the per-feed error record, and the save/render cadence.
   * @returns {boolean} true when the run is aborted or cancelled
   */
  private backgroundImportIsCancelled(): boolean {
    return (
      (this.backgroundImportSignal?.aborted ?? false) ||
      (this.isGlobalOperationCancelled?.() ?? false)
    );
  }

  /**
   * Fetch and merge a single feed into settings, updating its
   * `importStatus` throughout (`processing` → `completed`/`failed`/
   * `timed_out`/back to `pending` if cancelled). Never throws — fetch and
   * merge errors are caught and recorded on `feedMetadata.importError`
   * instead. Periodically persists settings and refreshes the view based on
   * the provided cadence.
   * @param {FeedMetadata} feedMetadata Placeholder feed being imported; mutated in place with status/error
   * @param {number} saveEvery Persist settings after every N processed feeds
   * @param {number} renderEvery Refresh the view after every N processed feeds
   * @param {boolean} shouldRenderDuringImport Whether to refresh the view mid-import at all
   * @returns {Promise<void>} Resolves once the feed has been fetched (or has failed/timed out) and bookkeeping is updated
   */
  private async processBackgroundImportFeed(
    feedMetadata: FeedMetadata,
    saveEvery: number,
    renderEvery: number,
    shouldRenderDuringImport: boolean,
  ): Promise<void> {
    this.backgroundImportInFlightUrls.add(feedMetadata.url);

    try {
      await importBackgroundFeed(feedMetadata, {
        isCancelled: () => this.backgroundImportIsCancelled(),
        updateProgress: (currentFeedTitle) =>
          this.updateBackgroundImportProgress(
            this.backgroundImportProcessedCount,
            this.backgroundImportTotalCount,
            currentFeedTitle,
          ),
        parseFeed: (url) =>
          this.parseFeedWithTimeout(
            url,
            this.backgroundImportSignal ?? undefined,
          ),
        merge: (metadata, parsedFeed) =>
          this.mergeBackgroundImportedFeed(metadata, parsedFeed),
        onImported: (feed) => this.onFeedImported?.(feed),
        clearImportPending: (url) => this.clearImportPending(url),
      });
    } finally {
      this.backgroundImportInFlightUrls.delete(feedMetadata.url);
      this.backgroundImportProcessedCount += 1;
      this.updateGlobalOperationProgress?.(
        this.backgroundImportProcessedCount,
        this.backgroundImportTotalCount,
      );
    }

    if (
      shouldPersistBackgroundImport(
        this.backgroundImportProcessedCount,
        saveEvery,
        this.backgroundImportIsCancelled(),
      )
    ) {
      await this.saveSettingsWithMode(this.getPersistModeForBackgroundImport());
    }

    if (
      shouldRenderBackgroundImport(
        this.backgroundImportProcessedCount,
        renderEvery,
        shouldRenderDuringImport,
        this.backgroundImportIsCancelled(),
      )
    ) {
      renderBackgroundImportProgress(await this.getView());
    }
  }

  /**
   * Resolve after `FEED_SOFT_TIMEOUT_MS`, used to race against an in-flight
   * feed fetch so a slow feed doesn't block the worker pool.
   * @returns {Promise<void>} Resolves after the soft timeout elapses
   */
  private waitForSoftTimeout(signal?: AbortSignal): {
    promise: Promise<"timeout" | "cancelled">;
    cancel: () => void;
  } {
    let timeoutId: number | null = null;
    let abortHandler: (() => void) | null = null;
    let resolveTimeout: (result: "timeout" | "cancelled") => void = () => {};

    const promise = new Promise<"timeout" | "cancelled">((resolve) => {
      resolveTimeout = resolve;
      const finish = (result: "timeout" | "cancelled"): void => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        timeoutId = null;
        if (abortHandler && signal) {
          signal.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }
        resolve(result);
      };

      if (signal?.aborted) {
        finish("cancelled");
        return;
      }

      timeoutId = window.setTimeout(
        () => finish("timeout"),
        FEED_SOFT_TIMEOUT_MS,
      );
      if (signal) {
        abortHandler = () => finish("cancelled");
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });

    return {
      promise,
      cancel: () => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        timeoutId = null;
        if (abortHandler && signal) {
          signal.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }
        resolveTimeout("cancelled");
      },
    };
  }

  /**
   * Parse a feed, retrying up to `BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT`
   * times if the attempt times out. Non-timeout errors are not retried.
   * @param {string} url Feed URL to parse
   * @param {AbortSignal} [signal] Signal that aborts the fetch (e.g. global operation cancellation)
   * @returns {Promise<Feed>} The parsed feed
   * @throws {Error} If every attempt times out, or if a non-timeout error occurs (including abort)
   */
  private async parseFeedWithTimeout(
    url: string,
    signal?: AbortSignal,
  ): Promise<Feed> {
    let lastError: Error | null = null;

    for (
      let attempt = 0;
      attempt <= BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT;
      attempt += 1
    ) {
      try {
        return await this.parseFeedAttemptWithTimeout(url, signal);
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        const shouldRetry =
          normalizedError.message === TIMED_OUT_MESSAGE &&
          attempt < BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT;

        if (!shouldRetry) {
          throw normalizedError;
        }
      }
    }

    throw lastError ?? new Error(TIMED_OUT_MESSAGE);
  }

  /**
   * Single parse attempt, racing the feed parser against a hard timeout
   * (`BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS`). Aborts the parser's
   * request if the timeout wins or if `signal` is aborted externally.
   * @param {string} url Feed URL to parse
   * @param {AbortSignal} [signal] External signal that aborts this attempt
   * @returns {Promise<Feed>} The parsed feed
   * @throws {Error} With message "Timed out" if the hard timeout elapses first
   * @throws {DOMException} With name "AbortError" if `signal` is already aborted when called
   */
  private async parseFeedAttemptWithTimeout(
    url: string,
    signal?: AbortSignal,
  ): Promise<Feed> {
    let timeoutId: number | null = null;
    const abortController = new AbortController();
    const forwardAbort = (): void => abortController.abort();

    try {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      signal?.addEventListener("abort", forwardAbort, { once: true });
      return await Promise.race([
        this.feedParser.parseFeed(url, null, {
          signal: abortController.signal,
        }),
        new Promise<Feed>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            abortController.abort();
            reject(new Error(TIMED_OUT_MESSAGE));
          }, BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS);
        }),
      ]);
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Merge a freshly parsed feed into the settings feed at `feedMetadata.url`,
   * preferring parsed values but falling back to the existing placeholder's
   * values where the parse result is missing them. Trims items to the feed's
   * configured (or default) max items limit.
   * @param {FeedMetadata} feedMetadata Placeholder feed being replaced, identified by URL
   * @param {Feed} parsedFeed Freshly parsed feed content
   * @returns {Feed | null} The merged feed as written into settings, or null if the placeholder is no longer present in settings
   */
  private mergeBackgroundImportedFeed(
    feedMetadata: FeedMetadata,
    parsedFeed: Feed,
  ): Feed | null {
    const settings = this.getSettings();
    const feedIndex = settings.feeds.findIndex(
      (f) => f.url === feedMetadata.url,
    );
    if (feedIndex < 0) {
      return null;
    }

    const existingFeed = settings.feeds[feedIndex];
    if (!existingFeed) {
      return null;
    }
    const importedFeed: Feed = {
      ...existingFeed,
      title: parsedFeed.title || existingFeed.title || feedMetadata.title,
      author: parsedFeed.author ?? existingFeed.author,
      siteUrl: parsedFeed.siteUrl ?? existingFeed.siteUrl,
      language: parsedFeed.language ?? existingFeed.language,
      iconUrl: parsedFeed.iconUrl ?? existingFeed.iconUrl,
      mediaType: parsedFeed.mediaType ?? existingFeed.mediaType,
      items: parsedFeed.items.slice(
        0,
        existingFeed.maxItemsLimit || settings.maxItems,
      ),
      lastUpdated: Date.now(),
    };
    delete importedFeed.importPending;
    settings.feeds[feedIndex] = importedFeed;
    return importedFeed;
  }

  /**
   * Update the status bar item's text to reflect current import progress.
   * No-op if the status bar item hasn't been created yet.
   * @param {number} current Number of feeds processed so far
   * @param {number} total Total number of feeds in the current import run
   * @param {string} currentFeedTitle Title of the feed currently being fetched
   * @returns {void}
   */
  private updateBackgroundImportProgress(
    current: number,
    total: number,
    currentFeedTitle: string,
  ): void {
    if (this.importStatusBarItem) {
      const textSpan = this.importStatusBarItem.querySelector(
        ".import-statusbar-text",
      );
      if (textSpan) {
        textSpan.textContent = `Fetching articles: ${current}/${total} - ${currentFeedTitle}`;
      }
    }
  }

  /**
   * Build an empty placeholder Feed from an ingestion candidate, filling in
   * media-type-specific default folders and per-feed limits from settings
   * where the candidate doesn't specify its own.
   * @param {FeedIngestionCandidate} candidate Feed metadata supplied by the caller (e.g. OPML import)
   * @returns {Feed} A feed with no items yet, ready to be queued for background import
   */
  private createPlaceholderFeed(candidate: FeedIngestionCandidate): Feed {
    const mediaType = this.resolveCandidateMediaType(candidate);
    // `??` (not `||`) so an explicit "" — Root, chosen on purpose via the
    // folder popup's "Root (no folder)" action — is preserved. Only a
    // genuinely unspecified folder (undefined) falls back to Uncategorized.
    let folder = candidate.folder ?? "Uncategorized";

    if (mediaType === "video" && folder === "Uncategorized") {
      folder = this.getSettings().media.defaultYouTubeFolder;
    } else if (mediaType === "podcast" && folder === "Uncategorized") {
      folder = this.getSettings().media.defaultPodcastFolder;
    }

    return {
      title: candidate.title,
      url: candidate.url,
      folder,
      items: [],
      lastUpdated: Date.now(),
      author: candidate.author,
      mediaType,
      autoDetect: candidate.autoDetect,
      customTemplate: candidate.customTemplate,
      customFolder: candidate.customFolder,
      customTags: candidate.customTags,
      autoDeleteDuration:
        typeof candidate.autoDeleteDuration === "number"
          ? candidate.autoDeleteDuration
          : this.getSettings().defaultAutoDeleteDuration,
      maxItemsLimit:
        typeof candidate.maxItemsLimit === "number"
          ? candidate.maxItemsLimit
          : this.getSettings().maxItems,
      scanInterval:
        typeof candidate.scanInterval === "number" ? candidate.scanInterval : 0,
      excludeFromRefresh: candidate.excludeFromRefresh === true,
      keywordRules: candidate.keywordRules || {
        overrideGlobalRules: false,
        includeLogic: "AND",
        rules: [],
      },
      importPending: true,
    };
  }

  private clearImportPending(url: string): void {
    const feed = this.getSettings().feeds.find((f) => f.url === url);
    if (feed) delete feed.importPending;
  }

  /**
   * The storage mode saves during the current import run should use — the
   * mode captured when the run started, so a mid-run settings change doesn't
   * cause partial writes under a mismatched mode.
   * @returns {RssDashboardSettings["storageMode"]} The storage mode to persist with
   */
  private getPersistModeForBackgroundImport(): RssDashboardSettings["storageMode"] {
    return this.backgroundImportPersistMode ?? this.getSettings().storageMode;
  }

  /**
   * Persist settings with `storageMode` temporarily pinned to `mode` for the
   * duration of the save, then restored to its prior value.
   * @param {RssDashboardSettings["storageMode"]} mode Storage mode to save under
   * @returns {Promise<void>} Resolves once the save completes (mode is restored even if the save throws)
   * @throws {Error} If the underlying `saveSettings` call fails
   */
  private async saveSettingsWithMode(
    mode: RssDashboardSettings["storageMode"],
  ): Promise<void> {
    const settings = this.getSettings();
    const previousMode = settings.storageMode;

    if (previousMode !== mode) {
      settings.storageMode = mode;
    }

    try {
      await this.saveSettings();
    } finally {
      if (settings.storageMode !== previousMode) {
        settings.storageMode = previousMode;
      }
    }
  }

  /**
   * Determine a candidate's media type, defaulting to "article" when unset.
   * @param {FeedIngestionCandidate} candidate Feed metadata supplied by the caller
   * @returns {"article" | "video" | "podcast"} The resolved media type
   */
  private resolveCandidateMediaType(
    candidate: FeedIngestionCandidate,
  ): "article" | "video" | "podcast" {
    return candidate.mediaType ?? "article";
  }

  /**
   * Build and attach a modal showing OPML import progress, with minimize and
   * abort controls.
   * @param {number} totalFeeds Total number of feeds being imported, shown in the initial status text
   * @param {Function} onMinimize Called when the minimize button is clicked
   * @param {Function} onAbort Called when the abort button is clicked
   * @returns {HTMLElement} The modal root element, appended to `activeDocument.body`
   */
  private showImportProgressModal(
    totalFeeds: number,
    onMinimize: () => void,
    onAbort: () => void,
  ): HTMLElement {
    const modal = activeDocument.body.createDiv({
      cls: "rss-dashboard-modal rss-dashboard-modal-container rss-dashboard-import-modal",
    });

    const modalContent = modal.createDiv({
      cls: "rss-dashboard-modal-content",
    });

    const modalHeader = modalContent.createDiv({
      cls: "rss-dashboard-import-modal-header",
    });

    new Setting(modalHeader).setName("Importing OPML feeds").setHeading();

    const minimizeButton = modalHeader.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "Minimize" },
    });
    setIcon(minimizeButton, "minus");
    minimizeButton.onclick = onMinimize;

    const abortButton = modalHeader.createEl("button", {
      text: "Abort",
      cls: "rss-dashboard-import-abort-button",
    });
    abortButton.onclick = onAbort;

    const buttonGroup = modalHeader.createDiv({
      cls: "import-modal-header-buttons",
    });
    buttonGroup.appendChild(minimizeButton);
    buttonGroup.appendChild(abortButton);

    modalContent.createDiv({
      attr: { id: "import-progress-text" },
      cls: "rss-dashboard-center-text rss-dashboard-import-progress-text",
      text: `Preparing to import ${totalFeeds} feeds...`,
    });

    const progressBar = modalContent.createDiv({
      cls: "rss-dashboard-import-progress-bar",
    });

    const progressFill = progressBar.createDiv({
      attr: { id: "import-progress-fill" },
      cls: "rss-dashboard-import-progress-fill",
    });
    setCssProps(progressFill, { "--progress-width": "0%" });

    modalContent.createDiv({
      attr: { id: "import-current-feed" },
      cls: "rss-dashboard-center-text rss-dashboard-import-current-feed",
    });

    return modal;
  }
}
