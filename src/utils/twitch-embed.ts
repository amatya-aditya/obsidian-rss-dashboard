/**
 * Recognizing a Twitch VOD in a feed item and choosing the source for its
 * player iframe.
 *
 * Twitch refuses to play unless the embedding page's host is named in a
 * `parent` query parameter. Obsidian's origin is `app://obsidian.md` on desktop
 * and a Capacitor `localhost` origin on mobile, and Twitch accepts both
 * `localhost` and `obsidian.md` as parents from there. The player URL is built
 * only from a validated numeric VOD ID, so no feed text reaches the iframe.
 */
import type { FeedItem } from "../types/types";

const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

const TWITCH_VOD_PATH = /^\/videos\/(\d{1,15})\/?$/;

const TWITCH_VOD_ID_PATTERN = /^\d{1,15}$/;

const PLAYER_URL = "https://player.twitch.tv/";

/** Hosts Twitch accepts as the embedding page's `parent`, per platform. */
const PLAYER_PARENTS = ["localhost", "obsidian.md"];

export const TWITCH_PLAYER_ALLOW = "autoplay; fullscreen; encrypted-media";

/** Returns the VOD ID of a `twitch.tv/videos/<id>` link, or null for anything else. */
export function parseTwitchVodId(link: string | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link.trim());
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !TWITCH_HOSTS.has(url.hostname.toLowerCase())
    ) {
      return null;
    }
    return TWITCH_VOD_PATH.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The Twitch VOD ID the player should load for an item, or null. An item that
 * carries a YouTube `videoId` is never a Twitch VOD.
 */
export function twitchVodIdFor(
  item: Pick<FeedItem, "link" | "videoId">,
): string | null {
  if (item.videoId) return null;
  return parseTwitchVodId(item.link);
}

export function twitchVodWatchUrl(vodId: string): string {
  return `https://www.twitch.tv/videos/${vodId}`;
}

export interface TwitchPlayerSourceOptions {
  /** Load and start the player instead of waiting for a click. */
  autoplay?: boolean;
}

/**
 * The iframe `src` for one VOD. Throws on an ID that is not all digits, so no
 * other value can reach the iframe.
 */
export function twitchPlayerSourceUrl(
  vodId: string,
  options: TwitchPlayerSourceOptions = {},
): string {
  if (!TWITCH_VOD_ID_PATTERN.test(vodId)) {
    throw new Error("twitchPlayerSourceUrl needs a numeric VOD ID.");
  }

  const params = new URLSearchParams();
  params.set("video", `v${vodId}`);
  for (const parent of PLAYER_PARENTS) params.append("parent", parent);
  params.set("autoplay", options.autoplay ? "true" : "false");
  return `${PLAYER_URL}?${params.toString()}`;
}
