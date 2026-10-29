// A cover-image fetch reads an article page on the publisher's own site, so it
// must not take a slot from the feed-refresh limiter (#1702). The service runs
// through the same page fetch main.ts wires; only the network call is replaced.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/fetch-helpers", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/utils/fetch-helpers")
  >()),
  fetchWithProxyFallbackDetailed: vi.fn(),
}));

import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";
import { fetchPageMetadataWithOutcome } from "../../../src/utils/full-article-fetch";
import { globalFetchSemaphore } from "../../../src/services/feed-parser/fetch-semaphore";
import { PageCoverImageService } from "../../../src/services/page-cover-image-service";

const fetchMock = vi.mocked(fetchWithProxyFallbackDetailed);

describe("PageCoverImageService and the feed-refresh limiter (#1702)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ content: "", failureType: "network" });
  });

  it("fetches a page without taking a feed-refresh slot", async () => {
    const acquire = vi.spyOn(globalFetchSemaphore, "acquire");
    const service = new PageCoverImageService({
      fetchPage: (url) => fetchPageMetadataWithOutcome(url),
    });

    await service.fetch("https://example.com/posts/one");
    await service.fetch("https://example.com/posts/two");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(acquire).not.toHaveBeenCalled();
  });
});
