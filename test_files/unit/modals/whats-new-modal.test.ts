import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const lightbox = vi.hoisted(() => ({
  open: vi.fn(),
  calls: [] as unknown[],
}));

vi.mock("../../../src/components/reader-lightbox", () => ({
  ReaderLightbox: class {
    constructor(options: unknown) {
      lightbox.calls.push(options);
    }
    open = lightbox.open;
  },
}));

import { WhatsNewModal } from "../../../src/modals/whats-new-modal";

const NOTE = [
  "# RSS Dashboard 2.7.0",
  "",
  "A short summary of the release.",
  "",
  "## A headline feature",
  "",
  "![Release screenshot](https://example.com/shot.png)",
  "",
  "## Also improved",
  "",
  "- One thing",
  "- Another thing",
].join("\n");

async function openModal(note = NOTE): Promise<WhatsNewModal> {
  const modal = new WhatsNewModal(new obsidian.App(), "2.7.0", note);
  modal.open();
  await vi.waitFor(() => {
    expect(
      modal.contentEl
        .querySelector("img")
        ?.classList.contains("rss-dashboard-whats-new-image"),
    ).toBe(true);
  });
  return modal;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  lightbox.open.mockClear();
  lightbox.calls.length = 0;
});

describe("WhatsNewModal", () => {
  it("renders the note's heading, summary, sections, and list", async () => {
    const modal = await openModal();

    expect(modal.contentEl.querySelector("h1")?.textContent).toBe(
      "RSS Dashboard 2.7.0",
    );
    expect(modal.contentEl.textContent).toContain(
      "A short summary of the release.",
    );
    expect(
      Array.from(modal.contentEl.querySelectorAll("h2")).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["A headline feature", "Also improved"]);
    expect(
      Array.from(modal.contentEl.querySelectorAll("li")).map(
        (item) => item.textContent,
      ),
    ).toEqual(["One thing", "Another thing"]);
  });

  it("renders the image with its alt text, HTTPS source, and screenshot frame", async () => {
    const modal = await openModal();
    const img = modal.contentEl.querySelector("img");

    expect(img?.getAttribute("src")).toBe("https://example.com/shot.png");
    expect(img?.getAttribute("alt")).toBe("Release screenshot");
    expect(img?.classList.contains("rss-dashboard-whats-new-image")).toBe(true);
  });

  it("opens the reader lightbox against the modal's own document when clicked", async () => {
    const modal = await openModal();

    modal.contentEl
      .querySelector("img")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(lightbox.open).toHaveBeenCalledTimes(1);
    expect(lightbox.calls[0]).toMatchObject({
      doc: modal.contentEl.ownerDocument,
      source: {
        previewUrl: "https://example.com/shot.png",
        fullUrl: "https://example.com/shot.png",
        altText: "Release screenshot",
      },
    });
  });

  it("removes an image that fails to load and leaves the text intact", async () => {
    const modal = await openModal();

    modal.contentEl.querySelector("img")?.dispatchEvent(new Event("error"));

    expect(modal.contentEl.querySelector("img")).toBeNull();
    expect(modal.contentEl.textContent).toContain(
      "A short summary of the release.",
    );
    expect(modal.contentEl.textContent).toContain("One thing");
  });

  it("links to the full changelog in a new tab", async () => {
    const modal = await openModal();
    const link = modal.contentEl.querySelector("a");

    expect(link?.getAttribute("href")).toBe(
      "https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/CHANGELOG.md",
    );
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");
  });

  it("closes when 'Got it' is clicked", async () => {
    const modal = await openModal();
    const closeSpy = vi.spyOn(modal, "close");

    const button = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (el) => el.textContent?.includes("Got it"),
    );
    button?.click();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
