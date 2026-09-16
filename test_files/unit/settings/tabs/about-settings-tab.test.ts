import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { renderAboutTab } from "../../../../src/settings/tabs/about-settings-tab";
import { WhatsNewModal } from "../../../../src/modals/whats-new-modal";
import type RssDashboardPlugin from "../../../../main";
import { installObsidianDomPolyfills } from "../../test-dom-polyfills";

vi.mock("../../../../src/generated/whats-new-content", () => ({
  WHATS_NEW_VERSION: "2.7.0",
  WHATS_NEW_FEATURES: ["Add a What's New popup"],
}));

function createPlugin(version = "2.7.0"): RssDashboardPlugin {
  return {
    app: new obsidian.App(),
    manifest: { name: "RSS Dashboard", version },
  } as unknown as RssDashboardPlugin;
}

function findWhatsNewButton(containerEl: HTMLElement): HTMLElement | undefined {
  return Array.from(containerEl.querySelectorAll("button")).find((el) =>
    el.textContent?.includes("What's new"),
  );
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderAboutTab", () => {
  it("shows a 'What's new' link when the running version has embedded features", () => {
    const containerEl = document.body.createDiv();
    renderAboutTab(containerEl, createPlugin("2.7.0"));

    expect(findWhatsNewButton(containerEl)).toBeDefined();
  });

  it("omits the link when the running version has no embedded features", () => {
    const containerEl = document.body.createDiv();
    renderAboutTab(containerEl, createPlugin("2.8.0"));

    expect(findWhatsNewButton(containerEl)).toBeUndefined();
  });

  it("opens the WhatsNewModal when clicked", () => {
    const openSpy = vi
      .spyOn(WhatsNewModal.prototype, "open")
      .mockImplementation(() => {});
    const containerEl = document.body.createDiv();
    renderAboutTab(containerEl, createPlugin("2.7.0"));

    findWhatsNewButton(containerEl)?.click();

    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
