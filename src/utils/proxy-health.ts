/**
 * Session-only record of how the built-in CORS proxies are doing (#955).
 *
 * It learns from the full-article fetches the user already makes: no test
 * requests are sent, and nothing is persisted, so a restart forgets it. A proxy
 * that fails at the network level several times in a row is skipped for a
 * cooldown, then given one trial request; the rest are tried fastest and most
 * reliable first.
 */

/**
 * `neutral` is a site-level answer (a 403, a bot challenge, a paywall): the
 * proxy did its job, so it is neither credited nor blamed.
 */
export type ProxyOutcome = "success" | "failure" | "neutral";

const WINDOW_SIZE = 10;
const FAILURES_BEFORE_BENCH = 3;
const BASE_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_COOLDOWN_MS = 60 * 60 * 1000;
/** Where a proxy with no recorded attempts ranks between good and failing ones. */
const UNKNOWN_SUCCESS_RATE = 0.5;

interface Sample {
  ok: boolean;
  durationMs: number;
}

interface ProxyState {
  samples: Sample[];
  consecutiveFailures: number;
  benchedUntil: number;
  lastFailureAt: number;
  trialInFlight: boolean;
}

function successRate(state: ProxyState | undefined): number {
  if (!state || state.samples.length === 0) return UNKNOWN_SUCCESS_RATE;
  return state.samples.filter((s) => s.ok).length / state.samples.length;
}

function meanSuccessMs(state: ProxyState | undefined): number {
  const wins = state?.samples.filter((s) => s.ok) ?? [];
  if (wins.length === 0) return Number.POSITIVE_INFINITY;
  return wins.reduce((sum, s) => sum + s.durationMs, 0) / wins.length;
}

export class ProxyHealthTracker {
  private readonly states = new Map<string, ProxyState>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /**
   * The prefixes to try, in order. Benched proxies are left out, and proxies
   * whose cooldown has ended (trial candidates) come after the healthy ones so
   * a probably-dead proxy cannot use up the budget ahead of a good one. When
   * every proxy is benched they are all returned, least recently failed first.
   */
  order(prefixes: string[]): string[] {
    const now = this.now();
    const indexed = prefixes.map((prefix, index) => ({ prefix, index }));
    const status = (prefix: string): "healthy" | "trial" | "benched" => {
      const state = this.states.get(prefix);
      if (!state || state.consecutiveFailures < FAILURES_BEFORE_BENCH) {
        return "healthy";
      }
      return now < state.benchedUntil ? "benched" : "trial";
    };
    const lastFailure = (prefix: string) =>
      this.states.get(prefix)?.lastFailureAt ?? 0;

    const healthy = indexed
      .filter((p) => status(p.prefix) === "healthy")
      .sort(
        (a, b) =>
          successRate(this.states.get(b.prefix)) -
            successRate(this.states.get(a.prefix)) ||
          meanSuccessMs(this.states.get(a.prefix)) -
            meanSuccessMs(this.states.get(b.prefix)) ||
          a.index - b.index,
      );
    const trials = indexed
      .filter((p) => status(p.prefix) === "trial")
      .sort(
        (a, b) =>
          lastFailure(a.prefix) - lastFailure(b.prefix) || a.index - b.index,
      );
    if (healthy.length + trials.length > 0) {
      return [...healthy, ...trials].map((p) => p.prefix);
    }
    return indexed
      .sort(
        (a, b) =>
          lastFailure(a.prefix) - lastFailure(b.prefix) || a.index - b.index,
      )
      .map((p) => p.prefix);
  }

  /**
   * Claims the attempt. A proxy past its cooldown allows one trial at a time, so
   * a second concurrent fetch skips it. `force` is for a caller that would
   * otherwise make no attempt at all.
   */
  beginAttempt(prefix: string, options: { force?: boolean } = {}): boolean {
    const state = this.states.get(prefix);
    const onTrial =
      state !== undefined &&
      state.consecutiveFailures >= FAILURES_BEFORE_BENCH &&
      this.now() >= state.benchedUntil;
    if (!onTrial) return true;
    if (state.trialInFlight && !options.force) return false;
    state.trialInFlight = true;
    return true;
  }

  /**
   * Records how an attempt ended. Returns the cooldown in milliseconds when
   * this result benched the proxy, so the caller can log it.
   */
  record(
    prefix: string,
    outcome: ProxyOutcome,
    durationMs: number,
  ): number | undefined {
    const state = this.stateFor(prefix);
    state.trialInFlight = false;
    if (outcome === "neutral") return undefined;

    state.samples.push({ ok: outcome === "success", durationMs });
    if (state.samples.length > WINDOW_SIZE) state.samples.shift();

    if (outcome === "success") {
      state.consecutiveFailures = 0;
      state.benchedUntil = 0;
      return undefined;
    }

    const now = this.now();
    state.consecutiveFailures += 1;
    state.lastFailureAt = now;
    if (state.consecutiveFailures < FAILURES_BEFORE_BENCH) return undefined;
    const cooldown = Math.min(
      BASE_COOLDOWN_MS *
        2 ** (state.consecutiveFailures - FAILURES_BEFORE_BENCH),
      MAX_COOLDOWN_MS,
    );
    state.benchedUntil = now + cooldown;
    return cooldown;
  }

  /** Forgets every recorded result. */
  clear(): void {
    this.states.clear();
  }

  private stateFor(prefix: string): ProxyState {
    let state = this.states.get(prefix);
    if (!state) {
      state = {
        samples: [],
        consecutiveFailures: 0,
        benchedUntil: 0,
        lastFailureAt: 0,
        trialInFlight: false,
      };
      this.states.set(prefix, state);
    }
    return state;
  }
}

/** The one tracker shared by every full-article fetch in this session. */
export const proxyHealth = new ProxyHealthTracker();

/** Forgets every recorded result; used by tests. */
export function resetProxyHealth(): void {
  proxyHealth.clear();
}
