import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

// #1478: the player's icon controls are native buttons, so the browser (not a
// hand-written keydown handler) supplies focus and Enter/Space activation.
// jsdom cannot show that activation, so it is checked in the fixture vault.
type PlayerInternals = { audioElement: HTMLAudioElement };

const TRANSPORT_CONTROLS = [
  { cls: ".rss-shuffle-btn", label: "Shuffle" },
  { cls: ".rss-rewind", label: "Rewind 30 seconds" },
  { cls: ".rss-play-pause", label: "Play/Pause" },
  { cls: ".rss-forward", label: "Forward 30 seconds" },
  { cls: ".rss-repeat-btn", label: "Repeat" },
  { cls: ".rss-volume", label: "Adjust volume" },
];

describe("PodcastPlayer icon controls", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function episode(): FeedItem {
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

  function loaded(): { container: HTMLElement; audio: HTMLAudioElement } {
    const container: HTMLDivElement = createDiv();
    document.body.appendChild(container);
    const player = new PodcastPlayer(container, new App(), "obsidian");
    const item = episode();
    player.loadEpisode(item, [item]);
    return {
      container,
      audio: (player as unknown as PlayerInternals).audioElement,
    };
  }

  describe.each(TRANSPORT_CONTROLS)("$label", ({ cls, label }) => {
    it("is a native button with its accessible name and no ARIA role or tabindex", () => {
      const { container } = loaded();
      const control = container.querySelector(cls)!;
      expect(control.tagName).toBe("BUTTON");
      expect(control.getAttribute("type")).toBe("button");
      expect(control.getAttribute("aria-label")).toBe(label);
      expect(control.hasAttribute("role")).toBe(false);
      expect(control.hasAttribute("tabindex")).toBe(false);
    });

    it("keeps its icon", () => {
      const { container } = loaded();
      expect(container.querySelector(cls)!.querySelector("svg")).not.toBeNull();
    });
  });

  it("seeks 30 seconds back and forward when clicked", () => {
    const { container, audio } = loaded();
    audio.currentTime = 100;
    container.querySelector<HTMLButtonElement>(".rss-rewind")!.click();
    expect(audio.currentTime).toBe(70);
    container.querySelector<HTMLButtonElement>(".rss-forward")!.click();
    expect(audio.currentTime).toBe(100);
  });

  it("keeps the 30-second badge inside the seek buttons", () => {
    const { container } = loaded();
    for (const cls of [".rss-rewind", ".rss-forward"]) {
      expect(container.querySelector(`${cls} .seek-label`)?.textContent).toBe(
        "30",
      );
    }
  });

  it("toggles repeat and shuffle when clicked", () => {
    const { container } = loaded();
    const repeat =
      container.querySelector<HTMLButtonElement>(".rss-repeat-btn")!;
    const shuffle =
      container.querySelector<HTMLButtonElement>(".rss-shuffle-btn")!;
    repeat.click();
    shuffle.click();
    expect(repeat.classList.contains("active")).toBe(true);
    expect(shuffle.classList.contains("active")).toBe(true);
    repeat.click();
    expect(repeat.classList.contains("active")).toBe(false);
  });

  it("starts playback when the play button is clicked", () => {
    const { container } = loaded();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    container.querySelector<HTMLButtonElement>(".rss-play-pause")!.click();
    expect(play).toHaveBeenCalled();
  });

  it("mutes and unmutes when the volume button is clicked", () => {
    const { container, audio } = loaded();
    const button = container.querySelector<HTMLButtonElement>(".rss-volume")!;
    button.click();
    expect(audio.muted).toBe(true);
    expect(button.classList.contains("is-muted")).toBe(true);
    button.click();
    expect(audio.muted).toBe(false);
  });

  it("does not let a volume click reach the surrounding row", () => {
    const { container } = loaded();
    const outer = vi.fn();
    container.addEventListener("click", outer);
    container.querySelector<HTMLButtonElement>(".rss-volume")!.click();
    expect(outer).not.toHaveBeenCalled();
  });

  it("keeps the sleep timer control as it was (icon plus countdown text)", () => {
    const { container } = loaded();
    const sleep = container.querySelector(".rss-sleep-timer-btn")!;
    expect(sleep.getAttribute("aria-label")).toBe("Sleep timer");
    expect(sleep.querySelector(".rss-sleep-timer-icon")).not.toBeNull();
  });
});

describe("podcast player icon button styles", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(
    path.resolve(testDir, "../../../src/styles/podcast-player.css"),
    "utf-8",
  );

  // jsdom does not run Obsidian's stylesheet, so the reset is pinned as a
  // stylesheet contract: a native button must not show the UA border or shadow.
  it("resets the UA border, shadow and font on the native buttons, scoped under the player", () => {
    let found = false;
    postcss.parse(css).walkRules((rule) => {
      const scoped = rule.selectors.some((s) =>
        /^\.rss-reader-podcast-container button\.clickable-icon$/.test(
          s.replace(/\s+/g, " ").trim(),
        ),
      );
      if (!scoped) return;
      const decls = new Map<string, string>();
      rule.walkDecls((d) => {
        decls.set(d.prop, d.value);
      });
      expect(decls.get("border")).toBe("none");
      expect(decls.get("box-shadow")).toBe("none");
      expect(decls.get("font-family")).toBe("inherit");
      found = true;
    });
    expect(found).toBe(true);
  });
});
