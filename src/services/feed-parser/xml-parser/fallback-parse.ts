import type { ParsedFeed, ParsedItem } from "../types.js";
import { joinAuthors, splitAuthorElements } from "../author-normalization.js";

export interface FallbackParseDeps {
  sanitizeCDATA: (text: string, isHtml?: boolean) => string;
  transformSageUrl: (url: string) => string;
  convertAppUrls: (url: string) => string;
}

type SanitizeCdata = FallbackParseDeps["sanitizeCDATA"];

interface ItemMatch {
  full: string;
  inner: string;
}

/** Trims the raw XML to the `<rss>...</rss>` block, dropping PHP/PI headers. */
function pruneFallbackXml(xmlString: string): string {
  let cleanedXml = xmlString;

  cleanedXml = cleanedXml.replace(/<\?php[\s\S]*?\?>/gi, "");
  cleanedXml = cleanedXml.replace(/<\?.*?\?>/gi, "");

  const rssStartMatch = cleanedXml.match(/<rss[^>]*>/i);
  if (rssStartMatch) {
    const rssStartIndex = cleanedXml.indexOf(rssStartMatch[0]);
    cleanedXml = cleanedXml.substring(rssStartIndex);
  }

  const rssEndMatch = cleanedXml.match(/<\/rss>/i);
  if (rssEndMatch) {
    const rssEndIndex =
      cleanedXml.indexOf(rssEndMatch[0]) + rssEndMatch[0].length;
    cleanedXml = cleanedXml.substring(0, rssEndIndex);
  }

  return cleanedXml;
}

/** Masks `<`/`>` inside CDATA with same-length control characters. */
function maskCdata(xml: string): string {
  return xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (cdata: string) =>
    cdata.replace(/</g, "\u0001").replace(/>/g, "\u0002"),
  );
}

/**
 * Returns the channel's own markup for metadata reads, stopping before the
 * first `<item>` (or at `</channel>`). This keeps feed metadata from leaking
 * out of item descendants, matching the DOM path's channel-scoped lookups.
 */
function channelMetadataScope(cleanedXml: string): string {
  const maskedXml = maskCdata(cleanedXml);
  const channelStartMatch = maskedXml.match(/<channel[^>]*>/i);
  if (!channelStartMatch || channelStartMatch.index === undefined) {
    return "";
  }

  const contentStart = channelStartMatch.index + channelStartMatch[0].length;
  const contentBoundary = maskedXml
    .substring(contentStart)
    .match(/<item[^>]*>|<\/channel>/i);
  const contentEnd =
    contentBoundary?.index !== undefined
      ? contentStart + contentBoundary.index
      : maskedXml.length;

  return cleanedXml.substring(contentStart, contentEnd);
}

/** Reads the channel title/description/link, applying `sanitize` to text. */
function readFallbackChannelMetadata(
  cleanedXml: string,
  sanitize: SanitizeCdata,
): { title: string; description: string; link: string } {
  const channelXml = channelMetadataScope(cleanedXml);

  const channelTitleMatch = channelXml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = channelTitleMatch?.[1]
    ? sanitize(channelTitleMatch[1].trim())
    : "Unknown feed";

  const channelDescMatch = channelXml.match(
    /<description[^>]*>([\s\S]*?)<\/description>/i,
  );
  const description = channelDescMatch?.[1]
    ? sanitize(channelDescMatch[1].trim())
    : "";

  const channelLinkMatch = channelXml.match(/<link[^>]*>([^<]+)<\/link>/i);
  const link = channelLinkMatch?.[1]?.trim() ?? "";

  return { title, description, link };
}

/** Splits well-formed `<item>...</item>` blocks. */
function splitClosedItems(
  cleanedXml: string,
  xmlForItemSplit: string,
): ItemMatch[] {
  const itemMatches: ItemMatch[] = [];

  const itemRegex = /<item[^>]*>[\s\S]*?<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(xmlForItemSplit)) !== null) {
    const full = cleanedXml.substring(
      itemMatch.index,
      itemMatch.index + itemMatch[0].length,
    );
    const inner = full
      .replace(/^<item[^>]*>/i, "")
      .replace(/<\/item>\s*$/i, "");
    itemMatches.push({ full, inner });
  }

  return itemMatches;
}

