import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Menu } from "obsidian";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import type { FeedItem } from "../../../src/types/types";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";

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

  function loadPlayer() {
    const container = document.body.createDiv();
    const player = new PodcastPlayer(container, new App());
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
    return { container, player, button, audio, selectTimer };
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
});
