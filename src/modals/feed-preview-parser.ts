import { decodeHtmlEntities } from "../services/feed-parser/xml-parser/xml-html-utils";

export interface FeedPreviewArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author?: string;
  image?: string;
}

export function parseFeedPreviewXml(xmlString: string): FeedPreviewArticle[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");

    const channel = doc.querySelector("channel");
    const rssItems = channel
      ? Array.from(channel.children).filter(
          (el) => el.tagName.toLowerCase() === "item",
        )
      : [];

    if (rssItems.length > 0) {
      return parseRssItems(rssItems);
    }

    const entries = doc.querySelectorAll("entry");
    return parseAtomEntries(entries);
  } catch {
    return [];
  }
}

function parseRssItems(items: Element[]): FeedPreviewArticle[] {
  const articles: FeedPreviewArticle[] = [];
  for (const item of items) {
    if (articles.length >= 10) break;
    articles.push(parseRssItem(item));
  }
  return articles;
}

function parseRssItem(item: Element): FeedPreviewArticle {
  const title = readRssItemText(item, ":scope > title");
  const link = readRssItemText(item, ":scope > link");
  const description = readRssItemText(item, ":scope > description");
  const pubDate = readRssItemText(item, ":scope > pubDate");
  const author =
    readRssItemText(item, ":scope > author") ||
    readRssItemText(item, ":scope > dc\\:creator");
  const image = getRssItemImage(item, description);

  return {
    title,
    link,
    description: sanitizeFeedPreviewText(description),
    pubDate,
    author,
    image,
  };
}

function readRssItemText(item: Element, selector: string): string {
  return item.querySelector(selector)?.textContent?.trim() || "";
}

function getRssItemImage(item: Element, description: string): string {
  let image = "";
  const content =
    item.querySelector(":scope > content\\:encoded")?.textContent ||
    description;
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (imgMatch?.[1]) {
    image = imgMatch[1];
  } else {
    const mediaContent = item.querySelector(":scope > media\\:content");
    if (mediaContent) {
      const mediaUrl = mediaContent.getAttribute("url");
      if (mediaUrl) {
        image = mediaUrl;
      }
    } else {
      const enclosure = item.querySelector(':scope > enclosure[type^="image"]');
      if (enclosure) {
        image = enclosure.getAttribute("url") || "";
      }
    }
  }
  return image;
}

function parseAtomEntries(entries: NodeListOf<Element>): FeedPreviewArticle[] {
  const articles: FeedPreviewArticle[] = [];
  for (const entry of entries) {
    if (articles.length >= 10) break;
    articles.push(parseAtomEntry(entry));
  }
  return articles;
}

function parseAtomEntry(entry: Element): FeedPreviewArticle {
  const title = readAtomEntryText(entry, "title");
  const link = entry.querySelector("link")?.getAttribute("href") || "";
  const description =
    readAtomEntryText(entry, "summary") || readAtomEntryText(entry, "content");
  const pubDate =
    readAtomEntryText(entry, "published") ||
    readAtomEntryText(entry, "updated");
  const author = readAtomEntryText(entry, "author > name");

  return {
    title,
    link,
    description: sanitizeFeedPreviewText(description),
    pubDate,
    author,
  };
}

function readAtomEntryText(entry: Element, selector: string): string {
  return entry.querySelector(selector)?.textContent?.trim() || "";
}

export function sanitizeFeedPreviewText(text: string): string {
  if (!text) return "";

  return decodeHtmlEntities(text.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}
