/**
 * Live playback events from the YouTube player inside Obsidian's embed host.
 *
 * The host (`releases.obsidian.md/youtube`) nests the nocookie player in its
 * own iframe, so the player is a grandchild of the plugin's window. A
 * cross-origin window still exposes `frames` and `postMessage`, so the plugin
 * sends the IFrame API's `listening` handshake straight to the nested player.
 * The player then answers the window that sent it, with `infoDelivery` events
 * carrying the exact `currentTime`, `duration` and `playerState` (#1236).
 * Checked in Obsidian 1.13.7 desktop: pause, seek and play all report exactly.
 *
 * The player only talks when its URL carries `enablejsapi=1`.
 */

/** The origins a YouTube player posts from. */
const PLAYER_ORIGINS = new Set([
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
]);

/** Both player sources load the nocookie player. */
const PLAYER_TARGET_ORIGIN = "https://www.youtube-nocookie.com";

/**
 * The handshake repeats quickly for 30 seconds while the player loads, then
 * slowly for as long as the channel is open: a player that loads late (a
 * click-to-play cover) or reloads still gets a handshake. A connected player
 * answers a repeat with `alreadyInitialized` and carries on.
 */
const FAST_HANDSHAKE_MS = 500;
const FAST_HANDSHAKE_ATTEMPTS = 60;
const SLOW_HANDSHAKE_MS = 5000;

export interface YouTubePlayerUpdate {
  /** The video the player is on, which changes if the viewer picks another. */
  videoId?: string;
  currentTime?: number;
  duration?: number;
  /** The IFrame API state: 1 playing, 2 paused, 0 ended, 3 buffering. */
  playerState?: number;
}

interface PlayerMessage {
  event?: unknown;
  info?: unknown;
}

/**
 * The windows that may be the player: the host's nested frame, or the iframe
 * itself when it loads the nocookie embed directly (an https page).
 */
function playerWindows(iframe: HTMLIFrameElement): Window[] {
  const outer = iframe.contentWindow;
  if (!outer) return [];
  const nested = outer.frames.length > 0 ? outer.frames[0] : null;
  return nested ? [nested, outer] : [outer];
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Reads one player message, or null when it carries nothing to track. */
export function parseYouTubePlayerMessage(
  data: unknown,
): YouTubePlayerUpdate | null {
  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const message = parsed as PlayerMessage;

  if (message.event === "onStateChange") {
    const playerState = numberOrUndefined(message.info);
    return playerState === undefined ? null : { playerState };
  }

  if (
    message.event === "infoDelivery" &&
    message.info &&
    typeof message.info === "object"
  ) {
    const info = message.info as Record<string, unknown>;
    const videoData = info.videoData as Record<string, unknown> | undefined;
    const update: YouTubePlayerUpdate = {
      videoId:
        typeof videoData?.video_id === "string" && videoData.video_id
          ? videoData.video_id
          : undefined,
      currentTime: numberOrUndefined(info.currentTime),
      duration: numberOrUndefined(info.duration),
      playerState: numberOrUndefined(info.playerState),
    };
    return Object.values(update).every((value) => value === undefined)
      ? null
      : update;
  }

  return null;
}

/**
 * Starts listening to the player in `iframe` and returns a disposer. Only a
 * message from that iframe's player, from a YouTube origin, reaches
 * `onUpdate`.
 *
 * The listener sits on the plugin's own `window`, popouts included: the player
 * answers the window whose code sent the handshake, and the plugin's code
 * always runs in the main window.
 */
export function connectYouTubePlayerChannel(
  iframe: HTMLIFrameElement,
  onUpdate: (update: YouTubePlayerUpdate) => void,
): () => void {
  const handshake = JSON.stringify({
    event: "listening",
    id: iframe.id || "rss-dashboard-video",
    channel: "widget",
  });
  let attempts = 0;
  let handshakeTimer: number | null = null;
  let handshakeMs = 0;
  // The window that answered; the host keeps one nested frame, so it stays.
  let player: Window | null = null;

  const schedule = (intervalMs: number): void => {
    if (handshakeTimer !== null) window.clearInterval(handshakeTimer);
    handshakeMs = intervalMs;
    handshakeTimer = window.setInterval(sendHandshake, intervalMs);
  };

  const sendHandshake = (): void => {
    attempts += 1;
    // A window from another origin silently drops the message, so the host
    // page never receives it.
    const targets = player ? [player] : playerWindows(iframe);
    for (const target of targets) {
      target.postMessage(handshake, PLAYER_TARGET_ORIGIN);
    }
    if (
      handshakeMs === FAST_HANDSHAKE_MS &&
      attempts >= FAST_HANDSHAKE_ATTEMPTS
    ) {
      schedule(SLOW_HANDSHAKE_MS);
    }
  };

  const isPlayer = (source: MessageEventSource | null): boolean => {
    if (!source) return false;
    if (player) return source === player;
    const match = playerWindows(iframe).find((win) => win === source);
    if (match) player = match;
    return match !== undefined;
  };

  const onMessage = (event: MessageEvent): void => {
    if (!PLAYER_ORIGINS.has(event.origin) || !isPlayer(event.source)) return;
    if (handshakeMs === FAST_HANDSHAKE_MS) schedule(SLOW_HANDSHAKE_MS);
    const update = parseYouTubePlayerMessage(event.data);
    if (!update) return;
    try {
      onUpdate(update);
    } catch {
      // A failing listener must not throw on every player event.
    }
  };

  window.addEventListener("message", onMessage);
  schedule(FAST_HANDSHAKE_MS);

  return () => {
    if (handshakeTimer !== null) window.clearInterval(handshakeTimer);
    handshakeTimer = null;
    window.removeEventListener("message", onMessage);
  };
}
