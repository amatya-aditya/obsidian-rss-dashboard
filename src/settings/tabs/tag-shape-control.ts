/**
 * Tag shape control (#663): a radiogroup of Rectangle, Squircle and Pill
 * previews, drawn in the global default tag colors. Choosing a value saves it
 * and triggers TAG_CHIP_RADIUS_EVENT so every open window republishes the
 * radius.
 */
import { Setting } from "obsidian";
import { setCssProps } from "../../utils/platform-utils";
import {
  applyTagAppearance,
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_TEXT_COLOR,
} from "../../utils/tag-colors";
import {
  TAG_CHIP_RADIUS_CSS_VAR,
  TAG_CHIP_RADIUS_EVENT,
  TAG_CHIP_RADIUS_PRESETS,
  findTagChipRadiusPreset,
  normalizeTagChipRadius,
} from "../../utils/tag-chip-radius";

/** The slice of the plugin this control reads and writes. */
export interface TagShapeControlHost {
  settings: TagShapeColorSettings & { display: { tagChipRadius: string } };
  app: { workspace: { trigger: (name: string) => void } };
  saveSettings: () => Promise<void>;
}

/** The global defaults the sample chips inherit. */
export interface TagShapeColorSettings {
  defaultTagColor?: string;
  defaultTagTextColor?: string;
}

/**
 * Styles every sample chip under `containerEl` with the global default tag
 * colors, so the shapes preview what a tag without its own colors looks like.
 */
export function refreshTagShapeSampleColors(
  containerEl: HTMLElement,
  settings: TagShapeColorSettings,
): void {
  const defaults = {
    availableTags: [],
    defaultTagColor: settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
    defaultTagTextColor: settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
  };
  for (const chip of containerEl.querySelectorAll<HTMLElement>(
    ".rss-dashboard-tag-shape-chip",
  )) {
    applyTagAppearance(chip, { name: chip.textContent ?? "" }, defaults);
  }
}

function createSampleChip(parent: HTMLElement, label: string): HTMLElement {
  return parent.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-tag-shape-chip",
    text: label,
  });
}

export function renderTagShapeControl(
  containerEl: HTMLElement,
  plugin: TagShapeControlHost,
): void {
  new Setting(containerEl).setName("Tag shape").setHeading();

  const root = containerEl.createDiv({ cls: "rss-dashboard-tag-shape" });
  root.createDiv({
    cls: "setting-item-description rss-dashboard-tag-shape-help",
    text: "Sets the corner shape of every tag chip in the dashboard, Reader, tag menus, and podcast views.",
  });

  const group = root.createDiv({
    cls: "rss-dashboard-tag-shape-options",
    attr: { role: "radiogroup", "aria-label": "Tag shape" },
  });

  const optionEls = new Map<string, HTMLButtonElement>();
  let currentRadius = normalizeTagChipRadius(
    plugin.settings.display.tagChipRadius,
  );

  const syncPresetSelection = (): void => {
    const selected = findTagChipRadiusPreset(currentRadius);
    optionEls.forEach((el, id) => {
      const checked = selected?.id === id;
      el.setAttribute("aria-checked", checked ? "true" : "false");
      el.toggleClass("is-selected", checked);
    });
    // Roving tabindex: the checked radio is the one tab stop; a stored custom
    // radius matches no preset, so then the first one is.
    const tabStop = selected?.id ?? TAG_CHIP_RADIUS_PRESETS[0]?.id;
    optionEls.forEach((el, id) => {
      el.tabIndex = id === tabStop ? 0 : -1;
    });
  };

  const commit = (value: string): void => {
    currentRadius = value;
    plugin.settings.display.tagChipRadius = value;
    syncPresetSelection();
    // Apply to open views first; saving can take a while on large vaults.
    plugin.app.workspace.trigger(TAG_CHIP_RADIUS_EVENT);
    void plugin.saveSettings();
  };

  const choose = (value: string): void => {
    if (value !== currentRadius) commit(value);
  };

  const presets = TAG_CHIP_RADIUS_PRESETS;
  presets.forEach((preset, index) => {
    const option = group.createEl("button", {
      cls: "rss-dashboard-tag-shape-option",
      attr: {
        type: "button",
        role: "radio",
        "aria-checked": "false",
        "data-preset": preset.id,
        "aria-label": `${preset.label}, ${preset.value}`,
      },
    });
    setCssProps(option, { [TAG_CHIP_RADIUS_CSS_VAR]: preset.value });
    createSampleChip(option, preset.label);
    option.createSpan({
      cls: "rss-dashboard-tag-shape-check",
      text: "✓",
      attr: { "aria-hidden": "true" },
    });
    optionEls.set(preset.id, option);

    option.addEventListener("click", () => choose(preset.value));
    option.addEventListener("keydown", (event: KeyboardEvent) => {
      const target = nextIndex(event.key, index, presets.length);
      if (target !== null) {
        event.preventDefault();
        const next = presets[target];
        if (!next) return;
        choose(next.value);
        optionEls.get(next.id)?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose(preset.value);
      }
    });
  });

  refreshTagShapeSampleColors(root, plugin.settings);
  syncPresetSelection();
}

function nextIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
