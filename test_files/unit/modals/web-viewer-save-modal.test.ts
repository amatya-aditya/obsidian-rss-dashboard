import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { WebViewerSaveModal } from "../../../src/modals/web-viewer-save-modal";

describe("WebViewerSaveModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  function open(onSave = vi.fn().mockResolvedValue(undefined)) {
    new WebViewerSaveModal(new App(), {
      defaultFolder: "RSS articles/",
      defaultTemplate: "# {{title}}",
      includeFrontmatter: true,
      onSave,
    }).open();
    return onSave;
  }

  const clickButton = (label: string) =>
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === label)!
      .click();

  it("opens inside a modal container carrying its own dialog class", () => {
    open();

    const dialog = document.querySelector(
      ".rss-dashboard-web-viewer-save-modal",
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.closest(".modal-container")).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('input[type="text"]')?.value,
    ).toBe("RSS articles/");
    expect(
      document.querySelector<HTMLInputElement>("#include-frontmatter")?.checked,
    ).toBe(true);
  });

  it("closes on Cancel without calling the save callback", () => {
    const onSave = open();

    clickButton("Cancel");

    expect(
      document.querySelector(".rss-dashboard-web-viewer-save-modal"),
    ).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls the save callback once with the form values, then closes", async () => {
    const onSave = open();

    document.querySelector<HTMLInputElement>('input[type="text"]')!.value =
      " Notes ";
    clickButton("Save");

    await vi.waitFor(() => {
      expect(
        document.querySelector(".rss-dashboard-web-viewer-save-modal"),
      ).toBeNull();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("Notes", "# {{title}}", true);
  });

  it("stays open and shows a Notice when saving fails", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    open(vi.fn().mockRejectedValue(new Error("disk full")));

    clickButton("Save");

    await vi.waitFor(() => {
      expect(debugSpy).toHaveBeenCalledWith(
        "[Stub Notice]",
        "Error saving article: disk full",
      );
    });
    expect(
      document.querySelector(".rss-dashboard-web-viewer-save-modal"),
    ).not.toBeNull();
  });
});
