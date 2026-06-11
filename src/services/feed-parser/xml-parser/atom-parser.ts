import type { ParsedFeed, ParsedItem } from "../types.js";

export interface AtomParserDeps {
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
  transformSageUrl: (url: string) => string;
}

export function getAtomEntryLink(entry: Element): string {
  let el = entry.querySelector('link[rel="alternate"][type="text/html"]');
  if (el && el.getAttribute("href")) return el.getAttribute("href") || "";

  el = entry.querySelector('link[rel="alternate"]');
  if (el && el.getAttribute("href")) return el.getAttribute("href") || "";

  el = entry.querySelector("link[href]");
  if (el && el.getAttribute("href")) return el.getAttribute("href") || "";
  return "";
}

export function parseAtom(doc: Document, deps: AtomParserDeps): ParsedFeed {
  const feed = doc.querySelector("feed");
  if (!feed) {
    throw new Error("Invalid atom feed: no feed element found");
  }

  const title = deps.getTextContent(feed, "title");
  const description = deps.getTextContent(feed, "subtitle");
  const link =
    deps.getAttribute(feed, 'link[rel="alternate"]', "href") ||
    deps.getAttribute(feed, "link", "href");
  const author = deps.getTextContent(feed, "author > name");

  // Try multiple sources for feed image (YouTube uses media:thumbnail for channel avatar)
  let imageUrl = "";

  // 1. Try media:thumbnail (YouTube channel avatar)
  const mediaThumbnail = feed.querySelector("media\\:thumbnail");
  if (mediaThumbnail) {
    imageUrl = mediaThumbnail.getAttribute("url") || "";
  }

  // 2. Try logo element
  if (!imageUrl) {
    const logoElement = feed.querySelector("logo");
    if (logoElement?.textContent) {
      imageUrl = logoElement.textContent;
    }
  }

  // 3. Try icon element
  if (!imageUrl) {
    const iconElement = feed.querySelector("icon");
    if (iconElement?.textContent) {
      imageUrl = iconElement.textContent;
    }
  }

  // 4. Try to extract from first entry's media:thumbnail as fallback for channel avatar
  if (!imageUrl) {
    const firstEntry = feed.querySelector("entry");
    if (firstEntry) {
      const entryMediaThumbnail =
        firstEntry.querySelector("media\\:thumbnail");
      if (entryMediaThumbnail) {
        imageUrl = entryMediaThumbnail.getAttribute("url") || "";
      }
    }
  }

  const image = imageUrl ? { url: imageUrl } : undefined;

  const items: ParsedItem[] = [];
  const entryElements = Array.from(feed.getElementsByTagName("entry"));

  entryElements.forEach((entry, _idx) => {
    const entryTitle = deps.getTextContent(entry, "title");
    let entryLink = getAtomEntryLink(entry);
    entryLink = deps.transformSageUrl(entryLink);
    const entryDescription =
      deps.getTextContent(entry, "summary") ||
      deps.getTextContent(entry, "media:description");
    const pubDate =
      deps.getTextContent(entry, "published") ||
      deps.getTextContent(entry, "updated");
    const guid = deps.getTextContent(entry, "id") || entryLink;
    const entryAuthor = deps.getTextContent(entry, "author > name");
    const content =
      deps.getTextContent(entry, "content", true) || entryDescription;

    // Extract duration from media:content or itunes:duration
    let duration = deps.getTextContent(entry, "itunes\\:duration");
    if (!duration) {
      const mediaContent = entry.querySelector("media\\:content");
      if (mediaContent) {
        duration = mediaContent.getAttribute("duration") || "";
      }
    }

    items.push({
      title: entryTitle,
      link: entryLink,
      description: entryDescription,
      pubDate,
      guid,
      author: entryAuthor,
      content,
      category: deps.getTextContent(entry, "category"),
      itunes: {
        duration: duration || undefined,
      },
    });
  });

  return {
    title,
    description,
    link,
    author,
    image,
    items,
    type: "atom",
    feedItunesImage: "",
    feedImageUrl: imageUrl,
  };
}
