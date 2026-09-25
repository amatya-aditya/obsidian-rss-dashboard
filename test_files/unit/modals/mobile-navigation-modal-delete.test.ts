import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "obsidian";
import type {
  SidebarCallbacks,
  SidebarOptions,
} from "../../../src/components/sidebar";
import { MobileNavigationModal } from "../../../src/modals/mobile-navigation-modal";
import type { Feed, RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function makeFeed(title: string, url: string, folder = ""): Feed {
  return { title, url, folder, items: [], lastUpdated: 0 };
}

describe("Deleting from the mobile navigation sidebar", () => {
  let settings: RssDashboardSettings;
  let modal: MobileNavigationModal;

  beforeEach(() => {
    installObsidianDomPolyfills();
    settings = {
      feeds: [
        makeFeed("Keep", "https://keep.example"),
        makeFeed("Gone", "https://gone.example"),
        makeFeed("Nested", "https://nested.example", "Tech"),
      ],
      folders: [{ name: "Tech", subfolders: [] }],
      sidebarWidth: 310,
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
      },
    } as unknown as RssDashboardSettings;

    // Mirror the dashboard's handlers: replace the lists and re-render only
    // the dashboard's own sidebar, which the modal's sidebar is not.
    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onDeleteFeed: (feed: Feed) => {
        settings.feeds = settings.feeds.filter((f) => f !== feed);
      },
      onDeleteFolder: (folder: string) => {
        settings.feeds = settings.feeds.filter((f) => f.folder !== folder);
        settings.folders = settings.folders.filter((f) => f.name !== folder);
      },
    } as unknown as SidebarCallbacks;

    const options: SidebarOptions = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
      selectedFeeds: [],
    };

    modal = new MobileNavigationModal(
      ObsidianStubs.App.createMock() as unknown as App,
      {
        settings,
        saveSettings: vi.fn(async () => {}),
      } as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    modal.open();
  });

  afterEach(() => {
    modal.close();
    activeDocument.body.empty();
  });

  function confirmMenuItem(target: HTMLElement, title: string): void {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    const item = ObsidianStubs.Menu.lastItems.find((i) => i.title === title);
    expect(item).toBeTruthy();
    item!.trigger();
    activeDocument
      .querySelector<HTMLButtonElement>(
        ".rss-sidebar-confirm-modal .rss-folder-name-modal-ok",
      )!
      .click();
  }

  it("removes a deleted feed's row immediately, without reopening", () => {
    const row = modal.contentEl.querySelector<HTMLElement>(
      '[data-feed-url="https://gone.example"]',
    );
    expect(row).toBeTruthy();

    confirmMenuItem(row!, "Delete feed");

    expect(
      modal.contentEl.querySelector('[data-feed-url="https://gone.example"]'),
    ).toBeNull();
    expect(
      modal.contentEl.querySelector('[data-feed-url="https://keep.example"]'),
    ).toBeTruthy();
  });

  it("removes a deleted folder's row immediately, without reopening", () => {
    const folder = modal.contentEl.querySelector<HTMLElement>(
      '[data-folder-path="Tech"]',
    );
    expect(folder).toBeTruthy();

    confirmMenuItem(folder!, "Delete folder");

    expect(
      modal.contentEl.querySelector('[data-folder-path="Tech"]'),
    ).toBeNull();
    expect(
      modal.contentEl.querySelector('[data-feed-url="https://keep.example"]'),
    ).toBeTruthy();
  });
});
