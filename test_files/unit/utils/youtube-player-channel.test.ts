import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectYouTubePlayerChannel,
  parseYouTubePlayerMessage,
} from "../../../src/utils/youtube-player-channel";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const NOCOOKIE = "https://www.youtube-nocookie.com";

interface FakeWindow {
  postMessage: ReturnType<typeof vi.fn>;
  frames: { length: number; [index: number]: FakeWindow };
}

function fakeWindow(nested?: FakeWindow): FakeWindow {
  const frames: FakeWindow["frames"] = { length: nested ? 1 : 0 };
  if (nested) frames[0] = nested;
  return { postMessage: vi.fn(), frames };
}

// The embed host nests the player one frame down. jsdom loads no frames, so
// the iframe's window is replaced with a host window holding a player window.
function hostIframe(): {
  iframe: HTMLIFrameElement;
  host: FakeWindow;
  player: FakeWindow;
} {
  const player = fakeWindow();
  const host = fakeWindow(player);
  const iframe = document.body.createEl("iframe");
  iframe.id = "yt-player-test";
  Object.defineProperty(iframe, "contentWindow", { value: host });
  return { iframe, host, player };
}

// A real MessageEvent only accepts a real window as its source.
function postMessageFrom(source: unknown, data: unknown, origin = NOCOOKIE) {
  const event = new Event("message");
  Object.defineProperties(event, {
    source: { value: source },
    origin: { value: origin },
    data: { value: typeof data === "string" ? data : JSON.stringify(data) },
  });
  window.dispatchEvent(event);
}