/** Splits by `<item>` start tags, ending each at the next item/channel/rss close. */
function splitItemsByStartTag(
  cleanedXml: string,
  xmlForItemSplit: string,
): ItemMatch[] {
  const itemMatches: ItemMatch[] = [];

  const itemStartRegex = /<item[^>]*>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemStartRegex.exec(xmlForItemSplit)) !== null) {
    const itemStartIndex = itemMatch.index;
    const itemStartTag = itemMatch[0];
    const contentStartIndex = itemStartIndex + itemStartTag.length;

    // Find where this item ends by looking for next item, channel close, or rss close
    const remainingText = xmlForItemSplit.substring(contentStartIndex);
    const nextItemMatch = remainingText.match(/<item[^>]*>/i);
    const channelCloseMatch = remainingText.match(/<\/channel>/i);
    const rssCloseMatch = remainingText.match(/<\/rss>/i);

    let endIndex = remainingText.length;
    if (nextItemMatch && nextItemMatch.index !== undefined) {
      endIndex = Math.min(endIndex, nextItemMatch.index);
    }
    if (channelCloseMatch && channelCloseMatch.index !== undefined) {
      endIndex = Math.min(endIndex, channelCloseMatch.index);
    }
    if (rssCloseMatch && rssCloseMatch.index !== undefined) {
      endIndex = Math.min(endIndex, rssCloseMatch.index);
    }

    const full = cleanedXml.substring(
      itemStartIndex,
      contentStartIndex + endIndex,
    );
    const inner = cleanedXml.substring(
      contentStartIndex,
      contentStartIndex + endIndex,
    );
    itemMatches.push({ full, inner });
  }

  return itemMatches;
}

/** Last-resort split over the raw, unmasked XML. */
function splitItemsAggressively(xmlString: string): ItemMatch[] {
  const itemMatches: ItemMatch[] = [];

  const xmlForAggressiveSplit = maskCdata(xmlString);
  const aggressiveItemRegex = /<item[^>]*>[\s\S]*?<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while (
    (itemMatch = aggressiveItemRegex.exec(xmlForAggressiveSplit)) !== null
  ) {
    const full = xmlString.substring(
      itemMatch.index,
      itemMatch.index + itemMatch[0].length,
    );
    const inner = full
      .replace(/^<item[^>]*>/i, "")
      .replace(/<\/item>\s*$/i, "");
    itemMatches.push({ full, inner });
  }

  return itemMatches;
}

/** Collects item matches, trying the closed split, then start tags, then aggressive. */
function collectFallbackItems(
  cleanedXml: string,
  xmlString: string,
): ItemMatch[] {
  // When splitting items with regex, ignore any `<item>` strings inside CDATA sections by
  // masking `<`/`>` within CDATA with same-length control characters. This keeps indices stable
  // so we can slice from the unmodified `cleanedXml`.
  const xmlForItemSplit = maskCdata(cleanedXml);

  const itemMatches = splitClosedItems(cleanedXml, xmlForItemSplit);
  if (itemMatches.length > 0) {
    return itemMatches;
  }

  const byStartTag = splitItemsByStartTag(cleanedXml, xmlForItemSplit);
  if (byStartTag.length > 0) {
    return byStartTag;
  }

  return splitItemsAggressively(xmlString);
}

/** Sanitizes the first capture of a field match, or "" when it did not match. */
function sanitizeMatch(
  match: RegExpMatchArray | null,
  sanitize: SanitizeCdata,
): string {
  return match?.[1] ? sanitize(match[1].trim()) : "";
}

/** Reads the item link, defaulting to "#". */
function readItemLink(itemXml: string): string {
  const itemLinkMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
  return itemLinkMatch?.[1]?.trim() ?? "#";
}

