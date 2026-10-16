import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
}));

import {
  robustFetch,
  robustFetchDetailed,
} from "../../../src/utils/platform-utils";
import {
  fetchAndParse,
  fetchWithProxyFallbackDetailed,
} from "../../../src/utils/fetch-helpers";

const detailedMock = vi.mocked(robustFetchDetailed);
const fetchMock = vi.mocked(robustFetch);

const ARTICLE = `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p><img src="/img/x.png" alt="Pic"></article></body></html>`;

describe("fetched articles resolve relative URLs against the article (#1195)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    fetchMock.mockReset();
  });

  it("absolute-ises a root-relative image against the fetched page's URL", async () => {
    detailedMock.mockResolvedValue({ text: ARTICLE, status: 200 });

    const result = await fetchWithProxyFallbackDetailed(
      "https://news.example.com/posts/1",
    );

    expect(result.failureType).toBe("none");
    expect(result.content).toContain("https://news.example.com/img/x.png");
    expect(result.content).not.toContain("app://");
  });

  it("absolute-ises a root-relative image from fetchAndParse", async () => {
    fetchMock.mockResolvedValue(ARTICLE);

    const content = await fetchAndParse("https://news.example.com/posts/1");

    expect(content).toContain("https://news.example.com/img/x.png");
    expect(content).not.toContain("app://");
  });

  it("keeps a page's own base when it declares one", async () => {
    detailedMock.mockResolvedValue({
      text: `<html><head><base href="https://cdn.example.net/assets/"></head><body><article><p>${"Real article text. ".repeat(40)}</p><img src="pic.png" alt="Pic"></article></body></html>`,
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(
      "https://news.example.com/posts/1",
    );

    expect(result.content).toContain("https://cdn.example.net/assets/pic.png");
  });

  it("leaves a fragment-only link as an in-page link", async () => {
    detailedMock.mockResolvedValue({
      text: `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p><a href="#fn1">Footnote</a></article></body></html>`,
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(
      "https://news.example.com/posts/1",
    );

    expect(result.content).toContain('href="#fn1"');
    expect(result.content).not.toContain("news.example.com/posts/1#fn1");
  });

  it("absolute-ises a relative link and a srcset candidate", async () => {
    detailedMock.mockResolvedValue({
      text: `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p><a href="/rel/page">More</a><img src="/pic.png" srcset="/pic.png 1x, /pic@2x.png 2x" alt="Pic"></article></body></html>`,
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(
      "https://news.example.com/posts/1",
    );

    expect(result.content).toContain(
      'href="https://news.example.com/rel/page"',
    );
    expect(result.content).toContain("https://news.example.com/pic@2x.png 2x");
  });
});
