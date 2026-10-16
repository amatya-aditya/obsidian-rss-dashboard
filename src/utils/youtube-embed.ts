/**
 * Recognizing a YouTube embed in feed HTML and writing it into a saved note.
 *
 * A saved note cannot hold the feed's `<iframe>`, and a feed's iframe can point
 * anywhere. A recognized embed (https, a YouTube host, path `/embed/<11-character
 * ID>`) becomes an Obsidian video embed plus a plain watch link, both built
 * from the validated ID. The feed's `src` and attributes are never copied.
 */

const YOUTUBE_EMBED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Stands in for a recognized iframe while the HTML waits for Turndown. */
const EMBED_MARKER_TAG = "rss-youtube-embed";

const EMBED_MARKER_ID_ATTRIBUTE = "data-video-id";

interface YouTubeEmbedTurndownService {
  addRule(
    name: string,
    rule: {
      filter: (node: Node) => boolean;
      replacement: (content: string, node: Node) => string;
    },
  ): void;
}

/** Returns the video ID of a YouTube embed `src`, or null for anything else. */
export function parseYouTubeEmbedId(src: string): string | null {
  try {
    const url = new URL(src.trim(), "https://invalid.example/");
    if (url.protocol !== "https:" || !YOUTUBE_EMBED_HOSTS.has(url.hostname)) {
      return null;
    }
    const match = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * The note text for a video: Obsidian's video embed on its own line, then a
 * plain link that still works where the embed does not play.
 */
function embedMarkdown(videoId: string): string {
  const url = youTubeWatchUrl(videoId);
  return `\n\n![](${url})\n\n[Watch on YouTube](${url})\n\n`;
}

/**
 * Replaces each recognized YouTube iframe with a marker that the Turndown rule
 * from {@link addYouTubeEmbedTurndownRule} writes out, and drops every other
 * iframe. Returns the input unchanged when it has no iframe.
 */
export function protectYouTubeEmbedsForMarkdown(html: string): string {
  if (!html || !/<iframe/i.test(html)) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const iframes = Array.from(doc.querySelectorAll("iframe"));
  if (iframes.length === 0) return html;

  for (const iframe of iframes) {
    const videoId = parseYouTubeEmbedId(iframe.getAttribute("src") || "");
    if (!videoId) {
      iframe.remove();
      continue;
    }
    iframe.replaceWith(
      // Turndown discards an element with no text before any rule runs.
      doc.win.createEl(EMBED_MARKER_TAG, {
        text: videoId,
        attr: { [EMBED_MARKER_ID_ATTRIBUTE]: videoId },
      }),
    );
  }

  return doc.body.innerHTML;
}

export function addYouTubeEmbedTurndownRule(
  turndownService: YouTubeEmbedTurndownService,
): void {
  turndownService.addRule("youtube-embed", {
    filter: (node: Node) => node.nodeName.toLowerCase() === EMBED_MARKER_TAG,
    replacement: (_content: string, node: Node) => {
      const videoId =
        (node as Element).getAttribute(EMBED_MARKER_ID_ATTRIBUTE) || "";
      return VIDEO_ID_PATTERN.test(videoId) ? embedMarkdown(videoId) : "";
    },
  });
}

/**
 * For a note that keeps the feed's HTML: replaces each recognized iframe with
 * the embed text and drops every other iframe. The text goes after the
 * top-level block that held the iframe, because Obsidian reads Markdown inside
 * an HTML block as plain text.
 */
export function replaceYouTubeEmbedsInHtmlNote(doc: Document): void {
  const lastInsertedAfter = new Map<Node, Node>();

  for (const iframe of Array.from(doc.querySelectorAll("iframe"))) {
    const videoId = parseYouTubeEmbedId(iframe.getAttribute("src") || "");
    if (!videoId) {
      iframe.remove();
      continue;
    }

    let block: Node = iframe;
    while (block.parentNode && block.parentNode !== doc.body) {
      block = block.parentNode;
    }

    const text = doc.createTextNode(embedMarkdown(videoId));
    if (block === iframe) {
      iframe.replaceWith(text);
      continue;
    }
    const anchor = lastInsertedAfter.get(block) ?? block;
    anchor.parentNode?.insertBefore(text, anchor.nextSibling);
    lastInsertedAfter.set(block, text);
    iframe.remove();
  }
}
