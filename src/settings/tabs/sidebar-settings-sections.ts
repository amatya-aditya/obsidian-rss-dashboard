/** Focused renderers and helpers for the Sidebar settings tab. */
import { Setting, setIcon } from "obsidian";
import { isDomNode } from "../../utils/dom-node";
import {
  SIDEBAR_ICON_IDS,
  getIconById,
  SIDEBAR_ICONS,
} from "../../utils/sidebar-icon-registry";
import type { DisplaySettings, SidebarIconConfig } from "../../types/types";
import { settingsUiCompatibility } from "../settings-ui-compat";
import { addInputClearButton } from "../../utils/input-clear-button";
import { renderFeedIconSettings } from "./sidebar-feed-icon-settings";
import type { SidebarSettingsPlugin } from "./sidebar-settings-plugin";

export type { SidebarSettingsPlugin };

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Reorders `currentOrder` by moving the item identified by `fromId`
 * either before or after the item identified by `toId`.
 *
 * Returns a new array — does NOT mutate the input.
 * Returns the original array unchanged if either ID is missing or equal.
 */
export function moveIconOrder(
  currentOrder: string[],
  fromId: string,
  toId: string,
  insertAfter: boolean,
): string[] {
  const fromIndex = currentOrder.indexOf(fromId);
  const toIndex = currentOrder.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1 || fromId === toId)
    return currentOrder;

  const nextOrder = [...currentOrder];
  nextOrder.splice(fromIndex, 1);

  let insertIndex = toIndex;
  if (fromIndex < toIndex) insertIndex -= 1;
  if (insertAfter) insertIndex += 1;

  nextOrder.splice(insertIndex, 0, fromId);
  return nextOrder;
}

/**
 * Validates and normalises a hex color string.
 * Accepts '#rgb', '#rrggbb', 'rgb', or 'rrggbb' (with or without leading '#').
 * Returns the lowercase, hash-prefixed value, or null if invalid.
 */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
    return null;
  }

  return withHash.toLowerCase();
}

// ── Tab sections ──────────────────────────────────────────────────────────────

/**
 * @param onRefresh  Callback that re-renders the full settings panel.
 *                   Needed so the Sidebar tab can call display() without
 *                   holding a reference to the parent class.
 */
export function renderSidebarSettingsSections(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  onRefresh: () => void,
  targetSection?: string,
): void {
  new Setting(containerEl).setName("Sidebar").setHeading();

  renderHideDefaultRssIconSetting(containerEl, plugin);
  renderUnreadBadgeSettings(containerEl, plugin);
  renderFeedVisibilitySettings(containerEl, plugin);
  renderIconVisibilitySettings(containerEl, plugin, onRefresh, targetSection);
  renderSidebarPaddingSettings(containerEl, plugin, targetSection);
  renderRowSpacingSettings(containerEl, plugin, targetSection);
  renderFeedIconSettings(containerEl, plugin);

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });
}

function renderHideDefaultRssIconSetting(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
): void {
  const hideRssIconSetting = new Setting(containerEl)
    .setName("Hide default RSS icon")
    .setDesc("Hide the default RSS icon for regular feeds in the sidebar.")
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.hideDefaultRssIcon)
        .onChange(async (value) => {
          plugin.settings.display.hideDefaultRssIcon = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.sidebar.render();
          }
        }),
    );
  hideRssIconSetting.descEl.createSpan({
    text: " This also hides the fallback icon on Mastodon feeds.",
  });
}

// ── Unread badges ─────────────────────────────────────────────────────────────

function renderUnreadBadgeSettings(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
): void {
  renderBadgeSetting(
    containerEl,
    plugin,
    "All feeds badge",
    "showAllFeedsUnreadBadges",
    "allFeedsUnreadBadgeColor",
    "#8e44ad",
    "the All feeds row",
  );
  renderBadgeSetting(
    containerEl,
    plugin,
    "Folders badge",
    "showFolderUnreadBadges",
    "folderUnreadBadgeColor",
    "#d85b9f",
    "folder rows",
  );
  renderBadgeSetting(
    containerEl,
    plugin,
    "Feeds badge",
    "showFeedUnreadBadges",
    "feedUnreadBadgeColor",
    "#8e44ad",
    "feed rows",
  );
}

