import type { ParsedFeed } from "../types.js";
import {
  decodeHtmlEntities as decodeHtmlEntitiesUtil,
  sanitizeCDATA as sanitizeCDATAUtil,
} from "./xml-html-utils.js";
import {
  extractRssContent,
  fallbackParse,
  preprocessXmlContent,
} from "./xml-preprocessing.js";
import { parseAtom } from "./atom-parser.js";
import { parseJSON } from "./json-feed-parser.js";
import { parseRSS, parseRSS1 } from "./rss-parser.js";

export class CustomXMLParser {
  private parseXML(xmlString: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, "text/xml");
  }

  private detectEncoding(xmlString: string): string {
    const match = xmlString.match(/encoding=["']([^"']+)["']/);
    return match ? match[1] : "UTF-8";
  }

  private getTextContent(
    element: Element | null,
    tagName: string,
    isHtml: boolean = false,
  ): string {
    if (!element) return "";
    let el: Element | null = null;

    if (tagName.includes("\\:")) {
      el = element.querySelector(tagName);
    } else if (tagName.includes(":")) {
      const [namespace, localName] = tagName.split(":");

      // 1. Try namespaced selector with backslash
      try {
        el = element.querySelector(`${namespace}\\:${localName}`);
      } catch {
        /* ignore */
      }

      // 2. Try getElementsByTagNameNS if not found
      if (!el) {
        try {
          const elements = element.getElementsByTagNameNS("*", localName);
          if (elements.length > 0) el = elements[0];
        } catch {
          /* ignore */
        }
      }

      // 3. Try local name only if still not found
      if (!el) {
        try {
          el = element.querySelector(localName);
        } catch {
          /* ignore */
        }
      }

      // 4. Try local-name() selector if still not found
      if (!el) {
        try {
          el = element.querySelector(`*[local-name()="${localName}"]`);
        } catch {
          /* ignore */
        }
      }
    } else {
      // Basic tag
      el = element.querySelector(tagName);
      if (!el) {
        try {
          const tagEls = element.getElementsByTagName(tagName);
          if (tagEls.length > 0) el = tagEls[0];
        } catch {
          /* ignore */
        }
      }
    }

    if (!el) return "";
    const textContent = el.textContent?.trim() || "";
    return textContent ? sanitizeCDATAUtil(textContent, isHtml) : "";
  }

  private getAttribute(
    element: Element | null,
    tagName: string,
    attribute: string,
  ): string {
    if (!element) return "";

    let el: Element | null = null;

    if (tagName.includes("\\:")) {
      try {
        el = element.querySelector(tagName);
      } catch {
        /* ignore */
      }
    } else if (tagName.includes(":")) {
      const [namespace, localName] = tagName.split(":");

      try {
        el = element.querySelector(`${namespace}\\:${localName}`);
      } catch {
        /* ignore */
      }

      if (!el) {
        try {
          const elements = element.getElementsByTagNameNS("*", localName);
          if (elements.length > 0) el = elements[0];
        } catch {
          /* ignore */
        }
      }

      if (!el) {
        try {
          el = element.querySelector(localName);
        } catch {
          /* ignore */
        }
      }
    } else {
      try {
        el = element.querySelector(tagName);
      } catch {
        /* ignore */
      }
    }

    return el?.getAttribute(attribute) || "";
  }

  private getMediaImageUrl(item: Element): string {
    const MRSS_NS = "search.yahoo.com/mrss";

    const isMrss = (el: Element): boolean => {
      const ns = (el.namespaceURI || "").toLowerCase();
      if (ns.includes(MRSS_NS)) return true;

      // Fallback for DOM implementations that don't expose namespaceURI reliably.
      const tag = (el.tagName || "").toLowerCase();
      return tag.startsWith("media:") || tag.includes(":media:");
    };

    const score = (el: Element): number => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      const medium = (el.getAttribute("medium") || "").toLowerCase();
      const width = parseInt(el.getAttribute("width") || "0", 10);
      const height = parseInt(el.getAttribute("height") || "0", 10);
      const isImage = type.startsWith("image/") || medium === "image";

      // Base score: 1000 for images, 1 otherwise
      let s = isImage ? 1000 : 1;
      // Add dimensions to prioritize larger images
      s += Math.max(width, height);
      return s;
    };

    const pickBest = (candidates: Element[]): string => {
      const withUrl = candidates
        .map((el) => ({ el, url: (el.getAttribute("url") || "").trim() }))
        .filter((x) => !!x.url);
      if (withUrl.length === 0) return "";
      withUrl.sort((a, b) => score(b.el) - score(a.el));
      return withUrl[0].url;
    };

    // 1) Standard selectors (works in many environments)
    try {
      const url = pickBest(
        Array.from(item.querySelectorAll("media\\:content")),
      );
      if (url) return url;
    } catch {
      /* ignore */
    }

    try {
      const url = pickBest(
        Array.from(item.querySelectorAll("media\\:thumbnail")),
      );
      if (url) return url;
    } catch {
      /* ignore */
    }

    // 2) Namespace-robust fallback using localName + namespaceURI
    try {
      const all = Array.from(item.getElementsByTagNameNS("*", "*"));
      const mediaContent = all.filter(
        (el) => el.localName === "content" && isMrss(el),
      );
      const contentUrl = pickBest(mediaContent);
      if (contentUrl) return contentUrl;

      const mediaThumb = all.filter(
        (el) => el.localName === "thumbnail" && isMrss(el),
      );
      const thumbUrl = pickBest(mediaThumb);
      if (thumbUrl) return thumbUrl;
    } catch {
      /* ignore */
    }

    return "";
  }

  private getMediaContentType(item: Element): string {
    const MRSS_NS = "search.yahoo.com/mrss";

    const isMrss = (el: Element): boolean => {
      const ns = (el.namespaceURI || "").toLowerCase();
      if (ns.includes(MRSS_NS)) return true;

      const tag = (el.tagName || "").toLowerCase();
      return tag.startsWith("media:") || tag.includes(":media:");
    };

    const getPreferredType = (types: string[]): string => {
      const normalized = types
        .map((type) => type.trim().toLowerCase())
        .filter(Boolean);
      const preferred = normalized.find(
        (type) => type.startsWith("video/") || type.startsWith("audio/"),
      );
      return preferred || normalized[0] || "";
    };

    try {
      const mediaContent = Array.from(item.querySelectorAll("media\\:content"));
      const mediaContentType = getPreferredType(
        mediaContent.map((el) =>
          (el.getAttribute("type") || "").trim().toLowerCase(),
        ),
      );
      if (mediaContentType) {
        return mediaContentType;
      }
    } catch {
      /* ignore */
    }

    try {
      const all = Array.from(item.getElementsByTagNameNS("*", "*"));
      const namespacedTypes = all
        .filter((el) => el.localName === "content" && isMrss(el))
        .map((el) => (el.getAttribute("type") || "").trim().toLowerCase())
        .filter(Boolean);
      return getPreferredType(namespacedTypes);
    } catch {
      return "";
    }
  }

  private getMediaContentMedium(item: Element): string {
    const MRSS_NS = "search.yahoo.com/mrss";

    const isMrss = (el: Element): boolean => {
      const ns = (el.namespaceURI || "").toLowerCase();
      if (ns.includes(MRSS_NS)) return true;

      const tag = (el.tagName || "").toLowerCase();
      return tag.startsWith("media:") || tag.includes(":media:");
    };

    const getPreferredMedium = (mediums: string[]): string => {
      const normalized = mediums
        .map((medium) => medium.trim().toLowerCase())
        .filter(Boolean);
      const preferred = normalized.find(
        (medium) => medium === "video" || medium === "audio",
      );
      return preferred || normalized[0] || "";
    };

    const getElementMedium = (el: Element): string => {
      const medium = (el.getAttribute("medium") || "").trim().toLowerCase();
      if (medium) {
        return medium;
      }

      const type = (el.getAttribute("type") || "").trim().toLowerCase();
      if (type.startsWith("video/")) return "video";
      if (type.startsWith("audio/")) return "audio";
      if (type.startsWith("image/")) return "image";

      return "";
    };

    try {
      const mediaContent = Array.from(item.querySelectorAll("media\\:content"));
      const mediaContentMedium = getPreferredMedium(
        mediaContent.map((el) => getElementMedium(el)),
      );
      if (mediaContentMedium) {
        return mediaContentMedium;
      }
    } catch {
      /* ignore */
    }

    try {
      const all = Array.from(item.getElementsByTagNameNS("*", "*"));
      const namespacedMediums = all
        .filter((el) => el.localName === "content" && isMrss(el))
        .map((el) => getElementMedium(el))
        .filter(Boolean);
      return getPreferredMedium(namespacedMediums);
    } catch {
      return "";
    }
  }

  private getTextContentWithMultipleSelectors(
    element: Element | null,
    selectors: string[],
  ): string {
    if (!element) return "";

    for (const selector of selectors) {
      try {
        const el = element.querySelector(selector);
        if (el && el.textContent?.trim()) {
          return sanitizeCDATAUtil(el.textContent.trim());
        }
      } catch {
        continue;
      }
    }

    return "";
  }

  private getTextContentWithNamespace(
    element: Element | null,
    namespace: string,
    tagName: string,
  ): string {
    const el = element?.querySelector(`${namespace}\\:${tagName}`);
    return el?.textContent?.trim() || "";
  }

  private validateFeedStructure(doc: Document): boolean {
    const hasRSS = doc.querySelector("rss");
    if (hasRSS) return true;

    const hasAtom = doc.querySelector("feed");
    if (hasAtom) return true;

    const rootElement = doc.documentElement;
    const hasRDF =
      rootElement &&
      (rootElement.getAttribute("xmlns:rdf") ||
        rootElement.getAttribute("xmlns")?.includes("rdf"));
    if (hasRDF) return true;

    const hasChannel = doc.querySelector("channel");
    if (hasChannel) return true;

    const hasItems = doc.querySelector("item");
    if (hasItems) return true;

    return false;
  }

  private sanitizeText(text: string): string {
    if (!text) return "";

    let cleaned = text.replace(/<[^>]*>/g, "");

    cleaned = decodeHtmlEntitiesUtil(cleaned);

    return cleaned.replace(/\s+/g, " ").trim();
  }

  private convertAppUrls(url: string): string {
    if (url && url.startsWith("app://")) {
      return url.replace("app://", "https://");
    }
    return url;
  }

  /**
   * Normalizes URL-encoded strings that may be double-encoded.
   * For example: "ai%2520girlfriend.jpg" -> "ai girlfriend.jpg"
   * Detects double-encoding by checking for %25 (encoded percent)
   */
  normalizeUrlEncoding(url: string): string {
    if (!url || !url.includes("%25")) {
      return url;
    }
    // URL decode once - this converts %25 to %
    // After this, %20 remains as %20 (single-encoded space), which is correct
    try {
      return decodeURIComponent(url);
    } catch {
      // If decode fails, return original
      return url;
    }
  }

  private extractImageFromContent(content: string): string {
    if (!content) return "";

    try {
      const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      const imageUrl = imgMatch ? imgMatch[1] : "";
      // Debug: log image URL extraction for troubleshooting
      if (imageUrl && imageUrl.includes("%25")) {
        console.debug(
          `[RSS Dashboard] extractImageFromContent: Found double-encoded URL: ${imageUrl}`,
        );
      }
      return this.convertAppUrls(imageUrl);
    } catch {
      return "";
    }
  }

  private transformSageUrl(url: string): string {
    if (url.includes("journals.sagepub.com")) {
      if (url.includes("/doi/abs/")) {
        const transformedUrl = url.replace("/doi/abs/", "/doi/full/");

        return transformedUrl;
      }

      if (url.includes("/doi/") && !url.includes("/doi/full/")) {
        const transformedUrl = url.replace("/doi/", "/doi/full/");

        return transformedUrl;
      }
    }
    return url;
  }

  decodeHtmlEntities(text: string): string {
    return decodeHtmlEntitiesUtil(text);
  }

  private getRssParserDeps() {
    return {
      getTextContent: this.getTextContent.bind(this),
      getAttribute: this.getAttribute.bind(this),
      getMediaImageUrl: this.getMediaImageUrl.bind(this),
      getMediaContentType: this.getMediaContentType.bind(this),
      getMediaContentMedium: this.getMediaContentMedium.bind(this),
      transformSageUrl: this.transformSageUrl.bind(this),
      extractImageFromContent: this.extractImageFromContent.bind(this),
      convertAppUrls: this.convertAppUrls.bind(this),
    };
  }

  private getAtomParserDeps() {
    return {
      getTextContent: this.getTextContent.bind(this),
      getAttribute: this.getAttribute.bind(this),
      transformSageUrl: this.transformSageUrl.bind(this),
    };
  }

  private getFallbackParseDeps() {
    return {
      sanitizeCDATA: sanitizeCDATAUtil,
      transformSageUrl: this.transformSageUrl.bind(this),
      convertAppUrls: this.convertAppUrls.bind(this),
    };
  }

  parseString(xmlString: string): ParsedFeed {
    try {
      if (xmlString.trim().startsWith("{")) {
        return parseJSON(xmlString, {
          transformSageUrl: this.transformSageUrl.bind(this),
        });
      }

      const cleanedXml = preprocessXmlContent(xmlString.trim());

      const doc = this.parseXML(cleanedXml);

      const parserError = doc.querySelector("parsererror");
      if (parserError) {
        const extractedXml = extractRssContent(xmlString);
        if (extractedXml !== xmlString) {
          try {
            const extractedDoc = this.parseXML(extractedXml);
            const extractedParserError =
              extractedDoc.querySelector("parsererror");
            if (
              !extractedParserError &&
              this.validateFeedStructure(extractedDoc)
            ) {
              const rootElement = extractedDoc.documentElement;
              const isRDF =
                rootElement && rootElement.tagName.toLowerCase() === "rdf:rdf";
              if (isRDF) {
                return parseRSS1(extractedDoc, this.getRssParserDeps());
              } else if (extractedDoc.querySelector("rss")) {
                return parseRSS(extractedDoc, this.getRssParserDeps());
              } else if (extractedDoc.querySelector("feed")) {
                return parseAtom(extractedDoc, this.getAtomParserDeps());
              }
            }
          } catch (extractError) {
            console.error(
              "[RSS dashboard] parseString: Error in fallback extraction",
              extractError,
            );
          }
        }

        return fallbackParse(xmlString, this.getFallbackParseDeps());
      }

      if (!this.validateFeedStructure(doc)) {
        return fallbackParse(xmlString, this.getFallbackParseDeps());
      }

      const rootElement = doc.documentElement;
      const isRDF =
        rootElement &&
        (rootElement.tagName.toLowerCase() === "rdf:rdf" ||
          rootElement.getAttribute("xmlns") === "http://purl.org/rss/1/");

      if (isRDF) {
        return parseRSS1(doc, this.getRssParserDeps());
      } else if (doc.querySelector("rss")) {
        return parseRSS(doc, this.getRssParserDeps());
      } else if (doc.querySelector("feed")) {
        return parseAtom(doc, this.getAtomParserDeps());
      } else {
        return fallbackParse(xmlString, this.getFallbackParseDeps());
      }
    } catch (error) {
      console.error("[RSS dashboard] parseString error:", error);
      try {
        return fallbackParse(xmlString, this.getFallbackParseDeps());
      } catch (fallbackError) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const fallbackMsg =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        throw new Error(
          `All parsing attempts failed: ${errorMsg}. Fallback error: ${fallbackMsg}`,
        );
      }
    }
  }
}
