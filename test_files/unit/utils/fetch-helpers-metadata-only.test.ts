// A cover fetch needs only the page's declared image, so it reads the page's
// head and stops there: no Readability, no body parse (#1702). The full parse
// ran on the main thread for every page of a bulk run and froze Obsidian.
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
import { resolvePageCoverImage } from "../../../src/utils/article-metadata";
import { PageCoverImageService } from "../../../src/services/page-cover-image-service";
import { fetchPageMetadataWithOutcome } from "../../../src/utils/full-article-fetch";

const detailedMock = vi.mocked(robustFetchDetailed);
const URL_ = "https://news.example.com/posts/one";
const OG = "https://cdn.example.com/hero.jpg";

function page(head: string, bodyKb = 0): string {
  const body = "<div><p>Lantern velvet cedar marble river engine.</p></div>\n";
  return `<!doctype html><html><head>${head}</head><body>${body.repeat(Math.ceil((bodyKb * 1024) / body.length))}</body></html>`;
}

describe("metadata-only page read (#1702)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    readability.constructed.mockReset();
    vi.restoreAllMocks();
  });

  it("reads the declared og:image without running Readability", async () => {
    detailedMock.mockResolvedValue({
      text: page(`<meta property="og:image" content="${OG}">`, 300),
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(
      URL_,
      undefined,
      undefined,
      { metadataOnly: true },
    );

    expect(result.failureType).toBe("none");
    expect(result.pageMetadata).toBeDefined();
    expect(resolvePageCoverImage(result.pageMetadata!, URL_)).toBe(OG);
    expect(readability.constructed).not.toHaveBeenCalled();
  });

  it("parses only the head of a large page", async () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    detailedMock.mockResolvedValue({
      text: page(`<meta property="og:image" content="${OG}">`, 600),
      status: 200,
    });

    await fetchWithProxyFallbackDetailed(URL_, undefined, undefined, {
      metadataOnly: true,
    });

    expect(parse).toHaveBeenCalled();
    for (const [input] of parse.mock.calls) {
      expect(String(input).length).toBeLessThan(16 * 1024);
    }
  });

  it("still runs the full article parse when asked for the whole article", async () => {
    detailedMock.mockResolvedValue({
      text: page(`<meta property="og:image" content="${OG}">`, 5),
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(URL_);

    expect(readability.constructed).toHaveBeenCalledTimes(1);
    expect(result.content).toContain("article");
  });

  it("falls back to twitter:image, and resolves a relative declaration, as the full read does", async () => {
    detailedMock.mockResolvedValue({
      text: page(`<meta name="twitter:image" content="/img/card.png">`, 50),
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(
      URL_,
      undefined,
      undefined,
      { metadataOnly: true },
    );

    expect(resolvePageCoverImage(result.pageMetadata!, URL_)).toBe(
      "https://news.example.com/img/card.png",
    );
  });

  it("reads a page that never closes its head from the first part of the document", async () => {
    detailedMock.mockResolvedValue({
      text: `<html><head><meta property="og:image" content="${OG}">${"<p>filler</p>".repeat(30000)}`,
      status: 200,
    });
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");

    const result = await fetchWithProxyFallbackDetailed(
      URL_,
      undefined,
      undefined,
      { metadataOnly: true },
    );

    expect(resolvePageCoverImage(result.pageMetadata!, URL_)).toBe(OG);
    for (const [input] of parse.mock.calls) {
      expect(String(input).length).toBeLessThanOrEqual(100 * 1024);
    }
  });

  it("classifies a refused page the same way as the full read", async () => {
    detailedMock.mockResolvedValue({ text: "", status: 403 });
    const whole = await fetchWithProxyFallbackDetailed(URL_);
    detailedMock.mockResolvedValue({ text: "", status: 403 });

    const metadataOnly = await fetchWithProxyFallbackDetailed(
      URL_,
      undefined,
      undefined,
      { metadataOnly: true },
    );

    expect(metadataOnly.failureType).toBe(whole.failureType);
    expect(metadataOnly.failureReason).toBe(whole.failureReason);
  });

  it("is what the cover service reads through fetchPageMetadataWithOutcome", async () => {
    detailedMock.mockResolvedValue({
      text: page(`<meta property="og:image" content="${OG}">`, 200),
      status: 200,
    });
    const service = new PageCoverImageService({
      fetchPage: (url) => fetchPageMetadataWithOutcome(url),
    });

    await expect(service.fetch(URL_)).resolves.toEqual({
      status: "found",
      url: OG,
    });
    expect(readability.constructed).not.toHaveBeenCalled();
  });
});
