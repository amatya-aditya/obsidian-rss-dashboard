/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  openSettingsOnTop,
  type SettingManager,
} from "../../../src/utils/settings-manager";

// Stands in for Obsidian's internal settings modal: open() mounts its
// container at the end of <body>, close() removes it.
function createSettingsModal(): SettingManager & {
  containerEl: HTMLElement;
  open: Mock<() => void>;
  close: Mock<() => void>;
} {
  const containerEl = createDiv({
    cls: "modal-container mod-settings-container",
  });
  const setting = {
    containerEl,
    open: vi.fn(() => {
      document.body.appendChild(containerEl);
    }),
    close: vi.fn(() => {
      containerEl.remove();
    }),
    openTabById: vi.fn(),
  };
  return setting;
}

function mountOtherModal(): HTMLElement {
  return document.body.createDiv({ cls: "modal-container" });
}

describe("openSettingsOnTop", () => {
  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  it("opens settings when it is not already open", () => {
    const setting = createSettingsModal();

    openSettingsOnTop(setting);

    expect(setting.open).toHaveBeenCalledTimes(1);
    expect(setting.close).not.toHaveBeenCalled();
    expect(document.body.lastElementChild).toBe(setting.containerEl);
  });

  it("raises open settings above a modal that was opened from it", () => {
    const setting = createSettingsModal();
    setting.open();
    // e.g. the starred import modal, launched from a settings tab
    const importModal = mountOtherModal();
    setting.open.mockClear();

    openSettingsOnTop(setting);

    expect(setting.close).toHaveBeenCalledTimes(1);
    expect(setting.open).toHaveBeenCalledTimes(1);
    expect(importModal.isConnected).toBe(true);
    expect(document.body.lastElementChild).toBe(setting.containerEl);
  });

  it("leaves settings in place when it is already the topmost modal", () => {
    const setting = createSettingsModal();
    mountOtherModal();
    setting.open();
    setting.open.mockClear();

    openSettingsOnTop(setting);

    expect(setting.close).not.toHaveBeenCalled();
    expect(setting.open).toHaveBeenCalledTimes(1);
  });
});
