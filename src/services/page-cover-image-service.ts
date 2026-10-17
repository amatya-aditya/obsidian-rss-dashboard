// The card action's fetch step (#1314). One page request per article link, at
// most, and only the page's declared image is read: a scan of the article body
// would pick a byline avatar or a site logo (#812).
import type { FullArticleFetchResult } from "../utils/fetch-helpers";
import { resolvePageCoverImage } from "../utils/article-metadata";

export type PageCoverImageStatus =
  | "found"
  | "none"
  | "restricted"
  | "failed"
  /** Nothing was requested: the item has no usable `http(s)` article link. */
  | "skipped";

export interface PageCoverImageResult {
  status: PageCoverImageStatus;
  /** The resolved image, empty unless `status` is `"found"`. */
  url: string;
  /** Why a `"failed"` result failed. */
  reason?: "timeout" | "network";
}

export interface PageCoverImageServiceDeps {
  /** The plugin's page-fetch path, so proxy fallback and the fetch timeout apply. */
  fetchPage(url: string): Promise<FullArticleFetchResult>;
}

export class PageCoverImageService {
  private readonly inFlight = new Map<string, Promise<PageCoverImageResult>>();

  constructor(private readonly deps: PageCoverImageServiceDeps) {}

  /**
   * Reads the page's declared cover image. A second call for a link already
   * being fetched shares that request rather than starting another.
   */
  fetch(rawLink: string): Promise<PageCoverImageResult> {
    const link = (rawLink ?? "").trim();
    if (!/^https?:\/\//i.test(link)) {
      return Promise.resolve({ status: "skipped", url: "" });
    }

    const existing = this.inFlight.get(link);
    if (existing) return existing;

    const run = this.run(link).finally(() => this.inFlight.delete(link));
    this.inFlight.set(link, run);
    return run;
  }

  private async run(link: string): Promise<PageCoverImageResult> {
    const result = await this.deps.fetchPage(link);
    const url = result.pageMetadata
      ? resolvePageCoverImage(result.pageMetadata, link)
      : "";
    if (url) return { status: "found", url };

    if (result.failureType === "restricted") {
      return { status: "restricted", url: "" };
    }
    if (result.failureType === "network") {
      return {
        status: "failed",
        url: "",
        reason: result.failureReason === "timeout" ? "timeout" : "network",
      };
    }
    return { status: "none", url: "" };
  }
}