// Badge settings helper (reused 3×)
function renderBadgeSetting(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  label: string,
  enabledKey: keyof DisplaySettings,
  colorKey: keyof DisplaySettings,
  placeholder: string,
  rowsDesc: string,
): void {
  let isSyncingBadgeColor = false;
  let badgeColorPicker: { setValue: (value: string) => void } | null = null;
  let badgeColorInput: import("obsidian").TextComponent | null = null;

  const applyBadgeColor = async (value: string): Promise<void> => {
    (plugin.settings.display[colorKey] as string) = value;
    await plugin.saveSettings();
    const view = await plugin.getActiveDashboardView();
    if (view?.sidebar) {
      await plugin.app.workspace.revealLeaf(view.leaf);
      view.sidebar.render();
    }
  };

  const badgeSetting = new Setting(containerEl)
    .setName(label)
    .setDesc(
      `Show the unread count badge on ${rowsDesc}. Use the switch to turn it on or off, then pick its color or type a hex value.`,
    )
    .setClass("rss-dashboard-settings-two-row")
    .setClass("rss-dashboard-sidebar-badge-setting")
    .addToggle((toggle) => {
      toggle.toggleEl.setAttribute("aria-label", `Show ${label}`);
      toggle
        .setValue((plugin.settings.display[enabledKey] as boolean) ?? true)
        .onChange(async (value) => {
          (plugin.settings.display[enabledKey] as boolean) = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.sidebar.render();
          }
        });
    })
    .addColorPicker((colorPicker) => {
      badgeColorPicker = colorPicker;
      colorPicker
        .setValue(plugin.settings.display[colorKey] as string)
        .onChange(async (value) => {
          if (isSyncingBadgeColor) return;
          isSyncingBadgeColor = true;
          badgeColorInput?.setValue(value);
          isSyncingBadgeColor = false;
          await applyBadgeColor(value);
        });
    })
    .addText((text) => {
      badgeColorInput = text;
      text
        .setPlaceholder(placeholder)
        .setValue(plugin.settings.display[colorKey] as string)
        .onChange(async (value) => {
          if (isSyncingBadgeColor) return;
          const normalized = normalizeHexColor(value);
          if (!normalized) return;
          isSyncingBadgeColor = true;
          badgeColorPicker?.setValue(normalized);
          isSyncingBadgeColor = false;
          await applyBadgeColor(normalized);
        });
      text.inputEl.addClass("rss-dashboard-color-hex-input");
      addInputClearButton(text.inputEl, { label: "Clear color" });
      text.inputEl.setAttribute("aria-label", `${label} hex color`);
    });
  // The color picker component exposes no element, so name its input here.
  badgeSetting.controlEl
    .querySelector('input[type="color"]')
    ?.setAttribute("aria-label", `${label} color`);
}

