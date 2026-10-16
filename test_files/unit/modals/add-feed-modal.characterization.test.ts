import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { AddFeedModal } from "../../../src/modals/feed-manager/add-feed-modal";
import * as feedPreviewLoader from "../../../src/modals/feed-manager/feed-preview-loader";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Pins AddFeedModal load-state and feed-options behavior ahead of the #1094
// complexity/length split of handleLoadFeed and renderFeedOptionsSection.

type OnAddFn = AddFeedModal["onAdd"];

function createModal(
  onAdd: OnAddFn = vi.fn(async () => true),
  plugin?: unknown,
): AddFeedModal {
  const modal = new AddFeedModal(
    new obsidian.App(),
    [],
    onAdd,
    vi.fn(),
    "",
    plugin as never,
  );
  modal.open();
  return modal;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getSetting(containerEl: HTMLElement, name: string): HTMLElement {
  const match = Array.from(containerEl.querySelectorAll(".setting-item")).find(
    (el) => el.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!match) throw new Error(`Setting not found: ${name}`);
  return match as HTMLElement;
}

function getSelect(containerEl: HTMLElement, name: string): HTMLSelectElement {
  const el = getSetting(containerEl, name).querySelector("select");
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Select not found: ${name}`);
  }
  return el;
}

function getTextInput(
  containerEl: HTMLElement,
  name: string,
): HTMLInputElement {
  const el = getSetting(containerEl, name).querySelector('input[type="text"]');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Text input not found: ${name}`);
  }
  return el;
}

