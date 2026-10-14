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
    const rootAttrs = rootTagMatch[2] ?? "";
    const declaredPrefixes = new Set<string>();
    const nsRegex = /xmlns:(\w+)\s*=/g;
    let nsMatch;
    while ((nsMatch = nsRegex.exec(rootAttrs)) !== null) {
      const prefix = nsMatch[1];
      if (prefix) {
        declaredPrefixes.add(prefix.toLowerCase());
      }
    }
    // Always consider these as declared (built-in XML prefixes)
    declaredPrefixes.add("xml");
    declaredPrefixes.add("xmlns");

    const usedPrefixes = new Set<string>();
    const prefixRegex = /<(\w+):\w+[\s>/]/g;
    let pfxMatch;
    while ((pfxMatch = prefixRegex.exec(processed)) !== null) {
      const originalPrefix = pfxMatch[1];
      if (!originalPrefix) {
        continue;
      }
      const prefix = originalPrefix.toLowerCase();
      if (!declaredPrefixes.has(prefix)) {
        usedPrefixes.add(originalPrefix); // preserve original case
      }
    }

    if (usedPrefixes.size > 0) {
      const newAttrs = [...usedPrefixes]
        .map((p) => `xmlns:${p}="urn:x-${p}:unknown"`)
        .join(" ");
      const rootTag = rootTagMatch[1] ?? "rss";
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
    const channelMatch = xmlString.match(/<channel[^>]*>[\s\S]*?<\/channel>/i);
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

        const title = titleMatch?.[1]?.trim() ?? "Unknown feed";
        const description = descMatch?.[1]?.trim() ?? "";
        const link = linkMatch?.[1]?.trim() ?? "";

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
