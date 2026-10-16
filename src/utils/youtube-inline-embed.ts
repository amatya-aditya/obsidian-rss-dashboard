/**
 * Playing a recognized YouTube embed inline in article content.
 *
 * The sanitizer (`safe-html.ts`) turns a recognized embed into a marked link
 * that carries the validated video ID; nothing else about the feed's iframe is
 * copied. This module's post-render step replaces each marked link with a video
 * placeholder, then loads the player when the reader clicks play, so no request
 * is made just by opening an article.
 *
 * The player is Obsidian's embed host (`releases.obsidian.md`), which wraps the
 * YouTube nocookie iframe from an `https` origin: a direct nocookie iframe shows
 * "This video is unavailable" from Obsidian's `app://` origin (#1173). The host
 * is undocumented and may change or disappear, so its availability is probed
 * once per session and the "Watch on YouTube" link always stays beside the
 * player. The host sees the video ID and the reader's IP address on play.
 */
import { requestUrl, setIcon } from "obsidian";
import {
  YOUTUBE_VIDEO_ID_ATTRIBUTE,
  isYouTubeVideoId,
  youTubeWatchUrl,
} from "./youtube-embed";

const EMBED_HOST_ORIGIN = "https://releases.obsidian.md";
const AVAILABILITY_TIMEOUT_MS = 8000;

/**
 * The limited permission set the embed host's player needs. Deliberately
 * narrower than the plugin's full-view YouTube embed.
 */
const EMBED_ALLOW = "autoplay; encrypted-media; fullscreen";

const EMBED_REFERRER_POLICY = "strict-origin-when-cross-origin";

const MARKED_LINK_SELECTOR = `a[${YOUTUBE_VIDEO_ID_ATTRIBUTE}]`;

export interface YouTubeVideoPlaceholderOptions {
  /** The video title, shown in the placeholder and named on the play control. */
  title?: string;
  /** How long the embed-host availability probe waits before giving up. */
  availabilityTimeoutMs?: number;
}

/**
 * The embed-host URL for one video, built only from the validated ID. Throws on
 * anything that is not an 11-character, URL-safe video ID, so no other value
 * can reach the iframe.
 */
export function youTubeEmbedHostUrl(videoId: string): string {
  if (!isYouTubeVideoId(videoId)) {
    throw new Error("youTubeEmbedHostUrl needs an 11-character video ID.");
  }
  return `${EMBED_HOST_ORIGIN}/youtube?v=${videoId}&autoplay=1`;
}

let availability: Promise<boolean> | null = null;

/** Test hook: forget the session's cached embed-host availability result. */
export function __resetYouTubeInlinePlaybackAvailability(): void {
  availability = null;
}

/**
 * Whether the embed host answers, probed at most once per session. Until the
 * first call nothing is requested.
 */
function isInlinePlaybackAvailable(
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  if (availability === null) {
    availability = probeEmbedHost(url, timeoutMs);
  }
  return availability;
}

/** A 200 confirms the host answers the request; anything else is unavailable. */
async function probeEmbedHost(
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  let timer: number | null = null;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = window.setTimeout(
        () => reject(new Error("Embed host probe timed out")),
        timeoutMs,
      );
    });
    const response = await Promise.race([
      requestUrl({ url, throw: false }),
      timeout,
    ]);
    return response.status === 200;
  } catch {
    return false;
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
}

function playButtonLabel(title: string): string {
  return title ? `Play video: ${title}` : "Play video";
}

function buildWatchLink(
  ownerDocument: Document,
  videoId: string,
): HTMLAnchorElement {
  const link = ownerDocument.win.createEl("a", {
    cls: "rss-youtube-embed-watch",
  });
  link.href = youTubeWatchUrl(videoId);
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const icon = ownerDocument.win.createSpan({
    cls: "rss-youtube-embed-watch-icon",
  });
  setIcon(icon, "play");
  link.appendChild(icon);
  link.appendChild(ownerDocument.createTextNode("Watch on YouTube"));
  return link;
}

