// Characterization (#1094): pins PodcastPlayer.loadEpisode, the episode
// details section and the render() controls before those functions are split
// to get under the complexity and line limits. Read-only during the
// extraction.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

type PlayerInternals = { audioElement: HTMLAudioElement };

describe("PodcastPlayer characterization", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function baseEpisode(overrides: Partial<FeedItem> = {}): FeedItem {
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
      ...overrides,
    };
  }

  function mount(
    options: {
      progressTrackingEnabled?: boolean;
      onEpisodeSelected?: ConstructorParameters<typeof PodcastPlayer>[3];
    } = {},
  ): { container: HTMLElement; player: PodcastPlayer } {
    const container: HTMLDivElement = createDiv();
    document.body.appendChild(container);
    const player = new PodcastPlayer(
      container,
      new App(),
      "obsidian",
      undefined,
      options.onEpisodeSelected as never,
      undefined,
      options.progressTrackingEnabled ?? true,
    );
    return { container, player };
  }

  function audioOf(player: PodcastPlayer): HTMLAudioElement {
    return (player as unknown as PlayerInternals).audioElement;
  }

  function metaRows(container: HTMLElement): Map<string, string> {
    const rows = new Map<string, string>();
    const labels = container.querySelectorAll(".podcast-episode-meta-label");
    const values = container.querySelectorAll(".podcast-episode-meta-value");
    labels.forEach((label, i) =>
      rows.set(label.textContent ?? "", values[i]?.textContent ?? ""),
    );
    return rows;
  }

  describe("loadEpisode audio resolution", () => {
    it("prefers item.audioUrl over the enclosure url", () => {
      const { player } = mount();
      const item = baseEpisode({
        audioUrl: "https://example.com/a.mp3",
        enclosure: { url: "https://example.com/b.mp3", type: "audio/mpeg" },
      } as Partial<FeedItem>);
      player.loadEpisode(item, [item]);
      expect(item.audioUrl).toBe("https://example.com/a.mp3");
      expect(audioOf(player).src).toBe("https://example.com/a.mp3");
    });

    it("falls back to the enclosure url and stores it on the item", () => {
      const { player } = mount();
      const item = baseEpisode({
        audioUrl: undefined,
        enclosure: { url: "https://example.com/b.mp3", type: "audio/mpeg" },
      } as Partial<FeedItem>);
      player.loadEpisode(item, [item]);
      expect(item.audioUrl).toBe("https://example.com/b.mp3");
      expect(audioOf(player).src).toBe("https://example.com/b.mp3");
    });

    it("falls back to audio extracted from the description", () => {
      const { player } = mount();
      const item = baseEpisode({
        audioUrl: undefined,
        description: '<audio src="https://example.com/c.mp3"></audio>',
      });
      player.loadEpisode(item, [item]);
      expect(item.audioUrl).toBe("https://example.com/c.mp3");
    });

    it("disables play and shows the error when no audio is found", () => {
      const { container, player } = mount();
      const item = baseEpisode({ audioUrl: undefined });
      player.loadEpisode(item, [item]);
      expect(
        container
          .querySelector(".rss-play-pause")
          ?.classList.contains("is-disabled"),
      ).toBe(true);
      expect(
        container.querySelector(".podcast-player-error")?.textContent,
      ).toBe("Audio url not found. Cannot play this podcast.");
    });

    it("clears the source of an existing audio element when the next episode has no audio", () => {
      const { player } = mount();
      const first = baseEpisode();
      const second = baseEpisode({
        guid: "guid-2",
        title: "Ep 2",
        audioUrl: undefined,
      });
      player.loadEpisode(first, [first, second]);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      player.loadEpisode(second);
      // render() recreates the element, so only the new element is observable.
      expect(audioOf(player).getAttribute("src")).toBe("");
      expect(pause).toHaveBeenCalled();
    });
  });

  describe("loadEpisode callbacks and playlist", () => {
    it("notifies onEpisodeSelected only when notify is set", () => {
      const onEpisodeSelected = vi.fn();
      const { player } = mount({ onEpisodeSelected });
      const item = baseEpisode();
      player.loadEpisode(item, [item]);
      expect(onEpisodeSelected).not.toHaveBeenCalled();
      player.loadEpisode(item, undefined, { notify: true, source: "nav" });
      expect(onEpisodeSelected).toHaveBeenCalledWith(item, "nav");
    });

    it("defaults the notify source to external", () => {
      const onEpisodeSelected = vi.fn();
      const { player } = mount({ onEpisodeSelected });
      const item = baseEpisode();
      player.loadEpisode(item, [item], { notify: true });
      expect(onEpisodeSelected).toHaveBeenCalledWith(item, "external");
    });

    it("replaces the playlist when fullFeedEpisodes is passed", () => {
      const { container, player } = mount();
      const a = baseEpisode();
      const b = baseEpisode({ guid: "guid-b", title: "Ep B" });
      const c = baseEpisode({ guid: "guid-c", title: "Ep C" });
      const rows = () =>
        container.querySelectorAll(".episode-list-row[data-episode-guid]");
      player.loadEpisode(a, [a, b, c]);
      expect(rows().length).toBe(3);
      player.loadEpisode(a, [a, b]);
      expect(rows().length).toBe(2);
    });
  });

  describe("loadEpisode progress and autoplay", () => {
    it("restores saved progress from item.playbackProgress", () => {
      const { player } = mount();
      const item = baseEpisode({
        playbackProgress: { position: 42, duration: 100 },
      } as Partial<FeedItem>);
      player.loadEpisode(item, [item]);
      expect(audioOf(player).currentTime).toBe(42);
    });

    it("restores progress from the playlist map when the item has none", () => {
      const { player } = mount();
      const saved = baseEpisode({
        playbackProgress: { position: 17, duration: 100 },
      } as Partial<FeedItem>);
      const fresh = baseEpisode({ guid: "guid-fresh" });
      player.setPlaylist([saved]);
      player.loadEpisode(fresh);
      expect(audioOf(player).currentTime).toBe(0);
      player.loadEpisode(saved, [saved]);
      expect(audioOf(player).currentTime).toBe(17);
    });

    it("ignores saved progress when tracking is disabled", () => {
      const { player } = mount({ progressTrackingEnabled: false });
      const item = baseEpisode({
        playbackProgress: { position: 42, duration: 100 },
      } as Partial<FeedItem>);
      player.loadEpisode(item, [item]);
      expect(audioOf(player).currentTime).toBe(0);
    });

    it("starts playback and flips the icon when autoplay is set", () => {
      const { player } = mount();
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      const item = baseEpisode();
      player.loadEpisode(item, [item], { autoplay: true });
      expect(play).toHaveBeenCalledTimes(1);
    });

    it("logs and resets the icon when autoplay is rejected", async () => {
      const { player } = mount();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
        new Error("blocked"),
      );
      const item = baseEpisode();
      player.loadEpisode(item, [item], { autoplay: true });
      await Promise.resolve();
      await Promise.resolve();
      expect(error).toHaveBeenCalledWith(
        "Failed to play audio:",
        expect.any(Error),
      );
    });

    it("does not play without the autoplay option", () => {
      const { player } = mount();
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      const item = baseEpisode();
      player.loadEpisode(item, [item]);
      expect(play).not.toHaveBeenCalled();
    });
  });

  describe("episode details", () => {
    it("renders no details element when there are no notes or metadata", () => {
      const { container, player } = mount();
      const item = baseEpisode({ pubDate: "", link: "" });
      player.loadEpisode(item, [item]);
      expect(container.querySelector("details")).toBeNull();
    });

    it("formats the published date and keeps an unparseable date as-is", () => {
      const { container, player } = mount();
      const good = baseEpisode({ pubDate: "2026-03-01T12:34:56.000Z" });
      player.loadEpisode(good, [good]);
      expect(metaRows(container).get("Published")).toBe(
        new Date("2026-03-01T12:34:56.000Z").toLocaleString(),
      );
      const bad = baseEpisode({ pubDate: "not a date" });
      player.loadEpisode(bad, [bad]);
      expect(metaRows(container).get("Published")).toBe("not a date");
    });

    it("falls back to the itunes duration and trims it", () => {
      const { container, player } = mount();
      const item = baseEpisode({
        itunes: { duration: " 12:34 " },
      } as Partial<FeedItem>);
      player.loadEpisode(item, [item]);
      expect(metaRows(container).get("Duration")).toBe("12:34");
    });

    it("renders explicit, season, episode, type and category rows", () => {
      const { container, player } = mount();
      const item = baseEpisode({
        explicit: false,
        season: 2,
        episode: 0,
        episodeType: " bonus ",
        category: " Tech ",
      } as Partial<FeedItem>);
      player.loadEpisode(item, [item]);
      const rows = metaRows(container);
      expect(rows.get("Explicit")).toBe("No");
      expect(rows.get("Season")).toBe("2");
      expect(rows.get("Episode")).toBe("0");
      expect(rows.get("Type")).toBe("bonus");
      expect(rows.get("Category")).toBe("Tech");
    });

    it("renders the link row as a safe external anchor", () => {
      const { container, player } = mount();
      const item = baseEpisode({ link: " https://example.com/ep " });
      player.loadEpisode(item, [item]);
      const anchor = container.querySelector<HTMLAnchorElement>(
        ".podcast-episode-meta-value a",
      );
      expect(anchor?.getAttribute("href")).toBe("https://example.com/ep");
      expect(anchor?.textContent).toBe("Open episode");
      expect(anchor?.target).toBe("_blank");
      expect(anchor?.rel).toBe("noopener noreferrer");
    });

    it("formats the enclosure size and keeps a non-numeric length", () => {
      const { container, player } = mount();
      const sized = baseEpisode({
        enclosure: {
          url: "https://example.com/a.mp3",
          type: "audio/mpeg",
          length: "1536",
        },
      } as Partial<FeedItem>);
      player.loadEpisode(sized, [sized]);
      expect(metaRows(container).get("Size")).toBe("1.5 KB");
      const odd = baseEpisode({
        enclosure: {
          url: "https://example.com/a.mp3",
          type: "audio/mpeg",
          length: "huge",
        },
      } as Partial<FeedItem>);
      player.loadEpisode(odd, [odd]);
      expect(metaRows(container).get("Size")).toBe("huge");
    });

    it("falls back from description to the itunes summary then summary for notes", () => {
      const { container, player } = mount();
      const itunes = baseEpisode({
        itunes: { summary: "<p>itunes notes</p>" },
        summary: "plain summary",
      } as Partial<FeedItem>);
      player.loadEpisode(itunes, [itunes]);
      expect(
        container.querySelector(".podcast-episode-notes-body")?.textContent,
      ).toBe("itunes notes");
      const summary = baseEpisode({ summary: "plain summary" });
      player.loadEpisode(summary, [summary]);
      expect(
        container.querySelector(".podcast-episode-notes-body")?.textContent,
      ).toBe("plain summary");
    });

    it("keeps the description when content is short", () => {
      const { container, player } = mount();
      const item = baseEpisode({
        description: "<p>the description</p>",
        content: "<p>short</p>",
      });
      player.loadEpisode(item, [item]);
      expect(
        container.querySelector(".podcast-episode-notes-body")?.textContent,
      ).toBe("the description");
    });
  });

  describe("transport controls", () => {
    function loaded(): { container: HTMLElement; audio: HTMLAudioElement } {
      const { container, player } = mount();
      const item = baseEpisode();
      player.loadEpisode(item, [item]);
      return { container, audio: audioOf(player) };
    }

    function press(el: Element, key: string): void {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }

    it("rewinds 30s on click without going below zero", () => {
      const { container, audio } = loaded();
      const rewind = container.querySelector<HTMLElement>(".rss-rewind")!;
      audio.currentTime = 100;
      rewind.click();
      expect(audio.currentTime).toBe(70);
      audio.currentTime = 10;
      rewind.click();
      expect(audio.currentTime).toBe(0);
    });

    it.each(["Enter", " "])("rewinds 30s on %j", (key) => {
      const { container, audio } = loaded();
      audio.currentTime = 100;
      press(container.querySelector(".rss-rewind")!, key);
      expect(audio.currentTime).toBe(70);
    });

    it("ignores other keys on rewind", () => {
      const { container, audio } = loaded();
      audio.currentTime = 100;
      press(container.querySelector(".rss-rewind")!, "a");
      expect(audio.currentTime).toBe(100);
    });

    it("forwards 30s on click and on Enter", () => {
      const { container, audio } = loaded();
      const forward = container.querySelector<HTMLElement>(".rss-forward")!;
      audio.currentTime = 5;
      forward.click();
      expect(audio.currentTime).toBe(35);
      press(forward, "Enter");
      expect(audio.currentTime).toBe(65);
    });

    it("toggles repeat and shuffle from the keyboard", () => {
      const { container } = loaded();
      const repeat = container.querySelector<HTMLElement>(".rss-repeat-btn")!;
      const shuffle = container.querySelector<HTMLElement>(".rss-shuffle-btn")!;
      const repeatBefore = repeat.className;
      const shuffleBefore = shuffle.className;
      press(repeat, "Enter");
      press(shuffle, " ");
      expect(repeat.className).not.toBe(repeatBefore);
      expect(shuffle.className).not.toBe(shuffleBefore);
    });

    it("does not toggle playback while the play button is disabled", () => {
      const { container, player } = mount();
      const item = baseEpisode({ audioUrl: undefined });
      player.loadEpisode(item, [item]);
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      container.querySelector<HTMLElement>(".rss-play-pause")!.click();
      press(container.querySelector(".rss-play-pause")!, "Enter");
      expect(play).not.toHaveBeenCalled();
    });
  });

  describe("tools and progress", () => {
    function loaded(): { container: HTMLElement; audio: HTMLAudioElement } {
      const { container, player } = mount();
      const item = baseEpisode();
      player.loadEpisode(item, [item]);
      return { container, audio: audioOf(player) };
    }

    it("lists the speed options and applies a change to the audio element", () => {
      const { container, audio } = loaded();
      const select =
        container.querySelector<HTMLSelectElement>(".rss-speed-control")!;
      expect([...select.options].map((o) => o.value)).toEqual([
        "0.75",
        "1",
        "1.25",
        "1.5",
        "1.75",
        "2",
        "2.5",
        "3",
      ]);
      select.value = "2";
      select.dispatchEvent(new Event("change"));
      expect(audio.playbackRate).toBe(2);
    });

    it("mutes on the volume button and restores the previous volume", () => {
      const { container, audio } = loaded();
      const button = container.querySelector<HTMLElement>(".rss-volume")!;
      const bar = container.querySelector<HTMLInputElement>(".rss-volume-bar")!;
      expect(bar.value).toBe("100");
      button.click();
      expect(audio.muted).toBe(true);
      expect(button.classList.contains("is-muted")).toBe(true);
      expect(bar.value).toBe("0");
      button.click();
      expect(audio.muted).toBe(false);
      expect(button.classList.contains("is-muted")).toBe(false);
      expect(bar.value).toBe("100");
    });

    it("toggles mute from the keyboard on Enter and space only", () => {
      const { container, audio } = loaded();
      const button = container.querySelector<HTMLElement>(".rss-volume")!;
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
      expect(audio.muted).toBe(false);
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(audio.muted).toBe(true);
    });

    it("follows the volume slider and unmutes when it is above zero", () => {
      const { container, audio } = loaded();
      const bar = container.querySelector<HTMLInputElement>(".rss-volume-bar")!;
      audio.muted = true;
      bar.value = "30";
      bar.dispatchEvent(new Event("input"));
      expect(audio.volume).toBeCloseTo(0.3);
      expect(audio.muted).toBe(false);
    });

    it("starts the clock labels at 0:00 and -0:00", () => {
      const { container } = loaded();
      expect(container.querySelector(".rss-current-time")?.textContent).toBe(
        "0:00",
      );
      expect(container.querySelector(".rss-duration")?.textContent).toBe(
        "-0:00",
      );
    });

    it("ignores clicks on the progress bar while the duration is unknown", () => {
      const { container, audio } = loaded();
      audio.currentTime = 12;
      container
        .querySelector<HTMLElement>(".podcast-progress-bar")!
        .dispatchEvent(new MouseEvent("click", { clientX: 50 }));
      expect(audio.currentTime).toBe(12);
    });
  });
});
