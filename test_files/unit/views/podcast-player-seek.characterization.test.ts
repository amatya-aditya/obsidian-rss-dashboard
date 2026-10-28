/**
 * Characterization (#1374, TEST-003): pins the seek bar's click-to-seek and
 * drag-to-seek behavior, mouse and touch, before the progress wrapper gains
 * chapter markers. This test is written against untouched code and stays
 * unchanged during the change (AC-010).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

type PlayerInternals = { audioElement: HTMLAudioElement };

describe("PodcastPlayer seek bar characterization", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function baseEpisode(): FeedItem {
    return {
      title: "Ep 1",
      link: "",
      description: "",
      pubDate: "",
      guid: "guid-ep1",
      read: false,
      starred: false,
      tags: [] as Tag[],
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed.xml",
      coverImage: "",
      mediaType: "podcast" as const,
      audioUrl: "https://example.com/ep1.mp3",
    };
  }

  function loaded(): {
    container: HTMLElement;
    audio: HTMLAudioElement;
    bar: HTMLElement;
  } {
    const container: HTMLDivElement = createDiv();
    document.body.appendChild(container);
    const player = new PodcastPlayer(container, new App(), "obsidian");
    const item = baseEpisode();
    player.loadEpisode(item, [item]);
    const audio = (player as unknown as PlayerInternals).audioElement;
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: 200,
    });
    const bar = container.querySelector<HTMLElement>(".podcast-progress-bar")!;
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
    return { container, audio, bar };
  }

  it("seeks to the clicked fraction of the duration", () => {
    const { audio, bar } = loaded();
    bar.dispatchEvent(new MouseEvent("click", { clientX: 50 }));
    expect(audio.currentTime).toBe(50);
  });

  it("clamps a click outside the bar to the nearest end", () => {
    const { audio, bar } = loaded();
    bar.dispatchEvent(new MouseEvent("click", { clientX: -20 }));
    expect(audio.currentTime).toBe(0);
    bar.dispatchEvent(new MouseEvent("click", { clientX: 500 }));
    expect(audio.currentTime).toBe(200);
  });

  it("drags with the mouse and seeks on every move until mouseup", () => {
    const { audio, bar } = loaded();
    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 20 }));
    activeWindow.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));
    expect(audio.currentTime).toBe(100);
    activeWindow.dispatchEvent(new MouseEvent("mousemove", { clientX: 150 }));
    expect(audio.currentTime).toBe(150);
    activeWindow.dispatchEvent(new MouseEvent("mouseup"));
    activeWindow.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
    expect(audio.currentTime).toBe(150);
  });

  it("drags with touch and seeks on every move until touchend", () => {
    const { audio, bar } = loaded();
    const touch = (clientX: number) => ({
      identifier: 1,
      clientX,
      clientY: 0,
      pageX: clientX,
      pageY: 0,
      screenX: clientX,
      screenY: 0,
      target: bar,
    });
    const touchEvent = (type: string, clientX: number | null) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: clientX === null ? [] : [touch(clientX)],
      });
      return event;
    };

    bar.dispatchEvent(touchEvent("touchstart", 20));
    activeWindow.dispatchEvent(touchEvent("touchmove", 100));
    expect(audio.currentTime).toBe(100);
    activeWindow.dispatchEvent(touchEvent("touchmove", 150));
    expect(audio.currentTime).toBe(150);
    activeWindow.dispatchEvent(touchEvent("touchend", null));
    activeWindow.dispatchEvent(touchEvent("touchmove", 10));
    expect(audio.currentTime).toBe(150);
  });

  it("ignores seeking while the duration is unknown", () => {
    const { audio, bar } = loaded();
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: Number.NaN,
    });
    audio.currentTime = 12;
    bar.dispatchEvent(new MouseEvent("click", { clientX: 50 }));
    expect(audio.currentTime).toBe(12);
  });
});
