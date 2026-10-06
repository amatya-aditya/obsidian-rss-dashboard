import { setIcon } from "obsidian";
import type { SidebarIconConfig } from "../types/types";

export const SIDEBAR_ICONS: SidebarIconConfig[] = [
  {
    id: "discover",
    label: "Discover",
    lucideIcon: "compass",
    settingKey: "hideIconDiscover",
    neverCollapses: true,
    isNav: true,
  },
  {
    id: "divider",
    label: "Divider",
    lucideIcon: "minus-vertical",
    settingKey: "hideIconDivider",
    isDivider: true,
  },
  {
    id: "addFeed",
    label: "Add feed",
    lucideIcon: "plus-circle",
    settingKey: "hideIconAddFeed",
  },
  {
    id: "manageFeeds",
    label: "Manage feeds",
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
    label: "Add folder",
    lucideIcon: "folder-plus",
    settingKey: "hideIconAddFolder",
  },
  {
    id: "sort",
    label: "Sort",
    lucideIcon: "sort-asc",
    settingKey: "hideIconSort",
  },
  {
    id: "collapseAll",
    label: "Collapse all",
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
  SIDEBAR_ICONS.map((icon) => [icon.id, icon]),
);

export function getIconById(id: string): SidebarIconConfig | undefined {
  return _iconById.get(id);
}

/**
 * Creates a native toolbar button following the Obsidian clickable-icon pattern.
 * Clicks pass their MouseEvent to `onClick`.
 */
export function createToolbarButton(
  icon: SidebarIconConfig,
  onClick: (e?: MouseEvent) => void,
): HTMLElement {
  const btn = activeWindow.createEl("button", { attr: { type: "button" } });
  btn.className = "clickable-icon";
  btn.setAttribute("aria-label", icon.label);

  setIcon(btn, icon.lucideIcon);

  btn.addEventListener("click", (e: MouseEvent) => onClick(e));

  return btn;
}
