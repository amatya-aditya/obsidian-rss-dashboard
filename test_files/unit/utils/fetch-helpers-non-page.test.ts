// A linked PDF or other file is skipped before it is parsed, and no proxy is
// tried for it (#1766). Reproduces the Hacker News "How to lie with statistics"
// item, whose link is a PDF.
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const ARTICLE = `<!doctype html><html><head><title>One</title></head><body><article>${"<p>Lantern velvet cedar marble river engine.</p>".repeat(40)}</article></body></html>`;

describe("fetch skips linked files (#1766)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    readability.constructed.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("makes no request for a link that ends in .pdf", async () => {
    const result = await fetchWithProxyFallbackDetailed(PDF_URL, PROXY);

    expect(detailedMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ content: "", failureType: "network" });
  });

  it("does not parse an extensionless PDF the server declares as application/pdf", async () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    detailedMock.mockResolvedValue({
      text: "%PDF-1.7 ".repeat(200_000),
      status: 200,
      contentType: "application/pdf",
    });

    const result = await fetchWithProxyFallbackDetailed(BARE_URL, PROXY);

    expect(result).toMatchObject({ content: "", failureType: "network" });
    expect(parse).not.toHaveBeenCalled();
    expect(readability.constructed).not.toHaveBeenCalled();
  });

  it("tries no proxy after the direct request returned a file", async () => {
    detailedMock.mockResolvedValue({
      text: "PK",
      status: 200,
      contentType: "application/zip",
    });

    await fetchWithProxyFallbackDetailed(BARE_URL, PROXY);

    expect(detailedMock).toHaveBeenCalledTimes(1);
  });

  it("skips the file for a metadata-only read too", async () => {
    detailedMock.mockResolvedValue({
      text: "%PDF",
      status: 200,
      contentType: "application/pdf",
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

  it("covers the shared entry point the reader and saver use", async () => {
    const result = await fetchFullArticleContentWithOutcome(PDF_URL, PROXY);

    expect(detailedMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ content: "", failureType: "network" });
  });

  it("still reads an HTML page that declares its type", async () => {
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

  it("still reads a page whose response declares no type", async () => {
    detailedMock.mockResolvedValue({ text: ARTICLE, status: 200 });

    const result = await fetchWithProxyFallbackDetailed(
      "https://example.com/posts/one",
      PROXY,
    );

    expect(result.failureType).toBe("none");
    expect(readability.constructed).toHaveBeenCalled();
  });
});
