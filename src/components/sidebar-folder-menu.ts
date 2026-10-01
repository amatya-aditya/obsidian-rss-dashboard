import { Menu, type MenuItem } from "obsidian";
import type { Feed, Folder, RssDashboardSettings } from "../types/types";

/**
 * What the folder context menu needs from its owner. `Sidebar` keeps the state
 * and the behavior; every method is looked up when it is used, so the owner can
 * still replace or spy on it.
 */
export interface SidebarFolderMenuHost {
  /** The sidebar's root element, the anchor when the event has no element target. */
  container: HTMLElement;
  /** The owner's live settings object; it is never reassigned. */
  settings: RssDashboardSettings;
  /** The owner's live callbacks object; it is never reassigned. */
  callbacks: { onDeleteFolder: (folder: string) => void };
  /** The owner's live plugin object; it is never reassigned. */
  plugin: {
    saveSettings: () => Promise<void>;
    refreshFeedsInFolder: (folderPath: string) => Promise<void>;
    cancelPendingStartupRefresh: () => void;
    refreshFeeds: () => Promise<void>;
  };
  render: () => void;
  showRefreshDetails: (
    anchor: HTMLElement,
    feeds: Feed[],
    scope: "all" | "feed" | "aggregate",
  ) => void;
  getAllDescendantFolderPaths: (path: string) => string[];
  isMultiSelectionTarget: (
    targetType: "folder" | "feed",
    targetKey: string,
  ) => boolean;
  appendSelectionContextMenu: (menu: Menu) => void;
  showAddFeedModal: (defaultFolder?: string) => void;
  showFolderNameModal: (options: {
    title: string;
    defaultValue?: string;
    existingNames?: string[];
    onSubmit: (name: string) => void;
  }) => void;
  findFolderByPath: (path: string) => Folder | null;
  addSubfolderByPath: (
    parentPath: string,
    subfolderName: string,
  ) => Promise<void>;
  renameFolderByPath: (oldPath: string, newName: string) => Promise<void>;
  sortFeedsInFolder: (
    folderPath: string,
    by: "name" | "created" | "itemCount" | "unreadCount",
    ascending: boolean,
  ) => Promise<void>;
  showFolderAutoTagModal: (folderPath: string) => void;
  showConfirmModal: (message: string, onConfirm: () => void) => void;
}

function addRefreshDetailsItem(
  menu: Menu,
  anchor: EventTarget | null,
  fullPath: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Refresh details")
      .setIcon("info")
      .onClick(() => {
        host.showRefreshDetails(
          anchor instanceof HTMLElement ? anchor : host.container,
          host.settings.feeds.filter((feed) => {
            const paths = host.getAllDescendantFolderPaths(fullPath);
            return Boolean(feed.folder) && paths.includes(feed.folder);
          }),
          "aggregate",
        );
      });
  });
}

function addAddFeedItem(
  menu: Menu,
  fullPath: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Add feed")
      .setIcon("rss")
      .onClick(() => {
        host.showAddFeedModal(fullPath);
      });
  });
}

function addAddSubfolderItem(
  menu: Menu,
  fullPath: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Add subfolder")
      .setIcon("folder-plus")
      .onClick(() => {
        host.showFolderNameModal({
          title: "Add subfolder",
          existingNames:
            host.findFolderByPath(fullPath)?.subfolders.map((f) => f.name) ??
            [],
          onSubmit: (subfolderName) => {
            void host
              .addSubfolderByPath(fullPath, subfolderName)
              .then(() => host.render());
          },
        });
      });
  });
}

function addRenameFolderItem(
  menu: Menu,
  fullPath: string,
  folderName: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Rename folder")
      .setIcon("edit")
      .onClick(() => {
        host.showFolderNameModal({
          title: "Rename folder",
          defaultValue: folderName,
          existingNames: (() => {
            const parentPath = fullPath.includes("/")
              ? fullPath.split("/").slice(0, -1).join("/")
              : "";
            return parentPath
              ? (host
                  .findFolderByPath(parentPath)
                  ?.subfolders.map((f) => f.name) ?? [])
              : host.settings.folders.map((f) => f.name);
          })(),
          onSubmit: (newName) => {
            if (newName !== folderName) {
              void host
                .renameFolderByPath(fullPath, newName)
                .then(() => host.render());
            }
          },
        });
      });
  });
}

