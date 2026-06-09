import { requestUrl } from "obsidian";
import { canonicalizeItemIdentityUrl, resolveAbsoluteHttpUrl } from "../../utils/url-utils.js";
import { MediaService } from "../media-service.js";
import { CustomXMLParser } from "./xml-parser/custom-xml-parser.js";
import { assertParsedFeedHasEntries } from "./parsed-feed-assert.js";
import type { Feed, FeedItem } from "../../types/types.js";
import type { ParsedItem } from "./types.js";
export class FeedParserService {
  private static instance: FeedParserService;
  private parser: CustomXMLParser;

  private constructor() {
    this.parser = new CustomXMLParser();
  }

  public static getInstance(): FeedParserService {
    if (!FeedParserService.instance) {
      FeedParserService.instance = new FeedParserService();
    }
    return FeedParserService.instance;
  }

  private async fetchFeedXml(url: string): Promise<string> {
    const response = await requestUrl({
      url: url,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
        Accept:
          "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!response.text) {
      throw new Error(`Failed to fetch feed: Empty response`);
    }

    return response.text;
  }

  public async parseFeed(url: string, folder: string): Promise<Feed> {
    const xml = await this.fetchFeedXml(url);
    const parsed = this.parser.parseString(xml);

    assertParsedFeedHasEntries(parsed);

    const isPodcast = parsed.items.some(
      (item) =>
        item.enclosure?.type?.startsWith("audio/") ||
        item.itunes?.duration ||
        item.itunes?.explicit,
    );

    const podcastFeedImage =
      parsed.feedItunesImage ||
      parsed.feedImageUrl ||
      (parsed.image && typeof parsed.image === "object"
        ? parsed.image.url
        : "") ||
      (typeof parsed.image === "string" ? parsed.image : "");

    const items: FeedItem[] = parsed.items.map((item: ParsedItem) => ({
      title: item.title || "",
      link: item.link || "",
      description: item.description || "",
      pubDate: item.pubDate || new Date().toISOString(),
      guid: canonicalizeItemIdentityUrl(item.guid || item.link || ""),
      read: false,
      starred: false,
      tags: [],
      feedTitle: parsed.title || "",
      feedUrl: url,
      coverImage: isPodcast
        ? item.itunes?.image?.href || item.image?.url || podcastFeedImage || ""
        : item.itunes?.image?.href || item.image?.url || "",
      mediaContentType: item.mediaContentType,
      mediaType: isPodcast ? "podcast" : "article",
      author: item.author || "",
      content: item.content || "",
      saved: false,

      duration: item.itunes?.duration || "",
      explicit: item.itunes?.explicit === "yes",
      image: item.itunes?.image?.href || item.image?.url || "",
      category: item.itunes?.category || "",
      summary: item.itunes?.summary || "",
      episodeType: item.itunes?.episodeType || "",
      season: item.itunes?.season ? Number(item.itunes.season) : undefined,
      episode: item.itunes?.episode ? Number(item.itunes.episode) : undefined,
      enclosure: item.enclosure
        ? {
            url: item.enclosure.url,
            type: item.enclosure.type,
            length: item.enclosure.length,
          }
        : undefined,
      ieee: item.ieee,
    }));

    const tempFeed: Feed = {
      title: parsed.title || "",
      url: url,
      siteUrl: resolveAbsoluteHttpUrl(parsed.link, url) || undefined,
      items: items,
      folder: folder,
      lastUpdated: Date.now(),
      mediaType: isPodcast ? "podcast" : "article",
      iconUrl:
        parsed.feedItunesImage ||
        parsed.feedImageUrl ||
        (parsed.image && typeof parsed.image === "object"
          ? parsed.image.url
          : "") ||
        (typeof parsed.image === "string" ? parsed.image : ""),
    };

    // Correctly detect and process media types (YouTube, etc.)
    const processedFeed = MediaService.detectAndProcessFeed(tempFeed);

    return processedFeed;
  }
}
