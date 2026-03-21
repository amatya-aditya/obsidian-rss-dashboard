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
    collapseThreshold: 220,
  },
  {
    id: "manageFeeds",
    label: "Manage Feeds",
    lucideIcon: "pencil",
    settingKey: "hideIconManageFeeds",
    collapseThreshold: 240,
  },
  {
    id: "search",
    label: "Search",
    lucideIcon: "search",
    settingKey: "hideIconSearch",
    collapseThreshold: 260,
  },
  {
    id: "addFolder",
    label: "Add Folder",
    lucideIcon: "folder-plus",
    settingKey: "hideIconAddFolder",
    collapseThreshold: 280,
  },
  {
    id: "sort",
    label: "Sort",
    lucideIcon: "arrow-up-down",
    settingKey: "hideIconSort",
    collapseThreshold: 300,
  },
  {
    id: "collapseAll",
    label: "Collapse All",
    lucideIcon: "chevrons-up-down",
    settingKey: "hideIconCollapseAll",
    collapseThreshold: 320,
  },
  {
    id: "settings",
    label: "Settings",
    lucideIcon: "settings",
    settingKey: "hideIconSettings",
    collapseThreshold: 360,
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
 * Computes which icon IDs should be hidden into the hamburger menu based on
 * the current sidebar width, icon order, per-icon hide settings, and master toggle.
 *
 * @param width               Current sidebar width in pixels
 * @param iconOrder           Ordered array of icon IDs (custom or default)
 * @param hiddenSettings      Map of settingKey → boolean (true = user hid this icon)
 * @param hideToolbarEntirely Master kill-switch
 * @returns Set of icon IDs that should be in the hamburger menu (not directly visible)
 */
export function computeCollapsedIds(
  width: number,
  iconOrder: string[],
  hiddenSettings: Partial<Record<string, boolean>>,
  hideToolbarEntirely: boolean
): Set<string> {
  if (hideToolbarEntirely) return new Set();

  const collapsed = new Set<string>();

  for (const id of iconOrder) {
    const icon = getIconById(id);
    if (!icon) continue;
    if (icon.neverCollapses) continue;

    // Icons hidden in settings are not rendered at all — not in hamburger either
    if (hiddenSettings[icon.settingKey as string]) continue;

    if (icon.collapseThreshold !== undefined && width < icon.collapseThreshold) {
      collapsed.add(id);
    }
  }

  return collapsed;
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
