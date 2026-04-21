import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  ApplyMaxItemsToExistingFeedsModal,
  ConfirmDeleteModal,
  HighlightWordEditModal,
  TemplateNameModal,
} from "../../../src/settings/modals/settings-modals";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("TemplateNameModal", () => {
  it("resolves trimmed input when Enter is pressed", async () => {
    const app = obsidian.App.createMock();
    const modal = new TemplateNameModal(app);
    const resultPromise = modal.waitForClose();

    modal.open();
    const input = modal.contentEl.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();

    input.value = "  My template  ";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    await expect(resultPromise).resolves.toBe("My template");
  });

  it("resolves null when Cancel is clicked", async () => {
    const app = obsidian.App.createMock();
    const modal = new TemplateNameModal(app);
    const resultPromise = modal.waitForClose();

    modal.open();
    const cancelBtn = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    ) as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();

    cancelBtn.click();
    await expect(resultPromise).resolves.toBeNull();
  });

  it("resolves null when Save is clicked with empty input", async () => {
    const app = obsidian.App.createMock();
    const modal = new TemplateNameModal(app);
    const resultPromise = modal.waitForClose();

    modal.open();
    const input = modal.contentEl.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    input.value = "   ";

    const saveBtn = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Save",
    ) as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();

    saveBtn.click();
    await expect(resultPromise).resolves.toBeNull();
  });
});

describe("HighlightWordEditModal", () => {
  it("prefills input and resolves edited value on Save", async () => {
    const app = obsidian.App.createMock();
    const modal = new HighlightWordEditModal(app, "initial");
    const resultPromise = modal.waitForClose();

    modal.open();
    const input = modal.contentEl.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("initial");

    input.value = "next";
    const saveBtn = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Save",
    ) as HTMLButtonElement;
    saveBtn.click();

    await expect(resultPromise).resolves.toBe("next");
  });

  it("resolves null on Cancel", async () => {
    const app = obsidian.App.createMock();
    const modal = new HighlightWordEditModal(app, "initial");
    const resultPromise = modal.waitForClose();

    modal.open();
    const cancelBtn = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();

    await expect(resultPromise).resolves.toBeNull();
  });
});

describe("ConfirmDeleteModal", () => {
  it("resolves true when Delete is clicked, false when Cancel is clicked", async () => {
    const app = obsidian.App.createMock();

    const modal1 = new ConfirmDeleteModal(app, "abc");
    const p1 = modal1.waitForClose();
    modal1.open();
    expect(modal1.contentEl.textContent).toContain('"abc"');
    const deleteBtn = Array.from(modal1.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Delete",
    ) as HTMLButtonElement;
    deleteBtn.click();
    await expect(p1).resolves.toBe(true);

    const modal2 = new ConfirmDeleteModal(app, "abc");
    const p2 = modal2.waitForClose();
    modal2.open();
    const cancelBtn = Array.from(modal2.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();
    await expect(p2).resolves.toBe(false);
  });
});

describe("ApplyMaxItemsToExistingFeedsModal", () => {
  it("resolves selected action and applies mobile classes/styles", async () => {
    Object.defineProperty(window, "innerWidth", {
      value: 600,
      configurable: true,
    });

    const app = obsidian.App.createMock();
    const modal = new ApplyMaxItemsToExistingFeedsModal(app, {
      newLimit: 123,
      increased: true,
    });
    const resultPromise = modal.waitForClose();

    modal.open();
    expect(modal.modalEl.classList.contains("rss-dashboard-modal")).toBe(true);
    expect(modal.modalEl.classList.contains("rss-dashboard-modal-container")).toBe(
      true,
    );
    expect(modal.modalEl.classList.contains("rss-mobile-apply-max-items-modal")).toBe(
      true,
    );
    expect(modal.contentEl.textContent).toContain("refresh all feeds");

    const buttonContainer = modal.contentEl.querySelector(
      ".rss-max-items-apply-buttons",
    ) as HTMLDivElement;
    expect(buttonContainer.style.getPropertyValue("flex-direction")).toBe("column");
    expect(buttonContainer.style.getPropertyValue("align-items")).toBe("stretch");

    const applyRefreshBtn = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Apply & refresh all") as HTMLButtonElement;
    expect(applyRefreshBtn).toBeTruthy();
    expect(applyRefreshBtn.style.getPropertyValue("width")).toBe("100%");

    applyRefreshBtn.click();
    await expect(resultPromise).resolves.toBe("apply-refresh");
  });

  it("defaults to cancel when Cancel is clicked", async () => {
    const app = obsidian.App.createMock();
    const modal = new ApplyMaxItemsToExistingFeedsModal(app, {
      newLimit: 10,
      increased: false,
    });
    const resultPromise = modal.waitForClose();

    modal.open();
    expect(modal.contentEl.textContent).not.toContain("refresh all feeds");

    const cancelBtn = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();

    await expect(resultPromise).resolves.toBe("cancel");
  });
});
