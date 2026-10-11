import { describe, it, expect, beforeEach } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { lucideIconId } from "../test-icon-helpers";
import { renderSupportedFormatBadges } from "../../../src/modals/feed-manager/supported-format-badges";

interface ObsidianElement extends HTMLElement {
  createDiv(o?: { cls?: string; text?: string }): HTMLDivElement;
  empty(): void;
}

describe("renderSupportedFormatBadges()", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    (document.body as unknown as ObsidianElement).empty();
  });

  it("renders RSS, Podcast, and YouTube badges (the YouTube icon is missing, see #1015)", () => {
    const host = (document.body as unknown as ObsidianElement).createDiv();
    renderSupportedFormatBadges(host);

    const rssBadge = host.querySelector<HTMLElement>(".format-badge.rss");
    const podcastBadge = host.querySelector<HTMLElement>(
      ".format-badge.podcast",
    );
    const youtubeBadge = host.querySelector<HTMLElement>(
      ".format-badge.youtube",
    );

    expect(rssBadge?.textContent).toContain("RSS");
    expect(podcastBadge?.textContent).toContain("Apple Podcasts");
    expect(youtubeBadge?.textContent).toContain("YouTube");

    expect(lucideIconId(rssBadge)).toBe("rss");
    expect(lucideIconId(podcastBadge)).toBe("headphones");
    // Obsidian 1.14.4 ships no "youtube" icon, so setIcon leaves the badge's
    // icon slot empty. BUG: pinned, see #1015.
    expect(lucideIconId(youtubeBadge)).toBeNull();
  });

  it("toggles active badge state", () => {
    const host = (document.body as unknown as ObsidianElement).createDiv();
    const { setActiveBadge } = renderSupportedFormatBadges(host);

    setActiveBadge("podcast");
    expect(
      host.querySelector(".format-badge.podcast")?.classList.contains("active"),
    ).toBe(true);
    expect(
      host.querySelector(".format-badge.rss")?.classList.contains("active"),
    ).toBe(false);
    expect(
      host.querySelector(".format-badge.youtube")?.classList.contains("active"),
    ).toBe(false);
  });
});
