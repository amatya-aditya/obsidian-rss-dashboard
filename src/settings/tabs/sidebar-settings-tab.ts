/**
 * Sidebar Settings Tab renderer.
 *
 * Extracted from display-settings-tab.ts.
 * Exports:
 *   - renderSidebarSettingsTab(containerEl, plugin, onRefresh, targetSection) — main render fn
 *   - moveIconOrder(order, fromId, toId, insertAfter)  — testable pure helper
 *   - normalizeHexColor(value)                         — testable pure helper
 */
import { Setting, setIcon, Notice } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  SIDEBAR_ICON_IDS,
  getIconById,
  SIDEBAR_ICONS,
} from "../../utils/sidebar-icon-registry";
import { MediaService } from "../../services/media-service";
import { MastodonService } from "../../services/mastodon-service";
import {
  collectDomainFeeds,
  fetchDomainFeedIcons,
  showDomainIconToggleConfirm,
} from "../../utils/domain-icon-helpers";
import { FeedItem, Feed } from "../../types/types";

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

// ── Tab renderer ──────────────────────────────────────────────────────────────

/**
 * @param onRefresh  Callback that re-renders the full settings panel.
 *                   Needed so the Sidebar tab can call display() without
 *                   holding a reference to the parent class.
 */
export function renderSidebarSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
  targetSection?: string,
): void {
  new Setting(containerEl).setName("Sidebar").setHeading();

  new Setting(containerEl)
    .setName("Show sidebar scrollbar")
    .setDesc("Show the scrollbar in the sidebar feed list")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.showSidebarScrollbar ?? true)
        .onChange(async (value) => {
          plugin.settings.display.showSidebarScrollbar = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.sidebar.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName("Hide default RSS icon")
    .setDesc("Hide the default RSS icon for regular feeds in the sidebar")
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

  // Badge settings helper (reused 3×)
  const renderBadgeSetting = (
    label: string,
    enabledKey: keyof typeof plugin.settings.display,
    colorKey: keyof typeof plugin.settings.display,
    placeholder: string,
  ) => {
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

    new Setting(containerEl)
      .setName(label)
      .setDesc("Enabled | color picker | hex input")
      .setClass("rss-dashboard-settings-two-row")
      .setClass("rss-dashboard-sidebar-badge-setting")
      .addToggle((toggle) =>
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
          }),
      )
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
      });
  };

  renderBadgeSetting(
    "All feeds badge",
    "showAllFeedsUnreadBadges",
    "allFeedsUnreadBadgeColor",
    "#8e44ad",
  );
  renderBadgeSetting(
    "Folders badge",
    "showFolderUnreadBadges",
    "folderUnreadBadgeColor",
    "#d85b9f",
  );
  renderBadgeSetting(
    "Feeds badge",
    "showFeedUnreadBadges",
    "feedUnreadBadgeColor",
    "#8e44ad",
  );

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
    .setDesc("Show a warning icon in the sidebar for feeds that failed to fetch")
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

  new Setting(containerEl)
    .setName("Show folder feed count")
    .setDesc("Show the total number of feeds contained within a folder next to its name")
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.showFolderFeedCount)
        .onChange(async (value) => {
          plugin.settings.display.showFolderFeedCount = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.sidebar.render();
          }
        }),
    );

  // ── Icon Visibility & Order ───────────────────────────────────────────────
  const iconHeading = new Setting(containerEl)
    .setName("Icon visibility")
    .setHeading();
  iconHeading.settingEl.dataset.rssSettingsSection = "icon-visibility";
  if (targetSection === "Icon visibility") {
    activeWindow.setTimeout(() => {
      iconHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  const iconToggleSettings: Setting[] = [];

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

  let draggedIconId: string | null = null;

  const clearIconRowDragState = (): void => {
    draggedIconId = null;
    iconRowsContainer
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
  };

  const renderIconRows = () => {
    iconRowsContainer.empty();
    iconToggleSettings.length = 0;
    const order: string[] = plugin.settings.display.iconOrder?.length
      ? plugin.settings.display.iconOrder
      : [...SIDEBAR_ICON_IDS];
    const hideToolbar = plugin.settings.display.hideToolbarEntirely ?? false;

    order.forEach((id, i) => {
      const icon = getIconById(id);
      if (!icon) return;
      const hideKey = icon.settingKey;

      const nameFrag = document.createDocumentFragment();
      const labelWrap = document.createElement("span");
      labelWrap.addClass("rss-settings-icon-label");
      const iconSpan = document.createElement("span");
      iconSpan.addClass("rss-settings-icon-preview");
      setIcon(iconSpan, icon.lucideIcon);
      labelWrap.append(iconSpan);
      labelWrap.append(` ${icon.label}`);
      nameFrag.append(labelWrap);

      const iconSetting = new Setting(iconRowsContainer)
        .setName(nameFrag)
        .setDisabled(hideToolbar)
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
        );

      iconSetting.settingEl.addClass("rss-dashboard-icon-visibility-row");
      iconSetting.settingEl.setAttribute("data-icon-id", id);

      const dragHandle = activeDocument.createElement("button");
      dragHandle.type = "button";
      dragHandle.addClass("rss-dashboard-icon-drag-handle");
      dragHandle.setAttribute("draggable", "true");
      dragHandle.setAttribute("aria-label", `Drag to reorder ${icon.label}`);
      setIcon(dragHandle, "grip-vertical");
      iconSetting.nameEl.prepend(dragHandle);

      const upBtn = activeDocument.createElement("button");
      upBtn.addClass("rss-dashboard-icon-order-btn");
      upBtn.setAttribute("aria-label", `Move ${icon.label} up`);
      upBtn.textContent = "↑";
      upBtn.disabled = i === 0;
      upBtn.addEventListener("click", () => {
        const currentOrder = plugin.settings.display.iconOrder || [
          ...SIDEBAR_ICON_IDS,
        ];
        const idx = currentOrder.indexOf(id);
        if (idx > 0) {
          const newOrder = [...currentOrder];
          [newOrder[idx - 1], newOrder[idx]] = [
            newOrder[idx],
            newOrder[idx - 1],
          ];
          plugin.settings.display.iconOrder = newOrder;
          renderIconRows();
          void (async () => {
            await plugin.saveSettings();
            const view = await plugin.getActiveDashboardView();
            if (view?.sidebar) view.sidebar.render();
          })();
        }
      });

      const downBtn = activeDocument.createElement("button");
      downBtn.addClass("rss-dashboard-icon-order-btn");
      downBtn.setAttribute("aria-label", `Move ${icon.label} down`);
      downBtn.textContent = "↓";
      downBtn.disabled = i === order.length - 1;
      downBtn.addEventListener("click", () => {
        const currentOrder = plugin.settings.display.iconOrder || [
          ...SIDEBAR_ICON_IDS,
        ];
        const idx = currentOrder.indexOf(id);
        if (idx >= 0 && idx < currentOrder.length - 1) {
          const newOrder = [...currentOrder];
          [newOrder[idx], newOrder[idx + 1]] = [
            newOrder[idx + 1],
            newOrder[idx],
          ];
          plugin.settings.display.iconOrder = newOrder;
          renderIconRows();
          void (async () => {
            await plugin.saveSettings();
            const view = await plugin.getActiveDashboardView();
            if (view?.sidebar) view.sidebar.render();
          })();
        }
      });

      iconSetting.controlEl.prepend(downBtn);
      iconSetting.controlEl.prepend(upBtn);
      iconToggleSettings.push(iconSetting);

      dragHandle.addEventListener("dragstart", (e: DragEvent) => {
        clearIconRowDragState();
        draggedIconId = id;
        iconSetting.settingEl.classList.add("rss-dashboard-icon-row-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.setData("rss-dashboard-icon-id", id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setDragImage(iconSetting.settingEl, 0, 0);
        }
      });

      iconSetting.settingEl.addEventListener("dragover", (e: DragEvent) => {
        if (!draggedIconId || draggedIconId === id) return;
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
        const related =
          e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null;
        if (related && iconSetting.settingEl.contains(related)) return;
        iconSetting.settingEl.classList.remove(
          "rss-dashboard-icon-drop-before",
          "rss-dashboard-icon-drop-after",
        );
      });

      iconSetting.settingEl.addEventListener("drop", (e: DragEvent) => {
        e.preventDefault();
        const fromId =
          draggedIconId ?? e.dataTransfer?.getData("rss-dashboard-icon-id");
        clearIconRowDragState();
        if (!fromId || fromId === id) return;

        const rect = iconSetting.settingEl.getBoundingClientRect();
        const insertAfter = e.clientY > rect.top + rect.height / 2;

        const currentOrder = plugin.settings.display.iconOrder?.length
          ? plugin.settings.display.iconOrder
          : [...SIDEBAR_ICON_IDS];

        const newOrder = moveIconOrder(currentOrder, fromId, id, insertAfter);
        plugin.settings.display.iconOrder = newOrder;
        renderIconRows();
        void (async () => {
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view?.sidebar) view.sidebar.render();
        })();
      });

      dragHandle.addEventListener("dragend", () => {
        clearIconRowDragState();
      });
    });
  };
  renderIconRows();

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

  // ── Sidebar padding ───────────────────────────────────────────────────────
  const paddingHeading = new Setting(containerEl)
    .setName("Sidebar padding")
    .setHeading();
  paddingHeading.settingEl.dataset.rssSettingsSection = "sidebar-padding";
  if (targetSection === "Sidebar padding") {
    activeWindow.setTimeout(() => {
      paddingHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  const renderPaddingSetting = (
    name: string,
    desc: string,
    settingKey: "sidebarItemPaddingLeft" | "sidebarItemPaddingRight",
    defaultValue: number,
  ) => {
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
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncing) return;
            isSyncing = true;
            paddingInput?.setValue(String(value));
            isSyncing = false;
            await apply(value);
          });
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
  };

  renderPaddingSetting(
    "Left padding",
    "Adjust left padding for sidebar rows",
    "sidebarItemPaddingLeft",
    2,
  );
  renderPaddingSetting(
    "Right padding",
    "Adjust right padding for sidebar rows",
    "sidebarItemPaddingRight",
    2,
  );

  // ── Row spacing ───────────────────────────────────────────────────────────
  const spacingHeading = new Setting(containerEl)
    .setName("Row spacing")
    .setHeading();
  spacingHeading.settingEl.dataset.rssSettingsSection = "row-spacing";
  if (targetSection === "Row spacing") {
    activeWindow.setTimeout(() => {
      spacingHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  const renderSpacingSetting = (
    name: string,
    desc: string,
    settingKey: "sidebarRowSpacing" | "sidebarRowIndentation",
    min: number,
    max: number,
    defaultValue: number,
  ) => {
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
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncing) return;
            isSyncing = true;
            spacingInput?.setValue(String(value));
            isSyncing = false;
            await apply(value);
          });
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
  };

  renderSpacingSetting(
    "Sidebar row spacing",
    "Adjust the height between rows in the sidebar feed list",
    "sidebarRowSpacing",
    0,
    44,
    10,
  );
  renderSpacingSetting(
    "Sidebar row indentation",
    "Adjust the indentation of nested items in the sidebar",
    "sidebarRowIndentation",
    0,
    50,
    20,
  );

  // ── Feed icons ───────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Feed icons").setHeading();

  // YouTube info message
  new Setting(containerEl)
    .setName("YouTube profile images")
    .setDesc(
      "YouTube RSS feeds do not provide channel profile images. Videos will always use the default video play icon.",
    );

  // Helper for domain icon toggles
  const setupDomainIconToggle = (
    containerEl: HTMLElement,
    plugin: RssDashboardPlugin,
    options: {
      settingName: string;
      settingDesc: string;
      settingKey:
        | "useDomainIconsRss"
        | "useDomainIconsPodcast"
        | "useDomainIconsTwitter"
        | "useDomainIconsMastodon";
      domainName: string;
      heading: string;
      confirmLabel: string;
      matchesDomain: (feed: {
        url: string;
        iconUrl?: string;
        title: string;
        mediaType?: "article" | "video" | "podcast";
        items: FeedItem[];
      }) => boolean;
      clearIconOnDisable?: (
        entries: { feed: Feed; needsRefresh: boolean }[],
      ) => void;
    },
  ) => {
    const {
      settingName,
      settingDesc,
      settingKey,
      domainName,
      heading,
      confirmLabel,
      matchesDomain,
      clearIconOnDisable,
    } = options;

    new Setting(containerEl)
      .setName(settingName)
      .setDesc(settingDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(!!plugin.settings.display[settingKey])
          .onChange(async (value) => {
            const oldValue = !!plugin.settings.display[settingKey];
            const settings = plugin.settings as unknown as Record<
              string,
              unknown
            >;
            const feeds =
              (settings.feeds as
                | Array<{
                    url: string;
                    iconUrl?: string;
                    title: string;
                    mediaType?: "article" | "video" | "podcast";
                    items: FeedItem[];
                  }>
                | undefined) ?? [];
            const availableTags =
              (settings.availableTags as
                | Array<{ name: string; id?: string }>
                | undefined) ?? [];

            // ── Transition: OFF → ON ─────────────────────────────────────────
            if (!oldValue && value) {
              plugin.settings.display[settingKey] = true as never;
              await plugin.saveSettings();

              // Re-fetch all matching feed icons asynchronously
              void (async () => {
                const entries = collectDomainFeeds(
                  feeds as Feed[],
                  matchesDomain,
                );
                await fetchDomainFeedIcons(
                  entries as { feed: Feed; needsRefresh: boolean }[],
                  plugin.settings.display,
                  availableTags,
                  plugin.settings.media,
                );
                await plugin.saveSettings();
                new Notice(
                  `Profile images loaded for ${entries.filter((e) => e.needsRefresh).length} ${domainName} feed${entries.filter((e) => e.needsRefresh).length === 1 ? "" : "s"}.`,
                );
                const view = await plugin.getActiveDashboardView();
                if (view) {
                  view.render();
                }
              })();
              return;
            }

            // ── Transition: ON → OFF ─────────────────────────────────────────
            if (oldValue && !value) {
              const entries = collectDomainFeeds(
                feeds as Feed[],
                matchesDomain,
              );
              const iconCountByUrl = new Map<string, number>();
              for (const { feed, needsRefresh } of entries as {
                feed: Feed;
                needsRefresh: boolean;
              }[]) {
                if (needsRefresh && feed.iconUrl) {
                  iconCountByUrl.set(
                    feed.url,
                    (iconCountByUrl.get(feed.url) || 0) + 1,
                  );
                }
              }
              const iconCount = iconCountByUrl.size;

              const confirmed = await showDomainIconToggleConfirm(plugin.app, {
                domainName,
                heading,
                description:
                  iconCount > 0
                    ? `${iconCount} ${domainName} feed${iconCount === 1 ? "" : "s"} currently use a profile image. Cached profile-image URLs in your feeds will be cleared. Cached favicons or domain images already shown in the feeds list are unaffected.`
                    : `Existing feeds may have cached profile-image URLs from when the setting was enabled. Cleared feeds will revert to the standard RSS or domain/favicon icon.`,
                cancelLabel: "Cancel",
                confirmLabel,
                onConfirm() {
                  clearIconOnDisable?.(
                    entries as { feed: Feed; needsRefresh: boolean }[],
                  );
                },
              });

              if (confirmed) {
                plugin.settings.display[settingKey] = false as never;
                await plugin.saveSettings();
                const view = await plugin.getActiveDashboardView();
                if (view) {
                  view.render();
                }
              } else {
                // User cancelled — revert the toggle to its previous (ON) state
                setTimeout(() => {
                  void toggle.setValue(true);
                }, 0);
              }
              return;
            }

            // ── No-op: toggle was already in the target state ──────────────────
            plugin.settings.display[settingKey] = value as never;
            await plugin.saveSettings();
          }),
      );
  };

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use site icons/favicons for RSS feeds",
    settingDesc:
      "Replace the standard RSS feed icon with the site icon/favicon when one is available",
    settingKey: "useDomainIconsRss",
    domainName: "RSS",
    heading: "Clear RSS site icons?",
    confirmLabel: "Clear site icons",
    matchesDomain: (feed) =>
      !MastodonService.isResolvedFeedUrl(feed.url) &&
      !MediaService.isYouTubeFeed(feed.url) &&
      feed.mediaType !== "podcast" &&
      !MediaService.isTwitterOrNitterFeed(feed.url),
    clearIconOnDisable: (entries) => {
      for (const { feed } of entries) {
        if (feed.iconUrl) {
          feed.iconUrl = "";
        }
      }
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use album/show artwork for Podcast feeds",
    settingDesc:
      "Replace the standard podcast mic icon with the album/show artwork when one is available",
    settingKey: "useDomainIconsPodcast",
    domainName: "Podcast",
    heading: "Clear Podcast artwork?",
    confirmLabel: "Clear artwork",
    matchesDomain: (feed) => feed.mediaType === "podcast",
    clearIconOnDisable: (entries) => {
      for (const { feed } of entries) {
        if (feed.iconUrl) {
          feed.iconUrl = "";
        }
      }
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use profile images for Twitter/Nitter feeds",
    settingDesc:
      "Replace the standard Twitter/X icon with the feed profile image when one is available",
    settingKey: "useDomainIconsTwitter",
    domainName: "Twitter",
    heading: "Clear Twitter profile images?",
    confirmLabel: "Clear profile images",
    matchesDomain: (feed) => MediaService.isTwitterOrNitterFeed(feed.url),
    clearIconOnDisable: (entries) => {
      for (const { feed } of entries) {
        if (feed.iconUrl) {
          feed.iconUrl = "";
        }
      }
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use profile images for Mastodon feeds",
    settingDesc:
      "Replace the standard Mastodon feed icon with the feed profile image when one is available",
    settingKey: "useDomainIconsMastodon",
    domainName: "Mastodon",
    heading: "Clear Mastodon profile images?",
    confirmLabel: "Clear profile images",
    matchesDomain: (feed) => MastodonService.isResolvedFeedUrl(feed.url),
    clearIconOnDisable: (entries) => {
      for (const { feed } of entries) {
        if (MastodonService.isResolvedFeedUrl(feed.url)) {
          feed.iconUrl = "";
        }
      }
    },
  });

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });
}
