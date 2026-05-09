import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { AddFeedModal } from "../../../src/modals/feed-manager/add-feed-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type MockApp = ReturnType<
  (typeof obsidian.App & { createMock(): unknown })["createMock"]
>;

function createMockApp(): MockApp {
  return (
    obsidian.App as typeof obsidian.App & { createMock(): MockApp }
  ).createMock();
}

type OnAddFn = AddFeedModal["onAdd"];

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const settingEls = Array.from(containerEl.querySelectorAll(".setting-item"));
  const match = settingEls.find((el) => {
    const nameEl = el.querySelector(".setting-item-name");
    return nameEl?.textContent === name;
  });
  if (!match) {
    throw new Error(`Setting not found: ${name}`);
  }
  return match as HTMLElement;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getSelectBySettingName(
  containerEl: HTMLElement,
  name: string,
): HTMLSelectElement {
  const settingEl = getSettingByName(containerEl, name);
  const selectEl = settingEl.querySelector("select");
  if (!(selectEl instanceof HTMLSelectElement)) {
    throw new Error(`Select not found for setting: ${name}`);
  }
  return selectEl;
}

function getButtonByText(
  containerEl: HTMLElement,
  label: string,
): HTMLButtonElement {
  const buttonEl = Array.from(containerEl.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
  if (!(buttonEl instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return buttonEl;
}

function getToggleBySettingName(
  containerEl: HTMLElement,
  name: string,
): HTMLInputElement {
  const settingEl = getSettingByName(containerEl, name);
  const toggleEl = settingEl.querySelector('input[type="checkbox"]');
  if (!(toggleEl instanceof HTMLInputElement)) {
    throw new Error(`Toggle not found for setting: ${name}`);
  }
  return toggleEl;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", {
    value: 1400,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe("AddFeedModal", () => {
  it("submits an explicit Off auto-refresh override as -1", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    const modal = new AddFeedModal(app as any, [], onAdd as any, onSave as any);
    modal.open();

    const urlSetting = getSettingByName(modal.contentEl, "Feed URL");
    const urlInput = urlSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    urlInput.value = "https://example.com/feed.xml";
    urlInput.dispatchEvent(new Event("input"));

    const titleSetting = getSettingByName(modal.contentEl, "Title");
    const titleInput = titleSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    titleInput.value = "My feed";
    titleInput.dispatchEvent(new Event("input"));

    const scanIntervalSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto-refresh interval",
    );
    expect(
      Array.from(scanIntervalSelect.options).map((option) => option.text),
    ).toEqual(expect.arrayContaining(["Use global setting", "Off"]));

    scanIntervalSelect.value = "-1";
    scanIntervalSelect.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect((onAdd as ReturnType<typeof vi.fn>).mock.calls[0]?.[5]).toBe(-1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("submits the inherited auto-refresh setting as 0", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    const modal = new AddFeedModal(app as any, [], onAdd as any, onSave as any);
    modal.open();

    const urlSetting = getSettingByName(modal.contentEl, "Feed URL");
    const urlInput = urlSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    urlInput.value = "https://example.com/feed.xml";
    urlInput.dispatchEvent(new Event("input"));

    const titleSetting = getSettingByName(modal.contentEl, "Title");
    const titleInput = titleSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    titleInput.value = "My feed";
    titleInput.dispatchEvent(new Event("input"));

    const scanIntervalSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto-refresh interval",
    );
    scanIntervalSelect.value = "0";
    scanIntervalSelect.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect((onAdd as ReturnType<typeof vi.fn>).mock.calls[0]?.[5]).toBe(0);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("submits exclude-from-refresh when enabled", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    const modal = new AddFeedModal(app as any, [], onAdd as any, onSave as any);
    modal.open();

    const urlSetting = getSettingByName(modal.contentEl, "Feed URL");
    const urlInput = urlSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    urlInput.value = "https://example.com/feed.xml";
    urlInput.dispatchEvent(new Event("input"));

    const titleSetting = getSettingByName(modal.contentEl, "Title");
    const titleInput = titleSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    titleInput.value = "My feed";
    titleInput.dispatchEvent(new Event("input"));

    const excludeToggle = getToggleBySettingName(
      modal.contentEl,
      "Exclude from refresh",
    );
    excludeToggle.checked = true;
    excludeToggle.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect((onAdd as ReturnType<typeof vi.fn>).mock.calls[0]?.[8]).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("validates required fields and does not call onAdd when URL is empty", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const modal = new AddFeedModal(app as any, [], onAdd as any, onSave as any);
    modal.open();

    const titleSetting = getSettingByName(modal.contentEl, "Title");
    const titleInput = titleSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    titleInput.value = "My feed";
    titleInput.dispatchEvent(new Event("input"));

    const saveBtn = getButtonByText(modal.contentEl, "Save");
    saveBtn.click();
    await flushPromises();

    expect(onAdd).toHaveBeenCalledTimes(0);
    expect(onSave).toHaveBeenCalledTimes(0);
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Feed URL cannot be empty",
    );
  });

  it("does not close or call onSave when onAdd returns false (e.g., duplicate URL)", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => false);
    const onSave = vi.fn();

    const modal = new AddFeedModal(app as any, [], onAdd as any, onSave as any);
    const closeSpy = vi.spyOn(modal, "close");
    modal.open();

    const urlSetting = getSettingByName(modal.contentEl, "Feed URL");
    const urlInput = urlSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    urlInput.value = "https://example.com/feed.xml";
    urlInput.dispatchEvent(new Event("input"));

    const titleSetting = getSettingByName(modal.contentEl, "Title");
    const titleInput = titleSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    titleInput.value = "My feed";
    titleInput.dispatchEvent(new Event("input"));

    const saveBtn = getButtonByText(modal.contentEl, "Save");
    saveBtn.click();
    await flushPromises();

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(0);
    expect(closeSpy).toHaveBeenCalledTimes(0);
  });
});
