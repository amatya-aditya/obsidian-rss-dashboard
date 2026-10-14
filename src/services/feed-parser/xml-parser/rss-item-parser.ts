import type { ParsedItem } from "../types.js";
import { authorsFromChildren, joinAuthors } from "../author-normalization.js";

export interface RssItemParserDeps {
  getTextContent: (
    element: Element | null,
    tagName: string,
    isHtml?: boolean,
  ) => string;
  getAttribute: (
    element: Element | null,
    tagName: string,
    attribute: string,
  ) => string;
  getMediaImageUrl: (item: Element) => string;
  getMediaContentType: (item: Element) => string;
  getMediaContentMedium: (item: Element) => string;
  transformSageUrl: (url: string) => string;
  extractImageFromContent: (content: string) => string;
}

/** Reads the item title, link, description, dates, authors, and content. */
function readItemIdentity(
  item: Element,
  deps: RssItemParserDeps,
): {
  itemTitle: string;
  itemLink: string;
  itemDescription: string;
  pubDate: string;
  guid: string;
  itemAuthors: string[];
  content: string;
} {
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

  const itemAuthors = authorsFromChildren(item, [
    "authors",
    "author",
    "dc:creator",
  ]);

  const content =
    deps.getTextContent(item, "content:encoded", true) ||
    deps.getTextContent(item, "encoded", true) ||
    itemDescription;

  return {
    itemTitle,
    itemLink,
    itemDescription,
    pubDate,
    guid,
    itemAuthors,
    content,
  };
}

/** Reads the item's IEEE citation fields. */
function readItemIeee(
  item: Element,
  deps: RssItemParserDeps,
): ParsedItem["ieee"] {
  const pubYear = deps.getTextContent(item, "pubYear");
  const volume = deps.getTextContent(item, "volume");
  const issue = deps.getTextContent(item, "issue");
  const startPage = deps.getTextContent(item, "startPage");
  const endPage = deps.getTextContent(item, "endPage");
  const fileSize = deps.getTextContent(item, "fileSize");
  const authors = deps.getTextContent(item, "authors");

  return pubYear ||
    volume ||
    issue ||
    startPage ||
    endPage ||
    fileSize ||
    authors
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
}

/** Reads the item's enclosure, if any. */
function readItemEnclosure(item: Element): ParsedItem["enclosure"] {
  const enclosureElement = item.querySelector("enclosure");
  return enclosureElement
    ? {
        url: enclosureElement.getAttribute("url") || "",
        type: enclosureElement.getAttribute("type") || "",
        length: enclosureElement.getAttribute("length") || "",
      }
    : undefined;
}

/** Reads the item's iTunes (podcast) fields. */
function readItemItunes(
  item: Element,
  deps: RssItemParserDeps,
): ParsedItem["itunes"] {
  return {
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
}

/** Resolves the item image from the item image element, media, then content. */
function resolveItemImage(
  item: Element,
  deps: RssItemParserDeps,
  content: string,
  itemDescription: string,
): {
  image: ParsedItem["image"];
  mediaContentType: string | undefined;
  mediaContentMedium: string | undefined;
} {
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

  return {
    image:
      itemImage ||
      (mediaImage ? { url: mediaImage } : undefined) ||
      (fallbackImage ? { url: fallbackImage } : undefined),
    mediaContentType,
    mediaContentMedium,
  };
}

/** Parses one channel `<item>` element into a `ParsedItem`. */
export function parseRssItem(
  item: Element,
  deps: RssItemParserDeps,
): ParsedItem {
  const {
    itemTitle,
    itemLink,
    itemDescription,
    pubDate,
    guid,
    itemAuthors,
    content,
  } = readItemIdentity(item, deps);

  const ieee = readItemIeee(item, deps);
  const enclosure = readItemEnclosure(item);
  const itunes = readItemItunes(item, deps);

  const { image, mediaContentType, mediaContentMedium } = resolveItemImage(
    item,
    deps,
    content,
    itemDescription,
  );

  return {
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
    image,
    category: deps.getTextContent(item, "category"),
    mediaContentType,
    mediaContentMedium,
    ieee,
  };
}