function renderFeedVisibilitySettings(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Hide empty feeds/no unread articles")
    .setDesc(
      "Hide feeds in the sidebar if they have zero articles or zero unread articles",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.hideEmptyFeeds ?? false)
        .onChange(async (value) => {
          plugin.settings.display.hideEmptyFeeds = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.sidebar.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName("Show feed fetch error badges")
    .setDesc(
      "Show a warning icon in the sidebar for feeds that failed to fetch",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(!plugin.settings.display.hideFeedFetchErrorBadges)
        .onChange(async (value) => {
          plugin.settings.display.hideFeedFetchErrorBadges = !value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.sidebar.render();
          }
        }),
    );
}

// ── Icon Visibility & Order ───────────────────────────────────────────────────

/** Per-render state shared by the icon rows of one Sidebar tab render. */
interface IconRowsContext {
  containerEl: HTMLElement;
  plugin: SidebarSettingsPlugin;
  iconRowsContainer: HTMLElement;
  iconToggleSettings: Setting[];
  // The arrows and drag handle are plain buttons, not Setting components, so
  // setDisabled does not reach them; each row registers an updater instead.
  iconOrderControlUpdaters: Array<(hidden: boolean) => void>;
  draggedIconId: string | null;
  isToolbarHidden: () => boolean;
  clearIconRowDragState: () => void;
  renderIconRows: () => void;
}

function renderIconVisibilitySettings(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  onRefresh: () => void,
  targetSection?: string,
): void {
  const iconHeading = new Setting(containerEl)
    .setName("Icon visibility")
    .setDesc(
      "Choose which icons appear in the sidebar header toolbar and in what order.",
    )
    .setHeading();
  iconHeading.settingEl.dataset.rssSettingsSection = "icon-visibility";
  if (targetSection === "Icon visibility") {
    window.setTimeout(() => {
      iconHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  const iconToggleSettings: Setting[] = [];
  const iconOrderControlUpdaters: Array<(hidden: boolean) => void> = [];
  const isToolbarHidden = (): boolean =>
    plugin.settings.display.hideToolbarEntirely ?? false;

  new Setting(containerEl)
    .setName("Hide toolbar entirely")
    .setDesc("Hide all icons in the sidebar header")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.hideToolbarEntirely ?? false)
        .onChange(async (value) => {
          plugin.settings.display.hideToolbarEntirely = value;
          await plugin.saveSettings();
          iconToggleSettings.forEach((s) => {
            s.setDisabled(value);
          });
          iconOrderControlUpdaters.forEach((update) => {
            update(value);
          });
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.sidebar.render();
          }
        }),
    );

  const iconRowsContainer = containerEl.createDiv({
    cls: "rss-dashboard-icon-visibility-rows",
  });

  const context: IconRowsContext = {
    containerEl,
    plugin,
    iconRowsContainer,
    iconToggleSettings,
    iconOrderControlUpdaters,
    draggedIconId: null,
    isToolbarHidden,
    clearIconRowDragState: () => clearIconRowDragState(context),
    renderIconRows: () => renderIconRows(context),
  };
  renderIconRows(context);

  new Setting(containerEl)
    .setName("Reset icon order & visibility")
    .addButton((btn) =>
      btn.setButtonText("Reset").onClick(() => {
        void (async () => {
          plugin.settings.display.iconOrder = [...SIDEBAR_ICON_IDS];
          plugin.settings.display.hideToolbarEntirely = false;
          SIDEBAR_ICONS.forEach((icon) => {
            (plugin.settings.display[icon.settingKey] as boolean) = false;
          });

          await plugin.saveSettings();
          onRefresh();

          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) view.sidebar.render();
        })();
      }),
    );
}

function clearIconRowDragState(context: IconRowsContext): void {
  context.draggedIconId = null;
  context.iconRowsContainer
    .querySelectorAll(
      ".rss-dashboard-icon-row-dragging, .rss-dashboard-icon-drop-before, .rss-dashboard-icon-drop-after",
    )
    .forEach((el) => {
      el.classList.remove(
        "rss-dashboard-icon-row-dragging",
        "rss-dashboard-icon-drop-before",
        "rss-dashboard-icon-drop-after",
      );
    });
}

function renderIconRows(context: IconRowsContext): void {
  const { plugin, iconRowsContainer } = context;
  iconRowsContainer.empty();
  context.iconToggleSettings.length = 0;
  context.iconOrderControlUpdaters.length = 0;
  const order: string[] = plugin.settings.display.iconOrder?.length
    ? plugin.settings.display.iconOrder
    : [...SIDEBAR_ICON_IDS];
  const hideToolbar = plugin.settings.display.hideToolbarEntirely ?? false;

  order.forEach((id, i) => {
    renderIconRow(context, id, i, order, hideToolbar);
  });
}

function renderIconRow(
  context: IconRowsContext,
  id: string,
  i: number,
  order: string[],
  hideToolbar: boolean,
): void {
  const icon = getIconById(id);
  if (!icon) return;

  const { iconSetting, dragHandle } = createIconVisibilitySetting(
    context,
    icon,
    id,
    hideToolbar,
  );
  const upBtn = createMoveUpButton(context, icon, id);
  const downBtn = createMoveDownButton(context, icon, id);

  iconSetting.controlEl.prepend(downBtn);
  iconSetting.controlEl.prepend(upBtn);
  context.iconToggleSettings.push(iconSetting);

  const applyToolbarHidden = (hidden: boolean): void => {
    dragHandle.disabled = hidden;
    dragHandle.setAttribute("draggable", hidden ? "false" : "true");
    upBtn.disabled = hidden || i === 0;
    downBtn.disabled = hidden || i === order.length - 1;
  };
  applyToolbarHidden(hideToolbar);
  context.iconOrderControlUpdaters.push(applyToolbarHidden);

  attachIconRowDragHandlers(context, iconSetting, dragHandle, id);
}