function getButton(containerEl: HTMLElement, label: string): HTMLButtonElement {
  const el = Array.from(containerEl.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return el;
}

function getStatusDiv(modal: AddFeedModal): HTMLElement {
  const el = modal.contentEl.querySelector(".add-feed-status");
  if (!(el instanceof HTMLElement)) throw new Error("Status div not found");
  return el;
}

function getLatestEntryDiv(modal: AddFeedModal): HTMLElement {
  const el = modal.contentEl.querySelector(".add-feed-latest-entry");
  if (!(el instanceof HTMLElement)) throw new Error("Latest entry not found");
  return el;
}

function typeUrl(modal: AddFeedModal, value: string): void {
  const urlInput = getTextInput(modal.contentEl, "Feed URL");
  urlInput.value = value;
  urlInput.dispatchEvent(new Event("input"));
  const titleInput = getTextInput(modal.contentEl, "Title");
  titleInput.value = "Feed";
  titleInput.dispatchEvent(new Event("input"));
}

function getCustomInput(
  modal: AddFeedModal,
  settingName: string,
): HTMLInputElement | null {
  return getSetting(modal.contentEl, settingName).querySelector(
    "input.rss-custom-input",
  );
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function previewResult(
  overrides: Partial<feedPreviewLoader.FeedPreviewLoadResult> = {},
): feedPreviewLoader.FeedPreviewLoadResult {
  return {
    detectedType: "rss",
    inputUrl: "https://example.com/feed.xml",
    finalUrl: "https://example.com/final.xml",
    isMastodonConversion: false,
    title: "Resolved title",
    latestPubDate: undefined,
    hasEntries: true,
    ...overrides,
  } as feedPreviewLoader.FeedPreviewLoadResult;
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

describe("AddFeedModal load state (characterization)", () => {
  it("shows an error status and skips the preview request when the URL is empty", async () => {
    const resolveSpy = vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview");
    const modal = createModal();
    const statusDiv = getStatusDiv(modal);
    statusDiv.addClass("status-ok");
    statusDiv.addClass("status-loading");

    getButton(modal.contentEl, "Load").click();
    await flushPromises();

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(statusDiv.textContent).toBe("❌ Please enter a feed URL");
    expect(statusDiv.hasClass("status-error")).toBe(true);
    expect(statusDiv.hasClass("status-ok")).toBe(false);
    expect(statusDiv.hasClass("status-loading")).toBe(false);
  });

  it("treats a whitespace-only URL as empty", async () => {
    const resolveSpy = vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview");
    const modal = createModal();
    typeUrl(modal, "   ");

    getButton(modal.contentEl, "Load").click();
    await flushPromises();

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(getStatusDiv(modal).textContent).toBe("❌ Please enter a feed URL");
  });

  it("disables the Load button with a loading class while the preview is pending, then restores it", async () => {
    let resolvePreview!: (
      value: feedPreviewLoader.FeedPreviewLoadResult,
    ) => void;
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const modal = createModal();
    typeUrl(modal, "https://example.com/feed.xml");
    const loadBtn = getButton(modal.contentEl, "Load");

    loadBtn.click();
    await flushPromises();

    expect(loadBtn.disabled).toBe(true);
    expect(loadBtn.hasClass("loading")).toBe(true);
    expect(getStatusDiv(modal).textContent).toBe("⏳ Loading...");
    expect(getStatusDiv(modal).hasClass("status-loading")).toBe(true);

    resolvePreview(previewResult());
    await flushPromises();

    expect(loadBtn.disabled).toBe(false);
    expect(loadBtn.hasClass("loading")).toBe(false);
  });

  it("fills URL, title, latest entry and an OK status from a successful preview", async () => {
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
      previewResult({ latestPubDate: "2024-03-05T12:00:00Z" }),
    );
    const modal = createModal();
    typeUrl(modal, "https://example.com/feed.xml");

    getButton(modal.contentEl, "Load").click();
    await flushPromises();

    const urlInput = getTextInput(modal.contentEl, "Feed URL");
    expect(urlInput.value).toBe("https://example.com/final.xml");
    expect(urlInput.hasClass("loaded")).toBe(true);
    expect(getTextInput(modal.contentEl, "Title").value).toBe("Resolved title");
    expect(getLatestEntryDiv(modal).textContent).toBe(
      feedPreviewLoader.formatLatestEntryLabel("2024-03-05T12:00:00Z"),
    );
    const statusDiv = getStatusDiv(modal);
    expect(statusDiv.textContent).toBe("✅ OK");
    expect(statusDiv.hasClass("status-ok")).toBe(true);
    expect(statusDiv.hasClass("status-loading")).toBe(false);
    expect(statusDiv.hasClass("status-error")).toBe(false);
  });

  it("shows the empty-feed warning when the preview has no entries", async () => {
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
      previewResult({ hasEntries: false }),
    );
    const modal = createModal();
    typeUrl(modal, "https://example.com/feed.xml");

    getButton(modal.contentEl, "Load").click();
    await flushPromises();

    const statusDiv = getStatusDiv(modal);
    expect(statusDiv.textContent).toBe(
      "⚠ Feed validation passed, however no content detected.",
    );
    expect(statusDiv.hasClass("rss-dashboard-status-warning")).toBe(true);
    expect(statusDiv.hasClass("status-ok")).toBe(false);
  });

  it("shows the error, resets the latest entry and re-enables Load when the preview fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockRejectedValue(
      new Error("boom"),
    );
    const modal = createModal();
    typeUrl(modal, "https://example.com/feed.xml");
    const loadBtn = getButton(modal.contentEl, "Load");

    loadBtn.click();
    await flushPromises();

    const statusDiv = getStatusDiv(modal);
    expect(statusDiv.textContent).toBe("❌ boom");
    expect(statusDiv.hasClass("status-error")).toBe(true);
    expect(statusDiv.hasClass("status-loading")).toBe(false);
    expect(statusDiv.hasClass("status-ok")).toBe(false);
    expect(getLatestEntryDiv(modal).textContent).toBe("-");
    expect(loadBtn.disabled).toBe(false);
    expect(loadBtn.hasClass("loading")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("stringifies a non-Error rejection in the status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockRejectedValue(
      "plain failure",
    );
    const modal = createModal();
    typeUrl(modal, "https://example.com/feed.xml");

    getButton(modal.contentEl, "Load").click();
    await flushPromises();

    expect(getStatusDiv(modal).textContent).toBe("❌ plain failure");
  });

  it("passes the CORS proxy settings and encoding from the plugin to the preview request", async () => {
    const resolveSpy = vi
      .spyOn(feedPreviewLoader, "resolveAndLoadPreview")
      .mockResolvedValue(previewResult());
    const modal = createModal(
      vi.fn(async () => true),
      {
        settings: {
          corsProxyEnabled: true,
          corsProxyUrl: "https://proxy.test/",
        },
      },
    );
    typeUrl(modal, "https://example.com/feed.xml");

    getButton(modal.contentEl, "Load").click();
    await flushPromises();

    expect(resolveSpy).toHaveBeenCalledWith("https://example.com/feed.xml", {
      corsProxyEnabled: true,
      corsProxyUrl: "https://proxy.test/",
      feedEncoding: "auto",
    });
  });
});

