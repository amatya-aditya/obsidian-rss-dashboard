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
const ARTICLE = `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p></article></body></html>`;

function sentHeaderNames(call: unknown[]): string[] {
  const options = call[1] as { headers?: Record<string, string> } | undefined;
  return Object.keys(options?.headers ?? {}).map((k) => k.toLowerCase());
}

describe("article fetch headers (#1109)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    fetchMock.mockReset();
  });

  it("sends no spoofed User-Agent on the direct fetch", async () => {
    detailedMock.mockResolvedValue({ text: ARTICLE, status: 200 });
    const result = await fetchWithProxyFallbackDetailed(
      "https://example.com/a",
    );
    expect(result.failureType).toBe("none");
    expect(sentHeaderNames(detailedMock.mock.calls[0])).not.toContain(
      "user-agent",
    );
  });

  it("sends no spoofed User-Agent on the proxy fallback fetch", async () => {
    detailedMock
      .mockResolvedValueOnce({ text: "", status: 200 })
      .mockResolvedValue({ text: ARTICLE, status: 200 });
    await fetchWithProxyFallbackDetailed(
      "https://example.com/a",
      "https://proxy.example/?url=",
    );
    expect(detailedMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of detailedMock.mock.calls) {
      expect(sentHeaderNames(call)).not.toContain("user-agent");
    }
  });

  it("sends no spoofed User-Agent from fetchAndParse", async () => {
    fetchMock.mockResolvedValue(ARTICLE);
    await fetchAndParse("https://example.com/a");
    expect(sentHeaderNames(fetchMock.mock.calls[0])).not.toContain(
      "user-agent",
    );
  });
});
