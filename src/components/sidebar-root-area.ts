import { Menu, Notice, type MenuItem } from "obsidian";
import { moveFolder } from "../services/sidebar-ordering-controller";
import type { RssDashboardSettings } from "../types/types";

/**
 * What the folder tree's root area needs from its owner. `Sidebar` keeps the
 * state and the behavior; every method is looked up when it is used, so the
 * owner can still replace or spy on it.
 */
export interface SidebarRootAreaHost {
  /** The owner's live settings object; it is never reassigned. */
  settings: RssDashboardSettings;
  /** The owner's live options object; it is never reassigned. */
  options: { currentFolder: string | null };
  /** The owner's live callbacks object; it is never reassigned. */
  callbacks: { onFolderClick: (folder: string | null) => void };
  /** The owner's live plugin object; it is never reassigned. */
  plugin: { saveSettings: () => Promise<void> };
  render: () => void;
  extractDragPayload: (dataTransfer: DataTransfer | null) => {
    feedUrls: string[];
    folderPaths: string[];
  };
  batchMoveFeedsAndFoldersToFolder: (
    destinationFolderPath: string,
    feedUrls: string[],
    folderPaths: string[],
  ) => void;
  clearFolderPathCache: () => void;
  showFolderNameModal: (options: {
    title: string;
    defaultValue?: string;
    existingNames?: string[];
    onSubmit: (name: string) => void;
  }) => void;
  addTopLevelFolder: (folderName: string) => Promise<void>;
  showAddFeedModal: () => void;
}

function handleRootDragOver(
  e: DragEvent,
  feedFoldersSection: HTMLElement,
): void {
  // Only show drag-over if we're not over a folder header
  // Only show drag-over if we're not over a folder header or folder feed area
  const target = e.target as HTMLElement;
  if (
    !target.closest(".rss-dashboard-feed-folder-header") &&
    !target.closest(".rss-dashboard-folder-feeds")
  ) {
    e.preventDefault();
    feedFoldersSection.classList.add("drag-over");
  }
}

function handleRootDragLeave(
  e: DragEvent,
  feedFoldersSection: HTMLElement,
): void {
  // Only remove drag-over if we're actually leaving the root section
  // Only remove drag-over if we're actually leaving the root section
  const target = e.target as HTMLElement;
  if (
    !target.closest(".rss-dashboard-feed-folder-header") &&
    !target.closest(".rss-dashboard-folder-feeds")
  ) {
    feedFoldersSection.classList.remove("drag-over");
  }
}

function handleRootDrop(
  e: DragEvent,
  feedFoldersSection: HTMLElement,
  host: SidebarRootAreaHost,
): void {
  const target = e.target as HTMLElement;

  // Only process drops on the root section, not on folder headers or folder feed areas
  if (
    target.closest(".rss-dashboard-feed-folder-header") ||
    target.closest(".rss-dashboard-folder-feeds")
  ) {
    return; // Let the folder handle this drop
  }

  e.preventDefault();
  feedFoldersSection.classList.remove("drag-over");
  if (e.dataTransfer) {
    const { feedUrls, folderPaths } = host.extractDragPayload(e.dataTransfer);
    if (feedUrls.length > 0 || folderPaths.length > 1) {
      host.batchMoveFeedsAndFoldersToFolder("", feedUrls, folderPaths);
      return;
    }

    const draggedFolderPath = e.dataTransfer.getData("folder-path");
    if (draggedFolderPath) {
      const result = moveFolder(host.settings, {
        draggedPath: draggedFolderPath,
        targetPath: "",
        placement: "rootAppend",
      });

      if (!result.ok || !result.newPath) {
        new Notice(result.error || "Unable to move folder.");
        return;
      }

      host.clearFolderPathCache();

      const remapPathPrefix = (
        path: string,
        fromBase: string,
        toBase: string,
      ) => {
        if (path === fromBase) return toBase;
        if (path.startsWith(`${fromBase}/`)) {
          return `${toBase}${path.substring(fromBase.length)}`;
        }
        return path;
      };

      const currentFolder = host.options.currentFolder;
      if (
        currentFolder &&
        (currentFolder === draggedFolderPath ||
          currentFolder.startsWith(`${draggedFolderPath}/`))
      ) {
        const nextFolder = remapPathPrefix(
          currentFolder,
          draggedFolderPath,
          result.newPath,
        );
        host.callbacks.onFolderClick(nextFolder);
      }

      void host.plugin.saveSettings().then(() => host.render());
      return;
    }

    const feedUrl = e.dataTransfer.getData("feed-url");
    if (feedUrl) {
      host.batchMoveFeedsAndFoldersToFolder("", [feedUrl], []);
    }
  }
}

function handleRootContextMenu(e: MouseEvent, host: SidebarRootAreaHost): void {
  const target = e.target as HTMLElement;
  const isItem =
    target.closest(".rss-dashboard-feed") ||
    target.closest(".rss-dashboard-feed-folder-header") ||
    target.closest(".rss-dashboard-all-feeds-button");

  if (!isItem) {
    e.preventDefault();
    const menu = new Menu();
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Add folder")
        .setIcon("folder-plus")
        .onClick(() => {
          host.showFolderNameModal({
            title: "Add folder",
            existingNames: host.settings.folders.map((f) => f.name),
            onSubmit: (folderName) => {
              void host.addTopLevelFolder(folderName).then(() => host.render());
            },
          });
        });
    });
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Add feed")
        .setIcon("rss")
        .onClick(() => {
          host.showAddFeedModal();
        });
    });
    menu.showAtMouseEvent(e);
  }
}

/**
 * Wires the drop highlight, the drop and the empty-space context menu of the
 * folder tree's root area onto its section element.
 */
export function attachSidebarRootAreaEvents(
  feedFoldersSection: HTMLElement,
  host: SidebarRootAreaHost,
): void {
  // Add drop handler for root area - only when dropping on the actual root section, not on folders
  feedFoldersSection.addEventListener("dragover", (e) => {
    handleRootDragOver(e, feedFoldersSection);
  });

  feedFoldersSection.addEventListener("dragleave", (e) => {
    handleRootDragLeave(e, feedFoldersSection);
  });

  feedFoldersSection.addEventListener("drop", (e) => {
    handleRootDrop(e, feedFoldersSection, host);
  });

  feedFoldersSection.addEventListener("contextmenu", (e) => {
    handleRootContextMenu(e, host);
  });
}
