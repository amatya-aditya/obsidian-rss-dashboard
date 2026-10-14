import type { ParsedFeed } from "../types.js";
import { fallbackParse, type FallbackParseDeps } from "./fallback-parse.js";
import { parseAtom, type AtomParserDeps } from "./atom-parser.js";
import { parseJSON } from "./json-feed-parser.js";
import { parseRSS, parseRSS1, type RssParserDeps } from "./rss-parser.js";
import {
  extractRssContent,
  preprocessXmlContent,
} from "./xml-preprocessing.js";

export interface FeedDocumentRouterDeps {
  transformSageUrl: (url: string) => string;
  parseXML: (xmlString: string) => Document;
  validateFeedStructure: (doc: Document) => boolean;
  getRssParserDeps: () => RssParserDeps;
  getAtomParserDeps: () => AtomParserDeps;
  getFallbackParseDeps: () => FallbackParseDeps;
}

/**
 * Classifies the document recovered from a malformed feed's extracted `<rss>`
 * block. Unlike the main classification site, this checks only the literal
 * `rdf:rdf` root name and has no final `else`: an unmatched document returns
 * undefined so `recoverFromParserError` can fall back.
 */
function classifyExtractedDocument(
  extractedDoc: Document,
  deps: FeedDocumentRouterDeps,
): ParsedFeed | undefined {
  const extractedParserError = extractedDoc.querySelector("parsererror");
  if (!extractedParserError && deps.validateFeedStructure(extractedDoc)) {
    const rootElement = extractedDoc.documentElement;
    const isRDF =
      rootElement && rootElement.tagName.toLowerCase() === "rdf:rdf";
    if (isRDF) {
      return parseRSS1(extractedDoc, deps.getRssParserDeps());
    } else if (extractedDoc.querySelector("rss")) {
      return parseRSS(extractedDoc, deps.getRssParserDeps());
    } else if (extractedDoc.querySelector("feed")) {
      return parseAtom(extractedDoc, deps.getAtomParserDeps());
    }
  }
  return undefined;
}

/**
 * Retries a document whose first parse hit `parsererror` by extracting its
 * `<rss>` block, then falls back to regex parsing when that yields no feed.
 */
function recoverFromParserError(
  xmlString: string,
  deps: FeedDocumentRouterDeps,
): ParsedFeed {
  const extractedXml = extractRssContent(xmlString);
  if (extractedXml !== xmlString) {
    try {
      const extractedDoc = deps.parseXML(extractedXml);
      const extractedFeed = classifyExtractedDocument(extractedDoc, deps);
      if (extractedFeed) {
        return extractedFeed;
      }
    } catch (extractError) {
      console.error(
        "[RSS dashboard] parseString: Error in fallback extraction",
        extractError,
      );
    }
  }

  return fallbackParse(xmlString, deps.getFallbackParseDeps());
}

/**
 * Classifies a validated document as RSS 1.0/RDF, RSS 2.0, or Atom, falling
 * back to regex parsing otherwise. This site also accepts the RSS 1.0 default
 * namespace as an RDF marker and ends in a fallback `else`.
 */
function classifyFeedDocument(
  doc: Document,
  xmlString: string,
  deps: FeedDocumentRouterDeps,
): ParsedFeed {
  const rootElement = doc.documentElement;
  const isRDF =
    rootElement &&
    (rootElement.tagName.toLowerCase() === "rdf:rdf" ||
      rootElement.getAttribute("xmlns") === "http://purl.org/rss/1/");

  if (isRDF) {
    return parseRSS1(doc, deps.getRssParserDeps());
  } else if (doc.querySelector("rss")) {
    return parseRSS(doc, deps.getRssParserDeps());
  } else if (doc.querySelector("feed")) {
    return parseAtom(doc, deps.getAtomParserDeps());
  } else {
    return fallbackParse(xmlString, deps.getFallbackParseDeps());
  }
}

/**
 * Routes a raw feed string to the JSON, RSS 2.0, RSS 1.0/RDF, Atom, or regex
 * fallback parser, retrying malformed XML through its extracted `<rss>` block.
 * Extracted from `CustomXMLParser.parseString`.
 */
export function routeFeedDocument(
  xmlString: string,
  deps: FeedDocumentRouterDeps,
): ParsedFeed {
  try {
    if (xmlString.trim().startsWith("{")) {
      return parseJSON(xmlString, { transformSageUrl: deps.transformSageUrl });
    }

    const cleanedXml = preprocessXmlContent(xmlString.trim());

    const doc = deps.parseXML(cleanedXml);

    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return recoverFromParserError(xmlString, deps);
    }

    if (!deps.validateFeedStructure(doc)) {
      return fallbackParse(xmlString, deps.getFallbackParseDeps());
    }

    return classifyFeedDocument(doc, xmlString, deps);
  } catch (error) {
    console.error("[RSS dashboard] parseString error:", error);
    try {
      return fallbackParse(xmlString, deps.getFallbackParseDeps());
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