function renderPlayer(
  placeholder: HTMLElement,
  ownerDocument: Document,
  videoId: string,
  title: string,
): void {
  placeholder.empty();
  placeholder.addClass("rss-youtube-embed-playing");

  const frame = ownerDocument.win.createDiv({
    cls: "rss-youtube-embed-player",
  });
  const iframe = ownerDocument.win.createEl("iframe", {
    cls: "rss-youtube-embed-frame",
    attr: {
      src: youTubeEmbedHostUrl(videoId),
      allow: EMBED_ALLOW,
      allowfullscreen: "true",
      referrerpolicy: EMBED_REFERRER_POLICY,
    },
  });
  // A frame's `title` is its accessible name (WCAG 4.1.2), not the tooltip the
  // repo's title rule targets; the element is an `iframe`, not a control.
  iframe.title = title ? `YouTube video: ${title}` : "YouTube video";
  frame.appendChild(iframe);
  placeholder.appendChild(frame);
  placeholder.appendChild(buildWatchLink(ownerDocument, videoId));

  iframe.focus();
}

function renderUnavailable(
  placeholder: HTMLElement,
  ownerDocument: Document,
  videoId: string,
): void {
  placeholder.empty();
  placeholder.addClass("rss-youtube-embed-unavailable");

  const watchLink = buildWatchLink(ownerDocument, videoId);
  placeholder.appendChild(watchLink);

  const notice = ownerDocument.win.createSpan({
    cls: "rss-youtube-embed-notice",
    text: "Inline video playback is unavailable.",
    attr: { role: "status" },
  });
  placeholder.appendChild(notice);

  watchLink.focus();
}

async function loadPlayer(
  placeholder: HTMLElement,
  ownerDocument: Document,
  videoId: string,
  options: YouTubeVideoPlaceholderOptions,
): Promise<void> {
  const title = (options.title ?? "").trim();
  const available = await isInlinePlaybackAvailable(
    youTubeEmbedHostUrl(videoId),
    options.availabilityTimeoutMs ?? AVAILABILITY_TIMEOUT_MS,
  );
  // The article may have re-rendered while the probe ran; drop the stale node.
  if (!placeholder.isConnected) {
    return;
  }
  if (available) {
    renderPlayer(placeholder, ownerDocument, videoId, title);
  } else {
    renderUnavailable(placeholder, ownerDocument, videoId);
  }
}

/**
 * Builds a click-to-play video placeholder for a validated video ID. Nothing is
 * requested until the reader clicks play. Exported so a caller that already has
 * a validated ID (the fetched version, #1176) can reuse it.
 */
export function createYouTubeVideoPlaceholder(
  ownerDocument: Document,
  videoId: string,
  options: YouTubeVideoPlaceholderOptions = {},
): HTMLElement {
  if (!isYouTubeVideoId(videoId)) {
    throw new Error(
      "createYouTubeVideoPlaceholder needs an 11-character video ID.",
    );
  }
  const title = (options.title ?? "").trim();
  const placeholder = ownerDocument.win.createDiv({
    cls: "rss-youtube-embed",
  });

  const playButton = ownerDocument.win.createEl("button", {
    cls: "rss-youtube-embed-play",
    attr: { type: "button", "aria-label": playButtonLabel(title) },
  });
  const playIcon = ownerDocument.win.createSpan({
    cls: "rss-youtube-embed-play-icon",
  });
  setIcon(playIcon, "play");
  playButton.appendChild(playIcon);
  playButton.addEventListener("click", () => {
    playButton.disabled = true;
    void loadPlayer(placeholder, ownerDocument, videoId, options);
  });

  placeholder.appendChild(playButton);
  if (title) {
    placeholder.appendChild(
      ownerDocument.win.createDiv({
        cls: "rss-youtube-embed-title",
        text: title,
      }),
    );
  }
  placeholder.appendChild(buildWatchLink(ownerDocument, videoId));
  return placeholder;
}

/**
 * Replaces every marked YouTube embed link inside `container` with a video
 * placeholder. A marked link the sanitizer did not validate is left in place.
 */
export function enhanceYouTubeEmbeds(
  container: HTMLElement,
  options: YouTubeVideoPlaceholderOptions = {},
): void {
  const links = Array.from(
    container.querySelectorAll<HTMLAnchorElement>(MARKED_LINK_SELECTOR),
  );
  for (const link of links) {
    const videoId = link.getAttribute(YOUTUBE_VIDEO_ID_ATTRIBUTE) ?? "";
    if (!isYouTubeVideoId(videoId)) {
      continue;
    }
    link.replaceWith(
      createYouTubeVideoPlaceholder(link.ownerDocument, videoId, options),
    );
  }
}
