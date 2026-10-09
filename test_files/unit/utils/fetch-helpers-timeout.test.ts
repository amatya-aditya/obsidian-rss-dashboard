import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
}));

import { robustFetchDetailed } from "../../../src/utils/platform-utils";
import {
  fetchWithProxyFallbackDetailed,
  resolveFetchTimeoutMs,
} from "../../../src/utils/fetch-helpers";

const fetchMock = vi.mocked(robustFetchDetailed);
const ARTICLE = `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p></article></body></html>`;

describe("full-article fetch timeout (#928)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a network failure when the direct request hangs past the configured seconds", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const promise = fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      undefined,
      5,
    );
    await vi.advanceTimersByTimeAsync(4999);
    let settled = false;
    void promise.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toMatchObject({
      content: "",
      failureType: "network",
    });
  });

  it("times out a hung proxy fallback request", async () => {
    fetchMock
      .mockResolvedValueOnce({ text: "", status: 200 })
      .mockReturnValueOnce(new Promise(() => {}));
    const promise = fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "https://proxy.test/?u=",
      3,
    );
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toMatchObject({
      content: "",
      failureType: "network",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("leaves a fast request unaffected and clears the timer", async () => {
    fetchMock.mockResolvedValue({ text: ARTICLE, status: 200 });
    const result = await fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      undefined,
      5,
    );
    expect(result.failureType).toBe("none");
    expect(result.content).toContain("Real article text.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to 10 seconds for a missing, zero, negative or invalid value", () => {
    for (const bad of [undefined, 0, -5, Number.NaN]) {
      expect(resolveFetchTimeoutMs(bad)).toBe(10000);
    }
    expect(resolveFetchTimeoutMs(25)).toBe(25000);
  });
});
