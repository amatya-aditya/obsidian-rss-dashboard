/**
 * Small polling helper shared by `run-contract.mjs` to wait for FreshRSS
 * container readiness. Pure and injectable (caller supplies `now`/`delay`),
 * so it can be unit tested without real timers, Docker, or network access.
 */

/**
 * Repeatedly calls `check()` until it resolves truthy or `timeoutMs`
 * elapses. Returns `{ ready: true, result }` on success or
 * `{ ready: false, lastError }` on timeout. Never throws for an ordinary
 * "not ready yet" rejection from `check()` — those are recorded as
 * `lastError` and retried; only a timeout ends the loop unsuccessfully.
 *
 * @param {() => Promise<unknown>} check
 * @param {{
 *   timeoutMs: number,
 *   intervalMs: number,
 *   delay?: (ms: number) => Promise<void>,
 *   now?: () => number,
 * }} options
 */
export async function waitFor(check, options) {
  const { timeoutMs, intervalMs } = options;
  const delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());

  const deadline = now() + timeoutMs;
  let lastError;

  while (now() < deadline) {
    try {
      const result = await check();
      if (result) {
        return { ready: true, result };
      }
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  return { ready: false, lastError };
}
