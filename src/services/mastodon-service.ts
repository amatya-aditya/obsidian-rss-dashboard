import { requestUrl } from "obsidian";

export class MastodonService {
  private static readonly PROFILE_PATH_PATTERNS = [
    /^\/@[^/?#]+\/?$/i,
    /^\/users\/[^/?#]+\/?$/i,
  ];
  private static readonly FEED_PATH_PATTERNS = [
    /^\/@[^/?#]+\.rss$/i,
    /^\/users\/[^/?#]+\.rss$/i,
  ];

  static isMastodonProfileUrl(url: string): boolean {
    if (!url) return false;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
      return false;
    }

    return this.PROFILE_PATH_PATTERNS.some((pattern) =>
      pattern.test(parsed.pathname),
    );
  }

  static async resolveProfileFeed(url: string): Promise<string | null> {
    if (!this.isMastodonProfileUrl(url)) {
      return null;
    }

    const normalizedUrl = this.normalizeProfileUrl(url);

    try {
      const response = await requestUrl({
        url: normalizedUrl,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      return this.extractDiscoveredFeedUrl(response.text, normalizedUrl);
    } catch {
      return null;
    }
  }

  static isResolvedFeedUrl(url: string): boolean {
    if (!url) return false;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
      return false;
    }

    return this.FEED_PATH_PATTERNS.some((pattern) =>
      pattern.test(parsed.pathname),
    );
  }

  private static normalizeProfileUrl(url: string): string {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  }

  private static extractDiscoveredFeedUrl(
    html: string,
    baseUrl: string,
  ): string | null {
    if (!html) return null;

    const rssLinkMatch =
      html.match(
        /<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["'][^>]*>/i,
      ) ||
      html.match(
        /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["'][^>]*>/i,
      );

    if (!rssLinkMatch?.[1]) {
      return null;
    }

    try {
      return new URL(rssLinkMatch[1], baseUrl).toString();
    } catch {
      return null;
    }
  }
}
