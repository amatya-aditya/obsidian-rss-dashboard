import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Menu } from "obsidian";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import type { FeedItem } from "../../../src/types/types";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";

// #1478: the sleep timer is a native button, so the browser supplies focus and
// Enter/Space activation (as a click with detail 0). jsdom cannot show that
// activation, so it is checked with real keys in the fixture vault.
describe("PodcastPlayer sleep timer button", () => {
  const players: PodcastPlayer[] = [];

  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    players.splice(0).forEach((player) => player.destroy());
    vi.restoreAllMocks();
    document.body.empty();
  });

  function loadButton(): HTMLButtonElement {
    const container = document.body.createDiv();
    const player = new PodcastPlayer(container, new App(), "obsidian");
    players.push(player);
    const episode: FeedItem = {
      title: "Ep",
      link: "",
      description: "",
      pubDate: "",
      guid: "g",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
      mediaType: "podcast",
      audioUrl: "https://example.com/ep.mp3",
    };
    player.loadEpisode(episode, [episode]);
    return container.querySelector<HTMLButtonElement>(".rss-sleep-timer-btn")!;
  }

  it("is a native button with its accessible name and no ARIA role or tabindex", () => {
    const button = loadButton();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Sleep timer");
    expect(button.hasAttribute("role")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps the moon icon and the countdown slot inside the button, in order", () => {
    const button = loadButton();
    const children = [...button.children];
    expect(children).toHaveLength(2);
    expect(children[0].classList.contains("rss-sleep-timer-icon")).toBe(true);
    expect(children[0].getAttribute("aria-hidden")).toBe("true");
    expect(children[0].querySelector("svg")).not.toBeNull();
    expect(children[1].classList.contains("rss-sleep-timer-inline-value")).toBe(
      true,
    );
  });

  it("opens the menu at the pointer for a mouse click", () => {
    const button = loadButton();
    const atMouse = vi.spyOn(Menu.prototype, "showAtMouseEvent");
    const atPosition = vi.spyOn(Menu.prototype, "showAtPosition");
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1, clientX: 5 }),
    );
    expect(atMouse).toHaveBeenCalledTimes(1);
    expect(atPosition).not.toHaveBeenCalled();
  });

  it("opens the menu under the button when a key press activates it", () => {
    const button = loadButton();
    const atMouse = vi.spyOn(Menu.prototype, "showAtMouseEvent");
    const atPosition = vi.spyOn(Menu.prototype, "showAtPosition");
    // A browser turns Enter or Space on a button into a click with detail 0.
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(atPosition).toHaveBeenCalledTimes(1);
    expect(atMouse).not.toHaveBeenCalled();
  });

  it("lists the same timer options", () => {
    const button = loadButton();
    button.click();
    expect(Menu.lastItems.map((item) => item.title)).toEqual([
      "Off",
      "5 minutes",
      "10 minutes",
      "15 minutes",
      "30 minutes",
      "45 minutes",
      "60 minutes",
      "90 minutes",
      "120 minutes",
      "End of episode",
    ]);
  });
});

describe("sleep timer button styles", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(
    path.resolve(testDir, "../../../src/styles/podcast-player.css"),
    "utf-8",
  );

  // jsdom does not run Obsidian's stylesheet, so this is a stylesheet contract:
  // the button must keep its own border and drop the UA shadow and font.
  it("keeps its border and resets the UA shadow and font, scoped under the player", () => {
    let found = false;
    postcss.parse(css).walkRules((rule) => {
      const scoped = rule.selectors.some(
        (s) =>
          s.replace(/\s+/g, " ").trim() ===
          ".rss-reader-podcast-container button.rss-sleep-timer-btn",
      );
      if (!scoped) return;
      const decls = new Map<string, string>();
      rule.walkDecls((d) => {
        decls.set(d.prop, d.value);
      });
      expect(decls.get("border")).toBe(
        "1px solid var(--background-modifier-border)",
      );
      expect(decls.get("box-shadow")).toBe("none");
      expect(decls.get("font-family")).toBe("inherit");
      found = true;
    });
    expect(found).toBe(true);
  });
});

describe("podcast theme button rules", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(
    path.resolve(testDir, "../../../src/styles/podcast-themes.css"),
    "utf-8",
  );

  // The broad theme rule `[data-podcast-theme] button` paints every native
  // button. The icon controls (clickable-icon) have their own per-control theme
  // rules, which it would otherwise out-rank, e.g. the sleep timer's active
  // colour. jsdom does not run the cascade, so this pins the selector.
  it("leaves clickable-icon buttons to their own rules in every theme", () => {
    const broad: string[] = [];
    postcss.parse(css).walkRules((rule) => {
      for (const raw of rule.selectors) {
        const selector = raw.replace(/\s+/g, " ").trim();
        const bareButton =
          /^\.rss-reader-podcast-container\[data-podcast-theme="\w+"\] button(:not\(\.clickable-icon\))?$/;
        if (bareButton.test(selector)) {
          broad.push(selector);
        }
      }
    });
    expect(broad).toHaveLength(4);
    for (const selector of broad) {
      expect(selector).toMatch(/button:not\(\.clickable-icon\)$/);
    }
  });
});
