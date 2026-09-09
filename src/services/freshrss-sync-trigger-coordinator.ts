/**
 * Every source that can start a FreshRSS sync cycle: an app-startup attempt
 * once hydration completes, the dedicated automatic-sync timer waking up, the
 * user's manual "Sync now" action, and an explicit user-initiated retry (e.g.
 * of a blocked/backed-off state). All four are deliberately named here even
 * though only two behaviors exist ("manual"/"retry" always report a summary
 * notice; "startup"/"timer" stay quiet unless the durable outcome changes) --
 * see the coordinator caller for that split. Every one of the four enters
 * through this same coordinator, never a parallel invocation path.
 */
export type FreshRssSyncTriggerKind = "startup" | "timer" | "manual" | "retry";

export interface FreshRssSyncTriggerCoordinatorDeps {
  /** Runs exactly one FreshRSS sync cycle attempt for the given trigger kind. */
  runCycle: (trigger: FreshRssSyncTriggerKind) => Promise<void>;
}

/**
 * Serializes every FreshRSS sync trigger into at most one active cycle plus
 * at most one trailing queued cycle -- never an unbounded queue and never two
 * concurrent cycles. A trigger arriving while a cycle is already running
 * coalesces into that single trailing slot; further triggers arriving before
 * the trailing cycle starts replace what it will report on rather than
 * stacking up additional runs. A manual or retry trigger coalesced alongside
 * an automatic one wins the slot, so a user waiting on an explicit action
 * still gets it serviced (and reported) promptly rather than silently folded
 * into a quiet automatic attempt.
 */
export class FreshRssSyncTriggerCoordinator {
  private running = false;
  private pendingTrigger: FreshRssSyncTriggerKind | null = null;
  private pendingWaiters: Array<() => void> = [];

  constructor(private readonly deps: FreshRssSyncTriggerCoordinatorDeps) {}

  public get isRunning(): boolean {
    return this.running;
  }

  /**
   * Requests a cycle for `kind`. Resolves once a cycle that services this
   * request (the immediate run, or the trailing coalesced run it was folded
   * into) has completed.
   */
  public trigger(kind: FreshRssSyncTriggerKind): Promise<void> {
    if (this.running) {
      if (this.pendingTrigger === null || kind === "manual" || kind === "retry") {
        this.pendingTrigger = kind;
      }
      return new Promise((resolve) => {
        this.pendingWaiters.push(resolve);
      });
    }
    return this.runAndDrain(kind);
  }

  private async runAndDrain(kind: FreshRssSyncTriggerKind): Promise<void> {
    this.running = true;
    try {
      await this.deps.runCycle(kind);
    } finally {
      this.running = false;
    }

    const next = this.pendingTrigger;
    this.pendingTrigger = null;
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
    await this.runAndDrain(next);
    waiters.forEach((resolve) => resolve());
  }
}
