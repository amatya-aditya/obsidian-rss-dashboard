import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
}));

import { robustFetchDetailed } from "../../../src/utils/platform-utils";
import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";

const detailedMock = vi.mocked(robustFetchDetailed);

const PAGE = `<html><head><title>T</title></head><body><article><div class="ad-300"><p>Sponsored placement</p></div><p>${"Real article text. ".repeat(40)}</p><p>Closing paragraph.</p></article></body></html>`;

describe("fetched articles drop ad containers before extraction (#1195)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
  });

  it("leaves no ad text in the extracted content", async () => {
    // Readability strips class attributes, so the saver's class-based ad
    // selectors can never match the extracted content. The container has to go
    // while the raw page still carries its class.
    detailedMock.mockResolvedValue({ text: PAGE, status: 200 });

    const result = await fetchWithProxyFallbackDetailed(
      "https://news.example.com/posts/1",
    );

    expect(result.failureType).toBe("none");
    expect(result.content).toContain("Real article text.");
    expect(result.content).not.toContain("Sponsored placement");
  });
});
