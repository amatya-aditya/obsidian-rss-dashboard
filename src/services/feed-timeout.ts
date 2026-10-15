export const FEED_REQUEST_TIMEOUT_MS = 30000;
export const BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS = 30000;
export const FEED_SOFT_TIMEOUT_MS = 5000;
export const MAX_CONCURRENT_FETCHES = 8;
export const BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT = 0;
export const BACKGROUND_IMPORT_CONCURRENCY = 2;

/**
 * The error text a timed-out or cancelled fetch reports. The refresh tally and
 * the background importer key on this exact string, so it is defined once.
 */
export const TIMED_OUT_MESSAGE = "Timed out";

/**
 * Throw the shared timeout error when a fetch has been cancelled. A sequence
 * calls this before each request and again after its final one, so a cancelled
 * run reports the cancellation instead of the step's own failure error.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(TIMED_OUT_MESSAGE);
}
