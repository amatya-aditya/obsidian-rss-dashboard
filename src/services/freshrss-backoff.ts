/**
 * Pure cross-cycle backoff calculation for the FreshRSS sync coordinator.
 *
 * In-cycle transient retry (see `freshrss-retry.ts`) already exhausts three
 * attempts per request before an "unavailable" result reaches the
 * coordinator. When a cycle still ends with at least one exhausted transient
 * failure, the NEXT cycle should not be attempted immediately -- automatic
 * triggers (ticket 08) rearm from the deadline this module computes instead
 * of spinning. A fully successful cycle (no exhausted transient failure)
 * resets the count to zero.
 */

/** Initial cycle backoff duration: 5 minutes. */
export const FRESHRSS_BACKOFF_INITIAL_MS = 5 * 60 * 1000;

/** Maximum cycle backoff duration: 6 hours. */
export const FRESHRSS_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

/**
 * Exponential backoff duration for the Nth (1-indexed) consecutive cycle
 * that ended with at least one exhausted transient failure, doubling from
 * `FRESHRSS_BACKOFF_INITIAL_MS` and capped at `FRESHRSS_BACKOFF_MAX_MS`.
 * Returns 0 for a non-positive count (no backoff owed).
 */
export function freshRssBackoffDurationMs(consecutiveFailureCount: number): number {
  if (consecutiveFailureCount <= 0) return 0;
  const durationMs =
    FRESHRSS_BACKOFF_INITIAL_MS * 2 ** (consecutiveFailureCount - 1);
  return Math.min(durationMs, FRESHRSS_BACKOFF_MAX_MS);
}

/**
 * Durable, safe-to-persist cross-cycle health state for one FreshRSS
 * connection scope. Contains only counts and timestamps -- no secret,
 * session, or token material.
 */
export interface FreshRssSyncHealth {
  /** Consecutive cycles ending with at least one exhausted transient failure. */
  consecutiveTransientFailureCount: number;
  /** Earliest time (ms epoch) an automatic cycle should next be attempted, or null if not backed off. */
  backoffUntilMs: number | null;
}

/** Health state for a connection scope that has never recorded a cycle outcome. */
export function initialFreshRssSyncHealth(): FreshRssSyncHealth {
  return { consecutiveTransientFailureCount: 0, backoffUntilMs: null };
}

/**
 * Computes the next cycle health state given whether THIS cycle ended with
 * at least one exhausted transient failure. A successful cycle (even if
 * partial for a non-transient reason, e.g. a budget-capped stream) resets
 * backoff; a cycle with an exhausted transient failure advances the count
 * and schedules the next eligible attempt from `nowMs`.
 */
export function nextFreshRssSyncHealth(
  previous: FreshRssSyncHealth,
  input: { transientFailureOccurred: boolean; nowMs: number },
): FreshRssSyncHealth {
  if (!input.transientFailureOccurred) {
    return initialFreshRssSyncHealth();
  }
  const consecutiveTransientFailureCount =
    previous.consecutiveTransientFailureCount + 1;
  return {
    consecutiveTransientFailureCount,
    backoffUntilMs:
      input.nowMs + freshRssBackoffDurationMs(consecutiveTransientFailureCount),
  };
}
