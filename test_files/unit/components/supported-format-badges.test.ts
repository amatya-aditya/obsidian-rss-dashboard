import { describe, it, expect, beforeEach } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { renderSupportedFormatBadges } from "../../../src/modals/feed-manager/supported-format-badges";

describe("renderSupportedFormatBadges()", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("renders RSS, Podcast, and YouTube badges with Lucide icons", () => {
    const host = document.body.createDiv();
    renderSupportedFormatBadges(host);

    const rssBadge = host.querySelector<HTMLElement>(".format-badge.rss");
    const podcastBadge =
      host.querySelector<HTMLElement>(".format-badge.podcast");
    const youtubeBadge =
      host.querySelector<HTMLElement>(".format-badge.youtube");

    expect(rssBadge?.textContent).toContain("RSS");
    expect(podcastBadge?.textContent).toContain("Apple Podcasts");
    expect(youtubeBadge?.textContent).toContain("YouTube");

    expect(rssBadge?.querySelector("[data-icon='rss']")).toBeTruthy();
    expect(podcastBadge?.querySelector("[data-icon='headphones']")).toBeTruthy();
    expect(youtubeBadge?.querySelector("[data-icon='youtube']")).toBeTruthy();
  });

  it("toggles active badge state", () => {
    const host = document.body.createDiv();
    const { setActiveBadge } = renderSupportedFormatBadges(host);

    setActiveBadge("podcast");
    expect(host.querySelector(".format-badge.podcast")?.classList.contains("active")).toBe(true);
    expect(host.querySelector(".format-badge.rss")?.classList.contains("active")).toBe(false);
    expect(host.querySelector(".format-badge.youtube")?.classList.contains("active")).toBe(false);
  });
});

