import { App, setIcon } from "obsidian";
import type { RssDashboardSettings, SidebarIconConfig } from "../types/types";
import {
  SIDEBAR_ICON_IDS,
  getIconById,
  createToolbarButton,
} from "../utils/sidebar-icon-registry";
import {
  loadVaultLocalStorage,
  saveVaultLocalStorage,
} from "../utils/vault-local-storage";

type AppWithInternalSettings = App & {
  setting?: {
    open?: () => void;
    openTabById?: (id: string) => void;
  };
};

/**
 * What the sidebar header needs from its owner. `Sidebar` keeps the state and
 * the behavior; every member is looked up when it is used, so the owner can
 * still replace or spy on its methods.
 */
export interface SidebarHeaderHost {
  app: App;
  /** The sidebar's root element, which the search button focuses into. */
  container: HTMLElement;
  /** The owner's live settings object; it is never reassigned. */
  settings: RssDashboardSettings;
  /** The owner's live callbacks object; it is never reassigned. */
  callbacks: {
    onActivateDiscover?: () => void;
    onManageFeeds?: () => void;
  };
  /** Owned by the owner; the header clears and fills them on every render. */
  iconBtnEls: Map<string, HTMLElement>;
  iconActions: Map<string, (e?: MouseEvent) => void>;
  isSearchExpanded: () => boolean;
  isTagsExpanded: () => boolean;
  toggleSearch: () => void;
  toggleTags: () => void;
  render: () => void;
  getPluginId: () => string;
  activateDiscoverView: () => void;
  getCachedFolderPaths: () => string[];
  toggleAllFolders: () => void;
  showAddFeedModal: () => void;
  showFolderNameModal: (options: {
    title: string;
    defaultValue?: string;
    existingNames?: string[];
    onSubmit: (name: string) => void;
  }) => void;
  addTopLevelFolder: (name: string) => Promise<void>;
  fireIconAction: (id: string, e?: MouseEvent) => void;
  updateIconRowFades: () => void;
  addHorizontalScrollBehavior: (iconRow: HTMLElement) => void;
}

/**
 * The collapse-all button updates its own glyph, so it needs a reference to
 * itself and a cache of the folder paths. One object is shared by every
 * collapse-all entry of a render.
 */
interface CollapseAllState {
  btn: HTMLElement | null;
  cachedPaths: string[] | null;
}

function updateCollapseAllIcon(
  host: SidebarHeaderHost,
  collapseAll: CollapseAllState,
): void {
  if (!collapseAll.btn) return;
  if (!collapseAll.cachedPaths) {
    collapseAll.cachedPaths = host.getCachedFolderPaths();
  }
  const collapsedFolders = host.settings.collapsedFolders || [];
  const allCollapsed =
    collapseAll.cachedPaths.length > 0 &&
    collapseAll.cachedPaths.every((path) => collapsedFolders.includes(path));
  setIcon(
    collapseAll.btn,
    allCollapsed ? "chevrons-down-up" : "chevrons-up-down",
  );
}

function renderHeaderDivider(iconRow: HTMLElement, host: SidebarHeaderHost) {
  // Render the divider as a separate element based on iconOrder position
  const divider = iconRow.createDiv({ cls: "rss-nav-divider" });
  iconRow.appendChild(divider);
  host.iconBtnEls.set("divider", divider);
}

function buildDiscoverButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  const action = () => {
    if (host.callbacks.onActivateDiscover) {
      host.callbacks.onActivateDiscover();
    } else {
      host.activateDiscoverView();
    }
  };
  host.iconActions.set("discover", action);
  const btn = createToolbarButton(iconConfig, action);
  btn.addClass("clickable-icon");
  return btn;
}

function buildAddFeedButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  const action = () => {
    host.showAddFeedModal();
    if (!loadVaultLocalStorage(host.app, "rss-first-launch-coachmark-shown")) {
      saveVaultLocalStorage(
        host.app,
        "rss-first-launch-coachmark-shown",
        "true",
      );
      const coachmark = host.iconBtnEls
        .get("addFeed")
        ?.querySelector(".rss-dashboard-coachmark");
      if (coachmark) coachmark.remove();
    }
  };
  host.iconActions.set("addFeed", action);
  return createToolbarButton(iconConfig, action);
}

function buildManageFeedsButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  const action = () => {
    if (host.callbacks.onManageFeeds) {
      host.callbacks.onManageFeeds();
    }
  };
  host.iconActions.set("manageFeeds", action);
  return createToolbarButton(iconConfig, action);
}

function buildSearchButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  const action = () => {
    host.toggleSearch();
    host.render();
    if (host.isSearchExpanded()) {
      window.requestAnimationFrame(() => {
        const searchInput = host.container.querySelector<HTMLInputElement>(
          ".rss-dashboard-search-input",
        );
        if (!searchInput) return;
        searchInput.focus();
        searchInput.select();
        searchInput.scrollIntoView({ block: "nearest" });
      });
    }
  };
  host.iconActions.set("search", action);
  const btn = createToolbarButton(iconConfig, action);
  btn.toggleClass("is-active", host.isSearchExpanded());
  btn.setAttr("aria-pressed", host.isSearchExpanded() ? "true" : "false");
  return btn;
}

function buildTagsButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  const action = () => {
    host.toggleTags();
    host.render();
  };
  host.iconActions.set("tags", action);
  const btn = createToolbarButton(iconConfig, action);
  btn.toggleClass("is-active", host.isTagsExpanded());
  btn.setAttr("aria-pressed", host.isTagsExpanded() ? "true" : "false");
  return btn;
}

function buildAddFolderButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  const action = () => {
    host.showFolderNameModal({
      title: "Add folder",
      existingNames: host.settings.folders.map((f) => f.name),
      onSubmit: (folderName) => {
        void host.addTopLevelFolder(folderName).then(() => host.render());
      },
    });
  };
  host.iconActions.set("addFolder", action);
  return createToolbarButton(iconConfig, action);
}

function buildSortButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  // A click opens the menu at the pointer; Enter and Space have no MouseEvent,
  // so fireIconAction anchors the menu below the button instead.
  return createToolbarButton(iconConfig, (e) => host.fireIconAction("sort", e));
}

function buildCollapseAllButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
  collapseAll: CollapseAllState,
): HTMLElement {
  const action = () => {
    collapseAll.cachedPaths = null;
    host.toggleAllFolders();
    window.setTimeout(() => updateCollapseAllIcon(host, collapseAll), 0);
  };
  host.iconActions.set("collapseAll", action);
  const btn = createToolbarButton(iconConfig, action);
  collapseAll.btn = btn;
  updateCollapseAllIcon(host, collapseAll);
  return btn;
}

function buildSettingsButton(
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
): HTMLElement {
  const action = () => {
    const appWithSettings = host.app as AppWithInternalSettings;
    appWithSettings.setting?.open?.();
    appWithSettings.setting?.openTabById?.(host.getPluginId());
  };
  host.iconActions.set("settings", action);
  return createToolbarButton(iconConfig, action);
}

/** Builds the button for one icon id, or null when the id has no button. */
function createHeaderIconButton(
  id: string,
  iconConfig: SidebarIconConfig,
  host: SidebarHeaderHost,
  collapseAll: CollapseAllState,
): HTMLElement | null {
  switch (id) {
    case "discover":
      return buildDiscoverButton(iconConfig, host);
    case "addFeed":
      return buildAddFeedButton(iconConfig, host);
    case "manageFeeds":
      return buildManageFeedsButton(iconConfig, host);
    case "search":
      return buildSearchButton(iconConfig, host);
    case "tags":
      return buildTagsButton(iconConfig, host);
    case "addFolder":
      return buildAddFolderButton(iconConfig, host);
    case "sort":
      return buildSortButton(iconConfig, host);
    case "collapseAll":
      return buildCollapseAllButton(iconConfig, host, collapseAll);
    case "settings":
      return buildSettingsButton(iconConfig, host);
    default:
      return null;
  }
}

/** First-launch coachmark for the Add Feed button. */
function attachAddFeedCoachmark(host: SidebarHeaderHost): void {
  const addFeedBtn = host.iconBtnEls.get("addFeed");
  if (
    addFeedBtn &&
    !loadVaultLocalStorage(host.app, "rss-first-launch-coachmark-shown")
  ) {
    const coachmark = addFeedBtn.createDiv({
      cls: "rss-dashboard-coachmark",
      text: "Add your first feed here",
    });
    window.setTimeout(() => {
      if (!loadVaultLocalStorage(host.app, "rss-first-launch-coachmark-shown")) {
        saveVaultLocalStorage(
          host.app,
          "rss-first-launch-coachmark-shown",
          "true",
        );
        if (coachmark.parentNode) coachmark.remove();
      }
    }, 5000);
  }
}

export function renderSidebarHeader(
  parentEl: HTMLElement,
  host: SidebarHeaderHost,
): void {
  const header = parentEl.createDiv({ cls: "rss-dashboard-header" });
  host.iconBtnEls.clear();
  host.iconActions.clear();

  if (host.settings.display.hideToolbarEntirely) return;

  const iconRowWrapper = header.createDiv({ cls: "rss-icon-row-wrapper" });
  const iconRow = iconRowWrapper.createDiv({
    cls: "rss-dashboard-header-icon-row",
  });
  const display = host.settings.display;
  const iconOrder: string[] = display.iconOrder?.length
    ? display.iconOrder
    : [...SIDEBAR_ICON_IDS];

  const collapseAll: CollapseAllState = { btn: null, cachedPaths: null };

  for (const id of iconOrder) {
    const iconConfig = getIconById(id);
    if (!iconConfig) continue;

    const hideKey = iconConfig.settingKey;
    if (display[hideKey]) continue;

    if (id === "divider") {
      renderHeaderDivider(iconRow, host);
      continue;
    }

    const btn = createHeaderIconButton(id, iconConfig, host, collapseAll);
    if (!btn) continue;

    iconRow.appendChild(btn);
    host.iconBtnEls.set(id, btn);
  }

  // Hamburger button — always last; hidden until responsive collapse needs it
  // Set up scroll-fade indicators on the icon row wrapper
  iconRow.addEventListener("scroll", () => host.updateIconRowFades());

  attachAddFeedCoachmark(host);

  host.addHorizontalScrollBehavior(iconRow);
}
