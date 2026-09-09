import type {
  FreshRssHttpClient,
  FreshRssHttpRequest,
  FreshRssHttpResponse,
} from "./freshrss-connection-service";

/**
 * In-cycle transient-failure retry for the FreshRSS protocol transport.
 *
 * Decorating at the `FreshRssHttpClient` boundary means every FreshRSS
 * request issued through a decorated client -- login, authenticated reads,
 * and idempotent absolute-state mutations alike -- receives the same bounded
 * retry behavior without `FreshRssSyncClient` or `FreshRssConnectionService`
 * needing to know about it.
 */

/** Total attempts per request: the first attempt plus two in-cycle retries. */
export const FRESHRSS_MAX_REQUEST_ATTEMPTS = 3;

/** Fixed per-attempt base delay (ms) before bounded jitter: 1s, then 2s, then 4s. */
const FRESHRSS_RETRY_BASE_DELAYS_MS = [1000, 2000, 4000];

/** Upper bound (ms, exclusive) of the random jitter added to each retry delay. */
const FRESHRSS_RETRY_JITTER_MS = 250;

export type FreshRssSleep = (ms: number) => Promise<void>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * True for the HTTP statuses this client treats as safe to retry: request
 * timeout, rate limiting, and server errors. Every other status (including
 * 401/403 auth rejection and 400/404/422 terminal mutation errors) is never
 * retried here -- those follow their own dedicated recovery paths.
 */
export function isFreshRssRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * The delay before the retry attempt at `attemptIndex` (0 for the delay
 * before the first retry, 1 for the delay before the second): the fixed
 * base for that attempt, plus bounded random jitter so concurrent clients
 * do not retry in lockstep.
 */
export function freshRssRetryDelayMs(
  attemptIndex: number,
  random: () => number = Math.random,
): number {
  const base =
    FRESHRSS_RETRY_BASE_DELAYS_MS[
      Math.min(attemptIndex, FRESHRSS_RETRY_BASE_DELAYS_MS.length - 1)
    ];
  return base + Math.floor(random() * FRESHRSS_RETRY_JITTER_MS);
}

export interface FreshRssRetryDeps {
  /** Injectable delay, primarily so tests can assert without waiting in real time. */
  sleep?: FreshRssSleep;
  /** Injectable jitter source, primarily so tests can assert exact delays. */
  random?: () => number;
}

/**
 * Wraps a `FreshRssHttpClient` so every request receives at most
 * `FRESHRSS_MAX_REQUEST_ATTEMPTS` attempts. A thrown error (network failure
 * or timeout) or a retryable HTTP status (408, 429, 5xx) is retried after a
 * bounded delay of 1s, then 2s, then 4s plus jitter. Every other outcome --
 * including a non-retryable error status -- is returned immediately on the
 * first attempt, and the final attempt's result (success, thrown error, or
 * still-retryable status) is always returned/thrown rather than retried
 * further.
 */
export function createRetryingFreshRssHttpClient(
  httpClient: FreshRssHttpClient,
  deps: FreshRssRetryDeps = {},
): FreshRssHttpClient {
  const sleep = deps.sleep ?? defaultSleep;
  return {
    async request(request: FreshRssHttpRequest): Promise<FreshRssHttpResponse> {
      for (let attempt = 0; attempt < FRESHRSS_MAX_REQUEST_ATTEMPTS; attempt++) {
        const isLastAttempt = attempt === FRESHRSS_MAX_REQUEST_ATTEMPTS - 1;
        try {
          const response = await httpClient.request(request);
          if (isLastAttempt || !isFreshRssRetryableStatus(response.status)) {
            return response;
          }
        } catch (error) {
          if (isLastAttempt) {
            throw error;
          }
        }
        await sleep(freshRssRetryDelayMs(attempt, deps.random));
      }
      // Unreachable: the loop above always returns or throws on the last attempt.
      throw new Error("FreshRSS retry loop exited without a result.");
    },
  };
}
