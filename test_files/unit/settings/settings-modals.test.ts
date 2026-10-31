import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  ApplyMaxItemsToExistingFeedsModal,
  ApplyTagDefaultsModal,
  ConfirmActionModal,
  ConfirmDeleteModal,
  HighlightWordEditModal,
  RetentionChangeConfirmModal,
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
    const cancelBtn = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Cancel") as HTMLButtonElement;
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
    const cancelBtn = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Cancel") as HTMLButtonElement;
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
    const deleteBtn = Array.from(
      modal1.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Delete") as HTMLButtonElement;
    deleteBtn.click();
    await expect(p1).resolves.toBe(true);

    const modal2 = new ConfirmDeleteModal(app, "abc");
    const p2 = modal2.waitForClose();
    modal2.open();
    const cancelBtn = Array.from(
      modal2.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    cancelBtn.click();
    await expect(p2).resolves.toBe(false);
  });
});

describe("ApplyTagDefaultsModal", () => {
  const open = () => {
    const modal = new ApplyTagDefaultsModal(obsidian.App.createMock(), {
      renderPreview: (previewEl) => {
        previewEl.createSpan({ text: "Now / After" });
      },
    });
    const result = modal.waitForClose();
    modal.open();
    return { modal, result };
  };
  const click = (modal: ApplyTagDefaultsModal, label: string) =>
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((button) => button.textContent === label)!
      .click();

  it("offers Cancel, Future tags only and All tags with the caller's preview", () => {
    const { modal } = open();

    expect(
      Array.from(modal.contentEl.querySelectorAll("button")).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Cancel", "Future tags only", "All tags"]);
    expect(
      modal.contentEl.querySelector(".rss-dashboard-confirm-preview")
        ?.textContent,
    ).toBe("Now / After");
  });

  it.each([
    ["Cancel", "cancel"],
    ["Future tags only", "future"],
    ["All tags", "all"],
  ])("resolves %s as %s", async (label, expected) => {
    const { modal, result } = open();

    click(modal, label);

    await expect(result).resolves.toBe(expected);
  });

  it("treats closing the dialog any other way as cancel", async () => {
    const { modal, result } = open();

    modal.close();

    await expect(result).resolves.toBe("cancel");
  });
});

describe("ConfirmActionModal", () => {
  const options = {
    title: "Delete this template?",
    message: "It will be removed from the list.",
    confirmLabel: "Delete",
  };

  it("renders the given title and marks the confirming button destructive", () => {
    const modal = new ConfirmActionModal(obsidian.App.createMock(), options);
    modal.open();

    expect(modal.contentEl.textContent).toContain("Delete this template?");
    expect(modal.contentEl.textContent).toContain(
      "It will be removed from the list.",
    );
    const confirmBtn = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Delete") as HTMLButtonElement;
    expect(confirmBtn.classList.contains("mod-destructive")).toBe(true);
  });

  it("renders a caller-supplied preview between the message and the buttons", () => {
    const modal = new ConfirmActionModal(obsidian.App.createMock(), {
      ...options,
      renderPreview: (previewEl) => {
        previewEl.createSpan({ cls: "sample-preview", text: "Before / after" });
      },
    });
    modal.open();

    const children = Array.from(modal.contentEl.children);
    const previewIndex = children.findIndex((el) =>
      el.classList.contains("rss-dashboard-confirm-preview"),
    );
    expect(previewIndex).toBeGreaterThan(
      children.findIndex((el) => el.tagName === "P"),
    );
    expect(previewIndex).toBeLessThan(
      children.findIndex((el) => el.querySelector("button")),
    );
    expect(children[previewIndex]?.textContent).toBe("Before / after");
  });

  it("adds no preview block when none is supplied", () => {
    const modal = new ConfirmActionModal(obsidian.App.createMock(), options);
    modal.open();

    expect(
      modal.contentEl.querySelector(".rss-dashboard-confirm-preview"),
    ).toBeNull();
  });

  it("resolves true when the confirming button is clicked", async () => {
    const modal = new ConfirmActionModal(obsidian.App.createMock(), options);
    const resultPromise = modal.waitForClose();
    modal.open();

    const confirmBtn = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Delete") as HTMLButtonElement;
    confirmBtn.click();

    await expect(resultPromise).resolves.toBe(true);
  });

  it("resolves false when Cancel is clicked", async () => {
    const modal = new ConfirmActionModal(obsidian.App.createMock(), options);
    const resultPromise = modal.waitForClose();
    modal.open();

    const cancelBtn = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    cancelBtn.click();

    await expect(resultPromise).resolves.toBe(false);
  });

  it("resolves false when closed without choosing", async () => {
    const modal = new ConfirmActionModal(obsidian.App.createMock(), options);
    const resultPromise = modal.waitForClose();
    modal.open();

    modal.close();

    await expect(resultPromise).resolves.toBe(false);
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
    expect(
      modal.modalEl.classList.contains("rss-dashboard-modal-container"),
    ).toBe(true);
    expect(
      modal.modalEl.classList.contains("rss-mobile-apply-max-items-modal"),
    ).toBe(true);
    expect(modal.contentEl.textContent).toContain("refresh all feeds");

    const buttonContainer = modal.contentEl.querySelector(
      ".rss-max-items-apply-buttons",
    ) as HTMLDivElement;
    expect(buttonContainer.style.getPropertyValue("flex-direction")).toBe(
      "column",
    );
    expect(buttonContainer.style.getPropertyValue("align-items")).toBe(
      "stretch",
    );

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

    const cancelBtn = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    cancelBtn.click();

    await expect(resultPromise).resolves.toBe("cancel");
  });
});

describe("RetentionChangeConfirmModal", () => {
  it("warns about permanent removal and resolves Apply now", async () => {
    const modal = new RetentionChangeConfirmModal(obsidian.App.createMock());
    const resultPromise = modal.waitForClose();

    modal.open();

    expect(modal.contentEl.textContent).toContain("permanently removed");
    expect(
      Array.from(modal.contentEl.querySelectorAll("button")).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Cancel", "Apply on next refresh", "Apply now"]);

    const applyNowButton = Array.from(
      modal.contentEl.querySelectorAll("button"),
    ).find((button) => button.textContent === "Apply now") as HTMLButtonElement;
    applyNowButton.click();

    await expect(resultPromise).resolves.toBe("apply-now");
  });

  it("resolves deferred application and escape as cancel", async () => {
    const deferredModal = new RetentionChangeConfirmModal(
      obsidian.App.createMock(),
    );
    const deferredResult = deferredModal.waitForClose();
    deferredModal.open();
    const deferredButton = Array.from(
      deferredModal.contentEl.querySelectorAll("button"),
    ).find(
      (button) => button.textContent === "Apply on next refresh",
    ) as HTMLButtonElement;
    deferredButton.click();
    await expect(deferredResult).resolves.toBe("apply-on-next-refresh");

    const cancelledModal = new RetentionChangeConfirmModal(
      obsidian.App.createMock(),
    );
    const cancelledResult = cancelledModal.waitForClose();
    cancelledModal.open();
    cancelledModal.close();
    await expect(cancelledResult).resolves.toBe("cancel");
  });
});
