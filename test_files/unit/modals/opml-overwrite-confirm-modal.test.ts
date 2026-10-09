import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { OpmlOverwriteConfirmModal } from "../../../src/modals/opml-overwrite-confirm-modal";

describe("OpmlOverwriteConfirmModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    document.body.empty();
  });

  function open() {
    const onExport = vi.fn();
    const onConfirm = vi.fn();
    new OpmlOverwriteConfirmModal(new App(), { onExport, onConfirm }).open();
    return { onExport, onConfirm };
  }

  const clickButton = (label: string) =>
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === label)!
      .click();

  it("opens inside a modal container carrying its own dialog class", () => {
    open();

    const dialog = document.querySelector(".rss-dashboard-confirm-modal");
    expect(dialog).not.toBeNull();
    expect(dialog?.closest(".modal-container")).not.toBeNull();
    expect(dialog?.textContent).toContain("Replace all feeds");
  });

  it("closes on Cancel without exporting or confirming", () => {
    const { onExport, onConfirm } = open();

    clickButton("Cancel");

    expect(document.querySelector(".rss-dashboard-confirm-modal")).toBeNull();
    expect(onExport).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("exports without closing the dialog", () => {
    const { onExport, onConfirm } = open();

    clickButton("Export OPML");

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      document.querySelector(".rss-dashboard-confirm-modal"),
    ).not.toBeNull();
  });

  it("runs the confirm callback once, then closes", () => {
    const { onConfirm } = open();
    onConfirm.mockImplementation(() => {
      // The dialog is still open while the confirm callback runs.
      expect(
        document.querySelector(".rss-dashboard-confirm-modal"),
      ).not.toBeNull();
    });

    clickButton("Replace feeds");

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".rss-dashboard-confirm-modal")).toBeNull();
  });
});
