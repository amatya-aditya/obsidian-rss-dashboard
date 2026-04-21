import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAboutTab } from "../../../src/settings/tabs/about-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("renderAboutTab()", () => {
  it("renders name/version and link buttons with safe attrs", () => {
    const containerEl = document.body.createDiv();
    const plugin = {
      manifest: {
        name: "RSS Dashboard",
        version: "9.9.9",
      },
    };

    renderAboutTab(containerEl, plugin as any);

    expect(
      containerEl.querySelector(".rss-dashboard-about-title")?.textContent,
    ).toBe("RSS Dashboard");
    expect(
      containerEl.querySelector(".rss-dashboard-about-version")?.textContent,
    ).toBe("v9.9.9");

    const links = Array.from(
      containerEl.querySelectorAll("a.rss-dashboard-about-btn"),
    );
    expect(links.length).toBeGreaterThanOrEqual(6);

    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
      expect(link.textContent?.length).toBeGreaterThan(0);
    }
  });
});
