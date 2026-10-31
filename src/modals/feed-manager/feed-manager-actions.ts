import { App, Notice, Setting, setIcon } from "obsidian";
import { AccessibleModal } from "../../utils/accessible-modal";
import type { Folder } from "../../types/types";
import { settingsUiCompatibility } from "../../settings/settings-ui-compat";

interface PrimaryActionCallbacks {
  addFeed(): void;
  importOpml(): void;
  exportOpml(): void;
  importStarred(): void;
}

interface DestructiveActionCallbacks {
  getFeedCount(): number;
  getFolderCount(): number;
  getImageCacheSizeBytes(): number;
  deleteFeeds(): Promise<{ failed: number }>;
  deleteFeedsAndFolders(): Promise<{ failed: number }>;
}

export function renderPrimaryFeedActions(
  contentEl: HTMLElement,
  callbacks: PrimaryActionCallbacks,
): void {
  const buttonRow = contentEl.createDiv({
    cls: ["feed-manager-button-row", "feed-manager-button-row-primary"],
  });

  const addFeedBtn = buttonRow.createEl("button", {
    cls: "feed-manager-add-button",
  });
  addFeedBtn.createSpan({ text: "Add new feed..." });
  addFeedBtn.onclick = () => callbacks.addFeed();

  const importOpmlBtn = buttonRow.createEl("button", {
    cls: "feed-manager-import-button",
  });
  setIcon(importOpmlBtn, "upload");
  importOpmlBtn.createSpan({ text: "Import OPML/XML" });
  importOpmlBtn.onclick = () => callbacks.importOpml();

  const exportOpmlBtn = buttonRow.createEl("button", {
    cls: "feed-manager-export-button",
  });
  setIcon(exportOpmlBtn, "download");
  exportOpmlBtn.createSpan({ text: "Export OPML" });
  exportOpmlBtn.onclick = () => callbacks.exportOpml();

  const importStarredBtn = buttonRow.createEl("button", {
    cls: "feed-manager-import-starred-button",
  });
  setIcon(importStarredBtn, "star");
  importStarredBtn.createSpan({ text: "Import starred articles" });
  importStarredBtn.onclick = () => callbacks.importStarred();
}

export function renderDestructiveFeedActions(
  contentEl: HTMLElement,
  app: App,
  callbacks: DestructiveActionCallbacks,
): void {
  const destructiveButtonRow = contentEl.createDiv({
    cls: ["feed-manager-button-row", "feed-manager-button-row-secondary"],
  });
  const deleteAllBtn = destructiveButtonRow.createEl("button", {
    cls: "feed-manager-delete-all-button",
  });
  setIcon(deleteAllBtn, "trash-2");
  deleteAllBtn.createSpan({ text: "Delete all feeds" });
  deleteAllBtn.onclick = () => {
    if (callbacks.getFeedCount() === 0) {
      new Notice("There are no feeds to delete");
      return;
    }
    openDeleteConfirmation(app, callbacks, false);
  };

  const deleteFeedsAndFoldersBtn = destructiveButtonRow.createEl("button", {
    cls: "feed-manager-delete-feeds-folders-button",
  });
  setIcon(deleteFeedsAndFoldersBtn, "trash-2");
  deleteFeedsAndFoldersBtn.createSpan({ text: "Delete feeds + folders" });
  deleteFeedsAndFoldersBtn.onclick = () => {
    const folderCount = callbacks.getFolderCount();
    if (callbacks.getFeedCount() === 0 && folderCount === 0) {
      new Notice("There are no feeds or folders to delete");
      return;
    }
    openDeleteConfirmation(app, callbacks, true);
  };
}

function openDeleteConfirmation(
  app: App,
  callbacks: DestructiveActionCallbacks,
  deleteFolders: boolean,
): void {
  const feedCount = callbacks.getFeedCount();
  const folderCount = callbacks.getFolderCount();
  const confirmModal = new AccessibleModal(app);
  confirmModal.modalEl.addClass("rss-dashboard-confirm-modal");
  const { contentEl } = confirmModal;
  contentEl.empty();
  const imageCacheSizeBytes = callbacks.getImageCacheSizeBytes();

  new Setting(contentEl)
    .setName(
      deleteFolders ? "Delete all feeds and folders?" : "Delete all feeds?",
    )
    .setHeading();
  contentEl.createEl("p", {
    text: deleteFolders
      ? `This will permanently remove all ${feedCount} feeds and ${folderCount} folders from RSS Dashboard, resetting your sidebar to empty. Your other plugin settings will remain intact.`
      : `This will permanently remove all ${feedCount} feeds from RSS Dashboard. Your folder structure and plugin settings will remain intact.`,
  });
  if (imageCacheSizeBytes > 0) {
    contentEl.createEl("p", {
      text: `Cached preview images (${formatByteSize(imageCacheSizeBytes)}) will also be cleared.`,
    });
  }

  const buttonsSetting = new Setting(contentEl);
  buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
  buttonsSetting
    .addButton((btn) =>
      btn.setButtonText("Cancel").onClick(() => confirmModal.close()),
    )
    .addButton((btn) => {
      const action = deleteFolders
        ? "Delete feeds + folders"
        : "Delete all feeds";
      btn.setButtonText(action);
      settingsUiCompatibility.markDestructive(btn);
      btn.onClick(async () => {
        const cacheClearResult = deleteFolders
          ? await callbacks.deleteFeedsAndFolders()
          : await callbacks.deleteFeeds();
        confirmModal.close();
        showDeletionResult(
          deleteFolders,
          cacheClearResult.failed,
          imageCacheSizeBytes,
        );
      });
    });
  confirmModal.open();
}

function showDeletionResult(
  deleteFolders: boolean,
  failedCacheFiles: number,
  imageCacheSizeBytes: number,
): void {
  const subject = deleteFolders ? "All feeds and folders" : "All feeds";
  const cacheSubject = deleteFolders
    ? "All feeds, folders, and cached preview images deleted."
    : "All feeds and cached preview images deleted.";
  if (failedCacheFiles > 0) {
    const failedLabel =
      failedCacheFiles === 1
        ? "1 cached image could not be removed."
        : `${failedCacheFiles} cached images could not be removed.`;
    new Notice(`${subject} deleted, but ${failedLabel}`);
  } else if (imageCacheSizeBytes > 0) {
    new Notice(cacheSubject);
  } else {
    new Notice(`${subject} deleted`);
  }
}

function formatByteSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function countFoldersRecursively(folders: readonly Folder[]): number {
  return folders.reduce(
    (total, folder) => total + 1 + countFoldersRecursively(folder.subfolders),
    0,
  );
}
