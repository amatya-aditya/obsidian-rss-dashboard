import type { ParsedFeed, ParsedItem } from "../types.js";
import {
  authorsFromChildren,
  joinAuthors,
  splitAuthorElements,
} from "../author-normalization.js";

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
    const itemTitle = deps.getTextContent(item, "title");
    let itemLink = deps.getTextContent(item, "link");

    itemLink = deps.transformSageUrl(itemLink);

    let itemDescription =
      deps.getTextContent(item, "description") ||
      deps.getTextContent(item, "media:description");
    const pubDate = deps.getTextContent(item, "pubDate");
    const guid = deps.getTextContent(item, "guid") || itemLink;

    if (itemDescription === "null" || itemDescription === "") {
      itemDescription = "";
    }

    const pubYear = deps.getTextContent(item, "pubYear");
    const volume = deps.getTextContent(item, "volume");
    const issue = deps.getTextContent(item, "issue");
    const startPage = deps.getTextContent(item, "startPage");
    const endPage = deps.getTextContent(item, "endPage");
    const fileSize = deps.getTextContent(item, "fileSize");
    const authors = deps.getTextContent(item, "authors");

    const ieee =
      pubYear || volume || issue || startPage || endPage || fileSize || authors
        ? {
            pubYear,
            volume,
            issue,
            startPage,
            endPage,
            fileSize,
            authors,
          }
        : undefined;

    const itemAuthors = authorsFromChildren(item, [
      "authors",
      "author",
      "dc:creator",
    ]);

    const content =
      deps.getTextContent(item, "content:encoded", true) ||
      deps.getTextContent(item, "encoded", true) ||
      itemDescription;

    const enclosureElement = item.querySelector("enclosure");
    const enclosure = enclosureElement
      ? {
          url: enclosureElement.getAttribute("url") || "",
          type: enclosureElement.getAttribute("type") || "",
          length: enclosureElement.getAttribute("length") || "",
        }
      : undefined;

    const itunes = {
      duration: deps.getTextContent(item, "itunes\\:duration"),
      explicit: deps.getTextContent(item, "itunes\\:explicit"),
      image: {
        href: deps.getAttribute(item, "itunes\\:image", "href"),
      },
      category: deps.getTextContent(item, "itunes\\:category"),
      summary: deps.getTextContent(item, "itunes\\:summary"),
      episodeType: deps.getTextContent(item, "itunes\\:episodeType"),
      season: deps.getTextContent(item, "itunes\\:season"),
      episode: deps.getTextContent(item, "itunes\\:episode"),
    };

    const itemImageElement = item.querySelector("image");
    let itemImageUrl = "";
    if (itemImageElement) {
      itemImageUrl = deps.getTextContent(itemImageElement, "url");
      if (!itemImageUrl) {
        itemImageUrl = deps.getTextContent(item, "image");
      }
    }
    const itemImage = itemImageUrl ? { url: itemImageUrl } : undefined;

    let mediaImage = "";
    mediaImage = deps.getMediaImageUrl(item);
    const mediaContentType = deps.getMediaContentType(item) || undefined;
    const mediaContentMedium = deps.getMediaContentMedium(item) || undefined;

    let fallbackImage = "";
    if (!itemImage && !mediaImage) {
      fallbackImage = deps.extractImageFromContent(
        content || itemDescription || "",
      );
    }

    items.push({
      title: itemTitle,
      link: itemLink,
      description: itemDescription,
      pubDate,
      guid,
      author: joinAuthors(itemAuthors),
      authors: itemAuthors,
      content,
      enclosure,
      itunes,
      image:
        itemImage ||
        (mediaImage ? { url: mediaImage } : undefined) ||
        (fallbackImage ? { url: fallbackImage } : undefined),
      category: deps.getTextContent(item, "category"),
      mediaContentType,
      mediaContentMedium,
      ieee,
    });
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
  };
}