function createIconVisibilitySetting(
  context: IconRowsContext,
  icon: SidebarIconConfig,
  id: string,
  hideToolbar: boolean,
): { iconSetting: Setting; dragHandle: HTMLButtonElement } {
  const { containerEl, plugin, iconRowsContainer } = context;
  const hideKey = icon.settingKey;

  const iconSetting = new Setting(iconRowsContainer)
    .setName(icon.label)
    .setDesc(`Show the ${icon.label} icon in the sidebar header`)
    .addToggle((toggle) =>
      toggle
        .setValue(!(plugin.settings.display[hideKey] as boolean))
        .onChange((value) => {
          void (async () => {
            (plugin.settings.display[hideKey] as boolean) = !value;
            await plugin.saveSettings();
            const view = await plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await plugin.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          })();
        }),
    )
    // After addToggle: Setting.setDisabled only reaches existing components.
    .setDisabled(hideToolbar);

  iconSetting.settingEl.addClass("rss-dashboard-icon-visibility-row");
  iconSetting.settingEl.setAttribute("data-icon-id", id);

  const iconPreview = containerEl.win.createSpan();
  iconPreview.addClass("rss-settings-icon-preview");
  setIcon(iconPreview, icon.lucideIcon);
  iconSetting.nameEl.prepend(iconPreview);

  const dragHandle = containerEl.win.createEl("button");
  dragHandle.type = "button";
  dragHandle.addClass("rss-dashboard-icon-drag-handle");
  dragHandle.setAttribute("draggable", "true");
  dragHandle.setAttribute("aria-label", `Drag to reorder ${icon.label}`);
  setIcon(dragHandle, "grip-vertical");
  iconSetting.nameEl.prepend(dragHandle);

  return { iconSetting, dragHandle };
}

function createMoveUpButton(
  context: IconRowsContext,
  icon: SidebarIconConfig,
  id: string,
): HTMLButtonElement {
  const { containerEl, plugin } = context;
  const upBtn = containerEl.win.createEl("button");
  upBtn.addClass("rss-dashboard-icon-order-btn");
  upBtn.setAttribute("aria-label", `Move ${icon.label} up`);
  upBtn.textContent = "↑";
  upBtn.addEventListener("click", () => {
    if (context.isToolbarHidden()) return;
    const currentOrder = plugin.settings.display.iconOrder || [
      ...SIDEBAR_ICON_IDS,
    ];
    const idx = currentOrder.indexOf(id);
    if (idx > 0) {
      const newOrder = [...currentOrder];
      const previousId = newOrder[idx - 1];
      const currentId = newOrder[idx];
      if (previousId === undefined || currentId === undefined) return;
      [newOrder[idx - 1], newOrder[idx]] = [currentId, previousId];
      plugin.settings.display.iconOrder = newOrder;
      context.renderIconRows();
      void (async () => {
        await plugin.saveSettings();
        const view = await plugin.getActiveDashboardView();
        if (view?.sidebar) view.sidebar.render();
      })();
    }
  });
  return upBtn;
}

function createMoveDownButton(
  context: IconRowsContext,
  icon: SidebarIconConfig,
  id: string,
): HTMLButtonElement {
  const { containerEl, plugin } = context;
  const downBtn = containerEl.win.createEl("button");
  downBtn.addClass("rss-dashboard-icon-order-btn");
  downBtn.setAttribute("aria-label", `Move ${icon.label} down`);
  downBtn.textContent = "↓";
  downBtn.addEventListener("click", () => {
    if (context.isToolbarHidden()) return;
    const currentOrder = plugin.settings.display.iconOrder || [
      ...SIDEBAR_ICON_IDS,
    ];
    const idx = currentOrder.indexOf(id);
    if (idx >= 0 && idx < currentOrder.length - 1) {
      const newOrder = [...currentOrder];
      const currentId = newOrder[idx];
      const nextId = newOrder[idx + 1];
      if (currentId === undefined || nextId === undefined) return;
      [newOrder[idx], newOrder[idx + 1]] = [nextId, currentId];
      plugin.settings.display.iconOrder = newOrder;
      context.renderIconRows();
      void (async () => {
        await plugin.saveSettings();
        const view = await plugin.getActiveDashboardView();
        if (view?.sidebar) view.sidebar.render();
      })();
    }
  });
  return downBtn;
}

