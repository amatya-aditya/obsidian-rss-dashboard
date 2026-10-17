import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { EditFeedModal } from "../../../src/modals/feed-manager/edit-feed-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { Feed } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

type MockApp = ReturnType<(typeof obsidian.App)["createMock"]>;

function createMockApp(): MockApp {
  return (
    obsidian.App as typeof obsidian.App & { createMock(): MockApp }
  ).createMock();
}

function openModal(overrides: Partial<Feed> = {}): {
  modal: EditFeedModal;
  feed: Feed;
} {
  const app = createMockApp();
  const feed: Feed = {
    title: "Example feed",
    url: "https://example.com/feed.xml",
    folder: "Tech",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
  const plugin = {
    app,
    settings: {
      feeds: [feed],
      folders: [],
      maxItems: 50,
      corsProxyEnabled: false,
      corsProxyUrl: "",
      articleSaving: { savedTemplates: [] },
    },
    ensureFolderExists: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
    notifyFiltersUpdated: vi.fn(),
  };
  const modal = new EditFeedModal(
    app,
    plugin as unknown as RssDashboardPlugin,
    feed,
    vi.fn(),
  );
  modal.open();
  return { modal, feed };
}

function getRow(modal: EditFeedModal, name: string): HTMLElement {
  const row = Array.from(
    modal.contentEl.querySelectorAll<HTMLElement>(".setting-item"),
  ).find((el) => el.querySelector(".setting-item-name")?.textContent === name);
  if (!row) throw new Error(`Setting not found: ${name}`);
  return row;
}

function getSelect(modal: EditFeedModal, name: string): HTMLSelectElement {
  return getRow(modal, name).querySelector("select") as HTMLSelectElement;
}

function getCustomInput(
  modal: EditFeedModal,
  name: string,
): HTMLInputElement | null {
  return getRow(modal, name).querySelector("input.rss-custom-input");
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", {
    value: 1400,
    configurable: true,
  });
});

describe("EditFeedModal custom number inputs (#1278)", () => {
  it("shows a prefilled input for auto delete and max items that are not presets", () => {
    const { modal } = openModal({
      autoDeleteDuration: 45,
      maxItemsLimit: 75,
    });

    expect(getSelect(modal, "Auto delete articles duration").value).toBe(
      "custom",
    );
    const autoDelete = getCustomInput(modal, "Auto delete articles duration");
    expect(autoDelete?.value).toBe("45");
    expect(autoDelete?.hasClass("visible")).toBe(true);
    const maxItems = getCustomInput(modal, "Max items limit");
    expect(maxItems?.value).toBe("75");
    expect(maxItems?.hasClass("visible")).toBe(true);
  });

  it("prefills the max items input from the current limit when Custom... is picked", () => {
    const { modal } = openModal({ maxItemsLimit: 100 });

    changeSelect(getSelect(modal, "Max items limit"), "custom");

    expect(getCustomInput(modal, "Max items limit")?.value).toBe("100");
  });

  it("saves a negative custom value as 0", async () => {
    const { modal, feed } = openModal({ maxItemsLimit: 100 });
    changeSelect(getSelect(modal, "Max items limit"), "custom");
    const input = getCustomInput(modal, "Max items limit") as HTMLInputElement;
    input.value = "-7";
    input.dispatchEvent(new Event("change"));

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((b) => b.textContent === "Save")
      ?.click();
    await flushPromises();

    expect(feed.maxItemsLimit).toBe(0);
  });
});
