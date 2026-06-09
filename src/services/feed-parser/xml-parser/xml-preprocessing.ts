import type { ParsedFeed, ParsedItem } from "../types.js";

export interface FallbackParseDeps {
  sanitizeCDATA: (text: string, isHtml?: boolean) => string;
  transformSageUrl: (url: string) => string;
  convertAppUrls: (url: string) => string;
}

export function preprocessXmlContent(xmlString: string): string {
  let processed = xmlString;

  processed = processed.replace(/^\uFEFF/, "");

  const xmlDeclMatch = processed.match(/<\?xml[^>]*\?>/);
  let xmlDecl = "";
  if (xmlDeclMatch) {
    xmlDecl = xmlDeclMatch[0];
  }

  processed = processed.replace(/<\?.*?\?>/g, "");

  if (xmlDecl) {
    processed = xmlDecl + processed;
  }

  processed = processed.trim();

  if (!xmlDecl) {
    const rssStartMatch = processed.match(/<rss[^>]*>/i);
    if (rssStartMatch) {
      const rssStartIndex = processed.indexOf(rssStartMatch[0]);
      processed = processed.substring(rssStartIndex);
    }
  }

  const rssCloseMatch = processed.match(/<\/rss>/i);
  if (rssCloseMatch) {
    const rssCloseIndex =
      processed.indexOf(rssCloseMatch[0]) + rssCloseMatch[0].length;
    processed = processed.substring(0, rssCloseIndex);
  }

  // Only escape bare ampersands that are not already part of an entity and not inside CDATA
  processed = processed.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m: string) =>
    m.replace(/&/g, "__AMP__"),
  );
  // Replace lookahead with compatible pattern: match & and check if it's followed by valid entity pattern
  processed = processed.replace(
    /&/g,
    (match: string, offset: number, string: string) => {
      const remaining = string.substring(offset + 1);
      // Check if this ampersand is part of a valid entity
      if (remaining.match(/^(amp|lt|gt|quot|apos);/)) {
        return match; // Already valid entity
      }
      if (remaining.match(/^#\d+;/)) {
        return match; // Already valid numeric entity
      }
      if (remaining.match(/^#x[0-9a-fA-F]+;/i)) {
        return match; // Already valid hex entity
      }
      return "&amp;"; // Escape bare ampersand
    },
  );
  processed = processed.replace(/__AMP__/g, "&");

  if (!processed.startsWith("<?xml")) {
    processed = '<?xml version="1.0" encoding="UTF-8"?>' + processed;
  }

  // Auto-declare undeclared namespace prefixes to prevent XML parse errors
  const rootTagMatch = processed.match(/<(rss|feed|rdf:rdf)([^>]*)>/i);
  if (rootTagMatch) {
    const rootAttrs = rootTagMatch[2];
    const declaredPrefixes = new Set<string>();
    const nsRegex = /xmlns:(\w+)\s*=/g;
    let nsMatch;
    while ((nsMatch = nsRegex.exec(rootAttrs)) !== null) {
      declaredPrefixes.add(nsMatch[1].toLowerCase());
    }
    // Always consider these as declared (built-in XML prefixes)
    declaredPrefixes.add("xml");
    declaredPrefixes.add("xmlns");

    const usedPrefixes = new Set<string>();
    const prefixRegex = /<(\w+):\w+[\s>/]/g;
    let pfxMatch;
    while ((pfxMatch = prefixRegex.exec(processed)) !== null) {
      const prefix = pfxMatch[1].toLowerCase();
      if (!declaredPrefixes.has(prefix)) {
        usedPrefixes.add(pfxMatch[1]); // preserve original case
      }
    }

    if (usedPrefixes.size > 0) {
      const newAttrs = [...usedPrefixes]
        .map((p) => `xmlns:${p}="urn:x-${p}:unknown"`)
        .join(" ");
      const rootTag = rootTagMatch[1];
      processed = processed.replace(
        new RegExp(`<${rootTag}([^>]*)>`, "i"),
        `<${rootTag}$1 ${newAttrs}>`,
      );
    }
  }

  return processed;
}

export function extractRssContent(xmlString: string): string {
  let rssContent = "";

  const rssMatch = xmlString.match(/<rss[^>]*>[\s\S]*?<\/rss>/i);
  if (rssMatch) {
    rssContent = rssMatch[0];
  } else {
    const channelMatch = xmlString.match(
      /<channel[^>]*>[\s\S]*?<\/channel>/i,
    );
    if (channelMatch) {
      rssContent = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">${channelMatch[0]}</rss>`;
    } else {
      const itemMatches = xmlString.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
      if (itemMatches && itemMatches.length > 0) {
        const titleMatch = xmlString.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = xmlString.match(
          /<description[^>]*>([\s\S]*?)<\/description>/i,
        );
        const linkMatch = xmlString.match(/<link[^>]*>([^<]+)<\/link>/i);

        const title = titleMatch ? titleMatch[1].trim() : "Unknown feed";
        const description = descMatch ? descMatch[1].trim() : "";
        const link = linkMatch ? linkMatch[1].trim() : "";

        rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
    <title>${title}</title>
    <description>${description}</description>
    <link>${link}</link>
    ${itemMatches.join("\n    ")}
</channel>
</rss>`;
      }
    }
  }

  if (rssContent) {
    return rssContent;
  }

  return xmlString;
}

export function fallbackParse(
  xmlString: string,
  deps: FallbackParseDeps,
): ParsedFeed {
  const { sanitizeCDATA: sanitize, transformSageUrl, convertAppUrls } = deps;

  try {
    let cleanedXml = xmlString;

    cleanedXml = cleanedXml.replace(/<\?php[\s\S]*?\?>/gi, "");
    cleanedXml = cleanedXml.replace(/<\?.*?\?>/gi, "");

    // IMPORTANT: Do not unwrap CDATA globally here.
    // The fallback parser uses regexes to split `<item>...</item>` blocks, and unwrapping CDATA
    // can introduce literal `<item>` / `</item>` sequences from HTML content that cause item
    // boundaries to be detected incorrectly (leading to "two articles merged into one").

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

    const channelTitleMatch = cleanedXml.match(
      /<channel[^>]*>[\s\S]*?<title[^>]*>([^<]+)<\/title>/i,
    );
    const title = channelTitleMatch
      ? sanitize(channelTitleMatch[1].trim())
      : "Unknown feed";

    const channelDescMatch = cleanedXml.match(
      /<channel[^>]*>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/i,
    );
    const description = channelDescMatch
      ? sanitize(channelDescMatch[1].trim())
      : "";

    const channelLinkMatch = cleanedXml.match(
      /<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i,
    );
    const link = channelLinkMatch ? channelLinkMatch[1].trim() : "";

    const items: ParsedItem[] = [];

    const itemMatches: Array<{ full: string; inner: string }> = [];

    // When splitting items with regex, ignore any `<item>` strings inside CDATA sections by
    // masking `<`/`>` within CDATA with same-length control characters. This keeps indices stable
    // so we can slice from the unmodified `cleanedXml`.
    const xmlForItemSplit = cleanedXml.replace(
      /<!\[CDATA\[[\s\S]*?\]\]>/g,
      (cdata: string) =>
        cdata.replace(/</g, "\u0001").replace(/>/g, "\u0002"),
    );

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

    if (itemMatches.length === 0) {
      // Replace lookahead with compatible pattern: find items by matching content until next item/channel/rss tag
      const itemStartRegex = /<item[^>]*>/gi;
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
    }

    if (itemMatches.length === 0) {
      const xmlForAggressiveSplit = xmlString.replace(
        /<!\[CDATA\[[\s\S]*?\]\]>/g,
        (cdata: string) =>
          cdata.replace(/</g, "\u0001").replace(/>/g, "\u0002"),
      );
      const aggressiveItemRegex = /<item[^>]*>[\s\S]*?<\/item>/gi;
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
    }

    itemMatches.forEach((match) => {
      const itemXml = match.inner;

      let itemAuthor = "";
      let itemPubDate = "";
      let itemGuid = "";

      const itemTitleMatch = itemXml.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (!itemTitleMatch) {
        return;
      }

      const itemTitle = sanitize(itemTitleMatch[1].trim());

      const itemLinkMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
      let itemLink = itemLinkMatch ? itemLinkMatch[1].trim() : "#";

      itemLink = transformSageUrl(itemLink);

      const itemDescMatch = itemXml.match(
        /<description[^>]*>([\s\S]*?)<\/description>/i,
      );
      let itemDescription = itemDescMatch
        ? sanitize(itemDescMatch[1].trim())
        : "";
      if (itemDescription === "null" || itemDescription === "") {
        itemDescription = "";
      }

      const itemPubDateMatch = itemXml.match(
        /<pubDate[^>]*>([^<]+)<\/pubDate>/i,
      );
      itemPubDate = itemPubDateMatch
        ? itemPubDateMatch[1].trim()
        : new Date().toISOString();

      const itemGuidMatch = itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
      itemGuid = itemGuidMatch ? itemGuidMatch[1].trim() : itemLink;

      const authorMatches = [
        itemXml.match(/<author[^>]*>([^<]+)<\/author>/i),
        itemXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i),
        itemXml.match(/<dc\\:creator[^>]*>([^<]+)<\/dc\\:creator>/i),
        itemXml.match(
          /<dc:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc:creator>/i,
        ),
        itemXml.match(
          /<dc\\:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc\\:creator>/i,
        ),
      ];
      for (const authorMatch of authorMatches) {
        if (authorMatch) {
          itemAuthor = sanitize(authorMatch[1].trim());
          break;
        }
      }

      const itemCategoryMatch = itemXml.match(
        /<category[^>]*>([^<]+)<\/category>/i,
      );
      const itemCategory = itemCategoryMatch
        ? sanitize(itemCategoryMatch[1].trim())
        : "";

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

      const pickPreferredType = (types: string[]): string => {
        const normalized = types
          .map((type) => type.trim().toLowerCase())
          .filter(Boolean);
        const preferred = normalized.find(
          (type) => type.startsWith("video/") || type.startsWith("audio/"),
        );
        return preferred || normalized[0] || "";
      };

      const pickPreferredMedium = (mediums: string[]): string => {
        const normalized = mediums
          .map((medium) => medium.trim().toLowerCase())
          .filter(Boolean);
        const preferred = normalized.find(
          (medium) => medium === "video" || medium === "audio",
        );
        return preferred || normalized[0] || "";
      };

      const mediaContentType = pickPreferredType(
        mediaContentAttributes.map((entry) => entry.type),
      );
      const mediaContentMedium = pickPreferredMedium(
        mediaContentAttributes.map((entry) => entry.medium),
      );

      const pubYearMatch = itemXml.match(/<pubYear[^>]*>([^<]+)<\/pubYear>/i);
      const pubYear = pubYearMatch ? sanitize(pubYearMatch[1].trim()) : "";
      const volumeMatch = itemXml.match(/<volume[^>]*>([^<]+)<\/volume>/i);
      const volume = volumeMatch ? sanitize(volumeMatch[1].trim()) : "";
      const issueMatch = itemXml.match(/<issue[^>]*>([^<]+)<\/issue>/i);
      const issue = issueMatch ? sanitize(issueMatch[1].trim()) : "";
      const startPageMatch = itemXml.match(
        /<startPage[^>]*>([^<]+)<\/startPage>/i,
      );
      const startPage = startPageMatch
        ? sanitize(startPageMatch[1].trim())
        : "";
      const endPageMatch = itemXml.match(/<endPage[^>]*>([^<]+)<\/endPage>/i);
      const endPage = endPageMatch ? sanitize(endPageMatch[1].trim()) : "";
      const fileSizeMatch = itemXml.match(
        /<fileSize[^>]*>([^<]+)<\/fileSize>/i,
      );
      const fileSize = fileSizeMatch ? sanitize(fileSizeMatch[1].trim()) : "";
      const authorsMatch = itemXml.match(/<authors[^>]*>([^<]+)<\/authors>/i);
      const authors = authorsMatch ? sanitize(authorsMatch[1].trim()) : "";
      const ieee =
        pubYear ||
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
      if (authors && !itemAuthor) {
        itemAuthor = authors;
      }
      items.push({
        title: itemTitle,
        link: itemLink,
        description: itemDescription,
        pubDate: itemPubDate,
        guid: itemGuid,
        author: itemAuthor || undefined,
        content: itemDescription,
        image: mediaUrl ? { url: convertAppUrls(mediaUrl) } : undefined,
        category: itemCategory,
        mediaContentType: mediaContentType || undefined,
        mediaContentMedium: mediaContentMedium || undefined,
        ieee,
      });
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
