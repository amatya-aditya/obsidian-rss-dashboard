/**
 * Tests for fetch-helpers.ts
 *
 * Unit tests:   isBlockedResponse — pure logic, no mocks required
 * Integration:  fetchWithProxyFallback — mocks robustFetch via vi.mock
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  SpyInstance,
} from "vitest";
import * as platformUtils from "../../src/utils/platform-utils";
import { robustFetch } from "../../src/utils/platform-utils";
import {
  isBlockedResponse,
  fetchWithProxyFallback,
} from "../../src/utils/fetch-helpers";

// ── isBlockedResponse — unit tests ──────────────────────────────────────────

describe("isBlockedResponse", () => {
  it("returns true for empty string", () => {
    expect(isBlockedResponse("")).toBe(true);
  });

  it("returns true for null/undefined-like empty inputs", () => {
    expect(isBlockedResponse("   ")).toBe(true);
  });

  it("returns true for very short HTML (< 200 chars)", () => {
    expect(isBlockedResponse("<html><body>Tiny</body></html>")).toBe(true);
  });

  it("returns true for Cloudflare 'Just a moment...' page", () => {
    const cfPage = `<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body><div id="cf-challenge">Checking your browser...</div>
${"<p>placeholder content to make this long enough to pass length check</p>".repeat(5)}
</body></html>`;
    expect(isBlockedResponse(cfPage)).toBe(true);
  });

  it("returns true for cf-browser-verification marker", () => {
    const html =
      "<html><body>cf-browser-verification content" +
      " x".repeat(200) +
      "</body></html>";
    expect(isBlockedResponse(html)).toBe(true);
  });

  it("returns true for cf-challenge marker", () => {
    const html =
      "<html><body><div class='cf-challenge'>verify</div>" +
      " x".repeat(200) +
      "</body></html>";
    expect(isBlockedResponse(html)).toBe(true);
  });

  it("returns true for Access Denied page", () => {
    const html =
      "<html><body>Access Denied" + " x".repeat(200) + "</body></html>";
    expect(isBlockedResponse(html)).toBe(true);
  });

  it("returns true for 403 Forbidden page", () => {
    const html =
      "<html><body>403 Forbidden" + " x".repeat(200) + "</body></html>";
    expect(isBlockedResponse(html)).toBe(true);
  });

  it("returns true for DDoS-Guard page", () => {
    const html =
      "<html><body>ddos-guard protection" + " x".repeat(200) + "</body></html>";
    expect(isBlockedResponse(html)).toBe(true);
  });

  it("returns true for WAF trigger: enable javascript and cookies", () => {
    const html =
      "<html><body>Please enable javascript and cookies" +
      " x".repeat(200) +
      "</body></html>";
    expect(isBlockedResponse(html)).toBe(true);
  });

  it("returns false for normal article HTML", () => {
    const html = `<!DOCTYPE html><html><head><title>Psychology Today: Real Article</title></head>
<body>
  <article>
    <h1>Understanding Anxiety</h1>
    <p>Anxiety is a normal emotion that everyone experiences at times. It becomes a disorder
    when it interferes significantly with daily life. There are many approaches to treating
    anxiety, including therapy, medication, and lifestyle changes such as exercise and mindfulness.</p>
    <p>Cognitive-behavioral therapy (CBT) is one of the most effective treatments for anxiety.
    It works by helping people identify and change negative thought patterns that contribute
    to anxiety. Many people see improvements within a few months of regular sessions.</p>
  </article>
</body></html>`;
    expect(isBlockedResponse(html)).toBe(false);
  });
});

// ── fetchWithProxyFallback — integration tests ───────────────────────────────

// We spy on platformUtils.robustFetch so tests never make real network calls.

// Readability needs a real DOM — jsdom provides that.
// We also need to provide minimal HTML that Readability will successfully parse.
const ARTICLE_HTML = `<!DOCTYPE html><html><head><title>Test Article</title></head>
<body>
  <article>
    <h1>Test Headline</h1>
    <p>This is meaningful article content that is long enough for Readability to extract.
    It contains several sentences and paragraphs to ensure the parser considers it valid content.
    Psychology Today articles often have this kind of rich text body with many paragraphs.</p>
    <p>Second paragraph with more content to satisfy Readability minimum thresholds for content
    extraction. The article continues with interesting information about the topic at hand.</p>
  </article>
</body></html>`;

const CLOUDFLARE_HTML = `<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body>
  <div class="cf-challenge">Please wait while we verify your browser.</div>
  <p>Checking if the site connection is secure...</p>
  ${"<p>padding</p>".repeat(10)}
</body></html>`;

describe("fetchWithProxyFallback", () => {
  let robustFetchMock: SpyInstance<
    Parameters<typeof robustFetch>,
    ReturnType<typeof robustFetch>
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    robustFetchMock = vi.spyOn(platformUtils, "robustFetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed Readability content on successful direct fetch", async () => {
    robustFetchMock.mockResolvedValueOnce(ARTICLE_HTML);

    const result = await fetchWithProxyFallback("https://example.com/article");

    expect(robustFetchMock).toHaveBeenCalledTimes(1);
    expect(robustFetchMock.mock.calls[0][0]).toBe(
      "https://example.com/article",
    );
    // Readability will return some HTML content extracted from the article body
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Test Headline");
  });

  it("does not use proxy when direct fetch succeeds", async () => {
    robustFetchMock.mockResolvedValueOnce(ARTICLE_HTML);

    await fetchWithProxyFallback(
      "https://example.com/article",
      "https://proxy.example.com/?url=",
    );

    // Only one call — no proxy attempt
    expect(robustFetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries via proxy when direct fetch returns a Cloudflare block page", async () => {
    // First call (direct) → Cloudflare block
    robustFetchMock.mockResolvedValueOnce(CLOUDFLARE_HTML);
    // Second call (proxy) → real content
    robustFetchMock.mockResolvedValueOnce(ARTICLE_HTML);

    const result = await fetchWithProxyFallback(
      "https://psychologytoday.com/article",
      "https://proxy.example.com/?url=",
    );

    expect(robustFetchMock).toHaveBeenCalledTimes(2);
    // Verify the second call used the proxy URL
    const proxyCall = robustFetchMock.mock.calls[1][0] as string;
    expect(proxyCall).toContain("https://proxy.example.com/?url=");
    expect(proxyCall).toContain(
      encodeURIComponent("https://psychologytoday.com/article"),
    );
    // Content from the proxied page should be returned
    expect(result).toContain("Test Headline");
  });

  it("returns empty string when direct fetch returns empty and no proxy is configured", async () => {
    robustFetchMock.mockResolvedValueOnce("");

    const result = await fetchWithProxyFallback("https://example.com/article");

    expect(robustFetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBe("");
  });

  it("returns empty string when direct fetch returns empty and corsProxyUrl is empty string", async () => {
    robustFetchMock.mockResolvedValueOnce("");

    const result = await fetchWithProxyFallback(
      "https://example.com/article",
      "",
    );

    expect(robustFetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBe("");
  });

  it("returns empty string when both direct fetch and proxy return blocked content", async () => {
    robustFetchMock.mockResolvedValueOnce(CLOUDFLARE_HTML); // direct
    robustFetchMock.mockResolvedValueOnce(CLOUDFLARE_HTML); // proxy

    const result = await fetchWithProxyFallback(
      "https://example.com/article",
      "https://proxy.example.com/?url=",
    );

    expect(robustFetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBe("");
  });

  it("returns empty string when robustFetch throws an error", async () => {
    robustFetchMock.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchWithProxyFallback("https://example.com/article");

    expect(result).toBe("");
  });

  it("correctly encodes the article URL when appending to proxy base URL", async () => {
    robustFetchMock.mockResolvedValueOnce(CLOUDFLARE_HTML); // direct blocked
    robustFetchMock.mockResolvedValueOnce(ARTICLE_HTML); // proxy succeeds

    const articleUrl = "https://example.com/article?id=123&ref=rss";
    const proxyBase = "https://api.allorigins.win/raw?url=";

    await fetchWithProxyFallback(articleUrl, proxyBase);

    const proxyCall = robustFetchMock.mock.calls[1][0] as string;
    expect(proxyCall).toBe(proxyBase + encodeURIComponent(articleUrl));
  });

  it("trims trailing slash from proxy URL before appending article URL", async () => {
    robustFetchMock.mockResolvedValueOnce(CLOUDFLARE_HTML);
    robustFetchMock.mockResolvedValueOnce(ARTICLE_HTML);

    await fetchWithProxyFallback(
      "https://example.com/article",
      "https://proxy.example.com/?url=/", // trailing slash
    );

    const proxyCall = robustFetchMock.mock.calls[1][0] as string;
    // The trailing slash should be removed before appending the encoded URL
    expect(proxyCall.startsWith("https://proxy.example.com/?url=")).toBe(true);
    expect(proxyCall).not.toContain("/?url=/https%3A");
  });
});
