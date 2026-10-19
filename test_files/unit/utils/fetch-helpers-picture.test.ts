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

const figure = (index: number): string => `
  <figure>
    <div role="button" tabindex="0">
      <span>Press enter or click to view image in full size</span>
      <div>
        <picture>
          <source srcset="https://cdn.example.com/figure-${index}-640.webp 640w,https://cdn.example.com/figure-${index}-1400.webp 1400w" type="image/webp">
          <source srcset="https://cdn.example.com/figure-${index}-640.jpg 640w,https://cdn.example.com/figure-${index}-1400.jpg 1400w">
          <img alt="" width="700" height="365" loading="eager" role="presentation">
        </picture>
      </div>
    </div>
    <figcaption>Figure ${index}</figcaption>
  </figure>`;

// Medium's server-rendered shape: each body image exists only in <source srcset>.
const MEDIUM_ARTICLE = `<html><head><title>Netflix</title></head><body><article>
  <h1>Netflix</h1>
  <p>${"Real article text. ".repeat(40)}</p>
  ${Array.from({ length: 10 }, (_unused, index) => figure(index + 1)).join("\n")}
</article></body></html>`;

describe("fetched articles keep server-rendered pictures (#1361)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    fetchMock.mockReset();
  });

  it("keeps all ten body figures in the fetched version", async () => {
    detailedMock.mockResolvedValue({ text: MEDIUM_ARTICLE, status: 200 });

    const result = await fetchWithProxyFallbackDetailed(
      "https://medium.example.com/netflix",
    );

    expect(result.failureType).toBe("none");
    expect(result.content.match(/<img\b/g)).toHaveLength(10);
    expect(result.content).not.toContain(
      "Press enter or click to view image in full size",
    );
    for (let index = 1; index <= 10; index += 1) {
      expect(result.content).toContain(
        `https://cdn.example.com/figure-${index}-1400.webp`,
      );
    }
  });

  it("keeps the pictures in fetchAndParse, which the Reader renders", async () => {
    fetchMock.mockResolvedValue(MEDIUM_ARTICLE);

    const content = await fetchAndParse("https://medium.example.com/netflix");

    expect(content.match(/<img\b/g)).toHaveLength(10);
    expect(content).toContain("https://cdn.example.com/figure-10-1400.webp");
  });

  it("fills a relative source candidate after resolving it against the page", async () => {
    detailedMock.mockResolvedValue({
      text: `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p><figure><picture><source srcset="/img/photo-640.jpg 640w,/img/photo-1400.jpg 1400w"><img alt=""></picture></figure></article></body></html>`,
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(
      "https://news.example.com/posts/1",
    );

    expect(result.content).toContain(
      "https://news.example.com/img/photo-1400.jpg",
    );
  });
});
