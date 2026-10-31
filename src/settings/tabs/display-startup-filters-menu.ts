/**
 * Startup filters setting and its popover menu for the Display settings tab.
 *
 * Extracted from display-settings-tab.ts (#1251, umbrella #1094). The menu is
 * split along its original blocks; each block is moved verbatim except where
 * the split forces an edit (shared `let` state now lives on `MenuState`).
 */
import { Notice, setIcon, setTooltip, Setting } from "obsidian";
import type { App, ButtonComponent, WorkspaceLeaf } from "obsidian";
import type { RssDashboardSettings } from "../../types/types";
import { applyTagAppearance } from "../../utils/tag-colors";
import { formatDashboardMultiFiltersSummaryCompact } from "../../utils/filter-title-format";
import {
  computePopoverPosition,
  computeSubmenuPosition,
} from "../../utils/popover-position";

/** The slice of the plugin the startup filters setting reads and calls. */
export interface StartupFiltersPlugin {
  app: App;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  notifyFiltersUpdated(payload: { source: string; timestamp: number }): void;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
}

interface MenuState {
  repositionFrame: number | null;
  activeTagSubmenu: HTMLElement | null;
  activeTagSubmenuParentItem: HTMLElement | null;
  pendingStatusFilters: Set<string>;
  pendingTagFilters: Set<string>;
  pendingAllChecked: boolean;
  pendingFilterLogic: "AND" | "OR";
}

interface MenuContext {
  plugin: StartupFiltersPlugin;
  btn: ButtonComponent;
  targetDocument: Document;
  targetWindow: Window;
  menuPortal: HTMLElement;
  margin: number;
  state: MenuState;
}

interface AllItemControls {
  allCheckbox: HTMLInputElement;
  filterCheckboxes: Map<string, HTMLInputElement>;
}

/**
 * The cleanup of the menu currently open in a document. Reopening the menu
 * tears the previous one down through it, so its listeners do not leak
 * (#1259). Keyed by document because a menu can live in a popout window.
 */
const openMenuCleanups = new WeakMap<Document, () => void>();

const formatStartupFiltersButton = (
  plugin: StartupFiltersPlugin,
): {
  text: string;
  tooltip: string | null;
} => {
  const mf = plugin.settings.dashboardMultiFilters;
  return formatDashboardMultiFiltersSummaryCompact({
    statusFilters: mf?.statusFilters ?? [],
    tagFilters: mf?.tagFilters ?? [],
    logic: mf?.logic ?? "OR",
    maxItems: 2,
  });
};

export function renderStartupFiltersSetting(
  containerEl: HTMLElement,
  plugin: StartupFiltersPlugin,
): void {
  new Setting(containerEl)
    .setName("Startup filters")
    .setDesc(
      "Choose which status and tag filters to apply when opening the dashboard. With and, an article must match every selected filter; with or, matching any one is enough. Applying also resets the default filter to all.",
    )
    .addButton((btn) => {
      btn.buttonEl.addClass("rss-dashboard-startup-filters-button");
      const initial = formatStartupFiltersButton(plugin);
      btn.setButtonText(initial.text);
      if (initial.tooltip) {
        setTooltip(btn.buttonEl, initial.tooltip);
      }

      btn.onClick(() => openStartupFiltersMenu(plugin, btn));
    });
}

