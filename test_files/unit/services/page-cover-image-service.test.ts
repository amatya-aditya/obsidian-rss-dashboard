// The manual cover-image fetch step (#1314). One page request per
// article link, and only the page's declared image is read: a scan of the
// article body would pick a byline avatar or a site logo (#812).
import { describe, expect, it, vi } from "vitest";
import { PageCoverImageService } from "../../../src/services/page-cover-image-service";
import {
  emptyRawMetadata,
  type RawArticleMetadata,
} from "../../../src/utils/article-metadata";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";

/** A page-fetch result shaped like the real one, with the metadata a test needs. */
function pageResult(
  failureType: FullArticleFetchResult["failureType"],
  metadata: Partial<RawArticleMetadata> = {},
  failureReason?: FullArticleFetchResult["failureReason"],
): FullArticleFetchResult {
  return {
    content: "",
    failureType,
    pageMetadata: { ...emptyRawMetadata(), ...metadata },
    ...(failureReason ? { failureReason } : {}),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("PageCoverImageService", () => {
  const LINK = "https://example.com/posts/one";

  it("returns the page's declared og:image", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue(
        pageResult("none", { ogImage: "https://cdn.example.com/hero.jpg" }),
      );
    const service = new PageCoverImageService({ fetchPage });

    await expect(service.fetch(LINK)).resolves.toEqual({
      status: "found",
      url: "https://cdn.example.com/hero.jpg",
    });
    expect(fetchPage).toHaveBeenCalledWith(LINK);
  });

  it("uses a restricted page's own image, since a paywalled page often has one", async () => {
    const fetchPage = vi.fn().mockResolvedValue(
      pageResult("restricted", {
        ogImage: "https://cdn.example.com/hero.jpg",
      }),
    );
    const service = new PageCoverImageService({ fetchPage });

    await expect(service.fetch(LINK)).resolves.toEqual({
      status: "found",
      url: "https://cdn.example.com/hero.jpg",
    });
  });

  it("reports none when a fetched page declares no image", async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageResult("none"));
    const service = new PageCoverImageService({ fetchPage });

    await expect(service.fetch(LINK)).resolves.toEqual({
      status: "none",
      url: "",
    });
  });

  it("reports a restricted page with no image as restricted", async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageResult("restricted"));
    const service = new PageCoverImageService({ fetchPage });

    await expect(service.fetch(LINK)).resolves.toEqual({
      status: "restricted",
      url: "",
    });
  });

  it("reports a timeout and an unexpected network failure apart", async () => {
    const timeout = new PageCoverImageService({
      fetchPage: vi
        .fn()
        .mockResolvedValue(pageResult("network", {}, "timeout")),
    });
    const network = new PageCoverImageService({
      fetchPage: vi
        .fn()
        .mockResolvedValue(pageResult("network", {}, "unexpected")),
    });

    await expect(timeout.fetch(LINK)).resolves.toEqual({
      status: "failed",
      url: "",
      reason: "timeout",
    });
    await expect(network.fetch(LINK)).resolves.toEqual({
      status: "failed",
      url: "",
      reason: "network",
    });
  });

  it("skips an item with no usable http(s) article link, without fetching", async () => {
    const fetchPage = vi.fn();
    const service = new PageCoverImageService({ fetchPage });

    await expect(service.fetch("  ")).resolves.toEqual({
      status: "skipped",
      url: "",
    });
    await expect(service.fetch("obsidian://open?vault=x")).resolves.toEqual({
      status: "skipped",
      url: "",
    });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("shares one request when the same link is fetched twice in flight", async () => {
    const pending = deferred<FullArticleFetchResult>();
    const fetchPage = vi.fn().mockReturnValue(pending.promise);
    const service = new PageCoverImageService({ fetchPage });

    const first = service.fetch(LINK);
    const second = service.fetch(LINK);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    pending.resolve(
      pageResult("none", { ogImage: "https://cdn.example.com/hero.jpg" }),
    );
    await expect(first).resolves.toEqual({
      status: "found",
      url: "https://cdn.example.com/hero.jpg",
    });
    await expect(second).resolves.toEqual({
      status: "found",
      url: "https://cdn.example.com/hero.jpg",
    });
  });

  it("fetches again once the earlier request for that link has settled", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageResult("none"))
      .mockResolvedValueOnce(
        pageResult("none", { ogImage: "https://cdn.example.com/hero.jpg" }),
      );
    const service = new PageCoverImageService({ fetchPage });

    await expect(service.fetch(LINK)).resolves.toEqual({
      status: "none",
      url: "",
    });
    await expect(service.fetch(LINK)).resolves.toEqual({
      status: "found",
      url: "https://cdn.example.com/hero.jpg",
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
