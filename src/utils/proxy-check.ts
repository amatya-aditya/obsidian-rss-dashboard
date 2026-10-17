/**
 * On-demand CORS proxy check (#1298).
 *
 * Settings → General → Proxy asks every proxy to fetch one fixed neutral page,
 * all in parallel against one shared deadline, and reports the response time.
 * It is a diagnostic: results live in memory for the session, nothing runs on
 * its own, and no real fetch changes its proxy order or time budget. #955
 * tracks the automatic tracker this deliberately is not.
 */
import { FEED_SOFT_TIMEOUT_MS } from "../services/feed-timeout";
import { AUTO_PROXY_URL, PREDEFINED_PROXIES } from "./proxy-utils";
import { isValidUrl } from "./validation";

/**
 * One deadline for every request in a run: the proxy chain's own soft timeout
 * (#954). A request that has not answered by then reads as timed out.
 */
export const PROXY_CHECK_TIMEOUT_MS = FEED_SOFT_TIMEOUT_MS;

/** Under this, an answered request reads as fast; up to the deadline, slow. */
export const PROXY_CHECK_FAST_MS = 2000;

/**
 * The page every proxy is asked for. Fixed and neutral on purpose: a check
 * never sends a configured feed URL, an article URL or browsing history.
 */
export const PROXY_CHECK_TARGET_URL = "https://example.com/";

/** A proxy to test: its dropdown label and the prefix the target is appended to. */
export interface ProxyCheckCandidate {
  label: string;
  prefix: string;
}

/** The part of a response the check reads. */
export interface ProxyCheckResponse {
  status: number;
  text: string;
}

export type ProxyCheckStatus =
  "fast" | "slow" | "timeout" | "failed" | "not-tested";

export interface ProxyCheckResult {
  label: string;
  prefix: string;
  status: ProxyCheckStatus;
  /** Whole milliseconds to a complete body; absent unless the proxy answered. */
  elapsedMs?: number;
  /** Why a failed request failed: "HTTP 502", "no content", "DNS" or "network". */
  failure?: string;
}

/** What the General tab draws: the run in flight, or the last one. */
export interface ProxyCheckBoard {
  running: boolean;
  /** The proxies the run covers, in dropdown order. */
  candidates: ProxyCheckCandidate[];
  /** One result per candidate, in the same order; null while running or before any run. */
  results: ProxyCheckResult[] | null;
}

export interface ProxyCheckRequest {
  candidates: readonly ProxyCheckCandidate[];
  /** Fetches one URL. Injected so a unit test never touches the network. */
  fetchText: (url: string) => Promise<ProxyCheckResponse>;
  /** The clock, in milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** The page to fetch. Defaults to the fixed neutral target. */
  targetUrl?: string;
  /** The one deadline every request in this run shares. */
  timeoutMs?: number;
}

/**
 * Every proxy a run covers, in dropdown order: all six built-ins, including
 * the two that cannot relay an article body, then the configured custom URL.
 */
export function buildProxyCheckCandidates(
  proxyUrl: string,
): ProxyCheckCandidate[] {
  const candidates = PREDEFINED_PROXIES.map((proxy) => ({
    label: proxy.label,
    prefix: proxy.url,
  }));
  const custom = proxyUrl.trim();
  const isBuiltIn =
    custom === "" ||
    custom === AUTO_PROXY_URL ||
    PREDEFINED_PROXIES.some((proxy) => proxy.url === custom);
  if (!isBuiltIn) {
    candidates.push({ label: custom, prefix: custom });
  }
  return candidates;
}

/** The label the dropdown shows for a prefix: a built-in's own label, else the URL. */
export function proxyCheckCandidateLabel(prefix: string): string {
  return (
    PREDEFINED_PROXIES.find((proxy) => proxy.url === prefix)?.label ?? prefix
  );
}

/** The dropdown option value that opens the custom proxy URL field. */
export const CUSTOM_PROXY_OPTION = "custom";

