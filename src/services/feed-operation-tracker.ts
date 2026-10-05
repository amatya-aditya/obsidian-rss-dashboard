import { Notice, type App } from "obsidian";
import type { FeedRefreshState } from "../types/types";

/** Refresh status redraws during a refresh batch run at most this often. */
export const FEED_REFRESH_RENDER_THROTTLE_MS = 250;

export interface CancellableTimeout {
  promise: Promise<"timeout" | "cancelled">;
  cancel: () => void;
}

export interface TrackedOperation {
  signal: AbortSignal;
  release: () => void;
}

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
 * Tracks global feed-operation progress and status, independently cancellable
 * refresh work, and the coalesced sidebar redraws that report it.
 */
export class FeedOperationTracker {
  private isMultiFeedRefreshRunning = false;
  private isGlobalRefreshCancelled = false;
  private globalRefreshAbortController: AbortController | null = null;
  private activeOperationAbortController: AbortController | null = null;
  private readonly activeOperationControllers = new Set<AbortController>();
  private globalRefreshTotal = 0;
  private globalRefreshCompleted = 0;
  private refreshStatusRenderTimeoutId: number | null = null;
  private disposed = false;

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
      this.globalRefreshAbortController !== null &&
      !this.disposed
    );
  }

  public get isCancelled(): boolean {
    return this.isGlobalRefreshCancelled;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public get progress(): { completed: number; total: number } {
    return {
      completed: this.globalRefreshCompleted,
      total: this.globalRefreshTotal,
    };
  }

  public begin(total: number): AbortSignal | null {
    if (this.disposed) return null;
    if (this.isMultiFeedRefreshRunning) {
      new Notice("A feed operation is already in progress.");
      return null;
    }

    this.isMultiFeedRefreshRunning = true;
    this.globalRefreshAbortController = new AbortController();
    this.activeOperationAbortController = this.globalRefreshAbortController;
    this.activeOperationControllers.add(this.globalRefreshAbortController);
    this.isGlobalRefreshCancelled = false;
    this.globalRefreshTotal = total;
    this.globalRefreshCompleted = 0;
    void this.renderStatus();
    return this.globalRefreshAbortController.signal;
  }

  public async end(): Promise<void> {
    if (this.activeOperationAbortController) {
      this.activeOperationControllers.delete(
        this.activeOperationAbortController,
      );
    }
    this.options.activeRefreshState.clear();
    this.isMultiFeedRefreshRunning = false;
    this.globalRefreshAbortController = null;
    this.activeOperationAbortController = null;
    this.isGlobalRefreshCancelled = this.disposed;
    this.globalRefreshTotal = 0;
    this.globalRefreshCompleted = 0;
    if (!this.disposed) await this.options.renderStatus();
  }

  public cancel(): void {
    if (this.disposed || !this.isCancellable) return;
    this.isGlobalRefreshCancelled = true;
    this.options.onCancelled();
    this.globalRefreshAbortController?.abort();
    new Notice("Refresh stopped.");
  }

  public updateProgress(completed: number, total: number): void {
    if (this.disposed) return;
    this.globalRefreshCompleted = completed;
    this.globalRefreshTotal = total;
    void this.renderStatus();
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
    if (this.disposed) return undefined;
    this.isMultiFeedRefreshRunning = true;
    this.options.activeRefreshState.clear();
    const controller = new AbortController();
    this.activeOperationAbortController = controller;
    this.activeOperationControllers.add(controller);
    this.globalRefreshAbortController = isCancellableIntent ? controller : null;
    this.isGlobalRefreshCancelled = false;
    if (isCancellableIntent) {
      this.globalRefreshTotal = total;
      this.globalRefreshCompleted = 0;
    }
    return controller.signal;
  }

  /** Tracks independent work so unload can abort it without taking the global-operation lock. */
  public trackOperation(): TrackedOperation {
    const controller = new AbortController();
    if (this.disposed) {
      controller.abort();
    } else {
      this.activeOperationControllers.add(controller);
    }

    let released = false;
    return {
      signal: controller.signal,
      release: () => {
        if (released) return;
        released = true;
        this.activeOperationControllers.delete(controller);
      },
    };
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
    if (this.disposed) return;
    this.options.activeRefreshState.set(feedUrl, state);
  }

  public clearFeedStatus(feedUrl: string): void {
    this.options.activeRefreshState.delete(feedUrl);
  }

  public get activeFeedCount(): number {
    return this.options.activeRefreshState.size;
  }

  public renderStatus(): Promise<void> {
    return this.disposed ? Promise.resolve() : this.options.renderStatus();
  }

  /** Coalesces sidebar-only status redraws without delaying final settlement. */
  public scheduleSidebarRender(flush = false): void {
    if (this.disposed) return;
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

  public createSoftTimeout(
    delayMs: number,
    signal?: AbortSignal,
  ): CancellableTimeout {
    let timeoutId: number | null = null;
    let abortHandler: (() => void) | null = null;
    let finish: (result: "timeout" | "cancelled") => void = () => {};
    const promise = new Promise<"timeout" | "cancelled">((resolve) => {
      finish = (result) => {
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
      timeoutId = window.setTimeout(() => finish("timeout"), delayMs);
      if (signal) {
        abortHandler = () => finish("cancelled");
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });
    return {
      promise,
      cancel: () => finish("cancelled"),
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.isGlobalRefreshCancelled = true;
    for (const controller of this.activeOperationControllers)
      controller.abort();
    this.activeOperationControllers.clear();
    if (this.refreshStatusRenderTimeoutId !== null) {
      window.clearTimeout(this.refreshStatusRenderTimeoutId);
      this.refreshStatusRenderTimeoutId = null;
    }
  }
}
