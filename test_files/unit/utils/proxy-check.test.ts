import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEED_SOFT_TIMEOUT_MS } from "../../../src/services/feed-timeout";
import {
  PROXY_CHECK_FAST_MS,
  PROXY_CHECK_TARGET_URL,
  PROXY_CHECK_TIMEOUT_MS,
  ProxyCheckStore,
  buildProxyCheckCandidates,
  fastestProxyCheckIndex,
  formatProxyCheckElapsed,
  proxyCheckCandidateLabel,
  proxyCheckStatusLabel,
  resolveSelectedProxyState,
  runProxyCheck,
  type ProxyCheckCandidate,
  type ProxyCheckResponse,
} from "../../../src/utils/proxy-check";
import { PREDEFINED_PROXIES } from "../../../src/utils/proxy-utils";

const ENCODED_TARGET = encodeURIComponent(PROXY_CHECK_TARGET_URL);
const BODY = "<html><body>Example Domain</body></html>";

const ALL_ORIGINS_RAW: ProxyCheckCandidate = {
  label: "AllOrigins (Raw)",
  prefix: "https://api.allorigins.win/raw?url=",
};
const CODE_TABS: ProxyCheckCandidate = {
  label: "CodeTabs",
  prefix: "https://api.codetabs.com/v1/proxy/?quest=",
};

/** A fetch that answers with `status` and `text` after advancing the fake clock. */
function answers(
  text: string = BODY,
  status = 200,
  elapsedMs = 0,
): (url: string) => Promise<ProxyCheckResponse> {
  return () => {
    if (elapsedMs > 0) vi.setSystemTime(Date.now() + elapsedMs);
    return Promise.resolve({ status, text });
  };
}

/** A fetch that never answers, so only the shared deadline can settle it. */
function neverAnswers(): () => Promise<ProxyCheckResponse> {
  return () => new Promise<ProxyCheckResponse>(() => {});
}

describe("runProxyCheck()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads a 2xx response with a body as fast, with its response time", async () => {
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: answers(BODY, 200, 142),
    });

    expect(results).toEqual([
      {
        label: "AllOrigins (Raw)",
        prefix: ALL_ORIGINS_RAW.prefix,
        status: "fast",
        elapsedMs: 142,
      },
    ]);
  });

  it("reads an answered request from two seconds up as slow", async () => {
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: answers(BODY, 200, 3400),
    });

    expect(results[0]).toMatchObject({ status: "slow", elapsedMs: 3400 });
  });

  it("splits fast from slow at the two second threshold", async () => {
    const justFast = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: answers(BODY, 200, PROXY_CHECK_FAST_MS - 1),
    });
    const justSlow = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: answers(BODY, 200, PROXY_CHECK_FAST_MS),
    });

    expect(justFast[0]?.status).toBe("fast");
    expect(justSlow[0]?.status).toBe("slow");
  });

  it("reads a request with no answer inside the shared deadline as timed out", async () => {
    const promise = runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: neverAnswers(),
    });
    await vi.advanceTimersByTimeAsync(PROXY_CHECK_TIMEOUT_MS - 1);

    let settled = false;
    void promise.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual([
      {
        label: "AllOrigins (Raw)",
        prefix: ALL_ORIGINS_RAW.prefix,
        status: "timeout",
      },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("runs every proxy in parallel against one deadline, not one after another", async () => {
    const fetchText = vi.fn(neverAnswers());
    const promise = runProxyCheck({
      candidates: [ALL_ORIGINS_RAW, CODE_TABS],
      fetchText,
    });
    await vi.advanceTimersByTimeAsync(0);

    // Both requests are in flight before either deadline can pass.
    expect(fetchText).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(PROXY_CHECK_TIMEOUT_MS);
    await expect(promise).resolves.toEqual([
      {
        label: "AllOrigins (Raw)",
        prefix: ALL_ORIGINS_RAW.prefix,
        status: "timeout",
      },
      { label: "CodeTabs", prefix: CODE_TABS.prefix, status: "timeout" },
    ]);
  });

  it("reports a non-2xx answer as failed with its status", async () => {
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: answers(BODY, 502),
    });

    expect(results[0]).toMatchObject({
      status: "failed",
      failure: "HTTP 502",
    });
    expect(results[0]?.elapsedMs).toBeUndefined();
  });

  it("reports a rejected request with a status as failed with its status", async () => {
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: () =>
        Promise.reject(
          Object.assign(new Error("Request failed, status 500"), {
            status: 500,
          }),
        ),
    });

    expect(results[0]).toMatchObject({ status: "failed", failure: "HTTP 500" });
  });

  it("reports an empty body as failed with no content", async () => {
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: answers("   ", 200),
    });

    expect(results[0]).toMatchObject({
      status: "failed",
      failure: "no content",
    });
  });

  it("reports a name resolution failure as failed with DNS", async () => {
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: () => Promise.reject(new Error("net::ERR_NAME_NOT_RESOLVED")),
    });

    expect(results[0]).toMatchObject({ status: "failed", failure: "DNS" });
  });

  it("reports any other rejection as failed with a network reason", async () => {
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: () => Promise.reject(new Error("socket hang up")),
    });

    expect(results[0]).toMatchObject({ status: "failed", failure: "network" });
  });

  it("asks each proxy for the fixed neutral page and never for a user URL", async () => {
    const fetchText = vi.fn(answers());
    await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW, CODE_TABS],
      fetchText,
    });

    expect(fetchText.mock.calls.map(([url]) => url)).toEqual([
      `${ALL_ORIGINS_RAW.prefix}${ENCODED_TARGET}`,
      `${CODE_TABS.prefix}${ENCODED_TARGET}`,
    ]);
  });

  it("keeps a prefix's trailing slash, so the target stays in the path", async () => {
    const fetchText = vi.fn(answers());
    await runProxyCheck({
      candidates: [
        { label: "Isomorphic-Git", prefix: "https://cors.isomorphic-git.org/" },
      ],
      fetchText,
    });

    expect(fetchText).toHaveBeenCalledWith(
      `https://cors.isomorphic-git.org/${ENCODED_TARGET}`,
    );
  });

  it("measures the response time with the injected clock", async () => {
    let current = 1000;
    const results = await runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText: () => {
        current += 250;
        return Promise.resolve({ status: 200, text: BODY });
      },
      now: () => current,
    });

    expect(results[0]?.elapsedMs).toBe(250);
  });

  it("uses the injected target and deadline when a caller supplies them", async () => {
    const fetchText = vi.fn(neverAnswers());
    const promise = runProxyCheck({
      candidates: [ALL_ORIGINS_RAW],
      fetchText,
      targetUrl: "https://neutral.test/",
      timeoutMs: 250,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchText).toHaveBeenCalledWith(
      `${ALL_ORIGINS_RAW.prefix}${encodeURIComponent("https://neutral.test/")}`,
    );

    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toEqual([
      {
        label: "AllOrigins (Raw)",
        prefix: ALL_ORIGINS_RAW.prefix,
        status: "timeout",
      },
    ]);
  });

  it("uses the feed chain's shared soft timeout as the deadline", () => {
    expect(PROXY_CHECK_TIMEOUT_MS).toBe(FEED_SOFT_TIMEOUT_MS);
  });
});