function addSortItems(
  menu: Menu,
  fullPath: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Sort feeds (a to z)")
      .setIcon("sort-asc")
      .onClick(() => {
        void host.sortFeedsInFolder(fullPath, "name", true);
      });
  });
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Sort feeds (z to a)")
      .setIcon("sort-desc")
      .onClick(() => {
        void host.sortFeedsInFolder(fullPath, "name", false);
      });
  });
}

function addMarkAllReadItem(
  menu: Menu,
  fullPath: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Mark all as read")
      .setIcon("check-circle")
      .onClick(() => {
        const allPaths = host.getAllDescendantFolderPaths(fullPath);
        host.settings.feeds.forEach((feed) => {
          if (feed.folder && allPaths.includes(feed.folder)) {
            feed.items.forEach((item) => {
              item.read = true;
            });
          }
        });
        void host.plugin.saveSettings().then(() => host.render());
      });
  });
}

function addRefreshAndAutoTagItems(
  menu: Menu,
  fullPath: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle(`Refresh feeds in folder`)
      .setIcon("refresh-cw")
      .onClick(() => {
        void host.plugin.refreshFeedsInFolder(fullPath);
      });
  });
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Auto tag feeds in folder...")
      .setIcon("tags")
      .onClick(() => {
        host.showFolderAutoTagModal(fullPath);
      });
  });
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Refresh all feeds")
      .setIcon("refresh-cw")
      .onClick(() => {
        host.plugin.cancelPendingStartupRefresh();
        void host.plugin.refreshFeeds();
      });
  });
}

function addPinFolderItem(
  menu: Menu,
  folderObj: Folder,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    const isPinned = folderObj.pinned;
    item
      .setTitle(isPinned ? "Unpin folder" : "Pin folder")
      .setIcon(isPinned ? "unlock" : "lock")
      .onClick(() => {
        folderObj.pinned = !isPinned;
        folderObj.modifiedAt = Date.now();
        void host.plugin.saveSettings().then(() => host.render());
      });
  });
}

function addDeleteFolderItem(
  menu: Menu,
  fullPath: string,
  folderName: string,
  host: SidebarFolderMenuHost,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Delete folder")
      .setIcon("trash")
      .onClick(() => {
        host.showConfirmModal(
          `Are you sure you want to delete the folder '${folderName}' and all its subfolders and feeds?`,
          () => {
            host.callbacks.onDeleteFolder(fullPath);
          },
        );
      });
  });
}

export function showSidebarFolderContextMenu(
  event: MouseEvent,
  folderObj: Folder,
  fullPath: string,
  folderName: string,
  host: SidebarFolderMenuHost,
): void {
  const menu = new Menu();
  const anchor = event.currentTarget;

  addRefreshDetailsItem(menu, anchor, fullPath, host);

  if (host.isMultiSelectionTarget("folder", fullPath)) {
    host.appendSelectionContextMenu(menu);
    menu.showAtMouseEvent(event);
    return;
  }
  addAddFeedItem(menu, fullPath, host);
  addAddSubfolderItem(menu, fullPath, host);
  addRenameFolderItem(menu, fullPath, folderName, host);
  addSortItems(menu, fullPath, host);
  addMarkAllReadItem(menu, fullPath, host);
  addRefreshAndAutoTagItems(menu, fullPath, host);
  addPinFolderItem(menu, folderObj, host);
  addDeleteFolderItem(menu, fullPath, folderName, host);
  if (typeof menu.showAtMouseEvent === "function") {
    menu.showAtMouseEvent(event);
  } else {
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }
}