function createMenuPositioning(ctx: MenuContext): {
  repositionSubmenu: () => void;
  scheduleReposition: () => void;
} {
  const { btn, targetWindow, menuPortal, margin, state } = ctx;

  const repositionSubmenu = () => {
    const { activeTagSubmenu, activeTagSubmenuParentItem } = state;
    if (!activeTagSubmenu || !activeTagSubmenuParentItem) {
      return;
    }

    const parentItemRect = activeTagSubmenuParentItem.getBoundingClientRect();
    const parentMenuRect = menuPortal.getBoundingClientRect();
    const submenuRect = activeTagSubmenu.getBoundingClientRect();

    const pos = computeSubmenuPosition({
      parentItemRect,
      parentMenuRect,
      submenuRect,
      viewport: {
        width: targetWindow.innerWidth,
        height: targetWindow.innerHeight,
      },
      margin,
    });

    activeTagSubmenu.addClass("rss-dashboard-submenu-fixed");
    activeTagSubmenu.style.setProperty("--submenu-top", `${pos.top}px`);
    activeTagSubmenu.style.setProperty("--submenu-left", `${pos.left}px`);
    if (typeof pos.maxHeight === "number") {
      activeTagSubmenu.style.maxHeight = `${pos.maxHeight}px`;
    } else {
      activeTagSubmenu.style.removeProperty("max-height");
    }
  };

  const repositionMenu = () => {
    if (!menuPortal.isConnected) {
      return;
    }

    const anchorRect = btn.buttonEl.getBoundingClientRect();
    const popoverRect = menuPortal.getBoundingClientRect();

    const pos = computePopoverPosition({
      anchorRect,
      popoverRect,
      viewport: {
        width: targetWindow.innerWidth,
        height: targetWindow.innerHeight,
      },
      margin,
    });

    menuPortal.style.top = `${pos.top}px`;
    menuPortal.style.left = `${pos.left}px`;

    if (typeof pos.maxHeight === "number") {
      menuPortal.style.maxHeight = `${pos.maxHeight}px`;
    } else {
      menuPortal.style.removeProperty("max-height");
      menuPortal.style.removeProperty("overflow-y");
    }

    repositionSubmenu();
  };

  const scheduleReposition = () => {
    if (state.repositionFrame !== null) {
      return;
    }
    state.repositionFrame = targetWindow.requestAnimationFrame(() => {
      state.repositionFrame = null;
      repositionMenu();
    });
  };

  return { repositionSubmenu, scheduleReposition };
}

function renderLogicToggles(ctx: MenuContext): void {
  const { menuPortal, state } = ctx;

  // Logic Toggles: And / Or
  const logicToggles = menuPortal.createDiv({
    cls: "rss-dashboard-filter-logic-toggles",
  });

  const andBtn = logicToggles.createEl("button", {
    cls:
      "rss-dashboard-filter-logic-btn" +
      (state.pendingFilterLogic === "AND" ? " active" : ""),
    text: "And",
  });
  const orBtn = logicToggles.createEl("button", {
    cls:
      "rss-dashboard-filter-logic-btn" +
      (state.pendingFilterLogic === "OR" ? " active" : ""),
    text: "Or",
  });

  andBtn.addEventListener("click", () => {
    state.pendingFilterLogic = "AND";
    andBtn.addClass("active");
    orBtn.removeClass("active");
  });

  orBtn.addEventListener("click", () => {
    state.pendingFilterLogic = "OR";
    orBtn.addClass("active");
    andBtn.removeClass("active");
  });
}

function renderAllItem(
  ctx: MenuContext,
  removeTagSubmenus: () => void,
): AllItemControls {
  const { menuPortal, state } = ctx;

  // "All" Checkbox - shows all items when no filters selected
  const allItem = menuPortal.createDiv({
    cls: "rss-dashboard-filter-menu-item rss-dashboard-filter-all-item",
  });

  const allCheckbox = allItem.createEl("input", {
    attr: { type: "checkbox" },
    cls: "rss-dashboard-filter-checkbox",
  });
  allCheckbox.checked = state.pendingAllChecked;

  const allIconDiv = allItem.createDiv({
    cls: "rss-dashboard-filter-menu-icon",
  });
  setIcon(allIconDiv, "fullscreen");

  allItem.createDiv({
    cls: "rss-dashboard-filter-menu-text",
    text: "All",
  });

  const filterCheckboxes: Map<string, HTMLInputElement> = new Map();

  const uncheckAllFilterCheckboxes = () => {
    state.pendingStatusFilters.clear();
    state.pendingTagFilters.clear();
    state.pendingAllChecked = true;
    filterCheckboxes.forEach((cb) => {
      cb.checked = false;
    });
  };

  allCheckbox.addEventListener("change", (e) => {
    e.stopPropagation();
    if (allCheckbox.checked) {
      uncheckAllFilterCheckboxes();
    } else {
      state.pendingAllChecked = false;
    }
  });

  allItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target !== allCheckbox) {
      allCheckbox.checked = !allCheckbox.checked;
      if (allCheckbox.checked) {
        uncheckAllFilterCheckboxes();
      } else {
        state.pendingAllChecked = false;
      }
    }
  });

  allItem.addEventListener("mouseenter", removeTagSubmenus);

  return { allCheckbox, filterCheckboxes };
}

