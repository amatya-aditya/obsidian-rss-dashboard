import { setIcon } from "obsidian";
import type { SidebarIconConfig } from "../types/types";

export const SIDEBAR_ICONS: SidebarIconConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    lucideIcon: "house",
    settingKey: "hideIconDashboard",
    neverCollapses: true,
    isNav: true,
  },
  {
    id: "discover",
    label: "Discover",
    lucideIcon: "compass",
    settingKey: "hideIconDiscover",
    neverCollapses: true,
    isNav: true,
  },
  {
    id: "addFeed",
    label: "Add Feed",
    lucideIcon: "plus-circle",
    settingKey: "hideIconAddFeed",
  },
  {
    id: "manageFeeds",
    label: "Manage Feeds",
    lucideIcon: "pencil",
    settingKey: "hideIconManageFeeds",
  },
  {
    id: "search",
    label: "Search",
    lucideIcon: "search",
    settingKey: "hideIconSearch",
  },
  {
    id: "tags",
    label: "Tags",
    lucideIcon: "tags",
    settingKey: "hideIconTags",
  },
  {
    id: "addFolder",
    label: "Add Folder",
    lucideIcon: "folder-plus",
    settingKey: "hideIconAddFolder",
  },
  {
    id: "sort",
    label: "Sort",
    lucideIcon: "arrow-up-down",
    settingKey: "hideIconSort",
  },
  {
    id: "collapseAll",
    label: "Collapse All",
    lucideIcon: "chevrons-up-down",
    settingKey: "hideIconCollapseAll",
  },
  {
    id: "settings",
    label: "Settings",
    lucideIcon: "settings",
    settingKey: "hideIconSettings",
  },
];

export const SIDEBAR_ICON_IDS: string[] = SIDEBAR_ICONS.map((icon) => icon.id);

const _iconById = new Map<string, SidebarIconConfig>(
  SIDEBAR_ICONS.map((icon) => [icon.id, icon])
);

export function getIconById(id: string): SidebarIconConfig | undefined {
  return _iconById.get(id);
}

/**
 * Creates a toolbar button element following the Obsidian clickable-icon pattern.
 * Attaches click and keyboard (Enter/Space) handlers.
 */
export function createToolbarButton(
  icon: SidebarIconConfig,
  onClick: () => void
): HTMLElement {
  const btn = document.createElement("div");
  btn.className = "clickable-icon";
  btn.setAttribute("role", "button");
  btn.setAttribute("tabindex", "0");
  btn.setAttribute("aria-label", icon.label);

  setIcon(btn, icon.lucideIcon);

  btn.addEventListener("click", onClick);
  btn.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  });

  return btn;
}
