import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { FeedMetadata } from "../../../src/types/discover-types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchFeedXmlMock = vi.fn();

vi.mock("../../../src/services/feed-parser", () => ({
  fetchFeedXml: fetchFeedXmlMock,
}));

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const baseFeed = {
  id: "test-feed",
  title: "Example Feed",
  url: "https://example.com/feed.xml",
  imageUrl: "",
  summary: "A short summary",
  type: "Blog",
  domain: ["Tech"],
  subdomain: [],
  area: [],
  topic: [],
  tags: ["AI"],
};

describe("FeedPreviewModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
    fetchFeedXmlMock.mockReset();
    vi.restoreAllMocks();
  });

  it("renders latest articles and opens links on click", async () => {
    const { FeedPreviewModal } = await import("../../../src/modals/feed-preview-modal");

    fetchFeedXmlMock.mockResolvedValue(
      `<?xml version="1.0"?>
      <rss xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>One</title>
            <link>https://example.com/1</link>
            <description><![CDATA[<p>Hello &amp; <b>world</b></p>]]></description>
            <pubDate>2026-03-20T00:00:00.000Z</pubDate>
            <author>Jane</author>
            <content:encoded><![CDATA[<img src="https://example.com/img.jpg" />]]></content:encoded>
          </item>
          <item>
            <title>Two</title>
            <link>https://example.com/2</link>
            <description>Plain</description>
            <pubDate>2026-03-21T00:00:00.000Z</pubDate>
          </item>
        </channel>
      </rss>`,
    );

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const app = obsidian.App.createMock();
    const modal = new FeedPreviewModal(app as unknown as obsidian.App, baseFeed as unknown as FeedMetadata);
    modal.open();

    await flushPromises();

    expect(fetchFeedXmlMock).toHaveBeenCalledWith("https://example.com/feed.xml");
    expect(modal.contentEl.querySelector(".feed-preview-grid")).toBeTruthy();
    expect(modal.contentEl.textContent).toContain("Latest 2 articles");

    const firstTitle = modal.contentEl.querySelector(
      ".feed-preview-article-title",
    ) as HTMLHeadingElement;
    expect(firstTitle.textContent).toBe("One");

    const firstDescription = modal.contentEl.querySelector(
      ".feed-preview-article-description",
    ) as HTMLDivElement;
    expect(firstDescription.textContent).toContain("Hello & world");
    expect(firstDescription.textContent).not.toContain("<p>");

    firstTitle.click();
    expect(openSpy).toHaveBeenCalledWith("https://example.com/1", "_blank");
  });

  it("removes an article image container on image error", async () => {
    const { FeedPreviewModal } = await import("../../../src/modals/feed-preview-modal");

    fetchFeedXmlMock.mockResolvedValue(
      `<?xml version="1.0"?>
      <rss>
        <channel>
          <item>
            <title>One</title>
            <link>https://example.com/1</link>
            <description>Desc</description>
            <enclosure type="image/jpeg" url="https://example.com/img.jpg" />
          </item>
        </channel>
      </rss>`,
    );

    const app = obsidian.App.createMock();
    const modal = new FeedPreviewModal(app as unknown as obsidian.App, baseFeed as unknown as FeedMetadata);
    modal.open();

    await flushPromises();

    const imageContainer = modal.contentEl.querySelector(
      ".feed-preview-article-image-container",
    ) as HTMLDivElement;
    expect(imageContainer).toBeTruthy();

    const img = imageContainer.querySelector("img") as HTMLImageElement;
    img.dispatchEvent(new Event("error"));

    expect(
      modal.contentEl.querySelector(".feed-preview-article-image-container"),
    ).toBeFalsy();
  });

  it("renders an error and retries fetching on button click", async () => {
    const { FeedPreviewModal } = await import("../../../src/modals/feed-preview-modal");

    fetchFeedXmlMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(
        `<?xml version="1.0"?><rss><channel><item><title>Ok</title><link>x</link></item></channel></rss>`,
      );

    const app = obsidian.App.createMock();
    const modal = new FeedPreviewModal(app as unknown as obsidian.App, baseFeed as unknown as FeedMetadata);
    modal.open();

    await flushPromises();

    expect(modal.contentEl.textContent).toContain("Error: boom");

    const retryBtn = modal.contentEl.querySelector("button.mod-cta") as HTMLButtonElement;
    expect(retryBtn?.textContent).toBe("Retry");

    retryBtn.click();
    await flushPromises();

    expect(fetchFeedXmlMock).toHaveBeenCalledTimes(2);
  });

  it("shows an empty state when no articles are found", async () => {
    const { FeedPreviewModal } = await import("../../../src/modals/feed-preview-modal");

    fetchFeedXmlMock.mockResolvedValue(`<?xml version="1.0"?><rss><channel></channel></rss>`);

    const app = obsidian.App.createMock();
    const modal = new FeedPreviewModal(app as unknown as obsidian.App, baseFeed as unknown as FeedMetadata);
    modal.open();

    await flushPromises();

    expect(modal.contentEl.textContent).toContain("No articles found in this feed");
  });
});