export type SelectedProxyState =
  | { kind: "ready"; prefix: string }
  | { kind: "auto" }
  | { kind: "empty" }
  | { kind: "uncommitted" };

/**
 * What "Test selected proxy" would test. `selectedOption` is the Proxy URL
 * dropdown's current value. Its empty option means nothing is selected, even
 * though choosing it leaves a configured proxy in place; its custom option
 * selects the URL field, so it counts only once a custom URL is saved there
 * and the field still agrees with it. Every other option is a built-in (or
 * auto), where the configured proxy decides, and a custom URL counts only once
 * the field agrees with the saved value and passes the same URL check the save
 * uses.
 */
export function resolveSelectedProxyState(
  selectedOption: string,
  savedProxyUrl: string,
  pendingProxyUrl: string,
): SelectedProxyState {
  if (selectedOption === "") return { kind: "empty" };

  const saved = savedProxyUrl.trim();
  const isCustomUrl =
    saved !== "" &&
    saved !== AUTO_PROXY_URL &&
    !PREDEFINED_PROXIES.some((proxy) => proxy.url === saved);

  // The custom option selects the URL field, so it needs a custom URL saved
  // there: a built-in behind it is not what the dropdown says. With nothing
  // but auto (or nothing at all) saved, the configured proxy still decides.
  if (
    selectedOption === CUSTOM_PROXY_OPTION &&
    saved !== "" &&
    saved !== AUTO_PROXY_URL
  ) {
    const committed =
      isCustomUrl &&
      pendingProxyUrl.trim() === saved &&
      isValidUrl(saved).valid;
    return committed
      ? { kind: "ready", prefix: saved }
      : { kind: "uncommitted" };
  }

  if (saved === "") return { kind: "empty" };
  if (saved === AUTO_PROXY_URL) return { kind: "auto" };
  if (pendingProxyUrl.trim() !== saved) return { kind: "uncommitted" };
  if (!isValidUrl(saved).valid) return { kind: "uncommitted" };
  return { kind: "ready", prefix: saved };
}

class ProxyCheckTimeoutError extends Error {
  constructor() {
    super("Proxy check deadline expired");
  }
}

/**
 * The shared deadline for one request. `withFetchDeadline` in `fetch-helpers.ts`
 * is module-private and belongs to the article chain (#954), so the check keeps
 * its own small copy: accept a factory so no request starts after the budget is
 * gone, and read the clock through `now` so a test can drive it.
 */
function withProxyCheckDeadline<T>(
  request: () => Promise<T>,
  deadline: number,
  now: () => number,
): Promise<T> {
  const remainingMs = deadline - now();
  if (remainingMs <= 0) return Promise.reject(new ProxyCheckTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new ProxyCheckTimeoutError());
    }, remainingMs);
    void Promise.resolve()
      .then(() => {
        if (now() >= deadline) throw new ProxyCheckTimeoutError();
        return request();
      })
      .then(
        (value) => {
          window.clearTimeout(timer);
          if (now() >= deadline) reject(new ProxyCheckTimeoutError());
          else resolve(value);
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
  });
}

/** Obsidian's `requestUrl` throws for 4xx and 5xx with the status on the error. */
function readErrorStatus(error: unknown): number {
  const failure = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };
  return (
    failure?.status ?? failure?.statusCode ?? failure?.response?.status ?? 0
  );
}

const NAME_RESOLUTION_MARKERS = [
  "err_name_not_resolved",
  "enotfound",
  "eai_again",
  "getaddrinfo",
];

function describeProxyCheckFailure(error: unknown): string {
  const status = readErrorStatus(error);
  if (status > 0) return `HTTP ${status}`;
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (NAME_RESOLUTION_MARKERS.some((marker) => message.includes(marker))) {
    return "DNS";
  }
  return "network";
}

interface SingleProxyCheck {
  candidate: ProxyCheckCandidate;
  fetchText: (url: string) => Promise<ProxyCheckResponse>;
  now: () => number;
  deadline: number;
  encodedTarget: string;
}