describe("buildProxyCheckCandidates()", () => {
  it("tests every built-in proxy, in dropdown order, for auto", () => {
    expect(buildProxyCheckCandidates("auto").map((one) => one.prefix)).toEqual(
      PREDEFINED_PROXIES.map((proxy) => proxy.url),
    );
  });

  it("includes the two proxies that cannot relay an article body", () => {
    const prefixes = buildProxyCheckCandidates("auto").map((one) => one.prefix);

    expect(prefixes).toContain("https://api.allorigins.win/get?url=");
    expect(prefixes).toContain("https://api.rss2json.com/v1/api.json?rss_url=");
  });

  it("appends the configured custom URL last, once", () => {
    const candidates = buildProxyCheckCandidates("https://proxy.test/?url=");

    expect(candidates).toHaveLength(PREDEFINED_PROXIES.length + 1);
    expect(candidates[candidates.length - 1]).toEqual({
      label: "https://proxy.test/?url=",
      prefix: "https://proxy.test/?url=",
    });
  });

  it("does not repeat a built-in that is selected on its own", () => {
    const candidates = buildProxyCheckCandidates(
      PREDEFINED_PROXIES[2]?.url ?? "",
    );

    expect(candidates).toHaveLength(PREDEFINED_PROXIES.length);
  });

  it("tests the built-ins alone when no proxy is configured", () => {
    expect(buildProxyCheckCandidates("")).toHaveLength(
      PREDEFINED_PROXIES.length,
    );
  });
});

describe("proxyCheckCandidateLabel()", () => {
  it("uses the dropdown label for a built-in proxy", () => {
    expect(
      proxyCheckCandidateLabel("https://api.codetabs.com/v1/proxy/?quest="),
    ).toBe("CodeTabs");
  });

  it("uses the URL itself for a custom proxy", () => {
    expect(proxyCheckCandidateLabel("https://proxy.test/?url=")).toBe(
      "https://proxy.test/?url=",
    );
  });
});

