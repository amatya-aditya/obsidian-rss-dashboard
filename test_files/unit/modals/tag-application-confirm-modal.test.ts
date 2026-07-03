import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { TagApplicationConfirmModal } from "../../../src/modals/feed-manager/tag-application-confirm-modal";

describe("TagApplicationConfirmModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  function createMockApp(): App {
    return {} as unknown as App;
  }

  it("renders heading, description, warning text, and action buttons", () => {
    const app = createMockApp();
    const modal = new TagApplicationConfirmModal(app);
    modal.open();

    const textContent = modal.contentEl.textContent ?? "";
    expect(textContent).toContain("Update feed tags");
    expect(textContent).toContain(
      "How would you like to apply these tag changes?",
    );
    expect(textContent).toContain(
      "This will remove the selected tag names from all existing articles in this feed, including tags added manually or by other auto-tag rules.",
    );

    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    expect(buttons).toHaveLength(3);
    const buttonLabels = buttons.map((b) => b.textContent?.trim());
    expect(buttonLabels).toContain("Apply to existing");
    expect(buttonLabels).toContain("Future only");
    expect(buttonLabels).toContain("Cancel");
  });

  it("resolves to 'apply_existing' when confirmed retroactively", async () => {
    const app = createMockApp();
    const modal = new TagApplicationConfirmModal(app);
    modal.open();

    const promise = modal.waitForClose();
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    const applyBtn = buttons.find(
      (b) => b.textContent?.trim() === "Apply to existing",
    );
    expect(applyBtn).toBeDefined();
    applyBtn?.click();

    const result = await promise;
    expect(result).toBe("apply_existing");
  });

  it("resolves to 'future_only' when user selects future updates only", async () => {
    const app = createMockApp();
    const modal = new TagApplicationConfirmModal(app);
    modal.open();

    const promise = modal.waitForClose();
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    const futureBtn = buttons.find(
      (b) => b.textContent?.trim() === "Future only",
    );
    expect(futureBtn).toBeDefined();
    futureBtn?.click();

    const result = await promise;
    expect(result).toBe("future_only");
  });

  it("resolves to 'cancel_save' when cancel is clicked", async () => {
    const app = createMockApp();
    const modal = new TagApplicationConfirmModal(app);
    modal.open();

    const promise = modal.waitForClose();
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    const cancelBtn = buttons.find((b) => b.textContent?.trim() === "Cancel");
    expect(cancelBtn).toBeDefined();
    cancelBtn?.click();

    const result = await promise;
    expect(result).toBe("cancel_save");
  });

  it("resolves to 'cancel_save' when closed directly via Escape/backdrop", async () => {
    const app = createMockApp();
    const modal = new TagApplicationConfirmModal(app);
    modal.open();

    const promise = modal.waitForClose();
    modal.close(); // simulate close

    const result = await promise;
    expect(result).toBe("cancel_save");
  });
});
