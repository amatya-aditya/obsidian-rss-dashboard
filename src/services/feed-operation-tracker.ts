import { Notice, type App } from "obsidian";
import type { FeedRefreshState } from "../types/types";

/** Refresh status redraws during a refresh batch run at most this often. */
export const FEED_REFRESH_RENDER_THROTTLE_MS = 250;

export interface FeedOperationTrackerOptions {
  /**
   * The plugin's `activeRefreshState`. The tracker changes this same map in
   * place and never replaces it, so views reading the plugin field see it.
   */
  activeRefreshState: Map<string, FeedRefreshState>;
  /** Redraws the sidebar and filter status bar of open dashboards. */
  renderStatus: () => Promise<void>;
  /** Redraws only the sidebar of open dashboards. */
  renderSidebar: () => Promise<void>;
  /** Called when the user stops an operation, before its signal aborts. */
  onCancelled: () => void;
}

/**
 * The global feed operation: the one cancellable, progress-tracked operation
 * over many feeds that the sidebar shows (a refresh batch, a background
 * import, or a Discover or OPML add), each feed's refresh status, and the
 * coalesced sidebar redraws that report it.
 */
export class FeedOperationTracker {
  private isMultiFeedRefreshRunning = false;
  private isGlobalRefreshCancelled = false;
  private globalRefreshAbortController: AbortController | null = null;
  private globalRefreshTotal = 0;
  private globalRefreshCompleted = 0;
  private refreshStatusRenderTimeoutId: number | null = null;

  constructor(
    private readonly app: App,
    private readonly options: FeedOperationTrackerOptions,
  ) {}

  public get isRunning(): boolean {
    return this.isMultiFeedRefreshRunning;
  }

  public get isCancellable(): boolean {
    return (
      this.isMultiFeedRefreshRunning &&
      this.globalRefreshAbortController !== null
    );
  }

  public get isCancelled(): boolean {
    return this.isGlobalRefreshCancelled;
  }

  public get progress(): { completed: number; total: number } {
    return {
      completed: this.globalRefreshCompleted,
      total: this.globalRefreshTotal,
    };
  }

  public begin(total: number): AbortSignal | null {
    if (this.isMultiFeedRefreshRunning) {
      new Notice("A feed operation is already in progress.");
      return null;
    }

    this.isMultiFeedRefreshRunning = true;
    this.globalRefreshAbortController = new AbortController();
    this.isGlobalRefreshCancelled = false;
    this.globalRefreshTotal = total;
    this.globalRefreshCompleted = 0;
    void this.options.renderStatus();
    return this.globalRefreshAbortController.signal;
  }

  public async end(): Promise<void> {
    this.options.activeRefreshState.clear();
    this.isMultiFeedRefreshRunning = false;
    this.globalRefreshAbortController = null;
    this.isGlobalRefreshCancelled = false;
    this.globalRefreshTotal = 0;
    this.globalRefreshCompleted = 0;
    await this.options.renderStatus();
  }

  public cancel(): void {
    if (!this.isCancellable) return;
    this.isGlobalRefreshCancelled = true;
    this.options.onCancelled();
    this.globalRefreshAbortController?.abort();
    new Notice("Refresh stopped.");
  }

  public updateProgress(completed: number, total: number): void {
    this.globalRefreshCompleted = completed;
    this.globalRefreshTotal = total;
    void this.options.renderStatus();
  }

  /**
   * Takes the lock for a refresh batch and clears the feed statuses, without
   * the busy check, notice or redraw that `begin` has. Only a cancellable
   * batch resets the progress.
   */
  public startBatch(
    total: number,
    isCancellableIntent: boolean,
  ): AbortSignal | undefined {
    this.isMultiFeedRefreshRunning = true;
    this.options.activeRefreshState.clear();

    if (isCancellableIntent) {
      this.globalRefreshAbortController = new AbortController();
      this.isGlobalRefreshCancelled = false;
      this.globalRefreshTotal = total;
      this.globalRefreshCompleted = 0;
    } else {
      this.globalRefreshAbortController = null;
      this.isGlobalRefreshCancelled = false;
    }
    return this.globalRefreshAbortController?.signal;
  }

  /** Clears the feed statuses and releases the lock, and nothing else. */
  public markIdle(): void {
    this.options.activeRefreshState.clear();
    this.isMultiFeedRefreshRunning = false;
  }

  public recordSettled(): void {
    this.globalRefreshCompleted += 1;
  }

  public setFeedStatus(feedUrl: string, state: FeedRefreshState): void {
    this.options.activeRefreshState.set(feedUrl, state);
  }

  public clearFeedStatus(feedUrl: string): void {
    this.options.activeRefreshState.delete(feedUrl);
  }

  public get activeFeedCount(): number {
    return this.options.activeRefreshState.size;
  }

  public renderStatus(): Promise<void> {
    return this.options.renderStatus();
  }

  /** Coalesces sidebar-only status redraws without delaying final settlement. */
  public scheduleSidebarRender(flush = false): void {
    if (flush) {
      if (this.refreshStatusRenderTimeoutId !== null) {
        window.clearTimeout(this.refreshStatusRenderTimeoutId);
        this.refreshStatusRenderTimeoutId = null;
      }
      void this.options.renderSidebar();
      return;
    }

    if (this.refreshStatusRenderTimeoutId !== null) return;

    this.refreshStatusRenderTimeoutId = window.setTimeout(() => {
      this.refreshStatusRenderTimeoutId = null;
      void this.options.renderSidebar();
    }, FEED_REFRESH_RENDER_THROTTLE_MS);
  }

  public dispose(): void {
    if (this.refreshStatusRenderTimeoutId !== null) {
      window.clearTimeout(this.refreshStatusRenderTimeoutId);
      this.refreshStatusRenderTimeoutId = null;
    }
  }
}