function showTagsSubMenu(
  ctx: MenuContext,
  parentItem: HTMLElement,
  controls: AllItemControls,
  repositionSubmenu: () => void,
): void {
  const { plugin, targetWindow, menuPortal, state } = ctx;
  const { allCheckbox, filterCheckboxes } = controls;

  // A tag selection implies the broad Tagged status, so the row and the
  // stored filters stay in sync (#1260).
  const tickTaggedStatus = () => {
    state.pendingStatusFilters.add("tagged");
    const taggedCheckbox = filterCheckboxes.get("tagged");
    if (taggedCheckbox) {
      taggedCheckbox.checked = true;
    }
  };

  // Remove existing submenus
  menuPortal
    .querySelectorAll(".rss-dashboard-tag-submenu")
    .forEach((el) => el.remove());

  const subMenu = menuPortal.createDiv({
    cls: "rss-dashboard-filter-menu rss-dashboard-tag-submenu",
  });
  state.activeTagSubmenu = subMenu;
  state.activeTagSubmenuParentItem = parentItem;

  if (plugin.settings.availableTags.length === 0) {
    subMenu.createDiv({
      cls: "rss-dashboard-filter-menu-item empty",
      text: "No tags available",
    });
  }

  plugin.settings.availableTags.forEach((tag) => {
    const item = subMenu.createDiv({
      cls: "rss-dashboard-filter-menu-item",
    });

    const checkbox = item.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    checkbox.checked = state.pendingTagFilters.has(tag.name);

    const colorDot = item.createDiv({
      cls: "rss-dashboard-tag-color-dot",
    });
    applyTagAppearance(colorDot, tag, plugin.settings);

    item.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: tag.name,
    });

    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        state.pendingTagFilters.add(tag.name);
        tickTaggedStatus();
        allCheckbox.checked = false;
        state.pendingAllChecked = false;
      } else {
        state.pendingTagFilters.delete(tag.name);
        if (
          state.pendingStatusFilters.size === 0 &&
          state.pendingTagFilters.size === 0
        ) {
          allCheckbox.checked = true;
          state.pendingAllChecked = true;
        }
      }
    });

    item.addEventListener("click", (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          state.pendingTagFilters.add(tag.name);
          tickTaggedStatus();
          allCheckbox.checked = false;
          state.pendingAllChecked = false;
        } else {
          state.pendingTagFilters.delete(tag.name);
          if (
            state.pendingStatusFilters.size === 0 &&
            state.pendingTagFilters.size === 0
          ) {
            allCheckbox.checked = true;
            state.pendingAllChecked = true;
          }
        }
      }
    });
  });

  targetWindow.requestAnimationFrame(() => {
    repositionSubmenu();
  });
}

