import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/fetch-helpers", () => ({
  fetchWithProxyFallbackDetailed: vi.fn(),
}));

import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";
import { fetchFullArticleContentWithOutcome } from "../../../src/utils/full-article-fetch";

const fetchMock = vi.mocked(fetchWithProxyFallbackDetailed);

// The first fetch fails, so any abstract fallback shows up as a second call.
function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => call[0]);
}

describe("fetchFullArticleContentWithOutcome host handling", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ content: "", failureType: "network" });
  });

  it.each([
    "https://journals.sagepub.com/doi/full/10.1/abc",
    "http://journals.sagepub.com/doi/full/10.1/abc",
    "https://journals.sagepub.com:8443/doi/full/10.1/abc?x=1#f",
  ])("retries the abstract page for %s", async (url) => {
    await fetchFullArticleContentWithOutcome(url);
    expect(requestedUrls()).toEqual([
      url,
      url.replace("/doi/full/", "/doi/abs/"),
    ]);
  });

  it("does not retry for an unrelated host", async () => {
    await fetchFullArticleContentWithOutcome(
      "https://example.com/doi/full/10.1/abc",
    );
    expect(requestedUrls()).toHaveLength(1);
  });

  it("does not retry when the path is not a full-text path", async () => {
    await fetchFullArticleContentWithOutcome(
      "https://journals.sagepub.com/doi/abs/10.1/abc",
    );
    expect(requestedUrls()).toHaveLength(1);
  });

  it("retries the abstract page for an uppercase host", async () => {
    await fetchFullArticleContentWithOutcome(
      "https://JOURNALS.SAGEPUB.COM/doi/full/10.1/abc",
    );
    expect(requestedUrls()).toHaveLength(2);
  });

  it("does not retry for a host that contains the domain as a prefix", async () => {
    await fetchFullArticleContentWithOutcome(
      "https://journals.sagepub.com.example.net/doi/full/10.1/abc",
    );
    expect(requestedUrls()).toHaveLength(1);
  });

  it("does not retry when the query merely mentions the domain", async () => {
    await fetchFullArticleContentWithOutcome(
      "https://example.net/doi/full/10.1/abc?u=journals.sagepub.com",
    );
    expect(requestedUrls()).toHaveLength(1);
  });
});
