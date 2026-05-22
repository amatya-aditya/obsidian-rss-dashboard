import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { AddFeedModal } from "../../../src/modals/feed-manager/add-feed-modal";
import { MediaService } from "../../../src/services/media-service";
import * as feedPreviewLoader from "../../../src/modals/feed-manager/feed-preview-loader";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type MockApp = obsidian.App;

function createMockApp(): MockApp {
  return new obsidian.App();
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

function getTextInputBySettingName(
  containerEl: HTMLElement,
  name: string,
): HTMLInputElement {
  const settingEl = getSettingByName(containerEl, name);
  const inputEl = settingEl.querySelector('input[type="text"]');
  if (!(inputEl instanceof HTMLInputElement)) {
    throw new Error(`Text input not found for setting: ${name}`);
  }
  return inputEl;
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

    const modal = new AddFeedModal(app, [], onAdd, onSave);
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((onAdd as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].scanInterval).toBe(-1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("submits the inherited auto-refresh setting as 0", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    const modal = new AddFeedModal(app, [], onAdd, onSave);
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((onAdd as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].scanInterval).toBe(0);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("submits exclude-from-refresh when enabled", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    const modal = new AddFeedModal(app, [], onAdd, onSave);
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((onAdd as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].excludeFromRefresh).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("validates required fields and does not call onAdd when URL is empty", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();
    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const modal = new AddFeedModal(app, [], onAdd, onSave);
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

    const modal = new AddFeedModal(app, [], onAdd, onSave);
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

  it("routes X/Twitter feeds into the configured default Twitter folder when folder is eligible", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    vi.spyOn(MediaService, "normalizeNitterUrlToRss").mockReturnValue(null);
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue({
      detectedType: "rss",
      inputUrl: "https://x.com/user",
      finalUrl: "https://nitter.net/user/rss",
      isXConversion: true,
      isMastodonConversion: false,
      title: "User timeline",
      latestPubDate: "2026-05-01T00:00:00.000Z",
      hasEntries: true,
    });

    const plugin = {
      settings: {
        media: {
          defaultTwitterFolder: "Social/Twitter",
          defaultYouTubeFolder: "Videos",
          defaultPodcastFolder: "Podcast",
          defaultRssFolder: "RSS",
        },
      },
    };

    const modal = new AddFeedModal(
      app,
      [],
      onAdd,
      onSave,
      "Uncategorized",
      plugin as never,
    );
    modal.open();

    const urlInput = getTextInputBySettingName(modal.contentEl, "Feed URL");
    urlInput.value = "https://x.com/user";
    urlInput.dispatchEvent(new Event("input"));

    getButtonByText(modal.contentEl, "Load").click();
    await flushPromises();

    const folderInput = getTextInputBySettingName(modal.contentEl, "Folder");
    expect(folderInput.value).toBe("Social/Twitter");
  });

  it("keeps a custom folder when loading an X/Twitter feed", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    vi.spyOn(MediaService, "normalizeNitterUrlToRss").mockReturnValue(null);
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue({
      detectedType: "rss",
      inputUrl: "https://twitter.com/user",
      finalUrl: "https://nitter.net/user/rss",
      isXConversion: true,
      isMastodonConversion: false,
      title: "User timeline",
      latestPubDate: "2026-05-01T00:00:00.000Z",
      hasEntries: true,
    });

    const plugin = {
      settings: {
        media: {
          defaultTwitterFolder: "Social/Twitter",
          defaultYouTubeFolder: "Videos",
          defaultPodcastFolder: "Podcast",
          defaultRssFolder: "RSS",
        },
      },
    };

    const modal = new AddFeedModal(app, [], onAdd, onSave, "", plugin as never);
    modal.open();

    const folderInput = getTextInputBySettingName(modal.contentEl, "Folder");
    folderInput.value = "My Custom Folder";
    folderInput.dispatchEvent(new Event("input"));

    const urlInput = getTextInputBySettingName(modal.contentEl, "Feed URL");
    urlInput.value = "https://twitter.com/user";
    urlInput.dispatchEvent(new Event("input"));

    getButtonByText(modal.contentEl, "Load").click();
    await flushPromises();

    expect(folderInput.value).toBe("My Custom Folder");
  });

  it("routes Mastodon feeds into the configured default Mastodon folder and shows conversion notice", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue({
      detectedType: "rss",
      inputUrl: "https://mastodon.social/@user",
      finalUrl: "https://mastodon.social/@user.rss",
      isXConversion: false,
      isMastodonConversion: true,
      title: "Mastodon timeline",
      latestPubDate: "2026-05-01T00:00:00.000Z",
      hasEntries: true,
    });

    const plugin = {
      settings: {
        corsProxyEnabled: false,
        corsProxyUrl: "",
        media: {
          defaultTwitterFolder: "Social/Twitter",
          defaultMastodonFolder: "Social/Mastodon",
          defaultYouTubeFolder: "Videos",
          defaultPodcastFolder: "Podcast",
          defaultRssFolder: "RSS",
        },
      },
    };

    const modal = new AddFeedModal(
      app,
      [],
      onAdd,
      onSave,
      "Uncategorized",
      plugin as never,
    );
    modal.open();

    const urlInput = getTextInputBySettingName(modal.contentEl, "Feed URL");
    urlInput.value = "https://mastodon.social/@user";
    urlInput.dispatchEvent(new Event("input"));

    getButtonByText(modal.contentEl, "Load").click();
    await flushPromises();

    const folderInput = getTextInputBySettingName(modal.contentEl, "Folder");
    expect(folderInput.value).toBe("Social/Mastodon");

    const statusSetting = getSettingByName(modal.contentEl, "Status");
    expect(statusSetting.textContent).toContain(
      "Mastodon > RSS auto-discovery",
    );
  });

  it("keeps a custom folder when loading a Mastodon feed", async () => {
    const app = createMockApp();
    const onAdd: OnAddFn = vi.fn(async () => true);
    const onSave = vi.fn();

    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue({
      detectedType: "rss",
      inputUrl: "https://mastodon.social/@user",
      finalUrl: "https://mastodon.social/@user.rss",
      isXConversion: false,
      isMastodonConversion: true,
      title: "Mastodon timeline",
      latestPubDate: "2026-05-01T00:00:00.000Z",
      hasEntries: true,
    });

    const plugin = {
      settings: {
        corsProxyEnabled: false,
        corsProxyUrl: "",
        media: {
          defaultTwitterFolder: "Social/Twitter",
          defaultMastodonFolder: "Social/Mastodon",
          defaultYouTubeFolder: "Videos",
          defaultPodcastFolder: "Podcast",
          defaultRssFolder: "RSS",
        },
      },
    };

    const modal = new AddFeedModal(app, [], onAdd, onSave, "", plugin as never);
    modal.open();

    const folderInput = getTextInputBySettingName(modal.contentEl, "Folder");
    folderInput.value = "My Custom Folder";
    folderInput.dispatchEvent(new Event("input"));

    const urlInput = getTextInputBySettingName(modal.contentEl, "Feed URL");
    urlInput.value = "https://mastodon.social/@user";
    urlInput.dispatchEvent(new Event("input"));

    getButtonByText(modal.contentEl, "Load").click();
    await flushPromises();

    expect(folderInput.value).toBe("My Custom Folder");
  });

  it("renders tag multi-select and submits selected customTags in object payload", async () => {
    const app = createMockApp();
    const onAdd = vi.fn(async () => true);
    const onSave = vi.fn();

    const plugin = {
      settings: {
        tags: [
          { name: "News", color: "#111122" },
          { name: "Tech", color: "#228811" },
        ],
        media: {
          defaultTwitterFolder: "Social/Twitter",
          defaultYouTubeFolder: "Videos",
          defaultPodcastFolder: "Podcast",
          defaultRssFolder: "RSS",
        },
      },
    };

    const modal = new AddFeedModal(app, [], onAdd, onSave, "", plugin as never);
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

    // Find the tag multi-select control inside the modal
    const tagsWrapper = modal.contentEl.querySelector(".rss-dashboard-tag-multi-select");
    expect(tagsWrapper).not.toBeNull();

    // Select "News" and "Tech" tags by clicking their chips
    const chips = Array.from(tagsWrapper!.querySelectorAll<HTMLElement>(".rss-dashboard-tag-chip"));
    const newsChip = chips.find((c) => c.textContent?.trim() === "News");
    const techChip = chips.find((c) => c.textContent?.trim() === "Tech");
    expect(newsChip).toBeDefined();
    expect(techChip).toBeDefined();

    newsChip!.click();
    techChip!.click();

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(onAdd).toHaveBeenCalledTimes(1);
    const requestPayload = onAdd.mock.calls[0]?.[0];
    expect(requestPayload).toBeDefined();
    expect(requestPayload.url).toBe("https://example.com/feed.xml");
    expect(requestPayload.title).toBe("My feed");
    expect(requestPayload.customTags).toEqual(["News", "Tech"]);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