/** Reads the item description, falling back to media:description. */
function readItemDescription(itemXml: string, sanitize: SanitizeCdata): string {
  const itemDescMatch = itemXml.match(
    /<description[^>]*>([\s\S]*?)<\/description>/i,
  );
  let itemDescription = itemDescMatch?.[1]
    ? sanitize(itemDescMatch[1].trim())
    : "";
  if (itemDescription === "null" || itemDescription === "") {
    const mediaDescMatch =
      itemXml.match(
        /<media:description[^>]*>([\s\S]*?)<\/media:description>/i,
      ) ||
      itemXml.match(
        /<media\\:description[^>]*>([\s\S]*?)<\/media\\:description>/i,
      );
    if (mediaDescMatch) {
      itemDescription = sanitize(mediaDescMatch[1]?.trim() ?? "");
    } else {
      itemDescription = "";
    }
  }
  return itemDescription;
}

/** Reads the pubDate and guid (guid falls back to the item link). */
function readItemDates(
  itemXml: string,
  itemLink: string,
): { itemPubDate: string; itemGuid: string } {
  const itemPubDateMatch = itemXml.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i);
  const itemPubDate = itemPubDateMatch?.[1]?.trim() ?? "";

  const itemGuidMatch = itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
  const itemGuid = itemGuidMatch?.[1]?.trim() ?? itemLink;

  return { itemPubDate, itemGuid };
}

/** Reads the first author element that matches, sanitized. */
function readItemAuthors(itemXml: string, sanitize: SanitizeCdata): string {
  const authorMatches = [
    itemXml.match(/<author[^>]*>([^<]+)<\/author>/i),
    itemXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i),
    itemXml.match(/<dc\\:creator[^>]*>([^<]+)<\/dc\\:creator>/i),
    itemXml.match(/<dc:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc:creator>/i),
    itemXml.match(
      /<dc\\:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc\\:creator>/i,
    ),
  ];
  let itemAuthorText = "";
  for (const authorMatch of authorMatches) {
    if (authorMatch) {
      itemAuthorText = sanitize(authorMatch[1]?.trim() ?? "");
      break;
    }
  }
  return itemAuthorText;
}

/** Reads the item category. */
function readItemCategory(itemXml: string, sanitize: SanitizeCdata): string {
  const itemCategoryMatch = itemXml.match(
    /<category[^>]*>([^<]+)<\/category>/i,
  );
  return itemCategoryMatch?.[1] ? sanitize(itemCategoryMatch[1].trim()) : "";
}

function pickPreferredType(types: string[]): string {
  const normalized = types
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean);
  const preferred = normalized.find(
    (type) => type.startsWith("video/") || type.startsWith("audio/"),
  );
  return preferred || normalized[0] || "";
}

function pickPreferredMedium(mediums: string[]): string {
  const normalized = mediums
    .map((medium) => medium.trim().toLowerCase())
    .filter(Boolean);
  const preferred = normalized.find(
    (medium) => medium === "video" || medium === "audio",
  );
  return preferred || normalized[0] || "";
}

/** Reads the item image URL plus the preferred media type and medium. */
function readItemMedia(itemXml: string): {
  mediaUrl: string;
  mediaContentType: string;
  mediaContentMedium: string;
} {
  const mediaUrlMatch =
    itemXml.match(/<media:content[^>]*url=["']([^"']+)["']/i) ||
    itemXml.match(/<media\\:content[^>]*url=["']([^"']+)["']/i) ||
    itemXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i) ||
    itemXml.match(/<media\\:thumbnail[^>]*url=["']([^"']+)["']/i);
  const mediaUrl = mediaUrlMatch?.[1]?.trim() || "";
  const mediaContentMatches = [
    ...itemXml.matchAll(/<media:content\b[^>]*>/gi),
    ...itemXml.matchAll(/<media\\:content\b[^>]*>/gi),
  ];
  const mediaContentAttributes = mediaContentMatches.map((m) => {
    const element = m[0];
    const typeMatch = element.match(/type=["']([^"']+)["']/i);
    const mediumMatch = element.match(/medium=["']([^"']+)["']/i);
    const type = typeMatch?.[1]?.trim().toLowerCase() || "";
    const mediumFromType = type.startsWith("video/")
      ? "video"
      : type.startsWith("audio/")
        ? "audio"
        : type.startsWith("image/")
          ? "image"
          : "";
    return {
      type,
      medium: mediumMatch?.[1]?.trim().toLowerCase() || mediumFromType,
    };
  });

  const mediaContentType = pickPreferredType(
    mediaContentAttributes.map((entry) => entry.type),
  );
  const mediaContentMedium = pickPreferredMedium(
    mediaContentAttributes.map((entry) => entry.medium),
  );

  return { mediaUrl, mediaContentType, mediaContentMedium };
}

