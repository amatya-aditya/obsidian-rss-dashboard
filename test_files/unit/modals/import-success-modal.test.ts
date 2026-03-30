import { beforeEach, describe, expect, it } from "vitest";
import * as obsidian from "obsidian";
import { ImportSuccessModal } from "../../../src/modals/import-success-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

describe("ImportSuccessModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("renders a message and closes on OK click", () => {
    const app = obsidian.App.createMock();
    const modal = new ImportSuccessModal(app as any, "All done!");
    modal.open();

    expect(modal.contentEl.textContent).toContain("Import successful");
    expect(modal.contentEl.textContent).toContain("All done!");

    const okButton = modal.contentEl.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement;
    expect(okButton.textContent).toBe("OK");

    okButton.click();
    expect(modal.containerEl.isConnected).toBe(false);
  });
});

