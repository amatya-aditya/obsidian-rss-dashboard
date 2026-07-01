/**
 * Display Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderDisplaySettingsTab(containerEl, plugin, onRefresh) — main render fn
 */
import { Setting, setIcon } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../types/types";
import { formatDashboardMultiFiltersSummaryCompact } from "../../utils/filter-title-format";
import {
  computePopoverPosition,
  computeSubmenuPosition,
} from "../../utils/popover-position";

// Re-export pure helpers from sidebar-settings-tab for backward compatibility
export { moveIconOrder, normalizeHexColor } from "./sidebar-settings-tab";

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
        const clamped = Math.max(
          cardsPerRowMin,
          Math.min(cardsPerRowMax, parsed),
        );
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
        const clamped = Math.max(
          cardSpacingMin,
          Math.min(cardSpacingMax, parsed),
        );
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

  new Setting(containerEl)
    .setName("Article date display")
    .setDesc(
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      "Choose whether article dates are shown as relative ('2 days ago') or absolute ('May 9, 2026').",
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption("relative", "Relative (e.g. '2 days ago')")
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        .addOption("absolute", "Absolute (e.g. 'May 9, 2026, 11:39 AM')")
        .setValue(plugin.settings.display.articleDateStyle ?? "relative")
        .onChange(async (value: string) => {
          plugin.settings.display.articleDateStyle = value as
            | "relative"
            | "absolute";
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  const formatStartupFiltersButton = (): {
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

  new Setting(containerEl)
    .setName("Startup filters")
    .setDesc("Choose which filters to apply when opening the dashboard.")
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
        const targetWindow = targetDocument.defaultView || activeWindow;
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
              if (
                pendingStatusFilters.size === 0 &&
                pendingTagFilters.size === 0
              ) {
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
          targetDocument.removeEventListener(
            "scroll",
            scheduleReposition,
            true,
          );
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

  // ── Reader ───────────────────────────────────────────────────────────────
  const readerHeading = new Setting(containerEl).setName("Reader").setHeading();
  readerHeading.settingEl.dataset.rssSettingsSection = "reader";
  if (targetSection === "Reader") {
    activeWindow.setTimeout(() => {
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
          plugin.settings.readerFormat.fontScalePct = Number.parseInt(
            value,
            10,
          );
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
          plugin.settings.readerFormat.lineHeightPct = Number.parseInt(
            value,
            10,
          );
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

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

  // ── Mobile toolbar ────────────────────────────────────────────────────────
  const mobileHeading = new Setting(containerEl)
    .setName("Mobile toolbar")
    .setHeading();
  mobileHeading.settingEl.dataset.rssSettingsSection = "mobile-toolbar";
  if (targetSection === "Mobile toolbar") {
    activeWindow.setTimeout(() => {
      mobileHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

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
        .setValue(plugin.settings.display.mobileListToolbarStyle || "minimal")
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
