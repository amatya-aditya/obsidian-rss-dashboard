import type { JsonFeed, JsonFeedItem, ParsedFeed } from "../types.js";

export interface JsonFeedParserDeps {
  transformSageUrl: (url: string) => string;
}

export function parseJSON(
  jsonString: string,
  deps: JsonFeedParserDeps,
): ParsedFeed {
  try {
    const data = JSON.parse(jsonString) as JsonFeed;

    if (data.version && data.version.startsWith("https://jsonfeed.org/")) {
      return {
        title: data.title || "",
        description: data.description,
        link: data.home_page_url,
        author: data.authors?.[0]?.name,
        image: data.icon ? { url: data.icon } : undefined,
        items:
          data.items?.map((item: JsonFeedItem) => {
            let itemUrl = item.url || "";

            itemUrl = deps.transformSageUrl(itemUrl);

            return {
              title: item.title || "",
              link: itemUrl,
              description: item.summary || "",
              pubDate: item.date_published || new Date().toISOString(),
              guid: item.id || itemUrl || "",
              author: item.authors?.[0]?.name,
              content: item.content_html || item.content_text || "",
              image: item.image ? { url: item.image } : undefined,
              category: item.category || item.tags?.[0] || "",
            };
          }) || [],
        type: "json",
        feedItunesImage: "",
        feedImageUrl: "",
      };
    }

    throw new Error("Unsupported JSON feed format");
  } catch (error) {
    throw new Error(
      `Failed to parse JSON feed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
