import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
}));

import { robustFetchDetailed } from "../../../src/utils/platform-utils";
import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";

const fetchMock = vi.mocked(robustFetchDetailed);
const ARTICLE = `<html><head><title>T</title></head><body><article><p>${"Real article text. ".repeat(40)}</p></article></body></html>`;

describe("article fetch headers (#1109)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("does not spoof a Chrome User-Agent that anti-bot filters reject", async () => {
    fetchMock.mockResolvedValue({ html: ARTICLE } as never);
    await fetchWithProxyFallbackDetailed("https://example.com/a");
    expect(fetchMock).toHaveBeenCalled();
    const headers = fetchMock.mock.calls[0][1]?.headers ?? {};
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(
      "user-agent",
    );
  });
});