describe("resolveSelectedProxyState()", () => {
  it("offers the selected built-in proxy", () => {
    const url = PREDEFINED_PROXIES[0]?.url ?? "";
    expect(resolveSelectedProxyState(url, url, url)).toEqual({
      kind: "ready",
      prefix: url,
    });
  });

  it("offers a committed custom proxy URL", () => {
    expect(
      resolveSelectedProxyState(
        "custom",
        "https://proxy.test/?url=",
        "https://proxy.test/?url=",
      ),
    ).toEqual({ kind: "ready", prefix: "https://proxy.test/?url=" });
  });

  it("reports auto, where the selected proxy is the whole list", () => {
    expect(resolveSelectedProxyState("auto", "auto", "auto")).toEqual({
      kind: "auto",
    });
  });

  it("reports an empty selection", () => {
    expect(resolveSelectedProxyState("", "", "")).toEqual({ kind: "empty" });
  });

  it("reports the dropdown's empty option even while a proxy is still saved", () => {
    expect(
      resolveSelectedProxyState("", PREDEFINED_PROXIES[0]?.url ?? "", ""),
    ).toEqual({ kind: "empty" });
  });

  it("refuses the custom option while a built-in proxy is still saved", () => {
    const url = PREDEFINED_PROXIES[1]?.url ?? "";
    expect(resolveSelectedProxyState("custom", url, url)).toEqual({
      kind: "uncommitted",
    });
  });

  it("still reports auto behind the custom option when auto is what is saved", () => {
    expect(resolveSelectedProxyState("custom", "auto", "auto")).toEqual({
      kind: "auto",
    });
  });

  it("refuses a custom URL that is typed but not committed", () => {
    expect(
      resolveSelectedProxyState(
        "custom",
        "https://proxy.test/?url=",
        "https://other.test/?url=",
      ),
    ).toEqual({ kind: "uncommitted" });
  });

  it("refuses an invalid custom URL", () => {
    expect(
      resolveSelectedProxyState("custom", "not a url", "not a url"),
    ).toEqual({ kind: "uncommitted" });
  });
});

describe("fastestProxyCheckIndex()", () => {
  it("marks the answered proxy with the smallest response time", () => {
    const index = fastestProxyCheckIndex([
      { label: "a", prefix: "a", status: "slow", elapsedMs: 3400 },
      { label: "b", prefix: "b", status: "fast", elapsedMs: 142 },
      { label: "c", prefix: "c", status: "fast", elapsedMs: 900 },
    ]);

    expect(index).toBe(1);
  });

  it("keeps dropdown order when two proxies tie", () => {
    const index = fastestProxyCheckIndex([
      { label: "a", prefix: "a", status: "fast", elapsedMs: 100 },
      { label: "b", prefix: "b", status: "fast", elapsedMs: 100 },
    ]);

    expect(index).toBe(0);
  });

  it("marks nothing when no proxy answered", () => {
    const index = fastestProxyCheckIndex([
      { label: "a", prefix: "a", status: "timeout" },
      { label: "b", prefix: "b", status: "failed", failure: "HTTP 502" },
    ]);

    expect(index).toBe(-1);
  });
});

describe("formatProxyCheckElapsed()", () => {
  it("counts milliseconds below a second and seconds from there up", () => {
    expect(formatProxyCheckElapsed(142)).toBe("142 ms");
    expect(formatProxyCheckElapsed(999)).toBe("999 ms");
    expect(formatProxyCheckElapsed(1000)).toBe("1.0 s");
    expect(formatProxyCheckElapsed(3400)).toBe("3.4 s");
    expect(formatProxyCheckElapsed(PROXY_CHECK_TIMEOUT_MS)).toBe("5.0 s");
  });
});

describe("proxyCheckStatusLabel()", () => {
  it("states every status in words", () => {
    expect(
      proxyCheckStatusLabel({
        label: "a",
        prefix: "a",
        status: "fast",
        elapsedMs: 1,
      }),
    ).toBe("fast");
    expect(
      proxyCheckStatusLabel({
        label: "a",
        prefix: "a",
        status: "slow",
        elapsedMs: 2000,
      }),
    ).toBe("slow");
    expect(
      proxyCheckStatusLabel({ label: "a", prefix: "a", status: "timeout" }),
    ).toBe("timed out");
    expect(
      proxyCheckStatusLabel({
        label: "a",
        prefix: "a",
        status: "failed",
        failure: "HTTP 502",
      }),
    ).toBe("failed (HTTP 502)");
    expect(
      proxyCheckStatusLabel({
        label: "a",
        prefix: "a",
        status: "failed",
        failure: "no content",
      }),
    ).toBe("failed (no content)");
    expect(
      proxyCheckStatusLabel({ label: "a", prefix: "a", status: "not-tested" }),
    ).toBe("not tested");
  });
});

describe("ProxyCheckStore", () => {
  it("starts empty, records the run in flight, and keeps the finished board", () => {
    const store = new ProxyCheckStore();
    expect(store.getBoard()).toEqual({
      running: false,
      candidates: [],
      results: null,
    });

    store.startRun([ALL_ORIGINS_RAW]);
    expect(store.getBoard()).toEqual({
      running: true,
      candidates: [ALL_ORIGINS_RAW],
      results: null,
    });

    store.finishRun([
      {
        label: ALL_ORIGINS_RAW.label,
        prefix: ALL_ORIGINS_RAW.prefix,
        status: "fast",
        elapsedMs: 142,
      },
    ]);
    expect(store.getBoard()).toEqual({
      running: false,
      candidates: [ALL_ORIGINS_RAW],
      results: [
        {
          label: ALL_ORIGINS_RAW.label,
          prefix: ALL_ORIGINS_RAW.prefix,
          status: "fast",
          elapsedMs: 142,
        },
      ],
    });
  });

  it("tells subscribers about each change and stops after unsubscribing", () => {
    const store = new ProxyCheckStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.startRun([ALL_ORIGINS_RAW]);
    store.finishRun([]);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.startRun([ALL_ORIGINS_RAW]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
