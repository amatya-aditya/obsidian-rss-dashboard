/**
 * Which player an item's video belongs to. The route, the player guard and the
 * player itself all read it from here, so none of them can disagree about
 * whether an item is playable.
 */
import type { FeedItem } from "../types/types";
import { twitchVodIdFor } from "./twitch-embed";

export type VideoSource =
  { kind: "youtube"; id: string } | { kind: "twitch"; id: string };

/**
 * The player source for an item, or null when it has none. A YouTube
 * `videoId` wins; otherwise a `twitch.tv/videos/<id>` link is a Twitch VOD.
 */
export function resolveVideoSource(
  item: Pick<FeedItem, "link" | "videoId">,
): VideoSource | null {
  if (item.videoId) return { kind: "youtube", id: item.videoId };
  const vodId = twitchVodIdFor(item);
  return vodId ? { kind: "twitch", id: vodId } : null;
}
