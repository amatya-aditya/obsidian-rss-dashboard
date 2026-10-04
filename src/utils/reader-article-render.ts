import type { Feed, FeedItem } from "../types/types";
import { MediaService } from "../services/media-service";
import {
  getPubDateMs,
  resolveDisplayDate,
} from "../services/feed-parser/feed-retention";
import {
  findFirstNonFormulaImage,
  firstNonFormulaImageUrl,
} from "./image-url-utils";
import { normalizeSubstackImageUrl } from "./substack-image-url";

/** Which view the reader gives an item (see `ReaderView.displayItem`). */
export type ReaderMediaRoute = "video" | "video-podcast" | "podcast" | "article";

/**
 * Clears the saved flag, the saved path and the Saved tag on an item whose
 * saved note no longer exists, on the item and on the feed's own copy of it.
 * `savedFileExists` is only called for an item that claims to be saved.
 */
export function clearSavedStateIfFileMissing(
  item: FeedItem,
  feeds: Feed[],
  savedFileExists: () => boolean,
): void {
  if (item.saved) {
    const fileExists = savedFileExists();
    if (!fileExists) {
      item.saved = false;
      item.savedFilePath = undefined;
      if (item.tags) {
        item.tags = item.tags.filter(
          (tag) => tag.name.toLowerCase() !== "saved",
        );
      }
      if (item.feedUrl) {
        const feed = feeds.find((f) => f.url === item.feedUrl);
        if (feed) {
          const originalItem = feed.items.find((i) => i.guid === item.guid);
          if (originalItem) {
            originalItem.saved = false;
            originalItem.savedFilePath = undefined;
            if (originalItem.tags) {
              originalItem.tags = originalItem.tags.filter(
                (tag) => tag.name.toLowerCase() !== "saved",
              );
            }
          }
        }
      }
    }
  }
}

/**
 * Chooses the view for an item and back-fills the `videoId` (from a YouTube
 * link) or `audioUrl` (from the description) the chosen view needs.
 */
export function resolveReaderMediaRoute(item: FeedItem): ReaderMediaRoute {
  if (item.mediaType === "video" && !item.videoId && item.link) {
    const vid = MediaService.extractYouTubeVideoId(item.link);
    if (vid) item.videoId = vid;
  }

  if (item.mediaType === "video" && item.videoId) {
    return "video";
  }
  if (item.mediaType === "video" && item.videoUrl) {
    return "video-podcast";
  }
  if (
    item.mediaType === "podcast" &&
    (item.audioUrl || MediaService.extractPodcastAudio(item.description))
  ) {
    if (!item.audioUrl) {
      const aud = MediaService.extractPodcastAudio(item.description);
      if (aud) item.audioUrl = aud;
    }
    return "podcast";
  }
  return "article";
}

/** The date line in the article header. */
export function formatReaderDateText(
  item: FeedItem,
  useFirstSeenDateFallback: boolean,
): string {
  const displayDate = resolveDisplayDate(item, useFirstSeenDateFallback);
  const isFirstSeenFallback = getPubDateMs(item.pubDate) <= 0 && !!displayDate;
  return displayDate
    ? isFirstSeenFallback
      ? `First seen: ${displayDate.toLocaleString()}`
      : displayDate.toLocaleString()
    : "Unknown date";
}

/**
 * The item's cover image, or undefined when there is none or it is the feed's
 * own icon (a logo, not an article picture).
 */
export function resolveFallbackHeroUrl(
  item: FeedItem,
  feeds: readonly Feed[],
): string | undefined {
  let fallbackHeroUrl = firstNonFormulaImageUrl([
    item.coverImage,
    item.image,
    item.itunes?.image?.href,
  ]);

  // Avoid using the feed icon (logo) as the article hero image.
  if (fallbackHeroUrl && item.feedUrl) {
    const feedIconUrl = feeds.find((f) => f.url === item.feedUrl)?.iconUrl || "";
    const normalize = (u: string) => u.trim().replace(/\/$/, "");
    if (feedIconUrl && normalize(fallbackHeroUrl) === normalize(feedIconUrl)) {
      fallbackHeroUrl = undefined;
    }
  }

  return fallbackHeroUrl;
}

/** False for an empty description or one that is only an ellipsis. */
export function hasMeaningfulFeedDescription(html: string): boolean {
  if (!html) {
    return false;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return false;
  }

  return !/^(?:\.{3,}|…+|\[\s*(?:\.{3,}|…+)\s*\])$/.test(text);
}

export interface ArticleSections {
  descriptionHtml: string;
  mainHtml: string;
  hasMeaningfulDescription: boolean;
  hasDistinctMainContent: boolean;
  contentToRender: string;
}

