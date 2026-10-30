// Which page read the cover service gets, and with which settings (#1702): the
// head-only read, through the plugin's proxy and timeout, not the full article.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/full-article-fetch", () => ({
  fetchPageMetadataWithOutcome: vi.fn(async () => ({
    content: "",
    failureType: "none" as const,
  })),
  fetchFullArticleContentWithOutcome: vi.fn(),
}));

import {
  fetchFullArticleContentWithOutcome,
  fetchPageMetadataWithOutcome,
} from "../../../src/utils/full-article-fetch";
import { createPageCoverFetch } from "../../../src/services/page-cover-image-service";

const metadataOnly = vi.mocked(fetchPageMetadataWithOutcome);
const fullArticle = vi.mocked(fetchFullArticleContentWithOutcome);
const URL_ = "https://news.example.com/posts/one";

describe("createPageCoverFetch (#1702)", () => {
  beforeEach(() => {
    metadataOnly.mockClear();
    fullArticle.mockClear();
  });

  it("reads the page's head, never the whole article", async () => {
    const fetchPage = createPageCoverFetch(() => ({
      articleSaving: { fetchTimeout: 20 },
    }));

    await fetchPage(URL_);

    expect(metadataOnly).toHaveBeenCalledWith(URL_, undefined, 20);
    expect(fullArticle).not.toHaveBeenCalled();
  });

  it("uses the configured proxy only when it is enabled and set", async () => {
    let settings = {
      corsProxyEnabled: true,
      corsProxyUrl: "https://proxy.example.com/?url=",
      articleSaving: { fetchTimeout: 15 },
    };
    const fetchPage = createPageCoverFetch(() => settings);

    await fetchPage(URL_);
    expect(metadataOnly).toHaveBeenLastCalledWith(
      URL_,
      "https://proxy.example.com/?url=",
      15,
    );

    settings = { ...settings, corsProxyEnabled: false };
    await fetchPage(URL_);
    expect(metadataOnly).toHaveBeenLastCalledWith(URL_, undefined, 15);
  });
});