function renderStatusOptions(
  ctx: MenuContext,
  controls: AllItemControls,
  showTagsSubMenuFor: (parentItem: HTMLElement) => void,
  removeTagSubmenus: () => void,
): void {
  const { menuPortal, state } = ctx;
  const { allCheckbox, filterCheckboxes } = controls;

  const filterOptions = [
    { id: "unread", name: "Unread", icon: "circle" },
    { id: "read", name: "Read", icon: "check-circle" },
    { id: "saved", name: "Saved", icon: "save" },
    { id: "starred", name: "Starred", icon: "star" },
    { id: "podcasts", name: "Podcast", icon: "mic" },
    { id: "videos", name: "Videos", icon: "play" },
    { id: "tagged", name: "Tagged", icon: "tag" },
    { id: "untagged", name: "Untagged", icon: "ban" },
  ];

  filterOptions.forEach((opt) => {
    const item = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item",
    });

    const checkbox = item.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    checkbox.checked = state.pendingStatusFilters.has(opt.id);
    filterCheckboxes.set(opt.id, checkbox);

    const iconDiv = item.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(iconDiv, opt.icon);

    item.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: opt.name,
    });

    if (opt.id === "tagged") {
      const arrow = item.createDiv({
        cls: "rss-dashboard-filter-menu-arrow",
      });
      setIcon(arrow, "chevron-right");

      item.addEventListener("mouseenter", () => {
        showTagsSubMenuFor(item);
      });
    } else {
      item.addEventListener("mouseenter", () => {
        removeTagSubmenus();
      });
    }

    const handleFilterCheck = (checked: boolean) => {
      if (checked) {
        state.pendingStatusFilters.add(opt.id);
        allCheckbox.checked = false;
        state.pendingAllChecked = false;
      } else {
        state.pendingStatusFilters.delete(opt.id);
        if (opt.id === "tagged") {
          state.pendingTagFilters.clear();
          // The open submenu must not keep showing tags the filters no
          // longer contain (#1260).
          removeTagSubmenus();
        }
        if (
          state.pendingStatusFilters.size === 0 &&
          state.pendingTagFilters.size === 0
        ) {
          allCheckbox.checked = true;
          state.pendingAllChecked = true;
        }
      }
    };

    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      handleFilterCheck(checkbox.checked);
    });

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        handleFilterCheck(checkbox.checked);
      }
    });
  });
}

function renderApplyButton(
  ctx: MenuContext,
  removeTagSubmenus: () => void,
  cleanup: () => void,
): void {
  const { menuPortal } = ctx;

  const preApplySeparator = menuPortal.createDiv({
    cls: "rss-dashboard-filter-menu-separator",
  });
  preApplySeparator.addEventListener("mouseenter", removeTagSubmenus);

  const applyBtn = menuPortal.createEl("button", {
    cls: "rss-dashboard-filter-apply-btn",
    text: "Apply",
  });
  let applying = false;
  applyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // A save is a round trip. Ignore a second activation so an overlapping
    // run cannot restore an intermediate state instead of the pre-Apply one
    // (#1261), and disable the button so the wait is visible.
    if (applying) {
      return;
    }
    applying = true;
    applyBtn.disabled = true;
    void applyStartupFilters(ctx, cleanup);
  });
}

/**
 * Applies the pending filters. The save is all-or-nothing: when it fails the
 * previous filters are restored, and the menu always closes (#1261).
 */
async function applyStartupFilters(
  ctx: MenuContext,
  cleanup: () => void,
): Promise<void> {
  const { plugin, btn, state } = ctx;
  const previousFilters = plugin.settings.dashboardMultiFilters;
  const previousDefaultFilter = plugin.settings.display.defaultFilter;

  try {
    plugin.settings.dashboardMultiFilters = {
      statusFilters: state.pendingAllChecked
        ? []
        : Array.from(state.pendingStatusFilters),
      tagFilters: state.pendingAllChecked
        ? []
        : Array.from(state.pendingTagFilters),
      logic: state.pendingFilterLogic,
    };

    // De-emphasize legacy single-filter behavior now that startup filtering
    // is configured via dashboard multi-filters.
    plugin.settings.display.defaultFilter = "all";

    await plugin.saveSettings();
  } catch (error) {
    plugin.settings.dashboardMultiFilters = previousFilters;
    plugin.settings.display.defaultFilter = previousDefaultFilter;
    new Notice(
      `Startup filters update failed${
        error instanceof Error ? `: ${error.message}` : ""
      }`,
    );
    return;
  } finally {
    cleanup();
  }

  try {
    plugin.notifyFiltersUpdated({
      source: "settings-startup-filters",
      timestamp: Date.now(),
    });

    const updated = formatStartupFiltersButton(plugin);
    btn.setButtonText(updated.text);
    if (updated.tooltip) {
      setTooltip(btn.buttonEl, updated.tooltip);
    } else {
      btn.buttonEl.removeAttribute("aria-label");
    }

    const view = await plugin.getActiveDashboardView();
    if (view) {
      await plugin.app.workspace.revealLeaf(view.leaf);
      view.render();
    }
  } catch (error) {
    new Notice(
      `Dashboard refresh failed after startup filters were saved${
        error instanceof Error ? `: ${error.message}` : ""
      }`,
    );
  }
}