describe("connectYouTubePlayerChannel", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.empty();
  });

  it("sends the listening handshake to the player nested in the embed host", () => {
    const { iframe, player } = hostIframe();
    const dispose = connectYouTubePlayerChannel(iframe, vi.fn());

    vi.advanceTimersByTime(500);

    expect(player.postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        event: "listening",
        id: "yt-player-test",
        channel: "widget",
      }),
      NOCOOKIE,
    );
    dispose();
  });

  it("slows the handshake once the player answers, so a reloaded player is found again", () => {
    const { iframe, player } = hostIframe();
    const dispose = connectYouTubePlayerChannel(iframe, vi.fn());

    vi.advanceTimersByTime(500);
    postMessageFrom(player, { event: "onReady", info: null });
    const calls = player.postMessage.mock.calls.length;
    vi.advanceTimersByTime(4999);
    expect(player.postMessage).toHaveBeenCalledTimes(calls);

    vi.advanceTimersByTime(1);
    expect(player.postMessage).toHaveBeenCalledTimes(calls + 1);
    dispose();
  });

  it("keeps offering the handshake to a player that loads after 30 seconds", () => {
    const player = fakeWindow();
    const host = fakeWindow();
    const iframe = document.body.createEl("iframe");
    Object.defineProperty(iframe, "contentWindow", { value: host });
    const onUpdate = vi.fn();
    const dispose = connectYouTubePlayerChannel(iframe, onUpdate);

    // The host shows its click-to-play cover; the player appears a minute in.
    vi.advanceTimersByTime(60000);
    host.frames.length = 1;
    host.frames[0] = player;
    vi.advanceTimersByTime(5000);
    expect(player.postMessage).toHaveBeenCalledTimes(1);

    postMessageFrom(player, {
      event: "infoDelivery",
      info: { currentTime: 9 },
    });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ currentTime: 9 }),
    );
    dispose();
  });

  // Re-navigating the player iframe replaces the nested frame with a new window;
  // an answer from the first one must not pin the channel to a dead window.
  it("reconnects to a replacement player window after the host reloads", () => {
    const { iframe, host, player } = hostIframe();
    const onUpdate = vi.fn();
    const dispose = connectYouTubePlayerChannel(iframe, onUpdate);
    postMessageFrom(player, { event: "onReady", info: null });

    const replacement = fakeWindow();
    host.frames[0] = replacement;
    vi.advanceTimersByTime(5000);
    expect(replacement.postMessage).toHaveBeenCalledTimes(1);

    postMessageFrom(replacement, {
      event: "infoDelivery",
      info: { currentTime: 9 },
    });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ currentTime: 9 }),
    );

    onUpdate.mockClear();
    postMessageFrom(player, {
      event: "infoDelivery",
      info: { currentTime: 3 },
    });
    expect(onUpdate).not.toHaveBeenCalled();
    dispose();
  });

  // A window can close between two handshake ticks; the timer must not throw an
  // uncaught error every few seconds from then on.
  it("keeps handshaking when a player window throws on postMessage", () => {
    const { iframe, player } = hostIframe();
    player.postMessage.mockImplementation(() => {
      throw new TypeError("window closed");
    });
    const dispose = connectYouTubePlayerChannel(iframe, vi.fn());

    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(player.postMessage).toHaveBeenCalledTimes(4);
    dispose();
  });

  it("keeps listening when the update handler throws", () => {
    const { iframe, player } = hostIframe();
    const onUpdate = vi.fn(() => {
      throw new Error("save failed");
    });
    const dispose = connectYouTubePlayerChannel(iframe, onUpdate);
    const update = { event: "infoDelivery", info: { currentTime: 5 } };

    expect(() => postMessageFrom(player, update)).not.toThrow();
    postMessageFrom(player, update);

    expect(onUpdate).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("reports the player's exact position, duration, and state", () => {
    const { iframe, player } = hostIframe();
    const onUpdate = vi.fn();
    const dispose = connectYouTubePlayerChannel(iframe, onUpdate);

    postMessageFrom(player, {
      event: "infoDelivery",
      info: { currentTime: 137.857006, duration: 213.061, playerState: 2 },
    });

    expect(onUpdate).toHaveBeenCalledWith({
      currentTime: 137.857006,
      duration: 213.061,
      playerState: 2,
    });
    dispose();
  });

  it("ignores another frame, a non-YouTube origin, and unreadable data", () => {
    const { iframe, player } = hostIframe();
    const onUpdate = vi.fn();
    const dispose = connectYouTubePlayerChannel(iframe, onUpdate);
    const update = { event: "infoDelivery", info: { currentTime: 5 } };

    postMessageFrom(fakeWindow(), update);
    postMessageFrom(player, update, "https://releases.obsidian.md");
    postMessageFrom(player, "{not json");

    expect(onUpdate).not.toHaveBeenCalled();
    dispose();
  });

  it("stops listening and sending once disposed", () => {
    const { iframe, player } = hostIframe();
    const onUpdate = vi.fn();
    const dispose = connectYouTubePlayerChannel(iframe, onUpdate);

    dispose();
    vi.advanceTimersByTime(5000);
    postMessageFrom(player, {
      event: "infoDelivery",
      info: { currentTime: 5 },
    });

    expect(player.postMessage).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("parseYouTubePlayerMessage", () => {
  it("reads a state change", () => {
    expect(
      parseYouTubePlayerMessage(
        JSON.stringify({ event: "onStateChange", info: 1 }),
      ),
    ).toEqual({ playerState: 1 });
  });

  it("reads the video the player is on", () => {
    expect(
      parseYouTubePlayerMessage(
        JSON.stringify({
          event: "infoDelivery",
          info: { videoData: { video_id: "jNQXAC9IVRw" }, currentTime: 0 },
        }),
      ),
    ).toEqual(
      expect.objectContaining({ videoId: "jNQXAC9IVRw", currentTime: 0 }),
    );
  });

  it("returns null for an event with nothing to track", () => {
    expect(
      parseYouTubePlayerMessage(
        JSON.stringify({ event: "infoDelivery", info: { volume: 100 } }),
      ),
    ).toBeNull();
    expect(
      parseYouTubePlayerMessage(JSON.stringify({ event: "initialDelivery" })),
    ).toBeNull();
  });
});