/** Reads the IEEE citation fields, returning the `<authors>` text too. */
function readItemIeee(
  itemXml: string,
  sanitize: SanitizeCdata,
): { ieee: ParsedItem["ieee"]; authors: string } {
  const pubYear = sanitizeMatch(
    itemXml.match(/<pubYear[^>]*>([^<]+)<\/pubYear>/i),
    sanitize,
  );
  const volume = sanitizeMatch(
    itemXml.match(/<volume[^>]*>([^<]+)<\/volume>/i),
    sanitize,
  );
  const issue = sanitizeMatch(
    itemXml.match(/<issue[^>]*>([^<]+)<\/issue>/i),
    sanitize,
  );
  const startPage = sanitizeMatch(
    itemXml.match(/<startPage[^>]*>([^<]+)<\/startPage>/i),
    sanitize,
  );
  const endPage = sanitizeMatch(
    itemXml.match(/<endPage[^>]*>([^<]+)<\/endPage>/i),
    sanitize,
  );
  const fileSize = sanitizeMatch(
    itemXml.match(/<fileSize[^>]*>([^<]+)<\/fileSize>/i),
    sanitize,
  );
  const authors = sanitizeMatch(
    itemXml.match(/<authors[^>]*>([^<]+)<\/authors>/i),
    sanitize,
  );

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

  return { ieee, authors };
}

/** Parses one `<item>`'s inner XML into a `ParsedItem`, or undefined without a title. */
function parseFallbackItem(
  itemXml: string,
  deps: FallbackParseDeps,
): ParsedItem | undefined {
  const { sanitizeCDATA: sanitize, transformSageUrl, convertAppUrls } = deps;

  const itemTitleMatch = itemXml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!itemTitleMatch) {
    return undefined;
  }

  const itemTitle = sanitize(itemTitleMatch[1]?.trim() ?? "");

  const itemLink = transformSageUrl(readItemLink(itemXml));

  const itemDescription = readItemDescription(itemXml, sanitize);

  const { itemPubDate, itemGuid } = readItemDates(itemXml, itemLink);

  const itemAuthorText = readItemAuthors(itemXml, sanitize);

  const itemCategory = readItemCategory(itemXml, sanitize);

  const { mediaUrl, mediaContentType, mediaContentMedium } =
    readItemMedia(itemXml);

  const { ieee, authors } = readItemIeee(itemXml, sanitize);
  const authorText = itemAuthorText || authors;

  const itemAuthors = splitAuthorElements([authorText]);
  return {
    title: itemTitle,
    link: itemLink,
    description: itemDescription,
    pubDate: itemPubDate,
    guid: itemGuid,
    author: joinAuthors(itemAuthors) || undefined,
    authors: itemAuthors,
    content: itemDescription,
    image: mediaUrl ? { url: convertAppUrls(mediaUrl) } : undefined,
    category: itemCategory,
    mediaContentType: mediaContentType || undefined,
    mediaContentMedium: mediaContentMedium || undefined,
    ieee,
  };
}

export function fallbackParse(
  xmlString: string,
  deps: FallbackParseDeps,
): ParsedFeed {
  const { sanitizeCDATA: sanitize } = deps;

  try {
    const cleanedXml = pruneFallbackXml(xmlString);

    const { title, description, link } = readFallbackChannelMetadata(
      cleanedXml,
      sanitize,
    );

    const itemMatches = collectFallbackItems(cleanedXml, xmlString);

    const items: ParsedItem[] = [];
    itemMatches.forEach((match) => {
      const item = parseFallbackItem(match.inner, deps);
      if (item) {
        items.push(item);
      }
    });

    return {
      title,
      description,
      link,
      author: undefined,
      image: undefined,
      items,
      type: "rss",
      feedItunesImage: "",
      feedImageUrl: "",
    };
  } catch (error) {
    throw new Error(
      `Fallback parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
