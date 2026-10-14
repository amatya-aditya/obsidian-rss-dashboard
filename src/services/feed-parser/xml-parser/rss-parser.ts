import type { ParsedFeed, ParsedItem } from "../types.js";
import {
  authorsFromChildren,
  joinAuthors,
  splitAuthorElements,
} from "../author-normalization.js";
import { parseRssItem } from "./rss-item-parser.js";

export interface RssParserDeps {
  getDirectChild: (element: Element, tagName: string) => Element | null;
  getTextContent: (
    element: Element | null,
    tagName: string,
    isHtml?: boolean,
    directChildOnly?: boolean,
  ) => string;
  getAttribute: (
    element: Element | null,
    tagName: string,
    attribute: string,
    directChildOnly?: boolean,
  ) => string;
  getMediaImageUrl: (item: Element) => string;
  getMediaContentType: (item: Element) => string;
  getMediaContentMedium: (item: Element) => string;
  transformSageUrl: (url: string) => string;
  extractImageFromContent: (content: string) => string;
  convertAppUrls: (url: string) => string;
}

/** The channel's declared language: `<language>`, else `<dc:language>`. */
function channelLanguage(channel: Element, deps: RssParserDeps): string {
  return (
    deps.getTextContent(channel, "language", false, true) ||
    deps.getTextContent(channel, "dc:language", false, true)
  );
}

export function parseRSS(doc: Document, deps: RssParserDeps): ParsedFeed {
  const channel = doc.querySelector("channel");
  if (!channel) throw new Error("Invalid rss feed: no channel element found");

  const title = deps.getTextContent(channel, "title", false, true);

  const description = deps.getTextContent(channel, "description", false, true);
  const link = deps.getTextContent(channel, "link", false, true);

  const author =
    deps.getTextContent(channel, "author", false, true) ||
    deps.getTextContent(channel, "dc:creator", false, true);

  const imageElement = deps.getDirectChild(channel, "image");
  const image = imageElement
    ? { url: deps.getTextContent(imageElement, "url") }
    : undefined;

  const feedItunesImage =
    deps.getAttribute(channel, "itunes:image", "href", true) ||
    deps.getAttribute(channel, "itunes\\:image", "href", true);
  const itunesImage = feedItunesImage ? { url: feedItunesImage } : undefined;
  const feedImageUrl = imageElement
    ? deps.getTextContent(imageElement, "url")
    : "";

  const items: ParsedItem[] = [];
  // Use only direct child <item> nodes to avoid accidentally parsing nested
  // <item> tags that may appear in malformed feeds (e.g., inside description HTML).
  const itemElements = Array.from(channel.children).filter(
    (el) => el.tagName.toLowerCase() === "item",
  );

  itemElements.forEach((item) => {
    items.push(parseRssItem(item, deps));
  });

  const result: ParsedFeed = {
    title,
    description,
    link,
    author,
    image: itunesImage || image,
    items,
    type: "rss",
    feedItunesImage,
    feedImageUrl,
    language: channelLanguage(channel, deps) || undefined,
  };

  return result;
}

export function parseRSS1(doc: Document, deps: RssParserDeps): ParsedFeed {
  const channel = doc.querySelector("channel");
  if (!channel)
    throw new Error("Invalid rss 1.0 feed: no channel element found");

  const title = deps.getTextContent(channel, "title", false, true);
  const description = deps.getTextContent(channel, "description", false, true);
  const link = deps.getTextContent(channel, "link", false, true);
  const author =
    deps.getTextContent(channel, "dc:creator", false, true) ||
    deps.getTextContent(channel, "dc:publisher", false, true);

  let image: { url: string } | undefined;
  const imageRef = deps.getDirectChild(channel, "image");
  if (imageRef) {
    const imageResource = imageRef.getAttribute("rdf:resource");
    if (imageResource) {
      image = { url: deps.convertAppUrls(imageResource) };
    } else {
      const imageUrl = deps.getTextContent(imageRef, "url");
      if (imageUrl) {
        image = { url: deps.convertAppUrls(imageUrl) };
      }
    }
  }

  const items: ParsedItem[] = [];

  const itemElements = Array.from(doc.getElementsByTagName("item"));

  itemElements.forEach((item, _index) => {
    const guid =
      item.getAttribute("rdf:about") ||
      deps.getTextContent(item, "guid") ||
      deps.getTextContent(item, "link") ||
      deps.getTextContent(item, "prism:url");

    const itemTitle =
      deps.getTextContent(item, "title") ||
      deps.getTextContent(item, "dc:title");
    let itemLink =
      deps.getTextContent(item, "link") ||
      deps.getTextContent(item, "prism:url");

    itemLink = deps.transformSageUrl(itemLink);

    const itemDescription =
      deps.getTextContent(item, "description") ||
      deps.getTextContent(item, "content:encoded");

    const pubDate =
      deps.getTextContent(item, "dc:date") ||
      deps.getTextContent(item, "pubDate");

    const creatorAuthors = authorsFromChildren(item, ["dc:creator"]);
    const itemAuthors = creatorAuthors.length
      ? creatorAuthors
      : splitAuthorElements([deps.getTextContent(item, "dc:creator")]);

    const contentValue =
      deps.getTextContent(item, "content:encoded", true) ||
      deps.getTextContent(item, "encoded", true) ||
      itemDescription;

    items.push({
      title: itemTitle || "Untitled",
      link: itemLink || "#",
      description: itemDescription || "",
      pubDate: pubDate || "",
      guid: guid || itemLink || `item-${items.length}`,
      author: joinAuthors(itemAuthors) || undefined,
      authors: itemAuthors,
      content: contentValue || itemDescription || "",
      category: deps.getTextContent(item, "category"),
    });
  });

  return {
    title: title || "Unknown feed",
    description: description || "",
    link: link || "",
    author: author || undefined,
    image,
    items,
    type: "rss",
    feedItunesImage: "",
    feedImageUrl: "",
    language: channelLanguage(channel, deps) || undefined,
  };
}
