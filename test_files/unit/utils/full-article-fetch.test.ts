// The Sage full-text fallback must not chase the abstract page of a host that
// has just challenged us, and a blocked verdict must survive the merge (#1347).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/fetch-helpers", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/utils/fetch-helpers")
  >()),
  fetchWithProxyFallbackDetailed: vi.fn(),
}));

import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";
import { fetchFullArticleContentWithOutcome } from "../../../src/utils/full-article-fetch";

const fetchMock = vi.mocked(fetchWithProxyFallbackDetailed);

const FULL_URL = "https://journals.sagepub.com/doi/full/10.1/article";

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => call[0]);
}

describe("fetchFullArticleContentWithOutcome blocked handling (#1347)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("does not retry the abstract page when the full page was blocked", async () => {
    fetchMock.mockResolvedValue({
      content: "",
      failureType: "network",
      failureReason: "blocked",
    });

    const result = await fetchFullArticleContentWithOutcome(FULL_URL);

    expect(requestedUrls()).toEqual([FULL_URL]);
    expect(result.failureReason).toBe("blocked");
  });

  it("keeps a blocked abstract's verdict when the full page failed for another reason", async () => {
    fetchMock
      .mockResolvedValueOnce({ content: "", failureType: "network" })
      .mockResolvedValueOnce({
        content: "",
        failureType: "network",
        failureReason: "blocked",
      });

    const result = await fetchFullArticleContentWithOutcome(FULL_URL);

    expect(result.failureType).toBe("network");
    expect(result.failureReason).toBe("blocked");
  });
});
