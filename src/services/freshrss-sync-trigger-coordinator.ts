/**
 * Every source that can start a FreshRSS sync cycle: an app-startup attempt
 * once hydration completes, the dedicated automatic-sync timer waking up, the
 * user's manual "Sync now" action, an explicit user-initiated retry (e.g. of
 * a blocked/backed-off state), and the bounded per-feed "Fetch more history"
 * action (ticket 10). "manual"/"retry"/"fetch-more-history" always report a
 * summary notice; "startup"/"timer" stay quiet unless the durable outcome
 * changes -- see the coordinator caller for that split. Every one of the five
 * enters through this same coordinator, never a parallel invocation path.
 */
export type FreshRssSyncTriggerKind =
  | "startup"
  | "timer"
  | "manual"
  | "retry"
  | "fetch-more-history";

export interface FreshRssSyncTriggerCoordinatorDeps {
  /**
   * Runs exactly one FreshRSS sync cycle attempt for the given trigger kind.
   * `feedId` is present only for "fetch-more-history" -- the one
   * FreshRSS-linked feed this invocation extends (ticket 10) -- and is
   * ignored for every other kind.
   */
  runCycle: (trigger: FreshRssSyncTriggerKind, feedId?: string) => Promise<void>;
}

/**
 * Serializes every FreshRSS sync trigger into at most one active cycle plus
 * at most one trailing queued cycle -- never an unbounded queue and never two
 * concurrent cycles. A trigger arriving while a cycle is already running
 * coalesces into that single trailing slot; further triggers arriving before
 * the trailing cycle starts replace what it will report on rather than
 * stacking up additional runs. A manual, retry, or fetch-more-history trigger
 * coalesced alongside an automatic one wins the slot, so a user waiting on an
 * explicit action still gets it serviced (and reported) promptly rather than
 * silently folded into a quiet automatic attempt.
 */
export class FreshRssSyncTriggerCoordinator {
  private running = false;
  private pendingTrigger: FreshRssSyncTriggerKind | null = null;
  private pendingFeedId: string | undefined = undefined;
  private pendingWaiters: Array<() => void> = [];

  constructor(private readonly deps: FreshRssSyncTriggerCoordinatorDeps) {}

  public get isRunning(): boolean {
    return this.running;
  }

  /**
   * Requests a cycle for `kind`. Resolves once a cycle that services this
   * request (the immediate run, or the trailing coalesced run it was folded
   * into) has completed. `feedId` is meaningful only for
   * "fetch-more-history"; see `FreshRssSyncTriggerCoordinatorDeps.runCycle`.
   */
  public trigger(kind: FreshRssSyncTriggerKind, feedId?: string): Promise<void> {
    if (this.running) {
      if (
        this.pendingTrigger === null ||
        kind === "manual" ||
        kind === "retry" ||
        kind === "fetch-more-history"
      ) {
        this.pendingTrigger = kind;
        this.pendingFeedId = feedId;
      }
      return new Promise((resolve) => {
        this.pendingWaiters.push(resolve);
      });
    }
    return this.runAndDrain(kind, feedId);
  }

  private async runAndDrain(kind: FreshRssSyncTriggerKind, feedId?: string): Promise<void> {
    this.running = true;
    try {
      await this.deps.runCycle(kind, feedId);
    } finally {
      this.running = false;
    }

    const next = this.pendingTrigger;
    const nextFeedId = this.pendingFeedId;
    this.pendingTrigger = null;
    this.pendingFeedId = undefined;
    const waiters = this.pendingWaiters;
    this.pendingWaiters = [];

    if (next === null) {
      waiters.forEach((resolve) => resolve());
      return;
    }

    // The trailing run may itself coalesce further triggers before it
    // finishes; every waiter gathered up to this point resolves once THAT
    // run completes, matching "at most one trailing cycle" rather than
    // resolving early against stale state.
    await this.runAndDrain(next, nextFeedId);
    waiters.forEach((resolve) => resolve());
  }
}
