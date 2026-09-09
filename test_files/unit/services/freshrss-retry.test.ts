import { describe, expect, it, vi } from "vitest";
import {
  FRESHRSS_MAX_REQUEST_ATTEMPTS,
  createRetryingFreshRssHttpClient,
  freshRssRetryDelayMs,
  isFreshRssRetryableStatus,
} from "../../../src/services/freshrss-retry";
import type {
  FreshRssHttpClient,
  FreshRssHttpRequest,
  FreshRssHttpResponse,
} from "../../../src/services/freshrss-connection-service";

const request: FreshRssHttpRequest = { url: "https://example.test/x", method: "GET" };

function createUnderlyingClient(
  handler: (attempt: number) => FreshRssHttpResponse | Promise<FreshRssHttpResponse>,
): FreshRssHttpClient & { attempts: number } {
  let attempts = 0;
  const client = {
    get attempts() {
      return attempts;
    },
    request: async () => {
      const result = await handler(attempts);
      attempts++;
      return result;
    },
  };
  return client;
}

describe("FreshRSS in-cycle transient retry", () => {
  describe("isFreshRssRetryableStatus", () => {
    it("treats 408, 429, and every 5xx status as retryable", () => {
      expect(isFreshRssRetryableStatus(408)).toBe(true);
      expect(isFreshRssRetryableStatus(429)).toBe(true);
      expect(isFreshRssRetryableStatus(500)).toBe(true);
      expect(isFreshRssRetryableStatus(503)).toBe(true);
      expect(isFreshRssRetryableStatus(599)).toBe(true);
    });

    it("never treats auth rejection or a terminal mutation status as retryable here", () => {
      expect(isFreshRssRetryableStatus(200)).toBe(false);
      expect(isFreshRssRetryableStatus(401)).toBe(false);
      expect(isFreshRssRetryableStatus(403)).toBe(false);
      expect(isFreshRssRetryableStatus(400)).toBe(false);
      expect(isFreshRssRetryableStatus(404)).toBe(false);
      expect(isFreshRssRetryableStatus(422)).toBe(false);
    });
  });

  describe("freshRssRetryDelayMs", () => {
    it("uses the fixed 1s, 2s, 4s base delays for the first three attempt indices", () => {
      const noJitter = () => 0;
      expect(freshRssRetryDelayMs(0, noJitter)).toBe(1000);
      expect(freshRssRetryDelayMs(1, noJitter)).toBe(2000);
      expect(freshRssRetryDelayMs(2, noJitter)).toBe(4000);
    });

    it("adds bounded jitter strictly less than 250ms on top of the base delay", () => {
      expect(freshRssRetryDelayMs(0, () => 0.999)).toBeLessThan(1250);
      expect(freshRssRetryDelayMs(0, () => 0.999)).toBeGreaterThanOrEqual(1000);
    });
  });

  describe("createRetryingFreshRssHttpClient", () => {
    it("returns a successful response on the first attempt without sleeping", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const underlying = createUnderlyingClient(() => ({ status: 200, text: "ok" }));
      const client = createRetryingFreshRssHttpClient(underlying, { sleep });

      const response = await client.request(request);

      expect(response).toEqual({ status: 200, text: "ok" });
      expect(underlying.attempts).toBe(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("retries a retryable status up to the maximum attempt count, then returns the final result", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const underlying = createUnderlyingClient(() => ({ status: 503, text: "" }));
      const client = createRetryingFreshRssHttpClient(underlying, { sleep, random: () => 0 });

      const response = await client.request(request);

      expect(response).toEqual({ status: 503, text: "" });
      expect(underlying.attempts).toBe(FRESHRSS_MAX_REQUEST_ATTEMPTS);
      // Two sleeps: before the 2nd and 3rd attempts, never after the last.
      expect(sleep).toHaveBeenCalledTimes(FRESHRSS_MAX_REQUEST_ATTEMPTS - 1);
      expect(sleep).toHaveBeenNthCalledWith(1, 1000);
      expect(sleep).toHaveBeenNthCalledWith(2, 2000);
    });

    it("returns immediately on a non-retryable status without any further attempt", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const underlying = createUnderlyingClient(() => ({ status: 401, text: "" }));
      const client = createRetryingFreshRssHttpClient(underlying, { sleep });

      const response = await client.request(request);

      expect(response).toEqual({ status: 401, text: "" });
      expect(underlying.attempts).toBe(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("succeeds once a retryable failure is followed by a good response, without exhausting all attempts", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const underlying = createUnderlyingClient((attempt) =>
        attempt === 0 ? { status: 503, text: "" } : { status: 200, text: "recovered" },
      );
      const client = createRetryingFreshRssHttpClient(underlying, { sleep });

      const response = await client.request(request);

      expect(response).toEqual({ status: 200, text: "recovered" });
      expect(underlying.attempts).toBe(2);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it("retries a thrown network error and re-throws only after the final attempt", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      let attempts = 0;
      const underlying: FreshRssHttpClient = {
        request: async () => {
          attempts++;
          throw new Error("network failure");
        },
      };
      const client = createRetryingFreshRssHttpClient(underlying, { sleep });

      await expect(client.request(request)).rejects.toThrow("network failure");
      expect(attempts).toBe(FRESHRSS_MAX_REQUEST_ATTEMPTS);
      expect(sleep).toHaveBeenCalledTimes(FRESHRSS_MAX_REQUEST_ATTEMPTS - 1);
    });

    it("recovers from a thrown error on a later attempt", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      let attempts = 0;
      const underlying: FreshRssHttpClient = {
        request: async () => {
          attempts++;
          if (attempts === 1) throw new Error("timeout");
          return { status: 200, text: "ok" };
        },
      };
      const client = createRetryingFreshRssHttpClient(underlying, { sleep });

      const response = await client.request(request);

      expect(response).toEqual({ status: 200, text: "ok" });
      expect(attempts).toBe(2);
    });
  });
});
