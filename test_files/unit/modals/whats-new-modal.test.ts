import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { WhatsNewModal } from "../../../src/modals/whats-new-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function openModal(version: string, features: string[]): WhatsNewModal {
  const modal = new WhatsNewModal(new obsidian.App(), version, features);
  modal.open();
  return modal;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("WhatsNewModal", () => {
  it("names the version in the heading", () => {
    const modal = openModal("2.7.0", ["Add a What's New popup"]);

    expect(modal.contentEl.textContent).toContain("2.7.0");
  });

  it("renders one bullet per feature", () => {
    const modal = openModal("2.7.0", ["First feature", "Second feature"]);

    const bullets = Array.from(modal.contentEl.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(bullets).toEqual(["First feature", "Second feature"]);
  });

  it("links to the full changelog on GitHub", () => {
    const modal = openModal("2.7.0", ["A feature"]);

    const link = modal.contentEl.querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/CHANGELOG.md",
    );
    expect(link?.target).toBe("_blank");
  });

  it("closes when 'Got it' is clicked", () => {
    const modal = openModal("2.7.0", ["A feature"]);
    const closeSpy = vi.spyOn(modal, "close");

    const button = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((el) => el.textContent?.includes("Got it"));
    button?.click();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