function attachIconRowDragHandlers(
  context: IconRowsContext,
  iconSetting: Setting,
  dragHandle: HTMLButtonElement,
  id: string,
): void {
  const { plugin, iconRowsContainer } = context;

  dragHandle.addEventListener("dragstart", (e: DragEvent) => {
    if (context.isToolbarHidden()) {
      e.preventDefault();
      return;
    }
    context.clearIconRowDragState();
    context.draggedIconId = id;
    iconSetting.settingEl.classList.add("rss-dashboard-icon-row-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.setData("rss-dashboard-icon-id", id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setDragImage(iconSetting.settingEl, 0, 0);
    }
  });

  iconSetting.settingEl.addEventListener("dragover", (e: DragEvent) => {
    if (
      context.isToolbarHidden() ||
      !context.draggedIconId ||
      context.draggedIconId === id
    )
      return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    iconRowsContainer
      .querySelectorAll(
        ".rss-dashboard-icon-drop-before, .rss-dashboard-icon-drop-after",
      )
      .forEach((el) => {
        el.classList.remove(
          "rss-dashboard-icon-drop-before",
          "rss-dashboard-icon-drop-after",
        );
      });

    const rect = iconSetting.settingEl.getBoundingClientRect();
    const insertAfter = e.clientY > rect.top + rect.height / 2;
    iconSetting.settingEl.classList.toggle(
      "rss-dashboard-icon-drop-after",
      insertAfter,
    );
    iconSetting.settingEl.classList.toggle(
      "rss-dashboard-icon-drop-before",
      !insertAfter,
    );
  });

  iconSetting.settingEl.addEventListener("dragleave", (e: DragEvent) => {
    const relatedTarget = e.relatedTarget;
    const related =
      isDomNode(relatedTarget) && relatedTarget.instanceOf(HTMLElement)
        ? relatedTarget
        : null;
    if (related && iconSetting.settingEl.contains(related)) return;
    iconSetting.settingEl.classList.remove(
      "rss-dashboard-icon-drop-before",
      "rss-dashboard-icon-drop-after",
    );
  });

  iconSetting.settingEl.addEventListener("drop", (e: DragEvent) => {
    e.preventDefault();
    if (context.isToolbarHidden()) {
      context.clearIconRowDragState();
      return;
    }
    const fromId =
      context.draggedIconId ?? e.dataTransfer?.getData("rss-dashboard-icon-id");
    context.clearIconRowDragState();
    if (!fromId || fromId === id) return;

    const rect = iconSetting.settingEl.getBoundingClientRect();
    const insertAfter = e.clientY > rect.top + rect.height / 2;

    const currentOrder = plugin.settings.display.iconOrder?.length
      ? plugin.settings.display.iconOrder
      : [...SIDEBAR_ICON_IDS];

    const newOrder = moveIconOrder(currentOrder, fromId, id, insertAfter);
    plugin.settings.display.iconOrder = newOrder;
    context.renderIconRows();
    void (async () => {
      await plugin.saveSettings();
      const view = await plugin.getActiveDashboardView();
      if (view?.sidebar) view.sidebar.render();
    })();
  });

  dragHandle.addEventListener("dragend", () => {
    context.clearIconRowDragState();
  });
}

// ── Sidebar padding ───────────────────────────────────────────────────────────

