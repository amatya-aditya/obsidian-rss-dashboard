/**
 * Display Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderDisplaySettingsTab(containerEl, plugin, onRefresh) — main render fn
 *   - moveIconOrder(order, fromId, toId, insertAfter)  — testable pure helper
 *   - normalizeHexColor(value)                         — testable pure helper
 */
import { Setting, setIcon } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../types/types";
import {
  SIDEBAR_ICON_IDS,
  getIconById,
  SIDEBAR_ICONS,
} from "../../utils/sidebar-icon-registry";
import { formatDashboardMultiFiltersSummaryCompact } from "../../utils/filter-title-format";
import {
  computePopoverPosition,
  computeSubmenuPosition,
} from "../../utils/popover-position";
import { setCssProps } from "../../utils/platform-utils";

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
  if (fromIndex === -1 || toIndex === -1 || fromId === toId) return currentOrder;

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
 *                   Needed so the Display tab can call display() without
 *                   holding a reference to the parent class.
 */
export function renderDisplaySettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
  targetSection?: string,
): void {
  const rerenderActiveReaderView = async (): Promise<void> => {
    const readerView = await plugin.getActiveReaderView?.();
    if (!readerView) {
      return;
    }

    try {
      const viewState = readerView as unknown as {
        applyReaderFormat?: () => void;
      };
      viewState.applyReaderFormat?.();
    } catch {
      // Best-effort refresh for settings-driven format changes.
    }
  };

  const persistReaderFormat = async (): Promise<void> => {
    await plugin.saveSettings();
    await rerenderActiveReaderView();
  };

  new Setting(containerEl).setName("Dashboard").setHeading();

  new Setting(containerEl)
    .setName("Show cover images")
    .setDesc("Display cover images for articles in reader view")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.showCoverImage)
        .onChange(async (value) => {
          plugin.settings.display.showCoverImage = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Show summary")
    .setDesc("Display content summary in card view")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.showSummary)
        .onChange(async (value) => {
          plugin.settings.display.showSummary = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view && plugin.settings.viewStyle === "card") {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  // Cards per row (slider + text input, synced)
  const cardsPerRowSetting = new Setting(containerEl)
    .setName("Cards per row")
    .setDesc("Set card columns in dashboard card view (0 = auto)");
  const cardsPerRowMin = 0;
  const cardsPerRowMax = 6;
  const cardsPerRowStep = 1;
  let isSyncingCardsPerRowControls = false;
  let cardsPerRowSlider: { setValue: (value: number) => void } | null = null;
  let cardsPerRowInput: import("obsidian").TextComponent | null = null;

  const applyCardsPerRow = async (value: number): Promise<void> => {
    plugin.settings.display.cardColumnsPerRow = value;
    await plugin.saveSettings();
    const view = await plugin.getActiveDashboardView();
    if (view) {
      await plugin.app.workspace.revealLeaf(view.leaf);
      view.render();
    }
  };

  cardsPerRowSetting
    .addSlider((slider) => {
      cardsPerRowSlider = slider;
      slider
        .setLimits(cardsPerRowMin, cardsPerRowMax, cardsPerRowStep)
        .setValue(plugin.settings.display.cardColumnsPerRow ?? 0)
        .setDynamicTooltip()
        .onChange(async (value) => {
          if (isSyncingCardsPerRowControls) return;
          isSyncingCardsPerRowControls = true;
          cardsPerRowInput?.setValue(String(value));
          isSyncingCardsPerRowControls = false;
          await applyCardsPerRow(value);
        });
    })
    .addText((text) => {
      const initialValue = plugin.settings.display.cardColumnsPerRow ?? 0;
      cardsPerRowInput = text;
      text.setValue(String(initialValue)).onChange(async (value) => {
        if (isSyncingCardsPerRowControls) return;
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return;
        const clamped = Math.max(cardsPerRowMin, Math.min(cardsPerRowMax, parsed));
        isSyncingCardsPerRowControls = true;
        text.setValue(String(clamped));
        cardsPerRowSlider?.setValue(clamped);
        isSyncingCardsPerRowControls = false;
        await applyCardsPerRow(clamped);
      });
      text.inputEl.type = "number";
      text.inputEl.min = String(cardsPerRowMin);
      text.inputEl.max = String(cardsPerRowMax);
      text.inputEl.step = String(cardsPerRowStep);
      text.inputEl.addClass("rss-dashboard-settings-number-input");
    });
  cardsPerRowSetting.settingEl.addClass("rss-dashboard-settings-two-row");

  // Card spacing (slider + text input, synced)
  const cardSpacingSetting = new Setting(containerEl)
    .setName("Card spacing")
    .setDesc("Adjust the spacing between cards in dashboard card view");
  const cardSpacingMin = 0;
  const cardSpacingMax = 40;
  const cardSpacingStep = 1;
  let isSyncingCardSpacingControls = false;
  let cardSpacingSlider: { setValue: (value: number) => void } | null = null;
  let cardSpacingInput: import("obsidian").TextComponent | null = null;

  const applyCardSpacing = async (value: number): Promise<void> => {
    plugin.settings.display.cardSpacing = value;
    await plugin.saveSettings();
    const view = await plugin.getActiveDashboardView();
    if (view) {
      await plugin.app.workspace.revealLeaf(view.leaf);
      view.render();
    }
  };

  cardSpacingSetting
    .addSlider((slider) => {
      cardSpacingSlider = slider;
      slider
        .setLimits(cardSpacingMin, cardSpacingMax, cardSpacingStep)
        .setValue(plugin.settings.display.cardSpacing ?? 15)
        .setDynamicTooltip()
        .onChange(async (value) => {
          if (isSyncingCardSpacingControls) return;
          isSyncingCardSpacingControls = true;
          cardSpacingInput?.setValue(String(value));
          isSyncingCardSpacingControls = false;
          await applyCardSpacing(value);
        });
    })
    .addText((text) => {
      const initialValue = plugin.settings.display.cardSpacing ?? 15;
      cardSpacingInput = text;
      text.setValue(String(initialValue)).onChange(async (value) => {
        if (isSyncingCardSpacingControls) return;
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return;
        const clamped = Math.max(cardSpacingMin, Math.min(cardSpacingMax, parsed));
        isSyncingCardSpacingControls = true;
        text.setValue(String(clamped));
        cardSpacingSlider?.setValue(clamped);
        isSyncingCardSpacingControls = false;
        await applyCardSpacing(clamped);
      });
      text.inputEl.type = "number";
      text.inputEl.min = String(cardSpacingMin);
      text.inputEl.max = String(cardSpacingMax);
      text.inputEl.step = String(cardSpacingStep);
      text.inputEl.addClass("rss-dashboard-settings-number-input");
    });
  cardSpacingSetting.settingEl.addClass("rss-dashboard-settings-two-row");

  new Setting(containerEl)
    .setName("Show filter status bar")
    .setDesc(
      "Show the dashboard status bar with retrieved and filtered article counts",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.showFilterStatusBar ?? true)
        .onChange(async (value) => {
          plugin.settings.display.showFilterStatusBar = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName('Automatically mark article "read" upon opening')
    .setDesc(
      "When an article is opened, it will be automatically marked as read",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.autoMarkReadOnOpen)
        .onChange(async (value) => {
          plugin.settings.display.autoMarkReadOnOpen = value;
          await plugin.saveSettings();
        }),
    );

  const formatStartupFiltersButton = (): { text: string; tooltip: string | null } => {
    const mf = plugin.settings.dashboardMultiFilters;
    return formatDashboardMultiFiltersSummaryCompact({
      statusFilters: mf?.statusFilters ?? [],
      tagFilters: mf?.tagFilters ?? [],
      logic: mf?.logic ?? "OR",
      maxItems: 2,
    });
  };

  new Setting(containerEl)
    .setName("Startup filters")
    .setDesc(
      "Choose which filters to apply when opening the dashboard.",
    )
    .addButton((btn) => {
      btn.buttonEl.addClass("rss-dashboard-startup-filters-button");
      const initial = formatStartupFiltersButton();
      btn.setButtonText(initial.text);
      if (initial.tooltip) {
        btn.buttonEl.setAttribute("title", initial.tooltip);
      }

      const openMenu = () => {
        const targetDocument = btn.buttonEl.ownerDocument;
        const targetBody = targetDocument.body;
        const targetWindow = targetDocument.defaultView || window;
        const margin = 8;

        // Remove any existing menus from stale state.
        targetDocument
          .querySelectorAll(".rss-dashboard-startup-filters-menu-portal")
          .forEach((el) => el.remove());

        const menuPortal = targetBody.createDiv({
          cls: "rss-dashboard-filter-menu rss-dashboard-filter-menu-portal rss-dashboard-startup-filters-menu-portal",
        });

        let repositionFrame: number | null = null;
        let activeTagSubmenu: HTMLElement | null = null;
        let activeTagSubmenuParentItem: HTMLElement | null = null;

        const repositionSubmenu = () => {
          if (!activeTagSubmenu || !activeTagSubmenuParentItem) {
            return;
          }

          const parentItemRect =
            activeTagSubmenuParentItem.getBoundingClientRect();
          const parentMenuRect = menuPortal.getBoundingClientRect();
          const submenuRect = activeTagSubmenu.getBoundingClientRect();

          const pos = computeSubmenuPosition({
            parentItemRect: parentItemRect as never,
            parentMenuRect: parentMenuRect as never,
            submenuRect: submenuRect as never,
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
            setCssProps(activeTagSubmenu, { "overflow-y": "auto" });
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
            anchorRect: anchorRect as never,
            popoverRect: popoverRect as never,
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
            setCssProps(menuPortal, { "overflow-y": "auto" });
          } else {
            menuPortal.style.removeProperty("max-height");
            menuPortal.style.removeProperty("overflow-y");
          }

          repositionSubmenu();
        };

        const scheduleReposition = () => {
          if (repositionFrame !== null) {
            return;
          }
          repositionFrame = targetWindow.requestAnimationFrame(() => {
            repositionFrame = null;
            repositionMenu();
          });
        };

        const currentMf = plugin.settings.dashboardMultiFilters;
        const pendingStatusFilters = new Set(currentMf?.statusFilters ?? []);
        const pendingTagFilters = new Set(currentMf?.tagFilters ?? []);
        let pendingAllChecked =
          pendingStatusFilters.size === 0 && pendingTagFilters.size === 0;
        let pendingFilterLogic: "AND" | "OR" = currentMf?.logic ?? "OR";

        const removeTagSubmenus = () => {
          menuPortal
            .querySelectorAll(".rss-dashboard-tag-submenu")
            .forEach((el) => el.remove());
          activeTagSubmenu = null;
          activeTagSubmenuParentItem = null;
        };

        // Logic Toggles: And / Or
        const logicToggles = menuPortal.createDiv({
          cls: "rss-dashboard-filter-logic-toggles",
        });

        const andBtn = logicToggles.createEl("button", {
          cls:
            "rss-dashboard-filter-logic-btn" +
            (pendingFilterLogic === "AND" ? " active" : ""),
          text: "And",
        });
        const orBtn = logicToggles.createEl("button", {
          cls:
            "rss-dashboard-filter-logic-btn" +
            (pendingFilterLogic === "OR" ? " active" : ""),
          text: "Or",
        });

        andBtn.addEventListener("click", () => {
          pendingFilterLogic = "AND";
          andBtn.addClass("active");
          orBtn.removeClass("active");
        });

        orBtn.addEventListener("click", () => {
          pendingFilterLogic = "OR";
          orBtn.addClass("active");
          andBtn.removeClass("active");
        });

        menuPortal.createDiv({ cls: "rss-dashboard-filter-menu-separator" });

        // "All" Checkbox - shows all items when no filters selected
        const allItem = menuPortal.createDiv({
          cls: "rss-dashboard-filter-menu-item rss-dashboard-filter-all-item",
        });

        const allCheckbox = allItem.createEl("input", {
          attr: { type: "checkbox" },
          cls: "rss-dashboard-filter-checkbox",
        });
        allCheckbox.checked = pendingAllChecked;

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
          pendingStatusFilters.clear();
          pendingTagFilters.clear();
          pendingAllChecked = true;
          filterCheckboxes.forEach((cb) => {
            cb.checked = false;
          });
        };

        allCheckbox.addEventListener("change", (e) => {
          e.stopPropagation();
          if (allCheckbox.checked) {
            uncheckAllFilterCheckboxes();
          } else {
            pendingAllChecked = false;
          }
        });

        allItem.addEventListener("click", (e) => {
          e.stopPropagation();
          if (e.target !== allCheckbox) {
            allCheckbox.checked = !allCheckbox.checked;
            if (allCheckbox.checked) {
              uncheckAllFilterCheckboxes();
            } else {
              pendingAllChecked = false;
            }
          }
        });

        allItem.addEventListener("mouseenter", removeTagSubmenus);

        const showTagsSubMenu = (parentItem: HTMLElement) => {
          // Remove existing submenus
          menuPortal
            .querySelectorAll(".rss-dashboard-tag-submenu")
            .forEach((el) => el.remove());

          const subMenu = menuPortal.createDiv({
            cls: "rss-dashboard-filter-menu rss-dashboard-tag-submenu",
          });
          activeTagSubmenu = subMenu;
          activeTagSubmenuParentItem = parentItem;

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
            checkbox.checked = pendingTagFilters.has(tag.name);

            const colorDot = item.createDiv({
              cls: "rss-dashboard-tag-color-dot",
            });
            colorDot.style.setProperty("--tag-color", tag.color);

            item.createDiv({
              cls: "rss-dashboard-filter-menu-text",
              text: tag.name,
            });

            checkbox.addEventListener("change", (e) => {
              e.stopPropagation();
              if (checkbox.checked) {
                pendingTagFilters.add(tag.name);
                allCheckbox.checked = false;
                pendingAllChecked = false;
              } else {
                pendingTagFilters.delete(tag.name);
                if (
                  pendingStatusFilters.size === 0 &&
                  pendingTagFilters.size === 0
                ) {
                  allCheckbox.checked = true;
                  pendingAllChecked = true;
                }
              }
            });

            item.addEventListener("click", (e) => {
              if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                  pendingTagFilters.add(tag.name);
                  allCheckbox.checked = false;
                  pendingAllChecked = false;
                } else {
                  pendingTagFilters.delete(tag.name);
                  if (
                    pendingStatusFilters.size === 0 &&
                    pendingTagFilters.size === 0
                  ) {
                    allCheckbox.checked = true;
                    pendingAllChecked = true;
                  }
                }
              }
            });
          });

          targetWindow.requestAnimationFrame(() => {
            repositionSubmenu();
          });
        };

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
          checkbox.checked = pendingStatusFilters.has(opt.id);
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
              showTagsSubMenu(item);
            });
          } else {
            item.addEventListener("mouseenter", () => {
              removeTagSubmenus();
            });
          }

          const handleFilterCheck = (checked: boolean) => {
            if (checked) {
              pendingStatusFilters.add(opt.id);
              allCheckbox.checked = false;
              pendingAllChecked = false;
            } else {
              pendingStatusFilters.delete(opt.id);
              if (opt.id === "tagged") {
                pendingTagFilters.clear();
              }
              if (pendingStatusFilters.size === 0 && pendingTagFilters.size === 0) {
                allCheckbox.checked = true;
                pendingAllChecked = true;
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

        const preApplySeparator = menuPortal.createDiv({
          cls: "rss-dashboard-filter-menu-separator",
        });
        preApplySeparator.addEventListener("mouseenter", removeTagSubmenus);

        const applyBtn = menuPortal.createEl("button", {
          cls: "rss-dashboard-filter-apply-btn",
          text: "Apply",
        });
        applyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void (async () => {
            const nextStatusFilters = pendingAllChecked
              ? []
              : Array.from(pendingStatusFilters);
            const nextTagFilters = pendingAllChecked
              ? []
              : Array.from(pendingTagFilters);

            plugin.settings.dashboardMultiFilters = {
              statusFilters: nextStatusFilters,
              tagFilters: nextTagFilters,
              logic: pendingFilterLogic,
            };

            // De-emphasize legacy single-filter behavior now that startup filtering
            // is configured via dashboard multi-filters.
            plugin.settings.display.defaultFilter = "all";

            await plugin.saveSettings();
            plugin.notifyFiltersUpdated({
              source: "settings-startup-filters",
              timestamp: Date.now(),
            });

            const updated = formatStartupFiltersButton();
            btn.setButtonText(updated.text);
            if (updated.tooltip) {
              btn.buttonEl.setAttribute("title", updated.tooltip);
            } else {
              btn.buttonEl.removeAttribute("title");
            }

            const view = await plugin.getActiveDashboardView();
            if (view) {
              await plugin.app.workspace.revealLeaf(view.leaf);
              view.render();
            }

            cleanup();
          })();
        });

        const cleanup = () => {
          removeTagSubmenus();
          if (repositionFrame !== null) {
            targetWindow.cancelAnimationFrame(repositionFrame);
            repositionFrame = null;
          }
          targetDocument.removeEventListener("scroll", scheduleReposition, true);
          targetWindow.removeEventListener("resize", scheduleReposition);
          targetDocument.removeEventListener("mousedown", handleClickOutside);
          menuPortal.remove();
        };

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
      };

      btn.onClick(openMenu);
    });

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const readerHeading = new Setting(containerEl).setName("Reader").setHeading();
  readerHeading.settingEl.dataset.rssSettingsSection = "reader";
  if (targetSection === "Reader") {
    window.setTimeout(() => {
      readerHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  new Setting(containerEl)
    .setName("Font size")
    .setDesc("Choose the reader body font size preset")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("80", "80%")
        .addOption("90", "90%")
        .addOption("100", "100%")
        .addOption("110", "110%")
        .addOption("120", "120%")
        .addOption("130", "130%")
        .addOption("150", "150%")
        .addOption("175", "175%")
        .addOption("200", "200%")
        .setValue(String(plugin.settings.readerFormat.fontScalePct))
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.fontScalePct = Number.parseInt(value, 10);
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Line height")
    .setDesc("Choose the reader line height preset")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("100", "100%")
        .addOption("110", "110%")
        .addOption("120", "120%")
        .addOption("130", "130%")
        .addOption("140", "140%")
        .addOption("150", "150%")
        .addOption("160", "160%")
        .addOption("180", "180%")
        .addOption("200", "200%")
        .setValue(String(plugin.settings.readerFormat.lineHeightPct))
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.lineHeightPct = Number.parseInt(value, 10);
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Font")
    .setDesc("Choose the reader font family")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("default", "Theme default")
        .addOption("serif", "Serif")
        .addOption("sans", "Sans")
        .addOption("mono", "Mono")
        .setValue(plugin.settings.readerFormat.fontFamily)
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.fontFamily = value as
            | "default"
            | "serif"
            | "sans"
            | "mono";
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Alignment")
    .setDesc("Choose how reader paragraphs align")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("justify", "Justify")
        .addOption("left", "Left")
        .setValue(plugin.settings.readerFormat.textAlign)
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.textAlign = value as "justify" | "left";
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Paragraph spacing")
    .setDesc("Choose the spacing between reader paragraphs")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("default", "Theme default")
        .addOption("tight", "Tight")
        .addOption("normal", "Normal")
        .addOption("loose", "Loose")
        .setValue(plugin.settings.readerFormat.paragraphSpacing)
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.paragraphSpacing = value as
            | "default"
            | "tight"
            | "normal"
            | "loose";
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Reset reader format")
    .setDesc("Restore the reader format defaults")
    .addButton((btn) =>
      btn.setButtonText("Reset").onClick(() => {
        void (async () => {
          plugin.settings.readerFormat = { ...DEFAULT_SETTINGS.readerFormat };
          await persistReaderFormat();
          onRefresh();
        })();
      }),
    );

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
    .setName("Use domain favicons")
    .setDesc(
      "Show domain-specific favicons instead of generic RSS icons for feeds",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.useDomainFavicons)
        .onChange(async (value) => {
          plugin.settings.display.useDomainFavicons = value;
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

  // ── Icon Visibility & Order ───────────────────────────────────────────────
  new Setting(containerEl).setName("Icon visibility").setHeading();

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
          iconToggleSettings.forEach((s) => { s.setDisabled(value); });
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
    const order: string[] =
      plugin.settings.display.iconOrder?.length
        ? plugin.settings.display.iconOrder
        : [...SIDEBAR_ICON_IDS];
    const hideToolbar =
      plugin.settings.display.hideToolbarEntirely ?? false;

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

      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.addClass("rss-dashboard-icon-drag-handle");
      dragHandle.setAttribute("draggable", "true");
      dragHandle.setAttribute("aria-label", `Drag to reorder ${icon.label}`);
      setIcon(dragHandle, "grip-vertical");
      iconSetting.nameEl.prepend(dragHandle);

      const upBtn = document.createElement("button");
      upBtn.addClass("rss-dashboard-icon-order-btn");
      upBtn.setAttribute("aria-label", `Move ${icon.label} up`);
      upBtn.textContent = "↑";
      upBtn.disabled = i === 0;
      upBtn.addEventListener("click", () => {
        const currentOrder =
          plugin.settings.display.iconOrder || [...SIDEBAR_ICON_IDS];
        const idx = currentOrder.indexOf(id);
        if (idx > 0) {
          const newOrder = [...currentOrder];
          [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
          plugin.settings.display.iconOrder = newOrder;
          renderIconRows();
          void (async () => {
            await plugin.saveSettings();
            const view = await plugin.getActiveDashboardView();
            if (view?.sidebar) view.sidebar.render();
          })();
        }
      });

      const downBtn = document.createElement("button");
      downBtn.addClass("rss-dashboard-icon-order-btn");
      downBtn.setAttribute("aria-label", `Move ${icon.label} down`);
      downBtn.textContent = "↓";
      downBtn.disabled = i === order.length - 1;
      downBtn.addEventListener("click", () => {
        const currentOrder =
          plugin.settings.display.iconOrder || [...SIDEBAR_ICON_IDS];
        const idx = currentOrder.indexOf(id);
        if (idx >= 0 && idx < currentOrder.length - 1) {
          const newOrder = [...currentOrder];
          [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
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

        const currentOrder =
          plugin.settings.display.iconOrder?.length
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
  new Setting(containerEl).setName("Sidebar padding").setHeading();

  const renderPaddingSetting = (
    name: string,
    desc: string,
    settingKey: "sidebarItemPaddingLeft" | "sidebarItemPaddingRight",
    defaultValue: number,
  ) => {
    const paddingSetting = new Setting(containerEl)
      .setName(name)
      .setDesc(desc);
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
          .setValue(
            String(plugin.settings.display[settingKey] ?? defaultValue),
          )
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
    0, 44, 10,
  );
  renderSpacingSetting(
    "Sidebar row indentation",
    "Adjust the indentation of nested items in the sidebar",
    "sidebarRowIndentation",
    0, 50, 20,
  );

  // ── Mobile toolbar ────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Mobile toolbar").setHeading();

  new Setting(containerEl)
    .setName("Show toolbar in card view (mobile)")
    .setDesc("Show per-article action buttons in card view on mobile")
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.mobileShowCardToolbar)
        .onChange(async (value) => {
          plugin.settings.display.mobileShowCardToolbar = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName("Show toolbar in list view (mobile)")
    .setDesc("Show per-article action buttons in list view on mobile")
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.mobileShowListToolbar)
        .onChange(async (value) => {
          plugin.settings.display.mobileShowListToolbar = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  const mobileListToolbarStyleSetting = new Setting(containerEl)
    .setName("List toolbar style (mobile)")
    .setDesc("Choose how action buttons are laid out in mobile list view")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("left-grid", "Left grid (2x2)")
        .addOption("bottom-row", "Bottom row")
        .addOption("minimal", "Minimal (read/unread only)")
        .setValue(
          plugin.settings.display.mobileListToolbarStyle || "minimal",
        )
        .onChange(async (value: string) => {
          plugin.settings.display.mobileListToolbarStyle = value as
            | "left-grid"
            | "bottom-row"
            | "minimal";
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );
  mobileListToolbarStyleSetting.settingEl.addClass(
    "rss-dashboard-settings-two-row",
  );

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });
}
