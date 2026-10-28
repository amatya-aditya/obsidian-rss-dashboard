import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Menu } from "obsidian";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import type { FeedItem } from "../../../src/types/types";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";

type PlayerInternals = { audioElement: HTMLAudioElement };

describe("PodcastPlayer sleep timer lifecycle", () => {
  const players: PodcastPlayer[] = [];

  beforeEach(() => {
    installObsidianDomPolyfills();
    // jsdom cannot play media; the shared polyfill supplies the media API.
    installMediaElementPolyfills();
    vi.useFakeTimers();
    document.body.empty();
  });

  afterEach(() => {
    players.splice(0).forEach((player) => player.destroy());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.empty();
  });

  function loadPlayer(options: { sleepTimerBandEnabled?: boolean } = {}) {
    const container = document.body.createDiv();
    const player = new PodcastPlayer(
      container,
      new App(),
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      1,
      false,
      undefined,
      true,
      options.sleepTimerBandEnabled ?? true,
    );
    players.push(player);
    const episode: FeedItem = {
      title: "Cleanup episode",
      link: "https://example.com/episode",
      description: "Episode description",
      pubDate: "2026-10-01T00:00:00Z",
      guid: "cleanup-episode",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Cleanup feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
      mediaType: "podcast",
      audioUrl: "https://example.com/episode.mp3",
    };
    player.loadEpisode(episode, [episode]);
    const button = container.querySelector<HTMLElement>(
      ".rss-sleep-timer-btn",
    )!;
    const audio = container.querySelector<HTMLAudioElement>("audio")!;
    const selectTimer = (title: string) => {
      button.click();
      const item = Menu.lastItems.find((entry) => entry.title === title);
      expect(item).toBeDefined();
      item!.trigger();
    };
    const band = () =>
      container.querySelector<HTMLElement>(".podcast-sleep-band");
    return { container, player, button, audio, selectTimer, band };
  }

  function withDuration(audio: HTMLAudioElement, duration: number): void {
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: duration,
    });
    audio.dispatchEvent(new Event("loadedmetadata"));
  }

  function bandPositions(element: HTMLElement | null): {
    start: string;
    end: string;
  } {
    expect(element).not.toBeNull();
    return {
      start: element!.style.getPropertyValue("--sleep-band-start"),
      end: element!.style.getPropertyValue("--sleep-band-end"),
    };
  }

  it("cancels the active interval when destroyed, including repeated destruction", () => {
    const { player, button, selectTimer } = loadPlayer();
    selectTimer("120 minutes");
    expect(vi.getTimerCount()).toBe(1);

    player.destroy();
    player.destroy();

    expect(vi.getTimerCount()).toBe(0);
    expect(button.getAttribute("aria-label")).toBe("Sleep timer");
    expect(button.classList.contains("is-active")).toBe(false);
  });

  it("leaves no intervals after three create, set timer, and destroy cycles", () => {
    for (let count = 0; count < 3; count++) {
      const { container, player, selectTimer } = loadPlayer();
      selectTimer("120 minutes");
      player.destroy();
      container.remove();
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not update detached countdown controls after destruction", () => {
    const { container, player, button, selectTimer } = loadPlayer();
    selectTimer("5 minutes");
    expect(button.getAttribute("aria-label")).toBe("Sleep timer: 5:00");
    player.destroy();
    container.remove();
    const labelAfterDestroy = button.getAttribute("aria-label");
    const textAfterDestroy = button.textContent;

    vi.advanceTimersByTime(1000);

    expect(button.isConnected).toBe(false);
    expect(button.getAttribute("aria-label")).toBe(labelAfterDestroy);
    expect(button.textContent).toBe(textAfterDestroy);
  });

  it("still cancels the interval when Off is selected", () => {
    const { button, selectTimer } = loadPlayer();
    selectTimer("120 minutes");
    expect(vi.getTimerCount()).toBe(1);
    selectTimer("Off");
    expect(vi.getTimerCount()).toBe(0);
    expect(button.getAttribute("aria-label")).toBe("Sleep timer");
  });

  it("replaces an active duration with one interval and the new deadline", () => {
    const { button, audio, selectTimer } = loadPlayer();
    const pause = vi.spyOn(audio, "pause");
    selectTimer("5 minutes");
    vi.advanceTimersByTime(1000);
    selectTimer("10 minutes");
    expect(vi.getTimerCount()).toBe(1);
    expect(button.getAttribute("aria-label")).toBe("Sleep timer: 10:00");
    vi.advanceTimersByTime(299000);
    expect(pause).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-label")).toBe("Sleep timer: 5:01");
  });

  it("still pauses playback and clears itself at expiry", () => {
    const { button, audio, selectTimer } = loadPlayer();
    const pause = vi.spyOn(audio, "pause");
    selectTimer("5 minutes");
    vi.advanceTimersByTime(299000);
    expect(pause).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-label")).toBe("Sleep timer: 0:01");
    vi.advanceTimersByTime(1000);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(button.getAttribute("aria-label")).toBe("Sleep timer");
  });

  it("still stops at the episode end without scheduling an interval", () => {
    const { button, audio, selectTimer } = loadPlayer();
    const pause = vi.spyOn(audio, "pause");
    selectTimer("End of episode");
    expect(vi.getTimerCount()).toBe(0);

    audio.dispatchEvent(new Event("ended"));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(button.getAttribute("aria-label")).toBe("Sleep timer");
  });

  it("keeps End of episode interval-free and clears that mode on destruction", () => {
    const { player, button, selectTimer } = loadPlayer();
    selectTimer("End of episode");
    expect(vi.getTimerCount()).toBe(0);
    expect(button.getAttribute("aria-label")).toBe(
      "Sleep timer: end of episode",
    );
    button.click();
    expect(
      Menu.lastItems.find((item) => item.title === "End of episode")?.checked,
    ).toBe(true);

    player.destroy();

    expect(vi.getTimerCount()).toBe(0);
    expect(button.getAttribute("aria-label")).toBe("Sleep timer");
    button.click();
    expect(Menu.lastItems.find((item) => item.title === "Off")?.checked).toBe(
      true,
    );
  });

  describe("sleep timer band", () => {
    function startPlaying(audio: HTMLAudioElement): void {
      audio.dispatchEvent(new Event("play"));
    }

    function setDurationAndPlay(
      audio: HTMLAudioElement,
      duration = 1000,
    ): void {
      withDuration(audio, duration);
      startPlaying(audio);
    }

    it("draws from the playhead to the projected expiry", () => {
      const { audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 100;

      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("timeupdate"));

      expect(band()?.hidden).toBe(false);
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });
    });

    it("shows the band as soon as a timer is active", () => {
      const { audio, selectTimer, band } = loadPlayer();
      withDuration(audio, 1000);
      audio.currentTime = 100;

      selectTimer("5 minutes");

      expect(band()?.hidden).toBe(false);
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });
    });

    it("recomputes a speed change immediately, including while paused", () => {
      const { container, audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 100;
      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("timeupdate"));
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });

      const speed =
        container.querySelector<HTMLSelectElement>(".rss-speed-control")!;
      speed.value = "2";
      speed.dispatchEvent(new Event("change"));

      expect(bandPositions(band())).toEqual({ start: "10%", end: "70%" });

      audio.dispatchEvent(new Event("pause"));
      speed.value = "1";
      speed.dispatchEvent(new Event("change"));

      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });
    });

    it("freezes the band while paused and redraws from the remaining time on play", () => {
      const { audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 100;
      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("timeupdate"));
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });

      audio.dispatchEvent(new Event("pause"));
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });

      vi.advanceTimersByTime(60000);
      // A progress update while paused must not move the frozen band.
      audio.dispatchEvent(new Event("timeupdate"));
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });

      startPlaying(audio);
      expect(bandPositions(band())).toEqual({ start: "10%", end: "34%" });
    });

    it("moves the band's start when seeking while paused", () => {
      const { audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 100;
      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("timeupdate"));
      audio.dispatchEvent(new Event("pause"));
      vi.advanceTimersByTime(60000);

      audio.currentTime = 500;
      audio.dispatchEvent(new Event("seeked"));

      expect(bandPositions(band())).toEqual({ start: "50%", end: "74%" });
    });

    it("clamps a projection past the episode end to the end of the bar", () => {
      const { audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 900;

      selectTimer("120 minutes");
      audio.dispatchEvent(new Event("timeupdate"));

      expect(bandPositions(band())).toEqual({ start: "90%", end: "100%" });
    });

    it("runs to the end with no text in End of episode mode", () => {
      const { audio, button, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 250;

      selectTimer("End of episode");

      expect(button.textContent).toBe("End of ep");
      expect(bandPositions(band())).toEqual({ start: "25%", end: "100%" });
      expect(band()?.textContent).toBe("");
      expect(band()?.getAttribute("aria-hidden")).toBe("true");
    });

    it("shows no band when the timer is off, cleared, expired, or stopped at the end", () => {
      const off = loadPlayer();
      setDurationAndPlay(off.audio);
      off.audio.dispatchEvent(new Event("timeupdate"));
      expect(off.band()?.hidden).toBe(true);

      const cleared = loadPlayer();
      withDuration(cleared.audio, 1000);
      cleared.selectTimer("5 minutes");
      expect(cleared.band()?.hidden).toBe(false);
      cleared.selectTimer("Off");
      expect(cleared.band()?.hidden).toBe(true);

      const expired = loadPlayer();
      setDurationAndPlay(expired.audio);
      expired.selectTimer("5 minutes");
      vi.advanceTimersByTime(300000);
      expect(expired.band()?.hidden).toBe(true);

      const stopped = loadPlayer();
      setDurationAndPlay(stopped.audio);
      stopped.selectTimer("End of episode");
      expect(stopped.band()?.hidden).toBe(false);
      stopped.audio.dispatchEvent(new Event("ended"));
      expect(stopped.band()?.hidden).toBe(true);
    });

    it("shows no band when the duration is unknown or non-finite", () => {
      const unknown = loadPlayer();
      unknown.selectTimer("5 minutes");
      expect(unknown.band()?.hidden).toBe(true);

      const infinite = loadPlayer();
      withDuration(infinite.audio, 1000);
      infinite.selectTimer("5 minutes");
      expect(infinite.band()?.hidden).toBe(false);
      Object.defineProperty(infinite.audio, "duration", {
        configurable: true,
        value: Number.POSITIVE_INFINITY,
      });
      infinite.audio.dispatchEvent(new Event("loadedmetadata"));
      expect(infinite.band()?.hidden).toBe(true);
    });

    it("recomputes against the new duration when another episode loads", () => {
      const { player, audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 100;
      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("timeupdate"));
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });

      const next: FeedItem = {
        title: "Next episode",
        link: "https://example.com/next",
        description: "Next description",
        pubDate: "2026-10-02T00:00:00Z",
        guid: "next-episode",
        read: false,
        starred: false,
        tags: [],
        feedTitle: "Cleanup feed",
        feedUrl: "https://example.com/feed",
        coverImage: "",
        mediaType: "podcast",
        audioUrl: "https://example.com/next.mp3",
      };
      player.loadEpisode(next, [next]);
      const nextAudio = (player as unknown as PlayerInternals).audioElement;
      withDuration(nextAudio, 2000);

      expect(band()?.hidden).toBe(false);
      expect(bandPositions(band())).toEqual({ start: "0%", end: "15%" });
    });

    it("hides the band when a timed timer keeps running past the episode end", () => {
      const { audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 500;
      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("timeupdate"));
      expect(band()?.hidden).toBe(false);

      audio.currentTime = 1000;
      audio.dispatchEvent(new Event("ended"));

      expect(band()?.hidden).toBe(true);
      expect(vi.getTimerCount()).toBe(1);
    });

    it("is hidden after the player is destroyed", () => {
      const { player, audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      selectTimer("5 minutes");
      expect(band()?.hidden).toBe(false);

      player.destroy();

      expect(band()?.hidden).toBe(true);
    });

    it("stays out of the accessibility tree and pointer path", () => {
      const { container, audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 100;
      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("timeupdate"));

      expect(band()?.getAttribute("aria-hidden")).toBe("true");
      expect(band()?.hasAttribute("tabindex")).toBe(false);
      expect(band()?.tabIndex).toBe(-1);

      const bar = container.querySelector<HTMLElement>(
        ".podcast-progress-bar",
      )!;
      vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 200,
        bottom: 12,
        width: 200,
        height: 12,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      bar.dispatchEvent(new MouseEvent("click", { clientX: 100 }));
      expect(audio.currentTime).toBe(500);

      bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 20 }));
      activeWindow.dispatchEvent(new MouseEvent("mousemove", { clientX: 150 }));
      expect(audio.currentTime).toBe(750);
    });

    it("stays hidden while the setting is off and leaves the timer running", () => {
      const { button, audio, selectTimer, band } = loadPlayer({
        sleepTimerBandEnabled: false,
      });
      setDurationAndPlay(audio);
      audio.currentTime = 100;

      selectTimer("5 minutes");

      expect(band()?.hidden).toBe(true);
      expect(button.classList.contains("is-active")).toBe(true);
      audio.dispatchEvent(new Event("timeupdate"));
      expect(band()?.hidden).toBe(true);
    });

    it("applies a live setting change to the open player", () => {
      const { player, audio, selectTimer, band } = loadPlayer();
      setDurationAndPlay(audio);
      audio.currentTime = 100;
      selectTimer("5 minutes");
      audio.dispatchEvent(new Event("pause"));
      expect(band()?.hidden).toBe(false);

      player.setSleepTimerBandEnabled(false);
      expect(band()?.hidden).toBe(true);
      audio.dispatchEvent(new Event("seeked"));
      expect(band()?.hidden).toBe(true);

      player.setSleepTimerBandEnabled(true);
      expect(band()?.hidden).toBe(false);
      expect(bandPositions(band())).toEqual({ start: "10%", end: "40%" });
    });
  });
});
