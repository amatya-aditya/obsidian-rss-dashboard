/**
 * Choosing the source for the plugin's full-view YouTube player.
 *
 * Obsidian's own YouTube embed routes to its https embed host whenever the
 * page origin is not `https`, because a direct nocookie iframe loaded from
 * Obsidian's `app://` (desktop) or `capacitor://` (iOS) origin makes YouTube
 * report "This video is unavailable" / Error 153 - YouTube sees no usable
 * `Referer` (#969, #1173, #1178). The host serves the same nocookie iframe from
 * an `https` origin, so YouTube accepts it. The plugin mirrors that routing
 * instead of inventing its own.
 *
 * The host forwards every query parameter to the iframe it nests, so
 * `enablejsapi`, `autoplay` and `start` reach the player. `enablejsapi=1` lets
 * `youtube-player-channel.ts` read the nested player's position (#1236).
 */
import { isYouTubeVideoId } from "./youtube-embed";

const EMBED_HOST_URL = "https://releases.obsidian.md/youtube";
const DIRECT_EMBED_URL = "https://www.youtube-nocookie.com/embed";

/** The host player is embedded by the plugin, so it needs this permission set. */
export const YOUTUBE_PLAYER_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

export const YOUTUBE_PLAYER_REFERRER_POLICY = "strict-origin-when-cross-origin";

export interface YouTubePlayerSourceOptions {
  /** Start the video at this many seconds in, for resume. */
  startSeconds?: number;
  /** Load and start the player instead of the host's click-to-play cover. */
  autoplay?: boolean;
}

/**
 * The iframe `src` for one video, built only from the validated 11-character
 * ID. `protocol` defaults to the current origin and exists so the routing can
 * be tested for every platform. Throws on an ID that is not 11 URL-safe
 * characters, so no other value can reach the iframe.
 */
export function youTubePlayerSourceUrl(
  videoId: string,
  options: YouTubePlayerSourceOptions = {},
  protocol: string = window.location.protocol,
): string {
  if (!isYouTubeVideoId(videoId)) {
    throw new Error("youTubePlayerSourceUrl needs an 11-character video ID.");
  }

  const startSeconds = Math.floor(options.startSeconds ?? 0);
  const params = new URLSearchParams();

  if (protocol !== "https:") {
    params.set("v", videoId);
    params.set("enablejsapi", "1");
    if (options.autoplay) params.set("autoplay", "1");
    if (startSeconds > 0) params.set("start", String(startSeconds));
    return `${EMBED_HOST_URL}?${params.toString()}`;
  }

  params.set("rel", "0");
  params.set("enablejsapi", "1");
  if (startSeconds > 0) params.set("start", String(startSeconds));
  return `${DIRECT_EMBED_URL}/${videoId}?${params.toString()}`;
}
