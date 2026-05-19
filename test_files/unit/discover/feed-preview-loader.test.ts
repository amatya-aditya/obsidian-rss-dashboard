import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MediaService } from "../../../src/services/media-service";

const loadFeedForPreviewMock = vi.fn();
const resolvePodcastPlatformUrlMock = vi.fn();
const detectPodcastPlatformMock = vi.fn();

vi.mock("../../../src/services/feed-parser", () => ({
  loadFeedForPreview: loadFeedForPreviewMock,
  resolvePodcastPlatformUrl: resolvePodcastPlatformUrlMock,
}));

vi.mock("../../../src/utils/podcast-platforms", () => ({
  detectPodcastPlatform: detectPodcastPlatformMock,
}));

describe("resolveAndLoadPreview()", () => {
  beforeEach(() => {
    loadFeedForPreviewMock.mockReset();
    resolvePodcastPlatformUrlMock.mockReset();
    detectPodcastPlatformMock.mockReset();

    vi.spyOn(MediaService, "isXUrl").mockReturnValue(false);
    vi.spyOn(MediaService, "getNitterRssFeed").mockReturnValue(null);
    vi.spyOn(MediaService, "isMastodonUrl").mockReturnValue(false);
    vi.spyOn(MediaService, "getMastodonRssFeed").mockResolvedValue(null);
    vi.spyOn(MediaService, "isYouTubeFeed").mockReturnValue(false);
    vi.spyOn(MediaService, "getYouTubeRssFeed").mockResolvedValue(null);

    loadFeedForPreviewMock.mockResolvedValue({
      title: "Example Feed",
      latestPubDate: "2026-03-20T00:00:00.000Z",
      hasEntries: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a plain RSS URL directly", async () => {
    const { resolveAndLoadPreview } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );

    detectPodcastPlatformMock.mockReturnValue(null);

    const result = await resolveAndLoadPreview("https://example.com/feed.xml");

    expect(result.detectedType).toBe("rss");
    expect(result.finalUrl).toBe("https://example.com/feed.xml");
    expect(result.isMastodonConversion).toBe(false);
    expect(loadFeedForPreviewMock).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
    );
  });

  it("converts X URLs to Nitter before loading", async () => {
    const { resolveAndLoadPreview } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );

    vi.spyOn(MediaService, "isXUrl").mockReturnValue(true);
    vi.spyOn(MediaService, "getNitterRssFeed").mockReturnValue(
      "https://nitter.net/user/rss",
    );

    const result = await resolveAndLoadPreview("https://x.com/user");

    expect(result.isXConversion).toBe(true);
    expect(result.isMastodonConversion).toBe(false);
    expect(result.finalUrl).toBe("https://nitter.net/user/rss");
    expect(loadFeedForPreviewMock).toHaveBeenCalledWith(
      "https://nitter.net/user/rss",
    );
  });

  it("resolves YouTube page URLs to RSS feed URLs before loading", async () => {
    const { resolveAndLoadPreview } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );

    vi.spyOn(MediaService, "isYouTubeFeed").mockReturnValue(true);
    vi.spyOn(MediaService, "getYouTubeRssFeed").mockResolvedValue(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
    );

    const result = await resolveAndLoadPreview("https://youtube.com/@handle");

    expect(result.detectedType).toBe("youtube");
    expect(result.isMastodonConversion).toBe(false);
    expect(result.finalUrl).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
    );
    expect(loadFeedForPreviewMock).toHaveBeenCalledWith(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
    );
  });

  it("resolves Mastodon profile URLs to RSS feed URLs before loading", async () => {
    const { resolveAndLoadPreview } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );

    vi.spyOn(MediaService, "isMastodonUrl").mockReturnValue(true);
    vi.spyOn(MediaService, "getMastodonRssFeed").mockResolvedValue(
      "https://mastodon.social/@user.rss",
    );

    const result = await resolveAndLoadPreview("https://mastodon.social/@user");

    expect(result.detectedType).toBe("rss");
    expect(result.isMastodonConversion).toBe(true);
    expect(result.finalUrl).toBe("https://mastodon.social/@user.rss");
    expect(loadFeedForPreviewMock).toHaveBeenCalledWith(
      "https://mastodon.social/@user.rss",
    );
  });

  it("resolves podcast platform URLs before loading", async () => {
    const { resolveAndLoadPreview } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );

    detectPodcastPlatformMock.mockReturnValue({
      id: "apple",
      name: "Apple Podcasts",
    });
    resolvePodcastPlatformUrlMock.mockResolvedValue(
      "https://example.com/podcast.rss",
    );

    const result = await resolveAndLoadPreview(
      "https://podcasts.apple.com/show/123",
      { corsProxyEnabled: true, corsProxyUrl: "https://proxy.example.com/" },
    );

    expect(result.detectedType).toBe("podcast");
    expect(result.isMastodonConversion).toBe(false);
    expect(result.finalUrl).toBe("https://example.com/podcast.rss");
    expect(resolvePodcastPlatformUrlMock).toHaveBeenCalledWith(
      "https://podcasts.apple.com/show/123",
      "https://proxy.example.com/",
    );
  });

  it("throws if Pocket Casts resolution is attempted without CORS proxy enabled", async () => {
    const { resolveAndLoadPreview } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );

    detectPodcastPlatformMock.mockReturnValue({
      id: "pocketcasts",
      name: "Pocket Casts",
    });

    await expect(
      resolveAndLoadPreview("https://pocketcasts.com/pod/xyz", {
        corsProxyEnabled: false,
      }),
    ).rejects.toThrow(/Pocket Casts resolution requires the CORS Proxy/i);
  });
});

describe("formatLatestEntryLabel()", () => {
  it("returns Today when latest pubdate is within same day offset", async () => {
    const { formatLatestEntryLabel } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );
    const now = new Date("2026-03-22T12:00:00.000Z").getTime();
    const latest = "2026-03-22T00:30:00.000Z";
    expect(formatLatestEntryLabel(latest, now)).toBe("Today");
  });

  it("returns N days ago for older dates", async () => {
    const { formatLatestEntryLabel } = await import(
      "../../../src/modals/feed-manager/feed-preview-loader"
    );
    const now = new Date("2026-03-22T12:00:00.000Z").getTime();
    const latest = "2026-03-20T00:30:00.000Z";
    expect(formatLatestEntryLabel(latest, now)).toBe("2 days ago");
  });
});

