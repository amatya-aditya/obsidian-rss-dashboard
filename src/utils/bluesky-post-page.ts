/**
 * Reads a Bluesky post page's own JSON-LD and renders the post's text and
 * pictures as plain HTML. `bsky.app` draws a post client-side, so the fetched
 * HTML has no article for Mozilla Readability to find, and its `og:image` tags
 * hold the author's avatar or a replier's picture (#1738). The Reader tries this
 * for `bsky.app/profile/{handle}/post/{id}` before Readability.
 *
 * The extractor reads only the page the fetch already returned: it makes no
 * request and sets no headers. It reads the `mainEntity` post and nothing else,
 * never the `og:image` tags and never `comment`, which carries repliers' images.
 * Every failure returns `null`, and the caller keeps its Readability result
 * unchanged.
 */

import { KEEP_LEAD_ATTRIBUTE } from "./reader-html-cleanup";

const BLUESKY_HOST = "bsky.app";
const POST_PATH = /^\/profile\/[^/]+\/post\/[^/]+\/?$/;
const JSON_LD_SELECTOR = 'script[type="application/ld+json"]';
const POST_TYPE = "DiscussionForumPosting";
const MAX_IMAGES = 20;
const THUMBNAIL_PATH = "/img/feed_thumbnail/";
const FULLSIZE_PATH = "/img/feed_fullsize/";

export interface BlueskyPostContent {
  /** The post as plain HTML: its text, then its pictures or video poster. */
  content: string;
  /** The first picture (or the video poster), "" for a video with no poster. */
  coverImage: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** True for `https://bsky.app/profile/{handle}/post/{id}`, whatever follows `?` or `#`. */
export function isBlueskyPostUrl(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.hostname.toLowerCase() === BLUESKY_HOST &&
    POST_PATH.test(url.pathname)
  );
}

function hasPostType(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  return Array.isArray(type) ? type.includes(POST_TYPE) : type === POST_TYPE;
}

function readMainEntity(html: string): Record<string, unknown> | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const script of Array.from(doc.querySelectorAll(JSON_LD_SELECTOR))) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const mainEntity = isRecord(data) ? data.mainEntity : null;
    if (isRecord(mainEntity) && hasPostType(mainEntity)) return mainEntity;
  }
  return null;
}

/** `value` when it is an absolute http(s) URL, else "". */
function httpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : "";
  } catch {
    return "";
  }
}

/** The feed thumbnail's full-size twin; any other URL is returned as it is. */
function toFullSize(imageUrl: string): string {
  return imageUrl.replace(THUMBNAIL_PATH, FULLSIZE_PATH);
}

function readImages(mainEntity: Record<string, unknown>): string[] {
  const image = mainEntity.image;
  if (!Array.isArray(image)) return [];
  const urls: string[] = [];
  for (const entry of image) {
    const url = httpUrl(entry);
    if (url) urls.push(toFullSize(url));
    if (urls.length === MAX_IMAGES) break;
  }
  return urls;
}

function renderText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        // Short enough to look like a teaser to the Reader's lead cleanup,
        // which would drop it beside a repeated description.
        `<p ${KEEP_LEAD_ATTRIBUTE}>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function renderImages(urls: string[]): string {
  return urls
    .map(
      (url, index) =>
        `<p><img src="${escapeHtml(url)}" alt="Post image ${index + 1}"></p>`,
    )
    .join("");
}

function renderWatchLink(pageUrl: string): string {
  const url = new URL(pageUrl);
  const href = `${url.origin}${url.pathname}`;
  return `<p><a href="${escapeHtml(href)}">Watch on Bluesky</a></p>`;
}

/**
 * Returns the post as plain HTML (its text, then every picture at full size, or
 * for a video post its poster and a "Watch on Bluesky" link) with the cover
 * image, or `null` when `pageUrl` is not a post page or the page's `mainEntity`
 * is absent, unexpectedly shaped, or carries no picture and no video.
 */
export function extractBlueskyPost(
  html: string,
  pageUrl: string,
): BlueskyPostContent | null {
  if (!isBlueskyPostUrl(pageUrl)) return null;
  const mainEntity = readMainEntity(html);
  if (!mainEntity) return null;

  const text = renderText(mainEntity.text);
  const video = isRecord(mainEntity.video) ? mainEntity.video : null;
  if (video) {
    // The video names its own poster; the image list only repeats it.
    const poster = httpUrl(video.thumbnailUrl);
    return {
      content:
        text + renderImages(poster ? [poster] : []) + renderWatchLink(pageUrl),
      coverImage: poster,
    };
  }

  const images = readImages(mainEntity);
  const [coverImage] = images;
  if (coverImage === undefined) return null;
  return { content: text + renderImages(images), coverImage };
}