describe("AddFeedModal feed options (characterization)", () => {
  it("renders the option settings in order inside the Feed options details", () => {
    const modal = createModal();

    const details = modal.contentEl.querySelector(
      "details.rss-per-feed-controls-details",
    );
    expect(details?.querySelector("summary")?.textContent).toBe("Feed options");
    const names = Array.from(
      details?.querySelectorAll(".setting-item-name") ?? [],
    ).map((el) => el.textContent);
    expect(names).toEqual([
      "Feed encoding",
      "Auto delete articles duration",
      "Max items limit",
      "Auto-refresh interval",
      "Exclude from refresh",
      "Article template",
      "Custom auto-tags",
    ]);
  });

  it("starts auto delete on 1 month and max items on 50 items by default", () => {
    const modal = createModal();

    expect(
      getSelect(modal.contentEl, "Auto delete articles duration").value,
    ).toBe("30");
    expect(getSelect(modal.contentEl, "Max items limit").value).toBe("50");
    expect(getCustomInput(modal, "Auto delete articles duration")).toBeNull();
    expect(getCustomInput(modal, "Max items limit")).toBeNull();
  });

  it("selects Custom... for plugin defaults that are not presets, and Disabled/Unlimited for 0", () => {
    const custom = createModal(
      vi.fn(async () => true),
      {
        settings: { defaultAutoDeleteDuration: 45, maxItems: 75 },
      },
    );
    expect(
      getSelect(custom.contentEl, "Auto delete articles duration").value,
    ).toBe("custom");
    expect(getSelect(custom.contentEl, "Max items limit").value).toBe("custom");
    custom.close();
    document.body.empty();

    const zero = createModal(
      vi.fn(async () => true),
      {
        settings: { defaultAutoDeleteDuration: 0, maxItems: 0 },
      },
    );
    expect(
      getSelect(zero.contentEl, "Auto delete articles duration").value,
    ).toBe("0");
    expect(getSelect(zero.contentEl, "Max items limit").value).toBe("0");
  });

  it("lists the expected auto delete and max items options", () => {
    const modal = createModal();

    expect(
      Array.from(
        getSelect(modal.contentEl, "Auto delete articles duration").options,
      ).map((o) => [o.value, o.text]),
    ).toEqual([
      ["0", "Disabled"],
      ["1", "1 day"],
      ["3", "3 days"],
      ["7", "1 week"],
      ["14", "2 weeks"],
      ["30", "1 month"],
      ["60", "2 months"],
      ["90", "3 months"],
      ["180", "6 months"],
      ["365", "1 year"],
      ["custom", "Custom..."],
    ]);
    expect(
      Array.from(getSelect(modal.contentEl, "Max items limit").options).map(
        (o) => [o.value, o.text],
      ),
    ).toEqual([
      ["0", "Unlimited"],
      ["10", "10 items"],
      ["25", "25 items"],
      ["50", "50 items"],
      ["100", "100 items"],
      ["200", "200 items"],
      ["500", "500 items"],
      ["1000", "1000 items"],
      ["custom", "Custom..."],
    ]);
  });

  it("submits the preset chosen for auto delete and max items", async () => {
    const onAdd: OnAddFn = vi.fn(async () => true);
    const modal = createModal(onAdd);
    typeUrl(modal, "https://example.com/feed.xml");
    changeSelect(
      getSelect(modal.contentEl, "Auto delete articles duration"),
      "7",
    );
    changeSelect(getSelect(modal.contentEl, "Max items limit"), "200");
    const titleInput = getTextInput(modal.contentEl, "Title");
    titleInput.value = "Feed";
    titleInput.dispatchEvent(new Event("input"));

    getButton(modal.contentEl, "Save").click();
    await flushPromises();

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ autoDeleteDuration: 7, maxItemsLimit: 200 }),
    );
  });

  it("creates the auto delete custom input once, prefilled from the current duration, and parses edits", async () => {
    const onAdd: OnAddFn = vi.fn(async () => true);
    const modal = createModal(onAdd);
    const select = getSelect(modal.contentEl, "Auto delete articles duration");

    changeSelect(select, "custom");
    const input = getCustomInput(modal, "Auto delete articles duration");
    expect(input).not.toBeNull();
    expect(input?.type).toBe("number");
    expect(input?.min).toBe("1");
    expect(input?.placeholder).toBe("Enter days");
    expect(input?.value).toBe("30");
    expect(input?.hasClass("visible")).toBe(true);
    expect(input?.hasClass("hidden")).toBe(false);

    changeSelect(select, "custom");
    expect(
      getSetting(
        modal.contentEl,
        "Auto delete articles duration",
      ).querySelectorAll("input.rss-custom-input").length,
    ).toBe(1);

    input!.value = "21";
    input!.dispatchEvent(new Event("change"));
    typeUrl(modal, "https://example.com/feed.xml");
    getButton(modal.contentEl, "Save").click();
    await flushPromises();
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ autoDeleteDuration: 21 }),
    );
  });

  it("hides the auto delete custom input when a preset is picked again and shows it again for Custom...", () => {
    const modal = createModal();
    const select = getSelect(modal.contentEl, "Auto delete articles duration");

    changeSelect(select, "custom");
    const input = getCustomInput(modal, "Auto delete articles duration")!;
    changeSelect(select, "14");

    expect(input.hasClass("hidden")).toBe(true);
    expect(input.hasClass("visible")).toBe(false);

    changeSelect(select, "custom");
    expect(input.hasClass("visible")).toBe(true);
    expect(input.hasClass("hidden")).toBe(false);
  });

  it("creates the max items custom input empty, parses edits, and hides it for a preset", async () => {
    const onAdd: OnAddFn = vi.fn(async () => true);
    const modal = createModal(onAdd);
    const select = getSelect(modal.contentEl, "Max items limit");

    changeSelect(select, "custom");
    const input = getCustomInput(modal, "Max items limit")!;
    expect(input.placeholder).toBe("Enter number");
    expect(input.min).toBe("1");
    expect(input.value).toBe("");
    expect(input.hasClass("visible")).toBe(true);

    input.value = "abc";
    input.dispatchEvent(new Event("change"));
    typeUrl(modal, "https://example.com/feed.xml");
    getButton(modal.contentEl, "Save").click();
    await flushPromises();
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ maxItemsLimit: 0 }),
    );

    changeSelect(select, "100");
    expect(input.hasClass("hidden")).toBe(true);
    expect(input.hasClass("visible")).toBe(false);
  });

  it("creates the auto-refresh custom input prefilled only for positive intervals and parses edits", async () => {
    const onAdd: OnAddFn = vi.fn(async () => true);
    const modal = createModal(onAdd);
    const select = getSelect(modal.contentEl, "Auto-refresh interval");
    expect(select.value).toBe("0");

    changeSelect(select, "custom");
    const input = getCustomInput(modal, "Auto-refresh interval")!;
    expect(input.placeholder).toBe("Enter minutes");
    expect(input.min).toBe("1");
    expect(input.value).toBe("");
    expect(input.hasClass("visible")).toBe(true);

    input.value = "90";
    input.dispatchEvent(new Event("change"));
    typeUrl(modal, "https://example.com/feed.xml");
    getButton(modal.contentEl, "Save").click();
    await flushPromises();
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ scanInterval: 90 }),
    );

    changeSelect(select, "15");
    expect(input.hasClass("hidden")).toBe(true);
    expect(input.hasClass("visible")).toBe(false);
  });

  it("offers the global default plus each saved template and submits the chosen one", async () => {
    const onAdd: OnAddFn = vi.fn(async () => true);
    const modal = createModal(onAdd, {
      settings: {
        articleSaving: {
          savedTemplates: [
            { id: "t1", name: "Template one" },
            { id: "t2", name: "Template two" },
          ],
        },
      },
    });
    const select = getSelect(modal.contentEl, "Article template");

    expect(Array.from(select.options).map((o) => [o.value, o.text])).toEqual([
      ["", "Use global default template"],
      ["t1", "Template one"],
      ["t2", "Template two"],
    ]);
    expect(select.value).toBe("");

    changeSelect(select, "t2");
    typeUrl(modal, "https://example.com/feed.xml");
    getButton(modal.contentEl, "Save").click();
    await flushPromises();
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ customTemplate: "t2" }),
    );
  });
});