function renderSidebarPaddingSettings(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  targetSection?: string,
): void {
  const paddingHeading = new Setting(containerEl)
    .setName("Sidebar padding")
    .setHeading();
  paddingHeading.settingEl.dataset.rssSettingsSection = "sidebar-padding";
  if (targetSection === "Sidebar padding") {
    window.setTimeout(() => {
      paddingHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  renderPaddingSetting(
    containerEl,
    plugin,
    "Left padding",
    "Adjust left padding for folder and feed rows in the sidebar",
    "sidebarItemPaddingLeft",
    2,
  );
  renderPaddingSetting(
    containerEl,
    plugin,
    "Right padding",
    "Adjust right padding for folder and feed rows in the sidebar",
    "sidebarItemPaddingRight",
    2,
  );
}

function renderPaddingSetting(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  name: string,
  desc: string,
  settingKey: "sidebarItemPaddingLeft" | "sidebarItemPaddingRight",
  defaultValue: number,
): void {
  const paddingSetting = new Setting(containerEl).setName(name).setDesc(desc);
  const paddingMin = 0;
  const paddingMax = 40;
  const paddingStep = 1;
  let isSyncing = false;
  let paddingSlider: { setValue: (value: number) => void } | null = null;
  let paddingInput: import("obsidian").TextComponent | null = null;

  const apply = async (value: number): Promise<void> => {
    plugin.settings.display[settingKey] = value;
    await plugin.saveSettings();
    const view = await plugin.getActiveDashboardView();
    if (view?.sidebar) view.sidebar.render();
  };

  paddingSetting
    .addSlider((slider) => {
      paddingSlider = slider;
      slider
        .setLimits(paddingMin, paddingMax, paddingStep)
        .setValue(plugin.settings.display[settingKey] ?? defaultValue)
        .onChange(async (value) => {
          if (isSyncing) return;
          isSyncing = true;
          paddingInput?.setValue(String(value));
          isSyncing = false;
          await apply(value);
        });
      settingsUiCompatibility.presentSliderValue(
        slider,
        (value) => `${value}px`,
      );
    })
    .addText((text) => {
      paddingInput = text;
      text
        .setValue(String(plugin.settings.display[settingKey] ?? defaultValue))
        .onChange(async (value) => {
          if (isSyncing) return;
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;
          const clamped = Math.max(paddingMin, Math.min(paddingMax, parsed));
          isSyncing = true;
          text.setValue(String(clamped));
          paddingSlider?.setValue(clamped);
          isSyncing = false;
          await apply(clamped);
        });
      text.inputEl.type = "number";
      text.inputEl.min = String(paddingMin);
      text.inputEl.max = String(paddingMax);
      text.inputEl.step = String(paddingStep);
      text.inputEl.addClass("rss-dashboard-settings-number-input");
    });
  paddingSetting.settingEl.addClass("rss-dashboard-settings-two-row");
}

// ── Row spacing ───────────────────────────────────────────────────────────────

function renderRowSpacingSettings(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  targetSection?: string,
): void {
  const spacingHeading = new Setting(containerEl)
    .setName("Row spacing")
    .setHeading();
  spacingHeading.settingEl.dataset.rssSettingsSection = "row-spacing";
  if (targetSection === "Row spacing") {
    window.setTimeout(() => {
      spacingHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  renderSpacingSetting(
    containerEl,
    plugin,
    "Sidebar row spacing",
    "Adjust the height between folder and feed rows in the sidebar",
    "sidebarRowSpacing",
    0,
    44,
    10,
  );
  renderSpacingSetting(
    containerEl,
    plugin,
    "Sidebar row indentation",
    "Adjust the indentation of feeds nested inside folders in the sidebar",
    "sidebarRowIndentation",
    0,
    50,
    20,
  );
}

function renderSpacingSetting(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  name: string,
  desc: string,
  settingKey: "sidebarRowSpacing" | "sidebarRowIndentation",
  min: number,
  max: number,
  defaultValue: number,
): void {
  const spacingSetting = new Setting(containerEl).setName(name).setDesc(desc);
  let isSyncing = false;
  let spacingSlider: { setValue: (value: number) => void } | null = null;
  let spacingInput: import("obsidian").TextComponent | null = null;

  const apply = async (value: number): Promise<void> => {
    plugin.settings.display[settingKey] = value;
    await plugin.saveSettings();
    const view = await plugin.getActiveDashboardView();
    if (view?.sidebar) view.sidebar.render();
  };

  spacingSetting
    .addSlider((slider) => {
      spacingSlider = slider;
      slider
        .setLimits(min, max, 1)
        .setValue(plugin.settings.display[settingKey] ?? defaultValue)
        .onChange(async (value) => {
          if (isSyncing) return;
          isSyncing = true;
          spacingInput?.setValue(String(value));
          isSyncing = false;
          await apply(value);
        });
      settingsUiCompatibility.presentSliderValue(
        slider,
        (value) => `${value}px`,
      );
    })
    .addText((text) => {
      spacingInput = text;
      text
        .setValue(String(plugin.settings.display[settingKey] ?? defaultValue))
        .onChange(async (value) => {
          if (isSyncing) return;
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;
          const clamped = Math.max(min, Math.min(max, parsed));
          isSyncing = true;
          text.setValue(String(clamped));
          spacingSlider?.setValue(clamped);
          isSyncing = false;
          await apply(clamped);
        });
      text.inputEl.type = "number";
      text.inputEl.min = String(min);
      text.inputEl.max = String(max);
      text.inputEl.step = "1";
      text.inputEl.addClass("rss-dashboard-settings-number-input");
    });
  spacingSetting.settingEl.addClass("rss-dashboard-settings-two-row");
}
