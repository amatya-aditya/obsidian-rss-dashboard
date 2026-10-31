import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Menu } from "obsidian";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";
import { lucideIconId } from "../test-icon-helpers";
import type { FeedItem, Tag } from "../../../src/types/types";

describe("PodcastPlayer", () => {
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
      link: "https://example.com/ep1",
      description: "<p>desc</p>",
      pubDate: "2026-03-01T12:34:56.000Z",
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

  describe("sleep timer button", () => {
    function loadPlayer(): HTMLElement {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const player = new PodcastPlayer(container, new App(), "obsidian");
      const episode = baseEpisode();
      player.loadEpisode(episode, [episode]);
      return container.querySelector<HTMLElement>(".rss-sleep-timer-btn")!;
    }

    // A native button turns Enter or Space into a click with detail 0 (#1478).
    it("opens the timer menu under the button when a key press activates it", () => {
      const button = loadPlayer();
      const atPosition = vi.spyOn(Menu.prototype, "showAtPosition");
      const atMouse = vi.spyOn(Menu.prototype, "showAtMouseEvent");

      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 0 }),
      );

      expect(atPosition).toHaveBeenCalledTimes(1);
      expect(atMouse).not.toHaveBeenCalled();
    });

    it("opens the timer menu at the pointer when clicked", () => {
      const button = loadPlayer();
      const atMouse = vi.spyOn(Menu.prototype, "showAtMouseEvent");

      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );

      expect(atMouse).toHaveBeenCalledTimes(1);
    });

    it("checks the active timer option and leaves the rest unchecked", () => {
      const button = loadPlayer();
      button.click();

      const byTitle = (title: string) =>
        Menu.lastItems.find((item) => item.title === title);
      expect(byTitle("Off")?.checked).toBe(true);
      expect(byTitle("5 minutes")?.checked).toBeNull();
    });

    it("checks End of episode once it is selected", () => {
      const button = loadPlayer();
      button.click();
      Menu.lastItems.find((item) => item.title === "End of episode")?.trigger();

      button.click();
      const byTitle = (title: string) =>
        Menu.lastItems.find((item) => item.title === title);
      expect(byTitle("End of episode")?.checked).toBe(true);
      expect(byTitle("Off")?.checked).toBeNull();
    });
  });

  describe("cover artwork", () => {
    it("keeps the styled placeholder visible until cover artwork loads", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const createElement = vi.spyOn(activeDocument, "createElement");
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");
      const episode = {
        ...baseEpisode(),
        coverImage: "https://example.com/cover.jpg",
      };

      player.loadEpisode(episode, [episode]);

      expect(
        container.querySelector(".podcast-cover-placeholder"),
      ).not.toBeNull();
      expect(container.querySelector(".podcast-cover")).toBeNull();

      const artwork = createElement.mock.results
        .map((result) => result.value)
        .find(
          (element): element is HTMLImageElement =>
            element instanceof HTMLImageElement &&
            element.classList.contains("podcast-cover"),
        );
      artwork?.dispatchEvent(new Event("load"));

      expect(container.querySelector(".podcast-cover-placeholder")).toBeNull();
      expect(container.querySelector(".podcast-cover")).not.toBeNull();
    });
  });

  describe("sorting", () => {
    it("renders a bounded episode list and loads additional episodes without recreating audio", async () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");
      const episodes = Array.from({ length: 25 }, (_, index) => ({
        ...baseEpisode(),
        title: `Ep ${index + 1}`,
        guid: `guid-${index + 1}`,
        audioUrl: `https://example.com/${index + 1}.mp3`,
      }));

      player.loadEpisode(episodes[4], episodes);

      expect(container.querySelectorAll(".episode-list-row")).toHaveLength(20);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      expect(container.querySelector(".episode-list-range")?.textContent).toBe(
        "Showing 20 of 25",
      );
      expect(
        container
          .querySelector(".episode-list-row.active")
          ?.getAttribute("data-episode-guid"),
      ).toBe("guid-5");

      const audioBeforePaging = container.querySelector("audio");
      (
        container.querySelector(".episode-list-load-more") as HTMLButtonElement
      ).click();
      expect(container.querySelector("audio")).toBe(audioBeforePaging);
      expect(container.querySelectorAll(".episode-list-row")).toHaveLength(25);
      expect(
        container
          .querySelector(".episode-list-row.active")
          ?.getAttribute("data-episode-guid"),
      ).toBe("guid-5");
    });

    it("does not recreate the audio element when sorting the episode list", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep1 = baseEpisode();
      const ep2 = {
        ...ep1,
        title: "Ep 2",
        guid: "guid-2",
        audioUrl: "https://example.com/2.mp3",
      };

      player.loadEpisode(ep1, [ep1, ep2]);

      const audioBefore = (
        player as unknown as { audioElement: HTMLAudioElement }
      ).audioElement;
      const audioDomBefore = container.querySelector("audio");
      expect(audioBefore).toBeTruthy();
      expect(audioDomBefore).toBe(audioBefore);

      (
        player as unknown as { sortPlaylist: (o: "recent" | "oldest") => void }
      ).sortPlaylist("oldest");

      const audioAfter = (
        player as unknown as { audioElement: HTMLAudioElement }
      ).audioElement;
      const audioDomAfter = container.querySelector("audio");
      expect(audioAfter).toBe(audioBefore);
      expect(audioDomAfter).toBe(audioBefore);
    });
  });

  describe("live tag updates", () => {
    it("renders current and playlist tags from the authoritative registry", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const settings = {
        availableTags: [
          { name: "Topic", color: "#234567", textColor: "#765432" },
        ],
      };
      const player = new PodcastPlayer(
        container,
        new App(),
        "obsidian",
        undefined,
        undefined,
        undefined,
        true,
        1,
        false,
        undefined,
        true,
        true,
      );
      player.setTagAppearanceSettings(settings);
      const episode = {
        ...baseEpisode(),
        tags: [{ name: "Topic", color: "#stale", textColor: "#stale" }],
      };

      player.loadEpisode(episode, [episode, { ...episode, guid: "other" }]);

      const chips = container.querySelectorAll<HTMLElement>(
        ".podcast-tag, .episode-list-row-tag",
      );
      expect(chips.length).toBeGreaterThan(1);
      chips.forEach((chip) => {
        expect(chip.style.getPropertyValue("--tag-color")).toBe("#234567");
        expect(chip.style.getPropertyValue("--tag-text-color")).toBe("#765432");
      });
    });

    it("refreshes inherited colors in the player strip and episode list", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const settings: {
        availableTags: { name: string; color?: string; textColor?: string }[];
        defaultTagColor: string;
        defaultTagTextColor: string;
      } = {
        availableTags: [{ name: "Topic" }],
        defaultTagColor: "#345678",
        defaultTagTextColor: "#fef3c7",
      };
      const player = new PodcastPlayer(container, new App(), "obsidian");
      player.setTagAppearanceSettings(settings);
      const episode = { ...baseEpisode(), tags: [{ name: "Topic" }] };
      player.loadEpisode(episode, [episode, { ...episode, guid: "other" }]);

      const expectResolvedColors = (background: string, text: string) => {
        const chips = container.querySelectorAll<HTMLElement>(
          ".podcast-tag, .episode-list-row-tag",
        );
        expect(chips.length).toBeGreaterThan(1);
        chips.forEach((chip) => {
          expect(chip.style.getPropertyValue("--tag-color")).toBe(background);
          expect(chip.style.getPropertyValue("--tag-text-color")).toBe(text);
        });
      };
      expectResolvedColors("#345678", "#fef3c7");

      settings.defaultTagColor = "#789abc";
      settings.defaultTagTextColor = "#111827";
      player.refreshTags();
      player.refreshPlaylistTags(episode.guid);

      expectResolvedColors("#789abc", "#111827");

      settings.availableTags[0] = {
        name: "Topic",
        color: "#123456",
        textColor: "#fedcba",
      };
      player.refreshTags();
      player.refreshPlaylistTags(episode.guid);

      expectResolvedColors("#123456", "#fedcba");
    });

    it("refreshTags + refreshPlaylistTags update player strip and episode-list row", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep1 = baseEpisode();
      const ep2 = {
        ...ep1,
        title: "Ep 2",
        guid: "guid-2",
        tags: [{ name: "initial", color: "#00ff00" }],
        audioUrl: "https://example.com/2.mp3",
      };

      player.loadEpisode(ep1, [ep1, ep2]);

      expect(container.querySelector(".podcast-tag-strip")).toBeNull();
      const row = container.querySelector<HTMLElement>(
        `.episode-list-row[data-episode-guid="${ep1.guid}"]`,
      );
      expect(row).not.toBeNull();

      // Add tag assignment
      ep1.tags = ep1.tags ?? [];
      ep1.tags.push({ name: "NewTag", color: "#ff0000" });
      player.refreshTags();
      player.refreshPlaylistTags(ep1.guid);

      const playerTag = container.querySelector(
        ".podcast-tag-strip .podcast-tag",
      );
      expect(playerTag?.textContent).toBe("NewTag");

      const rowTag = container.querySelector(
        `.episode-list-row[data-episode-guid="${ep1.guid}"] .episode-list-row-tag`,
      );
      expect(rowTag?.textContent).toBe("NewTag");

      // Remove tag assignment
      ep1.tags = [];
      player.refreshTags();
      player.refreshPlaylistTags(ep1.guid);

      expect(container.querySelector(".podcast-tag-strip")).toBeNull();
      const rowTagsAfter = container.querySelector(
        `.episode-list-row[data-episode-guid="${ep1.guid}"] .episode-list-row-tags`,
      );
      expect(rowTagsAfter).toBeNull();
    });
  });

  describe("episode details section", () => {
    it("renders the collapsible details section when notes exist", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.content = "<p>hello</p>";
      player.loadEpisode(ep);

      const details = container.querySelector(".podcast-episode-details");
      expect(details).not.toBeNull();
      expect(details?.querySelector("summary")?.textContent).toContain(
        "Episode details",
      );
    });

    it("prefers content over description when meaningfully different", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.description = "<p>DESC_UNIQUE</p>";
      ep.content = "<p>CONTENT_UNIQUE</p><p>" + "x".repeat(80) + "</p>"; // ensure length > 40
      player.loadEpisode(ep);

      const notesBody = container.querySelector<HTMLElement>(
        ".podcast-episode-notes-body",
      );
      expect(notesBody).not.toBeNull();
      expect(notesBody?.textContent).toContain("CONTENT_UNIQUE");
      expect(notesBody?.textContent).not.toContain("DESC_UNIQUE");
    });

    it("sanitizes show notes (removes scripts/events, blocks javascript: links)", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.content = `
        <p>
          Hi
          <a href="https://example.com/a" onclick="evil()">safe link</a>
          <a href="javascript:alert(1)">bad link</a>
          <img src="https://example.com/x.png" />
          <script>alert("x")</script>
        </p>
      `;
      player.loadEpisode(ep);

      const notesBody = container.querySelector<HTMLElement>(
        ".podcast-episode-notes-body",
      );
      expect(notesBody).not.toBeNull();
      expect(notesBody?.querySelector("script")).toBeNull();
      expect(notesBody?.querySelector("img")).toBeNull();

      const links = notesBody?.querySelectorAll<HTMLAnchorElement>("a") || [];
      expect(links.length).toBeGreaterThanOrEqual(1);

      const safe = links[0];
      expect(safe.getAttribute("href")).toBe("https://example.com/a");
      expect(safe.getAttribute("target")).toBe("_blank");
      expect(safe.getAttribute("rel")).toBe("noopener noreferrer");
      expect(safe.getAttribute("onclick")).toBeNull();

      const bad = Array.from(links).find((l) =>
        (l.textContent || "").includes("bad link"),
      );
      expect(bad).toBeTruthy();
      expect(bad?.getAttribute("href")).toBeNull();
    });

    it("renders metadata rows only when fields exist", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.content = "<p>notes</p>";
      ep.duration = "1:23";
      ep.explicit = true;
      ep.season = 2;
      ep.episode = 7;
      ep.episodeType = "full";
      ep.category = "Tech";
      ep.enclosure = {
        url: "https://example.com/ep1.mp3",
        type: "audio/mpeg",
        length: "1048576",
      };
      player.loadEpisode(ep);

      const grid = container.querySelector(".podcast-episode-meta-grid");
      expect(grid).not.toBeNull();
      const text = grid?.textContent || "";
      expect(text).toContain("Published");
      expect(text).toContain("Duration");
      expect(text).toContain("1:23");
      expect(text).toContain("Explicit");
      expect(text).toContain("Yes");
      expect(text).toContain("Season");
      expect(text).toContain("2");
      expect(text).toContain("Episode");
      expect(text).toContain("7");
      expect(text).toContain("Type");
      expect(text).toContain("full");
      expect(text).toContain("Category");
      expect(text).toContain("Tech");
      expect(text).toContain("Link");
      expect(text).toContain("Size");

      const link = container.querySelector<HTMLAnchorElement>(
        ".podcast-episode-meta-value a",
      );
      expect(link?.getAttribute("href")).toBe("https://example.com/ep1");
    });
  });

  describe("default play speed", () => {
    it("initializes with the given defaultPlaySpeed", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(
        container,
        app,
        "obsidian",
        undefined,
        undefined,
        undefined,
        true,
        1.5,
      );

      // audioElement is created during render(), which is called by loadEpisode()
      const ep = baseEpisode();
      player.loadEpisode(ep);

      const audio = (player as unknown as { audioElement: HTMLAudioElement })
        .audioElement;
      expect(audio.playbackRate).toBe(1.5);

      const speedBtn = container.querySelector(
        ".rss-speed-control",
      ) as HTMLSelectElement;
      expect(speedBtn).not.toBeNull();
      expect(speedBtn.value).toBe("1.5");
    });
  });

  describe("play speed reporting", () => {
    function buildPlayer(
      container: HTMLElement,
      defaultPlaySpeed: number,
      onPlaySpeedChange: (speed: number) => void,
    ): PodcastPlayer {
      return new PodcastPlayer(
        container,
        new App(),
        "obsidian",
        undefined,
        undefined,
        undefined,
        true,
        defaultPlaySpeed,
        false,
        onPlaySpeedChange,
      );
    }

    function speedControl(container: HTMLElement): HTMLSelectElement {
      return container.querySelector(".rss-speed-control") as HTMLSelectElement;
    }

    it("reports the chosen speed when the user changes the control", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const onPlaySpeedChange = vi.fn();
      const player = buildPlayer(container, 1, onPlaySpeedChange);
      player.loadEpisode(baseEpisode());

      const control = speedControl(container);
      control.value = "2";
      control.dispatchEvent(new Event("change"));

      expect(onPlaySpeedChange).toHaveBeenCalledTimes(1);
      expect(onPlaySpeedChange).toHaveBeenCalledWith(2);
    });

    it("does not report a speed when an episode loads without a change", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const onPlaySpeedChange = vi.fn();
      const player = buildPlayer(container, 1, onPlaySpeedChange);

      player.loadEpisode(baseEpisode());

      expect(onPlaySpeedChange).not.toHaveBeenCalled();
    });

    it("ignores a selected value that is not one of the control's options", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const onPlaySpeedChange = vi.fn();
      const player = buildPlayer(container, 1, onPlaySpeedChange);
      player.loadEpisode(baseEpisode());

      const control = speedControl(container);
      // jsdom stores "" for a value no option matches; `Number("")` is 0, so an
      // unguarded handler would persist and apply 0.
      control.value = "9";
      control.dispatchEvent(new Event("change"));

      expect(onPlaySpeedChange).not.toHaveBeenCalled();
      const audio = (player as unknown as { audioElement: HTMLAudioElement })
        .audioElement;
      expect(audio.playbackRate).toBe(1);
    });

    it("keeps the chosen speed when the next episode loads in the same player", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const player = buildPlayer(container, 1, vi.fn());
      player.loadEpisode(baseEpisode());

      const control = speedControl(container);
      control.value = "1.5";
      control.dispatchEvent(new Event("change"));

      player.loadEpisode({ ...baseEpisode(), guid: "guid-ep2" });

      const audio = (player as unknown as { audioElement: HTMLAudioElement })
        .audioElement;
      expect(audio.playbackRate).toBe(1.5);
      expect(speedControl(container).value).toBe("1.5");
    });

    it("starts a player constructed after the change at the chosen speed", () => {
      // Mirrors the reader/dashboard wiring: the change callback persists the
      // value, and the next player is constructed from the persisted value.
      const settings = { media: { defaultPlaySpeed: 1 } };
      const persist = (speed: number) => {
        settings.media.defaultPlaySpeed = speed;
      };

      const firstContainer: HTMLDivElement = createDiv();
      document.body.appendChild(firstContainer);
      const first = buildPlayer(
        firstContainer,
        settings.media.defaultPlaySpeed,
        persist,
      );
      first.loadEpisode(baseEpisode());
      const control = speedControl(firstContainer);
      control.value = "2";
      control.dispatchEvent(new Event("change"));

      const secondContainer: HTMLDivElement = createDiv();
      document.body.appendChild(secondContainer);
      const second = buildPlayer(
        secondContainer,
        settings.media.defaultPlaySpeed,
        persist,
      );
      second.loadEpisode(baseEpisode());

      const audio = (second as unknown as { audioElement: HTMLAudioElement })
        .audioElement;
      expect(audio.playbackRate).toBe(2);
      expect(speedControl(secondContainer).value).toBe("2");
    });
  });

  describe("autoplay behavior", () => {
    it("stops playing by default at the end of an episode", async () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep1 = baseEpisode();
      const ep2 = {
        ...ep1,
        title: "Ep 2",
        guid: "guid-2",
        audioUrl: "https://example.com/2.mp3",
      };

      player.loadEpisode(ep1, [ep1, ep2]);

      const loadSpy = vi.spyOn(player, "loadEpisode");

      (
        player as unknown as { handleEpisodeEnd: () => void }
      ).handleEpisodeEnd();
      await Promise.resolve();

      expect(loadSpy).not.toHaveBeenCalled();

      // Checking if playBtn is not "pause" is a proxy for stopped
      const playBtnAfter =
        container.querySelector<HTMLElement>(".rss-play-pause");
      expect(lucideIconId(playBtnAfter)).toBe("play");
    });

    it("advances to next episode when Autoplay is enabled", async () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep1 = baseEpisode();
      const ep2 = {
        ...ep1,
        title: "Ep 2",
        guid: "guid-2",
        audioUrl: "https://example.com/2.mp3",
      };

      player.loadEpisode(ep1, [ep1, ep2]);

      // Enable autoplay via the toggle checkbox
      const autoplayCheckbox = container.querySelector(
        ".podcast-autoplay-checkbox",
      ) as HTMLInputElement;
      expect(autoplayCheckbox).not.toBeNull();
      autoplayCheckbox.click();

      const loadSpy = vi.spyOn(player, "loadEpisode");

      (
        player as unknown as { handleEpisodeEnd: () => void }
      ).handleEpisodeEnd();
      await Promise.resolve();

      expect(loadSpy).toHaveBeenCalledWith(
        ep2,
        undefined,
        expect.objectContaining({ autoplay: true, source: "autoplay" }),
      );
    });
  });

  describe("playback progress persistence", () => {
    it("shows saved episode progress in the episode list", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");
      const ep = {
        ...baseEpisode(),
        playbackProgress: {
          position: 30,
          duration: 120,
          lastUpdated: 1,
        },
      };
      const otherEpisode = {
        ...baseEpisode(),
        title: "Ep 2",
        guid: "guid-ep2",
      };

      player.loadEpisode(ep, [ep, otherEpisode]);

      const row = container.querySelector<HTMLElement>(
        `.episode-list-row[data-episode-guid="${ep.guid}"]`,
      );
      expect(row?.classList.contains("has-progress")).toBe(true);
      expect(row?.style.getPropertyValue("--progress-width")).toBe("25%");
      player.destroy();
    });

    it("does not recreate the legacy key when playback progress is saved", () => {
      vi.useFakeTimers();
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const saveLocalStorage = vi.spyOn(app, "saveLocalStorage");
      const player = new PodcastPlayer(container, app, "obsidian");
      const ep = baseEpisode();
      player.loadEpisode(ep);

      const audio = container.querySelector<HTMLAudioElement>("audio");
      expect(audio).not.toBeNull();
      if (audio) {
        Object.defineProperty(audio, "duration", {
          configurable: true,
          value: 120,
        });
        audio.currentTime = 12;
        audio.dispatchEvent(new Event("play"));
      }

      vi.advanceTimersByTime(1000);
      player.destroy();

      expect(saveLocalStorage).not.toHaveBeenCalledWith(
        "rss-podcast-progress",
        expect.anything(),
      );
      vi.useRealTimers();
    });

    it("starts tracking on play and flushes on pause", () => {
      vi.useFakeTimers();

      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const app = new App();
      const onPlaybackProgress = vi.fn();
      const player = new PodcastPlayer(
        container,
        app,
        "obsidian",
        undefined,
        undefined,
        onPlaybackProgress,
      );

      const ep = baseEpisode();
      player.loadEpisode(ep);

      const audio = container.querySelector<HTMLAudioElement>("audio");
      expect(audio).not.toBeNull();

      Object.defineProperty(audio, "duration", {
        configurable: true,
        value: 120,
      });
      if (audio) {
        audio.currentTime = 12;
        audio.dispatchEvent(new Event("play"));
      }

      vi.advanceTimersByTime(1000);

      expect(onPlaybackProgress).toHaveBeenCalledWith(ep, 12, 120, false);

      if (audio) {
        audio.dispatchEvent(new Event("pause"));
      }

      expect(onPlaybackProgress).toHaveBeenCalledWith(ep, 12, 120, true);

      player.destroy();
      vi.useRealTimers();
    });
  });

  describe("non-finite audio duration (live streams)", () => {
    function loadWithDuration(
      duration: number,
      onPlaybackProgress?: (...args: unknown[]) => void,
    ) {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const player = new PodcastPlayer(
        container,
        new App(),
        "obsidian",
        undefined,
        undefined,
        onPlaybackProgress,
      );
      const ep = baseEpisode();
      player.loadEpisode(ep);
      const audio = container.querySelector<HTMLAudioElement>("audio")!;
      Object.defineProperty(audio, "duration", {
        configurable: true,
        value: duration,
      });
      return { container, player, audio, ep };
    }

    it("keeps the neutral duration label and does not throw on loadedmetadata/timeupdate", () => {
      const { container, player, audio } = loadWithDuration(Infinity);

      expect(() => {
        audio.dispatchEvent(new Event("loadedmetadata"));
        audio.dispatchEvent(new Event("timeupdate"));
      }).not.toThrow();

      const label = container.querySelector(".rss-duration")!.textContent;
      expect(label).not.toContain("Infinity");
      expect(label).toBe("-0:00");
      expect(
        container.querySelector<HTMLProgressElement>(".podcast-progress-bar")!
          .max,
      ).toBe(1);

      player.destroy();
    });

    it.each([NaN, 0, Infinity])(
      "shows the neutral label and does not throw for duration %s",
      (duration) => {
        const { container, player, audio } = loadWithDuration(duration);

        expect(() => {
          audio.dispatchEvent(new Event("loadedmetadata"));
          audio.dispatchEvent(new Event("timeupdate"));
        }).not.toThrow();

        expect(container.querySelector(".rss-duration")!.textContent).toBe(
          "-0:00",
        );

        player.destroy();
      },
    );

    it.each([NaN, 0, Infinity])(
      "does not seek when the seek bar is clicked with duration %s",
      (duration) => {
        const { container, player, audio } = loadWithDuration(duration);
        audio.currentTime = 5;

        container
          .querySelector<HTMLElement>(".podcast-progress-bar")!
          .dispatchEvent(new MouseEvent("click", { clientX: 50 }));

        expect(audio.currentTime).toBe(5);

        player.destroy();
      },
    );

    it("keeps the forward-30 button working with Infinity duration", () => {
      const { container, player, audio } = loadWithDuration(Infinity);
      audio.currentTime = 10;

      container
        .querySelector<HTMLElement>('[aria-label="Forward 30 seconds"]')!
        .click();

      expect(audio.currentTime).toBe(40);

      player.destroy();
    });

    it("skips saving progress inside the last 3 seconds of a finite episode", () => {
      vi.useFakeTimers();
      const onPlaybackProgress = vi.fn();
      const { player, audio } = loadWithDuration(100, onPlaybackProgress);

      audio.currentTime = 98;
      audio.dispatchEvent(new Event("play"));
      vi.advanceTimersByTime(1000);

      expect(onPlaybackProgress).not.toHaveBeenCalled();

      player.destroy();
      vi.useRealTimers();
    });

    it("still renders a finite duration label", () => {
      const { container, player, audio } = loadWithDuration(125);

      audio.dispatchEvent(new Event("loadedmetadata"));

      expect(container.querySelector(".rss-duration")!.textContent).toBe(
        "2:05",
      );

      player.destroy();
    });

    it("saves progress with a zero duration instead of Infinity", () => {
      vi.useFakeTimers();
      const onPlaybackProgress = vi.fn();
      const { player, audio, ep } = loadWithDuration(
        Infinity,
        onPlaybackProgress,
      );

      audio.currentTime = 12;
      audio.dispatchEvent(new Event("play"));
      vi.advanceTimersByTime(1000);

      expect(onPlaybackProgress).toHaveBeenCalledWith(ep, 12, 0, false);

      player.destroy();
      vi.useRealTimers();
    });
  });

  describe("seek drag listeners", () => {
    it("removes window drag listeners when the player is destroyed mid-drag", () => {
      const container: HTMLDivElement = createDiv();
      document.body.appendChild(container);
      const player = new PodcastPlayer(container, new App(), "obsidian");
      player.loadEpisode(baseEpisode());

      const removeSpy = vi.spyOn(activeWindow, "removeEventListener");
      const audio = container.querySelector("audio") as HTMLAudioElement;
      Object.defineProperty(audio, "duration", { value: 100 });
      const bar = container.querySelector(".podcast-progress-bar");
      expect(bar).not.toBeNull();

      bar?.dispatchEvent(new MouseEvent("mousedown"));
      player.destroy();

      const removed = removeSpy.mock.calls.map((call) => call[0]);
      expect(removed).toContain("mousemove");
      expect(removed).toContain("mouseup");
    });
  });
});
