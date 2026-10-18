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

/** Retry the handshake until the player loads, for at most 30 seconds. */
const HANDSHAKE_INTERVAL_MS = 500;
const HANDSHAKE_MAX_ATTEMPTS = 60;

export interface YouTubePlayerUpdate {
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
    const update: YouTubePlayerUpdate = {
      currentTime: numberOrUndefined(info.currentTime),
      duration: numberOrUndefined(info.duration),
      playerState: numberOrUndefined(info.playerState),
    };
    return update.currentTime === undefined &&
      update.duration === undefined &&
      update.playerState === undefined
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
  const listenerId = iframe.id || "rss-dashboard-video";
  let connected = false;
  let attempts = 0;
  let handshakeTimer: number | null = null;

  const stopHandshake = (): void => {
    if (handshakeTimer !== null) {
      window.clearInterval(handshakeTimer);
      handshakeTimer = null;
    }
  };

  const sendHandshake = (): void => {
    attempts += 1;
    const message = JSON.stringify({
      event: "listening",
      id: listenerId,
      channel: "widget",
    });
    // A window from another origin silently drops the message, so the host
    // page never receives it.
    for (const target of playerWindows(iframe)) {
      target.postMessage(message, PLAYER_TARGET_ORIGIN);
    }
    if (attempts >= HANDSHAKE_MAX_ATTEMPTS) stopHandshake();
  };

  const onMessage = (event: MessageEvent): void => {
    if (!PLAYER_ORIGINS.has(event.origin)) return;
    if (
      !event.source ||
      !playerWindows(iframe).includes(event.source as Window)
    )
      return;
    if (!connected) {
      connected = true;
      stopHandshake();
    }
    const update = parseYouTubePlayerMessage(event.data);
    if (update) onUpdate(update);
  };

  window.addEventListener("message", onMessage);
  handshakeTimer = window.setInterval(sendHandshake, HANDSHAKE_INTERVAL_MS);

  return () => {
    stopHandshake();
    window.removeEventListener("message", onMessage);
  };
}
