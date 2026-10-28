/**
 * Recognizing a Twitch VOD or live channel in a feed item and choosing the
 * source for its player iframe.
 *
 * Twitch refuses to play unless the embedding page's host is named in a
 * `parent` query parameter. Obsidian's origin is `app://obsidian.md` on desktop
 * and a Capacitor `localhost` origin on mobile, and Twitch accepts both
 * `localhost` and `obsidian.md` as parents from there. The player URL is built
 * only from a validated numeric VOD ID or channel login, so no feed text
 * reaches the iframe.
 */
import type { FeedItem } from "../types/types";

const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

const TWITCH_VOD_PATH = /^\/videos\/(\d{1,15})\/?$/;

const TWITCH_VOD_ID_PATTERN = /^\d{1,15}$/;

/** A channel link is one path segment; the login rules are checked on it. */
const TWITCH_CHANNEL_PATH = /^\/([^/]+)\/?$/;

const TWITCH_LOGIN_PATTERN = /^[A-Za-z0-9_]{1,25}$/;

/**
 * First path segments that are Twitch pages, not channels. A login can match
 * the login pattern and still be one of these, so they are refused by name.
 */
const TWITCH_RESERVED_PATHS = new Set([
  "videos",
  "directory",
  "downloads",
  "jobs",
  "p",
  "settings",
  "subscriptions",
  "wallet",
  "turbo",
  "friends",
  "inventory",
  "drops",
  "search",
  "popout",
  "embed",
  "store",
  "moderator",
  "broadcast",
]);

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

/**
 * Returns the lowercased channel login of a `twitch.tv/<login>` link, or null
 * for anything else: Twitch's own pages, deeper paths such as a channel's
 * videos or clips, and logins Twitch does not issue.
 */
export function parseTwitchChannel(link: string | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link.trim());
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !TWITCH_HOSTS.has(url.hostname.toLowerCase())
    ) {
      return null;
    }
    const segment = TWITCH_CHANNEL_PATH.exec(url.pathname)?.[1];
    if (!segment || !TWITCH_LOGIN_PATTERN.test(segment)) return null;
    const login = segment.toLowerCase();
    return TWITCH_RESERVED_PATHS.has(login) ? null : login;
  } catch {
    return null;
  }
}

/**
 * The live channel login the player should load for an item, or null. An item
 * that carries a YouTube `videoId` is never a Twitch channel.
 */
export function twitchChannelFor(
  item: Pick<FeedItem, "link" | "videoId">,
): string | null {
  if (item.videoId) return null;
  return parseTwitchChannel(item.link);
}

function requireTwitchLogin(login: string, caller: string): void {
  if (!TWITCH_LOGIN_PATTERN.test(login)) {
    throw new Error(`${caller} needs a valid Twitch channel login.`);
  }
}

export function twitchChannelWatchUrl(login: string): string {
  requireTwitchLogin(login, "twitchChannelWatchUrl");
  return `https://www.twitch.tv/${login}`;
}

/**
 * The iframe `src` for a live channel. It starts muted because a browser
 * blocks autoplay with sound; the viewer unmutes in the player. Throws on a
 * login that fails the channel pattern, so no other value can reach the iframe.
 */
export function twitchLivePlayerSourceUrl(login: string): string {
  requireTwitchLogin(login, "twitchLivePlayerSourceUrl");

  const params = new URLSearchParams();
  params.set("channel", login);
  for (const parent of PLAYER_PARENTS) params.append("parent", parent);
  params.set("autoplay", "true");
  params.set("muted", "true");
  return `${PLAYER_URL}?${params.toString()}`;
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
