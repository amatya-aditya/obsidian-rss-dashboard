import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

type PlayerInternals = { audioElement: HTMLAudioElement };

const CHAPTERS_HTML = [
  "<p>(00:00) Intro</p>",
  "<p>(00:10) Second</p>",
  "<p>(00:50) Third</p>",
  "<p>(01:30) Last</p>",
].join("");

describe("PodcastPlayer chapter markers", () => {
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
      description: CHAPTERS_HTML,
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

  function mount(enabled = true): {
    container: HTMLElement;
    player: PodcastPlayer;
  } {
    const container: HTMLDivElement = createDiv();
    document.body.appendChild(container);
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
      enabled,
    );
    return { container, player };
  }

  function load(
    enabled = true,
    item: FeedItem = baseEpisode(),
  ): {
    container: HTMLElement;
    player: PodcastPlayer;
    audio: HTMLAudioElement;
    markers: () => HTMLButtonElement[];
    label: () => HTMLElement | null;
  } {
    const { container, player } = mount(enabled);
    player.loadEpisode(item, [item]);
    const audio = (player as unknown as PlayerInternals).audioElement;
    const markers = () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(".seek-bar-marker"),
      );
    const label = () =>
      container.querySelector<HTMLElement>(".podcast-chapter-label");
    return { container, player, audio, markers, label };
  }

  function withDuration(audio: HTMLAudioElement, duration: number): void {
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: duration,
    });
    audio.dispatchEvent(new Event("loadedmetadata"));
  }

  function hover(marker: HTMLElement): void {
    marker.dispatchEvent(new MouseEvent("mouseenter"));
  }

  function previewOf(container: HTMLElement): HTMLElement {
    return container.querySelector<HTMLElement>(".seek-bar-marker-preview")!;
  }

  it("renders one marker per chapter once the duration is known", () => {
    const { audio, markers, container } = load();
    expect(markers()).toHaveLength(0);

    withDuration(audio, 100);

    const rendered = markers();
    expect(rendered).toHaveLength(4);
    expect(
      rendered.map((marker) =>
        marker.style.getPropertyValue("--seek-bar-marker-position"),
      ),
    ).toEqual(["0%", "10%", "50%", "90%"]);
    expect(rendered.map((marker) => marker.getAttribute("aria-label"))).toEqual(
      [
        "Chapter 1, 0:00, Intro (0:10)",
        "Chapter 2, 0:10, Second (0:40)",
        "Chapter 3, 0:50, Third (0:40)",
        "Chapter 4, 1:30, Last (0:10)",
      ],
    );
    expect(container.querySelector(".seek-bar-marker-layer")).not.toBeNull();
  });

  it("keeps every marker reachable by keyboard, in chapter order", () => {
    const { audio, markers } = load();
    withDuration(audio, 100);

    const rendered = markers();
    expect(rendered.every((marker) => marker.tagName === "BUTTON")).toBe(true);
    expect(rendered.every((marker) => marker.tabIndex === 0)).toBe(true);
    expect(rendered.map((marker) => marker.getAttribute("aria-label"))).toEqual(
      [
        "Chapter 1, 0:00, Intro (0:10)",
        "Chapter 2, 0:10, Second (0:40)",
        "Chapter 3, 0:50, Third (0:40)",
        "Chapter 4, 1:30, Last (0:10)",
      ],
    );
  });

  it("drops a marker at or past the duration", () => {
    const { audio, markers } = load();
    withDuration(audio, 90);
    expect(markers()).toHaveLength(3);
  });

  it("renders no markers with no chapter list, an unknown duration, or the setting off", () => {
    const noList = load(
      true,
      baseEpisode({ description: "<p>No timestamps</p>" }),
    );
    withDuration(noList.audio, 100);
    expect(noList.markers()).toHaveLength(0);
    expect(noList.label()?.hidden).toBe(true);

    const unknown = load();
    expect(unknown.markers()).toHaveLength(0);

    const off = load(false);
    withDuration(off.audio, 100);
    expect(off.markers()).toHaveLength(0);
    expect(off.label()?.hidden).toBe(true);
  });

  it("seeks exactly to the chapter on activation and leaves play/pause untouched", () => {
    const { audio, markers } = load();
    withDuration(audio, 100);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const marker = markers()[2];

    marker.click();

    expect(audio.currentTime).toBe(50);
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("does not start a bar drag from a mousedown on a marker", () => {
    const { container, audio, markers } = load();
    withDuration(audio, 100);
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

    markers()[1].dispatchEvent(
      new MouseEvent("mousedown", { clientX: 160, bubbles: true }),
    );
    activeWindow.dispatchEvent(new MouseEvent("mousemove", { clientX: 160 }));

    expect(audio.currentTime).toBe(0);
  });

  it("shows start time, title and chapter length in the hover preview", () => {
    const { container, audio, markers } = load();
    withDuration(audio, 100);
    const preview = previewOf(container);
    expect(preview.hidden).toBe(true);

    hover(markers()[1]);

    expect(preview.hidden).toBe(false);
    expect(preview.textContent).toBe("0:10 — Second (0:40)");
    expect(preview.getAttribute("role")).toBe("tooltip");
  });

  it("shows the preview on keyboard focus and hides it on blur", () => {
    const { container, audio, markers } = load();
    withDuration(audio, 100);
    const marker = markers()[0];
    marker.dispatchEvent(new FocusEvent("focus"));
    expect(previewOf(container).hidden).toBe(false);
    marker.dispatchEvent(new FocusEvent("blur"));
    expect(previewOf(container).hidden).toBe(true);
  });

  it("seeks to the nearest tick when dense markers overlap", () => {
    const { container, audio, markers } = load();
    withDuration(audio, 100);
    const layer = container.querySelector<HTMLElement>(
      ".seek-bar-marker-layer",
    )!;
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 32,
      width: 200,
      height: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // 98 px is 49 s: nearer the 50 s marker than the 10 s one whose button
    // painted first and would otherwise win the click. detail 1 marks a real
    // pointer click; a keyboard activation carries detail 0.
    markers()[1].dispatchEvent(
      new MouseEvent("click", { clientX: 98, detail: 1, bubbles: true }),
    );

    expect(audio.currentTime).toBe(50);
  });

  it("seeks to the focused chapter on keyboard activation at a real layout width", () => {
    const { container, audio, markers } = load();
    withDuration(audio, 100);
    const layer = container.querySelector<HTMLElement>(
      ".seek-bar-marker-layer",
    )!;
    // jsdom has no layout, and nearestMarker() falls back to the clicked
    // marker when the layer has no width, which would hide this defect.
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 32,
      width: 200,
      height: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // Enter and Space on a focused button dispatch a click with no pointer
    // coordinates and detail 0. Chapter 1 sits at 0 s, so any nearest-tick
    // resolution of clientX 0 would seek there instead of to chapter 3.
    const focused = markers()[2];
    focused.focus();
    focused.click();

    expect(audio.currentTime).toBe(50);
  });

  it("shows the preview briefly after activating a marker", () => {
    vi.useFakeTimers();
    try {
      const { container, audio, markers } = load();
      withDuration(audio, 100);
      const preview = previewOf(container);

      markers()[0].click();
      expect(preview.hidden).toBe(false);

      vi.advanceTimersByTime(1500);
      expect(preview.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("labels the first chapter while the playhead is before it", () => {
    const { audio, label } = load(
      true,
      baseEpisode({
        description: "(00:15) First\n(00:30) Second\n(00:45) Third",
      }),
    );
    withDuration(audio, 100);

    expect(label()?.hidden).toBe(false);
    expect(label()?.textContent).toBe("First");
  });

  it("renders HTML in a title as text, never as markup", () => {
    const { container, audio, markers } = load(
      true,
      baseEpisode({
        description:
          "<p>(00:00) <b>Intro</b> &amp; welcome</p><p>(00:10) Two</p><p>(00:20) Three</p>",
      }),
    );
    withDuration(audio, 100);
    const marker = markers()[0];
    expect(marker.querySelector("b")).toBeNull();
    hover(marker);
    expect(previewOf(container).textContent).toContain("Intro & welcome");
    expect(previewOf(container).querySelector("b")).toBeNull();
  });

  it("shortens a sentence-length title in the preview and label but keeps the full accessible name", () => {
    const longTitle = "A very long chapter sentence ".repeat(8).trim();
    const { container, audio, markers, label } = load(
      true,
      baseEpisode({
        description: `<p>(00:00) ${longTitle}</p><p>(00:10) Two</p><p>(00:20) Three</p>`,
      }),
    );
    withDuration(audio, 100);

    const marker = markers()[0];
    expect(marker.getAttribute("aria-label")).toContain(longTitle);
    hover(marker);
    expect(previewOf(container).textContent).toContain("…");
    expect(label()?.textContent).toContain("…");
    expect(label()?.textContent?.length).toBeLessThan(longTitle.length);
  });

  it("labels the chapter containing the playhead and updates across boundaries", () => {
    const { container, audio, label } = load();
    withDuration(audio, 100);
    const progressArea = container.querySelector<HTMLElement>(
      ".podcast-progress-area",
    )!;

    expect(label()?.hidden).toBe(false);
    expect(label()?.textContent).toBe("Intro");
    expect(progressArea.getAttribute("aria-label")).toBe("Intro");

    audio.currentTime = 11;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(label()?.textContent).toBe("Second");
    expect(progressArea.getAttribute("aria-label")).toBe("Second");

    audio.currentTime = 95;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(label()?.textContent).toBe("Last");
  });

  it("dims a marker the playhead has passed and keeps it clickable", () => {
    const { audio, markers } = load();
    withDuration(audio, 100);
    const [, second, third] = markers();

    audio.currentTime = 25;
    audio.dispatchEvent(new Event("timeupdate"));

    expect(markers()[0].classList.contains("is-passed")).toBe(true);
    expect(second.classList.contains("is-passed")).toBe(true);
    expect(third.classList.contains("is-passed")).toBe(false);

    third.click();
    expect(audio.currentTime).toBe(50);
  });

  it("removes and restores markers from the setting without recreating audio", () => {
    const { container, player, audio, markers } = load();
    withDuration(audio, 100);
    expect(markers()).toHaveLength(4);

    player.setChapterMarkersEnabled(false);
    expect(markers()).toHaveLength(0);
    expect(
      container.querySelector<HTMLElement>(".podcast-chapter-label")?.hidden,
    ).toBe(true);

    player.setChapterMarkersEnabled(true);
    expect(markers()).toHaveLength(4);
    expect(container.querySelector<HTMLAudioElement>("audio")).toBe(audio);
  });

  it("replaces the previous episode's markers and label on load", () => {
    const { container, player, audio, markers, label } = load();
    withDuration(audio, 100);
    expect(markers()).toHaveLength(4);

    const next = baseEpisode({
      guid: "guid-ep2",
      title: "Ep 2",
      description: "(00:00) New intro\n(00:20) New middle\n(00:40) New end",
    });
    player.loadEpisode(next, [next]);
    const nextAudio = (player as unknown as PlayerInternals).audioElement;
    withDuration(nextAudio, 100);

    expect(markers()).toHaveLength(3);
    expect(
      Array.from(container.querySelectorAll(".podcast-chapter-label")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["New intro"]);
    expect(label()?.textContent).toBe("New intro");
  });

  it("writes nothing about chapters to the episode", () => {
    const item = baseEpisode();
    const before = JSON.stringify(item);
    const { player } = load(true, item);
    player.setChapterMarkersEnabled(false);
    player.setChapterMarkersEnabled(true);

    expect("chapters" in item).toBe(false);
    expect(JSON.stringify(item)).toBe(before);
  });
});