/** Splits an item into the feed description and the body to render. */
export function selectArticleSections(
  item: FeedItem,
  fullContent: string | undefined,
  isEquivalentHtml: (html1: string, html2: string) => boolean,
): ArticleSections {
  const descriptionHtml = (item.description || "").trim();
  const hasMeaningfulDescription = hasMeaningfulFeedDescription(descriptionHtml);
  const mainHtml = (fullContent || item.content || "").trim();

  const hasDistinctMainContent =
    mainHtml !== "" &&
    (!hasMeaningfulDescription || !isEquivalentHtml(mainHtml, descriptionHtml));

  const contentToRender = hasDistinctMainContent
    ? mainHtml
    : mainHtml || descriptionHtml;

  return {
    descriptionHtml,
    mainHtml,
    hasMeaningfulDescription,
    hasDistinctMainContent,
    contentToRender,
  };
}

/** Resolves relative link and image urls (for navigation inside Obsidian). */
export function resolveRelativeUrlsInDocument(
  doc: Document,
  baseUrl: string,
): void {
  if (baseUrl) {
    const base = new URL(baseUrl);

    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (!href) return;
      try {
        el.setAttribute("href", new URL(href, base).toString());
      } catch {
        /* ignore */
      }
    });

    doc.querySelectorAll("img").forEach((el) => {
      const src = el.getAttribute("src");
      if (!src) return;
      try {
        el.setAttribute("src", new URL(src, base).toString());
      } catch {
        /* ignore */
      }
    });
  }
}

/**
 * Obsidian shows tooltips for many elements with `aria-label` / `data-tooltip*`.
 * Embedded article HTML frequently includes accessibility labels like "Breadcrumbs" and "Article body",
 * which then appear as noisy tooltips on hover throughout the reader view.
 */
export function stripEmbeddedTooltipAttributes(doc: Document): void {
  doc.body.querySelectorAll<HTMLElement>("[aria-label]").forEach((el) => {
    el.removeAttribute("aria-label");
  });
  doc.body.querySelectorAll<HTMLElement>("[data-tooltip]").forEach((el) => {
    el.removeAttribute("data-tooltip");
  });
  doc.body
    .querySelectorAll<HTMLElement>("[data-tooltip-position]")
    .forEach((el) => {
      el.removeAttribute("data-tooltip-position");
    });
  doc.body
    .querySelectorAll<HTMLElement>("[data-tooltip-delay]")
    .forEach((el) => {
      el.removeAttribute("data-tooltip-delay");
    });
}

/** The view helpers hero placement needs, passed in so they can stay on the view. */
export interface HeroImageHost {
  setupLightbox(img: HTMLImageElement): void;
  isLikelySameImageSource(urlA: string, urlB: string): boolean;
  removeLeadImageElement(imageEl: Element): void;
}

/**
 * Puts the hero image in an empty slot (the fallback url, else the document's
 * first image) and drops a duplicate lead image from the document; when the
 * slot is already filled, only drops a lead image that repeats it.
 */
export function placeHeroImage(
  doc: Document,
  heroSlot: HTMLElement,
  fallbackHeroUrl: string | undefined,
  title: string | undefined,
  host: HeroImageHost,
): void {
  const firstImg = findFirstNonFormulaImage(doc.body);

  if (heroSlot.childElementCount === 0) {
    fillEmptyHeroSlot(heroSlot, firstImg, fallbackHeroUrl, title, host);
  } else {
    dropLeadImageRepeatingHero(heroSlot, firstImg, host);
  }
}

function fillEmptyHeroSlot(
  heroSlot: HTMLElement,
  firstImg: HTMLImageElement | null,
  fallbackHeroUrl: string | undefined,
  title: string | undefined,
  host: HeroImageHost,
): void {
  let heroUrl = normalizeSubstackImageUrl(fallbackHeroUrl);
  const firstImgSrc = normalizeSubstackImageUrl(
    firstImg?.getAttribute("src")?.trim() || "",
  );
  if (!heroUrl && firstImgSrc) {
    heroUrl = firstImgSrc;
  }

  if (heroUrl) {
    const heroImg = heroSlot.createEl("img", {
      cls: "rss-reader-fallback-hero",
      attr: { src: heroUrl, alt: title || "Hero image" },
    });
    host.setupLightbox(heroImg);

    // Remove the first image from the body if it's the hero image to avoid duplication
    if (
      firstImg &&
      firstImgSrc &&
      host.isLikelySameImageSource(firstImgSrc, heroUrl)
    ) {
      host.removeLeadImageElement(firstImg);
    }
  }
}

function dropLeadImageRepeatingHero(
  heroSlot: HTMLElement,
  firstImg: HTMLImageElement | null,
  host: HeroImageHost,
): void {
  // Hero slot already filled by a previous section (e.g. description)
  // If the current section starts with the same image as the hero image, remove it to avoid duplication
  const existingHeroSrc = normalizeSubstackImageUrl(
    heroSlot.querySelector("img")?.getAttribute("src")?.trim() || "",
  );
  const firstImgSrc = normalizeSubstackImageUrl(
    firstImg?.getAttribute("src")?.trim() || "",
  );
  if (
    existingHeroSrc &&
    firstImg &&
    host.isLikelySameImageSource(firstImgSrc, existingHeroSrc)
  ) {
    host.removeLeadImageElement(firstImg);
  }
}
