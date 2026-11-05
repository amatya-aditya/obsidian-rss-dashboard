// A linked PDF or other file is skipped before it is parsed, and no proxy is
// tried for it (#1766). Reproduces the Hacker News "How to lie with statistics"
// item, whose link is a PDF. `robustFetchDetailed` makes the type and size
// call (see platform-utils.test.ts); these tests cover what the fetch does
// with its answer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readability = vi.hoisted(() => ({ constructed: vi.fn() }));

vi.mock("@mozilla/readability", () => ({
  Readability: class {
    constructor(doc: Document) {
      readability.constructed(doc);
    }
    parse() {
      return { content: "<p>article</p>", excerpt: "excerpt" };
    }
  },
}));

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
}));

import { robustFetchDetailed } from "../../../src/utils/platform-utils";
import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";
import { fetchFullArticleContentWithOutcome } from "../../../src/utils/full-article-fetch";

const detailedMock = vi.mocked(robustFetchDetailed);
const PROXY = "https://proxy.example.com/?url=";
const PDF_URL = "https://example.com/papers/how-to-lie-with-statistics.pdf";
const BARE_URL = "https://arxiv.org/pdf/1234.5678";
const SAGE_URL = "https://journals.sagepub.com/doi/full/10.1177/1";
const ARTICLE = `<!doctype html><html><head><title>One</title></head><body><article>${"<p>Lantern velvet cedar marble river engine.</p>".repeat(40)}</article></body></html>`;
const UNSUPPORTED_RESULT = {
  content: "",
  failureType: "network",
  failureReason: "unsupported",
};

describe("fetch skips linked files (#1766)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    readability.constructed.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes no request for a link that ends in .pdf", async () => {
    const result = await fetchWithProxyFallbackDetailed(PDF_URL, PROXY);

    expect(detailedMock).not.toHaveBeenCalled();
    expect(result).toMatchObject(UNSUPPORTED_RESULT);
  });

  it("asks for the type and size to be checked on the direct request", async () => {
    detailedMock.mockResolvedValue({ text: ARTICLE, status: 200 });

    await fetchWithProxyFallbackDetailed("https://example.com/p", PROXY);

    expect(detailedMock.mock.calls[0]?.[1]).toMatchObject({
      pageLimits: { checkType: true },
    });
  });

  it("does not parse a response the direct request left undecoded", async () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    detailedMock.mockResolvedValue({
      text: "",
      status: 200,
      contentType: "application/pdf",
      unsupported: true,
    });

    const result = await fetchWithProxyFallbackDetailed(BARE_URL, PROXY);

    expect(result).toMatchObject(UNSUPPORTED_RESULT);
    expect(parse).not.toHaveBeenCalled();
    expect(readability.constructed).not.toHaveBeenCalled();
  });

  it("tries no proxy after the direct request returned a file", async () => {
    detailedMock.mockResolvedValue({
      text: "",
      status: 200,
      contentType: "application/zip",
      unsupported: true,
    });

    await fetchWithProxyFallbackDetailed(BARE_URL, PROXY);

    expect(detailedMock).toHaveBeenCalledTimes(1);
  });

  it("checks only the size, not the type, on a proxied request", async () => {
    detailedMock
      .mockResolvedValueOnce({ text: "Access denied", status: 403 })
      .mockResolvedValue({ text: ARTICLE, status: 200 });

    await fetchWithProxyFallbackDetailed("https://example.com/p", PROXY);

    expect(detailedMock.mock.calls[1]?.[1]).toMatchObject({
      pageLimits: { checkType: false },
    });
  });

  it("stops at an oversized page a proxy relays, without trying the next proxy", async () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    detailedMock
      .mockResolvedValueOnce({ text: "Access denied", status: 403 })
      .mockResolvedValue({ text: "", status: 200, unsupported: true });

    const result = await fetchWithProxyFallbackDetailed(
      "https://example.com/posts/huge",
      "auto",
    );

    expect(result.failureReason).toBe("unsupported");
    expect(parse).not.toHaveBeenCalled();
    expect(detailedMock).toHaveBeenCalledTimes(2);
  });

  it("skips the file for a metadata-only read too", async () => {
    detailedMock.mockResolvedValue({
      text: "",
      status: 200,
      unsupported: true,
    });

    const result = await fetchWithProxyFallbackDetailed(
      BARE_URL,
      undefined,
      undefined,
      { metadataOnly: true },
    );

    expect(result.failureType).toBe("network");
    expect(result.pageMetadata).toBeUndefined();
  });

  it("makes no request for a .pdf link opened through the reader's fetch", async () => {
    const result = await fetchFullArticleContentWithOutcome(PDF_URL, PROXY);

    expect(detailedMock).not.toHaveBeenCalled();
    expect(result).toMatchObject(UNSUPPORTED_RESULT);
  });

  it("does not fall back to the abstract page when a sagepub link is a file", async () => {
    detailedMock.mockResolvedValue({
      text: "",
      status: 200,
      contentType: "application/pdf",
      unsupported: true,
    });

    const result = await fetchFullArticleContentWithOutcome(SAGE_URL, PROXY);

    expect(result.failureReason).toBe("unsupported");
    expect(detailedMock).toHaveBeenCalledTimes(1);
  });

  it("still reads an HTML page", async () => {
    detailedMock.mockResolvedValue({
      text: ARTICLE,
      status: 200,
      contentType: "text/html; charset=utf-8",
    });

    const result = await fetchWithProxyFallbackDetailed(
      "https://example.com/posts/one",
      PROXY,
    );

    expect(result.failureType).toBe("none");
    expect(readability.constructed).toHaveBeenCalled();
  });
});
