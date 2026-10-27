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
import { proxyHealth } from "../../../src/utils/proxy-health";
import { resolveProxyPrefixes } from "../../../src/utils/proxy-utils";

const fetchMock = vi.mocked(robustFetchDetailed);
const ARTICLE = `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p></article></body></html>`;

describe("full-article fetch timeout (#928, #954)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
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
      failureReason: "timeout",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("shares the direct request's remaining budget with a hung proxy", async () => {
    let finishDirect!: (value: { text: string; status: number }) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (finishDirect = resolve)))
      .mockReturnValue(new Promise(() => {}));
    const results: unknown[] = [];
    const promise = fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "auto",
      5,
    );
    void promise.then((result) => results.push(result));
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishDirect({ text: "", status: 200 });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(results).toEqual([
      { content: "", failureType: "network", failureReason: "timeout" },
    ]);
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tries proxies sequentially while time remains and stops at the shared deadline", async () => {
    const resolvers: ((value: { text: string; status: number }) => void)[] = [];
    fetchMock.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const results: unknown[] = [];
    void fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "auto",
      1,
    ).then((result) => results.push(result));
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolvers[0]({ text: "", status: 200 });
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolvers[1]({ text: "", status: 200 });
    await vi.advanceTimersByTimeAsync(599);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(results).toEqual([
      { content: "", failureType: "network", failureReason: "timeout" },
    ]);
    resolvers[2]({ text: ARTICLE, status: 200 });
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains restricted signals and publisher metadata when a later proxy times out", async () => {
    const restricted = `<html lang="de"><head><meta name="description" content="Publisher description"></head><body>subscription required ${"x".repeat(220)}</body></html>`;
    fetchMock
      .mockResolvedValueOnce({ text: "", status: 200 })
      .mockResolvedValueOnce({ text: restricted, status: 403 })
      .mockReturnValue(new Promise(() => {}));
    const results: unknown[] = [];
    void fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "auto",
      1,
    ).then((result) => results.push(result));
    await vi.advanceTimersByTimeAsync(1000);
    expect(results).toEqual([
      expect.objectContaining({
        content: "",
        failureType: "restricted",
        failureReason: "timeout",
        pageMetadata: expect.objectContaining({
          htmlLang: "de",
          metaDescription: "Publisher description",
        }),
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps a challenge block reported when a later proxy times out (#1347)", async () => {
    const challenge = `<html><head><title>Just a moment...</title></head><body>cf-challenge ${"x".repeat(220)}</body></html>`;
    fetchMock
      .mockResolvedValueOnce({ text: challenge, status: 403 })
      .mockReturnValueOnce(new Promise(() => {}));
    const promise = fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "https://proxy.test/?u=",
      1,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({
      content: "",
      failureType: "network",
      failureReason: "blocked",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not launch a proxy when processing a blocked response exhausts the budget", async () => {
    fetchMock
      .mockImplementationOnce(() => {
        vi.setSystemTime(Date.now() + 1000);
        return Promise.resolve({ text: "", status: 200 });
      })
      .mockResolvedValue({ text: ARTICLE, status: 200 });
    const result = await fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "auto",
      1,
    );
    expect(result).toMatchObject({ content: "", failureReason: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows a proxy to succeed within the shared budget without changing request headers", async () => {
    let finishDirect!: (value: { text: string; status: number }) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (finishDirect = resolve)))
      .mockResolvedValueOnce({ text: ARTICLE, status: 200 });
    const promise = fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "auto",
      5,
    );
    await vi.advanceTimersByTimeAsync(4000);
    finishDirect({ text: "", status: 200 });
    const result = await promise;
    expect(result.failureType).toBe("none");
    expect(result.failureReason).toBeUndefined();
    expect(result.content).toContain("Real article text.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toEqual(fetchMock.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a direct restricted response's metadata when its proxy hangs", async () => {
    const restricted = `<html lang="fr"><head><meta name="description" content="Original publisher description"></head><body>subscription required ${"x".repeat(220)}</body></html>`;
    fetchMock
      .mockResolvedValueOnce({ text: restricted, status: 403 })
      .mockReturnValueOnce(new Promise(() => {}));
    const promise = fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "https://proxy.test/?u=",
      1,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({
      content: "",
      failureType: "restricted",
      failureReason: "timeout",
      pageMetadata: {
        htmlLang: "fr",
        metaDescription: "Original publisher description",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to 10 seconds for a missing, zero, negative or invalid value", () => {
    for (const bad of [undefined, 0, -5, Number.NaN]) {
      expect(resolveFetchTimeoutMs(bad)).toBe(10000);
    }
    expect(resolveFetchTimeoutMs(25)).toBe(25000);
  });
});

describe("proxy health ordering in the full-article fetch (#955)", () => {
  const URL_UNDER_TEST = "https://example.com/a";
  const BLOCKED = { text: "", status: 200 };
  const RAW_PROXIES = resolveProxyPrefixes("auto", { rawBodyOnly: true });
  const requested = () => fetchMock.mock.calls.map(([target]) => target);

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts the next article with a different proxy after one hung", async () => {
    fetchMock
      .mockResolvedValueOnce(BLOCKED)
      .mockReturnValueOnce(new Promise(() => {}));
    const hung = fetchWithProxyFallbackDetailed(URL_UNDER_TEST, "auto", 10);
    await vi.advanceTimersByTimeAsync(10000);
    await expect(hung).resolves.toMatchObject({ failureReason: "timeout" });
    expect(requested()[1]).toContain(RAW_PROXIES[0]);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(BLOCKED)
      .mockResolvedValueOnce({ text: ARTICLE, status: 200 });
    const result = await fetchWithProxyFallbackDetailed(
      URL_UNDER_TEST,
      "auto",
      10,
    );

    expect(result.failureType).toBe("none");
    expect(requested()).toHaveLength(2);
    expect(requested()[1]).toContain(RAW_PROXIES[1]);
  });

  it("skips a proxy that has hung three times for its cooldown", async () => {
    for (let i = 0; i < 3; i++) {
      proxyHealth.record(RAW_PROXIES[0], "failure", 10000);
    }
    fetchMock
      .mockResolvedValueOnce(BLOCKED)
      .mockResolvedValueOnce({ text: ARTICLE, status: 200 });

    await fetchWithProxyFallbackDetailed(URL_UNDER_TEST, "auto", 10);

    expect(requested().join("\n")).not.toContain(RAW_PROXIES[0]);
    expect(requested()[1]).toContain(RAW_PROXIES[1]);
  });

  it("skips a proxy whose requests keep failing on DNS", async () => {
    fetchMock.mockImplementation((target) => {
      if (target === URL_UNDER_TEST) return Promise.resolve(BLOCKED);
      if (target.startsWith(RAW_PROXIES[0])) {
        return Promise.reject(new Error("net::ERR_NAME_NOT_RESOLVED"));
      }
      return Promise.resolve({ text: ARTICLE, status: 200 });
    });
    for (let i = 0; i < 3; i++) {
      await fetchWithProxyFallbackDetailed(URL_UNDER_TEST, "auto", 10);
    }

    fetchMock.mockClear();
    await fetchWithProxyFallbackDetailed(URL_UNDER_TEST, "auto", 10);

    expect(requested()).toHaveLength(2);
    expect(requested()[1]).toContain(RAW_PROXIES[1]);
  });

  it("does not penalise a proxy for the site's own 403", async () => {
    const forbidden = Object.assign(new Error("Request failed, status 403"), {
      status: 403,
    });
    fetchMock.mockImplementation((target) =>
      target === URL_UNDER_TEST
        ? Promise.resolve(BLOCKED)
        : Promise.reject(forbidden),
    );
    for (let i = 0; i < 4; i++) {
      await fetchWithProxyFallbackDetailed(URL_UNDER_TEST, "auto", 10);
    }

    fetchMock.mockClear();
    await fetchWithProxyFallbackDetailed(URL_UNDER_TEST, "auto", 10);

    expect(requested()[1]).toContain(RAW_PROXIES[0]);
  });

  it("does not penalise a proxy when the direct request had already used the budget", async () => {
    let finishDirect!: (value: { text: string; status: number }) => void;
    for (let i = 0; i < 3; i++) {
      fetchMock.mockReset();
      fetchMock
        .mockReturnValueOnce(new Promise((resolve) => (finishDirect = resolve)))
        .mockReturnValueOnce(new Promise(() => {}));
      const pending = fetchWithProxyFallbackDetailed(
        URL_UNDER_TEST,
        "auto",
        10,
      );
      await vi.advanceTimersByTimeAsync(9000);
      finishDirect(BLOCKED);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toMatchObject({
        failureReason: "timeout",
      });
    }

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(BLOCKED)
      .mockResolvedValueOnce({ text: ARTICLE, status: 200 });
    await fetchWithProxyFallbackDetailed(URL_UNDER_TEST, "auto", 10);

    expect(requested()[1]).toContain(RAW_PROXIES[0]);
  });

  it("still tries the proxies when every one is benched, least recently failed first", async () => {
    const failureOrder = [2, 0, 1, 3];
    for (const index of failureOrder) {
      for (let i = 0; i < 3; i++) {
        proxyHealth.record(RAW_PROXIES[index], "failure", 100);
      }
      await vi.advanceTimersByTimeAsync(1000);
    }
    fetchMock
      .mockResolvedValueOnce(BLOCKED)
      .mockResolvedValueOnce({ text: ARTICLE, status: 200 });

    const result = await fetchWithProxyFallbackDetailed(
      URL_UNDER_TEST,
      "auto",
      10,
    );

    expect(result.failureType).toBe("none");
    expect(requested()[1]).toContain(RAW_PROXIES[2].replace(/\/$/, ""));
  });

  it("never benches a single configured proxy", async () => {
    const custom = "https://proxy.test/?u=";
    fetchMock.mockImplementation((target) =>
      target === URL_UNDER_TEST
        ? Promise.resolve(BLOCKED)
        : Promise.reject(new Error("getaddrinfo ENOTFOUND proxy.test")),
    );
    for (let i = 0; i < 5; i++) {
      await fetchWithProxyFallbackDetailed(URL_UNDER_TEST, custom, 10);
    }

    expect(requested().filter((t) => t.startsWith(custom))).toHaveLength(5);
  });
});
