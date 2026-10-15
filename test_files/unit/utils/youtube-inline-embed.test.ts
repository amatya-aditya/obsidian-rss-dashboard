import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setRequestUrlHandler,
  type RequestUrlHandler,
  type RequestUrlParam,
} from "obsidian";
import {
  __resetYouTubeInlinePlaybackAvailability,
  createYouTubeVideoPlaceholder,
  enhanceYouTubeEmbeds,
  youTubeEmbedHostUrl,
} from "../../../src/utils/youtube-inline-embed";
import {
  YOUTUBE_VIDEO_ID_ATTRIBUTE,
  youTubeWatchUrl,
} from "../../../src/utils/youtube-embed";
import { sanitizeAndAppendHtml } from "../../../src/utils/safe-html";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const VIDEO_ID = "z9TFdTqkbPk";
const WATCH_URL = youTubeWatchUrl(VIDEO_ID);
const EMBED_URL = `https://releases.obsidian.md/youtube?v=${VIDEO_ID}&autoplay=1`;
const ALLOW = "autoplay; encrypted-media; fullscreen";

function markedLink(videoId = VIDEO_ID): HTMLAnchorElement {
  const link = createEl("a");
  link.setAttribute(YOUTUBE_VIDEO_ID_ATTRIBUTE, videoId);
  link.setAttribute("href", `https://www.youtube.com/watch?v=${videoId}`);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  link.textContent = "Watch on YouTube";
  return link;
}

function containerWithMarkedLink(videoId = VIDEO_ID): HTMLDivElement {
  const container = document.body.createDiv();
  container.appendChild(markedLink(videoId));
  return container;
}

/** Clicks the placeholder's play control and waits for it to be consumed. */
async function clickPlay(container: HTMLElement): Promise<void> {
  const play = container.querySelector<HTMLButtonElement>(
    ".rss-youtube-embed-play",
  );
  play?.click();
  await vi.waitFor(() => {
    expect(container.querySelector(".rss-youtube-embed-play")).toBeNull();
  });
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  __resetYouTubeInlinePlaybackAvailability();
});

afterEach(() => {
  setRequestUrlHandler(null);
  document.body.empty();
  vi.restoreAllMocks();
});

describe("youTubeEmbedHostUrl", () => {
  it("builds the embed-host URL from a validated video ID", () => {
    expect(youTubeEmbedHostUrl(VIDEO_ID)).toBe(EMBED_URL);
  });

  it.each([
    ["a short ID", "short"],
    ["a long ID", `${VIDEO_ID}x`],
    ["a URL-unsafe ID", "abc%22onload"],
    ["an empty ID", ""],
  ])("rejects %s so nothing malformed can reach the iframe", (_name, id) => {
    expect(() => youTubeEmbedHostUrl(id)).toThrow();
  });
});

