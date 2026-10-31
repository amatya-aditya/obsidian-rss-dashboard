// The native modal close button changed class across Obsidian versions. The
// helper must remove both generations: `.modal-header-button` (1.13.7 and
// 1.14.4) and `.modal-close-button` (observed on 1.8.7, #431).
import { describe, expect, it } from "vitest";
import { removeNativeModalCloseButton } from "../../../src/utils/modal-close-button";

describe("removeNativeModalCloseButton", () => {
  it("removes the 1.13+ close button and keeps the rest of modalEl", () => {
    const modalEl = createDiv();
    modalEl.createDiv({ cls: "modal-header-button mod-raised clickable-icon" });
    const header = modalEl.createDiv({ cls: "modal-header" });
    modalEl.createDiv({ cls: "modal-content" });

    removeNativeModalCloseButton(modalEl);

    expect(modalEl.querySelector(".modal-header-button")).toBeNull();
    expect(modalEl.contains(header)).toBe(true);
    expect(modalEl.querySelector(".modal-content")).not.toBeNull();
  });

  it("removes the legacy close button (.modal-close-button)", () => {
    const modalEl = createDiv();
    modalEl.createDiv({ cls: "modal-close-button" });
    modalEl.createDiv({ cls: "modal-content" });

    removeNativeModalCloseButton(modalEl);

    expect(modalEl.querySelector(".modal-close-button")).toBeNull();
    expect(modalEl.querySelector(".modal-content")).not.toBeNull();
  });
});