function openStartupFiltersMenu(
  plugin: StartupFiltersPlugin,
  btn: ButtonComponent,
): void {
  const targetDocument = btn.buttonEl.ownerDocument;
  const targetBody = targetDocument.body;
  const targetWindow = targetDocument.defaultView || activeWindow;
  const margin = 8;

  // Tear down the menu this document already has open, then remove any
  // portal left behind by stale state (#1259).
  openMenuCleanups.get(targetDocument)?.();
  targetDocument
    .querySelectorAll(".rss-dashboard-startup-filters-menu-portal")
    .forEach((el) => el.remove());

  const menuPortal = targetBody.createDiv({
    cls: "rss-dashboard-filter-menu rss-dashboard-filter-menu-portal rss-dashboard-startup-filters-menu-portal",
  });

  const currentMf = plugin.settings.dashboardMultiFilters;
  const state: MenuState = {
    repositionFrame: null,
    activeTagSubmenu: null,
    activeTagSubmenuParentItem: null,
    pendingStatusFilters: new Set(currentMf?.statusFilters ?? []),
    pendingTagFilters: new Set(currentMf?.tagFilters ?? []),
    pendingAllChecked: false,
    pendingFilterLogic: currentMf?.logic ?? "OR",
  };
  state.pendingAllChecked =
    state.pendingStatusFilters.size === 0 && state.pendingTagFilters.size === 0;

  const ctx: MenuContext = {
    plugin,
    btn,
    targetDocument,
    targetWindow,
    menuPortal,
    margin,
    state,
  };

  const { repositionSubmenu, scheduleReposition } = createMenuPositioning(ctx);

  const removeTagSubmenus = () => {
    menuPortal
      .querySelectorAll(".rss-dashboard-tag-submenu")
      .forEach((el) => el.remove());
    state.activeTagSubmenu = null;
    state.activeTagSubmenuParentItem = null;
  };

  renderLogicToggles(ctx);

  menuPortal.createDiv({ cls: "rss-dashboard-filter-menu-separator" });

  const controls = renderAllItem(ctx, removeTagSubmenus);

  renderStatusOptions(
    ctx,
    controls,
    (parentItem) =>
      showTagsSubMenu(ctx, parentItem, controls, repositionSubmenu),
    removeTagSubmenus,
  );

  renderApplyButton(ctx, removeTagSubmenus, () => cleanup());

  const cleanup = () => {
    // Only this menu owns the document's entry: a save that settles after the
    // menu was reopened must not drop the newer menu's cleanup (#1261/#1259).
    if (openMenuCleanups.get(targetDocument) === cleanup) {
      openMenuCleanups.delete(targetDocument);
    }
    removeTagSubmenus();
    if (state.repositionFrame !== null) {
      targetWindow.cancelAnimationFrame(state.repositionFrame);
      state.repositionFrame = null;
    }
    targetDocument.removeEventListener("scroll", scheduleReposition, true);
    targetWindow.removeEventListener("resize", scheduleReposition);
    targetDocument.removeEventListener("mousedown", handleClickOutside);
    menuPortal.remove();
  };

  openMenuCleanups.set(targetDocument, cleanup);

  // Position the menu (flip/clamp) and keep it attached on scroll/resize.
  scheduleReposition();
  targetDocument.addEventListener("scroll", scheduleReposition, true);
  targetWindow.addEventListener("resize", scheduleReposition);

  // Close menu on click outside
  const handleClickOutside = (ev: Event) => {
    if (!menuPortal.isConnected) {
      return;
    }

    if (
      !menuPortal.contains(ev.target as Node) &&
      !btn.buttonEl.contains(ev.target as Node)
    ) {
      cleanup();
    }
  };

  targetWindow.setTimeout(() => {
    targetDocument.addEventListener("mousedown", handleClickOutside);
  }, 0);
}