describe("enhanceYouTubeEmbeds", () => {
  it("replaces a marked link with a placeholder and requests nothing", () => {
    const handler = vi.fn((): { status: number } => ({ status: 200 }));
    setRequestUrlHandler(handler);
    const container = containerWithMarkedLink();

    enhanceYouTubeEmbeds(container, { title: "A Conversation article" });

    const placeholder = container.querySelector(".rss-youtube-embed");
    expect(placeholder).not.toBeNull();
    expect(
      container.querySelector(`a[${YOUTUBE_VIDEO_ID_ATTRIBUTE}]`),
    ).toBeNull();

    const play = container.querySelector<HTMLButtonElement>(
      ".rss-youtube-embed-play",
    );
    expect(play?.getAttribute("type")).toBe("button");
    expect(play?.getAttribute("aria-label")).toBe(
      "Play video: A Conversation article",
    );

    expect(
      container.querySelector(".rss-youtube-embed-title")?.textContent,
    ).toBe("A Conversation article");

    const watch = container.querySelector<HTMLAnchorElement>(
      ".rss-youtube-embed-watch",
    );
    expect(watch?.getAttribute("href")).toBe(WATCH_URL);
    expect(watch?.getAttribute("target")).toBe("_blank");
    expect(watch?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(watch?.textContent).toContain("Watch on YouTube");

    expect(container.querySelector("iframe")).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("builds the placeholder for a recognized YouTube embed the sanitizer marked", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(
      container,
      `<p>intro</p><iframe src="https://www.youtube.com/embed/${VIDEO_ID}?rel=0&amp;autoplay=0"></iframe>`,
      { mode: "rich" },
    );
    enhanceYouTubeEmbeds(container, { title: "Feed article" });

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector(".rss-youtube-embed")).not.toBeNull();
    expect(
      container.querySelector<HTMLAnchorElement>(".rss-youtube-embed-watch")
        ?.href,
    ).toBe(WATCH_URL);
  });

  it("leaves a marked link with a malformed ID alone", () => {
    const container = document.body.createDiv();
    const bad = markedLink("short");
    container.appendChild(bad);

    enhanceYouTubeEmbeds(container);

    expect(container.querySelector(".rss-youtube-embed")).toBeNull();
    expect(container.contains(bad)).toBe(true);
  });

  it("does not upgrade the placeholder's watch link on a second pass", () => {
    const container = containerWithMarkedLink();

    enhanceYouTubeEmbeds(container);
    const placeholder = container.querySelector(".rss-youtube-embed");
    enhanceYouTubeEmbeds(container);

    expect(container.querySelectorAll(".rss-youtube-embed")).toHaveLength(1);
    expect(container.querySelector(".rss-youtube-embed")).toBe(placeholder);
  });

  it("accepts a validated video ID directly, for callers that already have one", () => {
    const placeholder = createYouTubeVideoPlaceholder(document, VIDEO_ID, {
      title: "Fetched article",
    });

    expect(placeholder.classList.contains("rss-youtube-embed")).toBe(true);
    expect(
      placeholder
        .querySelector<HTMLButtonElement>(".rss-youtube-embed-play")
        ?.getAttribute("aria-label"),
    ).toBe("Play video: Fetched article");
    expect(
      placeholder
        .querySelector<HTMLAnchorElement>(".rss-youtube-embed-watch")
        ?.getAttribute("href"),
    ).toBe(WATCH_URL);
  });

  it("refuses to build a placeholder from an invalid ID", () => {
    expect(() => createYouTubeVideoPlaceholder(document, "short")).toThrow();
  });
});

describe("playing the video inline", () => {
  it("loads the player from the embed host after a click and keeps the watch link", async () => {
    const seen: string[] = [];
    setRequestUrlHandler((param: RequestUrlParam) => {
      seen.push(param.url);
      return { status: 200 };
    });
    const container = containerWithMarkedLink();
    enhanceYouTubeEmbeds(container, { title: "A title" });

    expect(seen).toEqual([]);
    await clickPlay(container);

    const iframe = container.querySelector<HTMLIFrameElement>(
      ".rss-youtube-embed-player iframe",
    );
    expect(iframe?.getAttribute("src")).toBe(EMBED_URL);
    expect(iframe?.getAttribute("allow")).toBe(ALLOW);
    expect(iframe?.hasAttribute("allowfullscreen")).toBe(true);
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(iframe?.getAttribute("title")).toBe("YouTube video: A title");

    const watch = container.querySelector<HTMLAnchorElement>(
      ".rss-youtube-embed-watch",
    );
    expect(watch?.getAttribute("href")).toBe(WATCH_URL);
    expect(container.querySelector(".rss-youtube-embed-notice")).toBeNull();
    expect(seen).toEqual([EMBED_URL]);
  });

  it("moves focus to the player after play", async () => {
    setRequestUrlHandler(() => ({ status: 200 }));
    const container = containerWithMarkedLink();
    enhanceYouTubeEmbeds(container, { title: "A title" });

    await clickPlay(container);

    expect(document.activeElement).toBe(
      container.querySelector(".rss-youtube-embed-player iframe"),
    );
  });

  it("probes the embed host once per session", async () => {
    const handler = vi.fn(() => ({ status: 200 }));
    setRequestUrlHandler(handler);
    const first = containerWithMarkedLink();
    const second = containerWithMarkedLink();
    enhanceYouTubeEmbeds(first, { title: "First" });
    enhanceYouTubeEmbeds(second, { title: "Second" });

    await clickPlay(first);
    await clickPlay(second);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(
      second.querySelector<HTMLIFrameElement>(
        ".rss-youtube-embed-player iframe",
      ),
    ).not.toBeNull();
  });

  const unavailable: ReadonlyArray<readonly [string, RequestUrlHandler]> = [
    ["a non-200 response", () => ({ status: 404 })],
    [
      "a network error",
      () => {
        throw new Error("offline");
      },
    ],
  ];

  it.each(unavailable)(
    "falls back to the watch link with a notice for %s",
    async (_name, handler) => {
      setRequestUrlHandler(handler);
      const container = containerWithMarkedLink();
      enhanceYouTubeEmbeds(container, { title: "A title" });

      await clickPlay(container);

      const watch = container.querySelector<HTMLAnchorElement>(
        ".rss-youtube-embed-watch",
      );
      expect(watch?.getAttribute("href")).toBe(WATCH_URL);
      expect(container.querySelector("iframe")).toBeNull();
      expect(
        container.querySelector(".rss-youtube-embed-notice")?.textContent,
      ).toContain("unavailable");
    },
  );

  it("falls back to the watch link when the probe times out", async () => {
    setRequestUrlHandler(() => new Promise<never>(() => {}));
    const container = containerWithMarkedLink();
    enhanceYouTubeEmbeds(container, {
      title: "A title",
      availabilityTimeoutMs: 5,
    });

    await clickPlay(container);

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector(".rss-youtube-embed-watch")).not.toBeNull();
    expect(
      container.querySelector(".rss-youtube-embed-notice")?.textContent,
    ).toContain("unavailable");
  });
});