async function checkOneProxy(
  check: SingleProxyCheck,
): Promise<ProxyCheckResult> {
  const { candidate, fetchText, now, deadline, encodedTarget } = check;
  // `<prefix><target>` exactly as configured, the shape the feed path builds:
  // a prefix that ends in `/` keeps its separator, so the target stays in the
  // path instead of joining the host name.
  const url = `${candidate.prefix}${encodedTarget}`;
  const startedAt = now();
  const base = { label: candidate.label, prefix: candidate.prefix };

  try {
    const response = await withProxyCheckDeadline(
      () => fetchText(url),
      deadline,
      now,
    );
    if (response.status < 200 || response.status >= 300) {
      return { ...base, status: "failed", failure: `HTTP ${response.status}` };
    }
    if (response.text.trim() === "") {
      return { ...base, status: "failed", failure: "no content" };
    }
    const elapsedMs = now() - startedAt;
    return {
      ...base,
      status: elapsedMs < PROXY_CHECK_FAST_MS ? "fast" : "slow",
      elapsedMs,
    };
  } catch (error) {
    if (error instanceof ProxyCheckTimeoutError) {
      return { ...base, status: "timeout" };
    }
    return {
      ...base,
      status: "failed",
      failure: describeProxyCheckFailure(error),
    };
  }
}

/**
 * Tests every candidate in parallel and returns one result per candidate, in
 * the same order. A pass is a 2xx answer with a non-empty body.
 */
export async function runProxyCheck({
  candidates,
  fetchText,
  now = () => Date.now(),
  targetUrl = PROXY_CHECK_TARGET_URL,
  timeoutMs = PROXY_CHECK_TIMEOUT_MS,
}: ProxyCheckRequest): Promise<ProxyCheckResult[]> {
  const deadline = now() + timeoutMs;
  const encodedTarget = encodeURIComponent(targetUrl);
  return Promise.all(
    candidates.map((candidate) =>
      checkOneProxy({ candidate, fetchText, now, deadline, encodedTarget }),
    ),
  );
}

/**
 * The index of the fastest proxy that answered, or -1 when none did. A tie
 * keeps dropdown order.
 */
export function fastestProxyCheckIndex(
  results: readonly ProxyCheckResult[],
): number {
  let fastest = -1;
  for (const [index, result] of results.entries()) {
    if (result.elapsedMs === undefined) continue;
    const best = fastest === -1 ? undefined : results[fastest]?.elapsedMs;
    if (best === undefined || result.elapsedMs < best) fastest = index;
  }
  return fastest;
}

/** "142 ms" below a second, "3.4 s" from there up. */
export function formatProxyCheckElapsed(elapsedMs: number): string {
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

/** The status in words, so colour never carries the meaning alone. */
export function proxyCheckStatusLabel(result: ProxyCheckResult): string {
  switch (result.status) {
    case "fast":
      return "fast";
    case "slow":
      return "slow";
    case "timeout":
      return "timed out";
    case "failed":
      return `failed (${result.failure ?? "network"})`;
    case "not-tested":
      return "not tested";
  }
}

/**
 * The plugin's session-only holder for the proxy check. The General tab reads
 * and writes it, so a run survives a settings-tab switch and is gone on
 * reload. Nothing here is persisted, and nothing runs on its own.
 */
export class ProxyCheckStore {
  private board: ProxyCheckBoard = {
    running: false,
    candidates: [],
    results: null,
  };

  private readonly listeners = new Set<() => void>();

  getBoard(): ProxyCheckBoard {
    return this.board;
  }

  /** A run starting replaces the board with the proxies it is testing. */
  startRun(candidates: ProxyCheckCandidate[]): void {
    this.board = { running: true, candidates, results: null };
    this.notify();
  }

  finishRun(results: ProxyCheckResult[]): void {
    this.board = { ...this.board, running: false, results };
    this.notify();
  }

  /** Subscribes to board changes; the returned function unsubscribes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
