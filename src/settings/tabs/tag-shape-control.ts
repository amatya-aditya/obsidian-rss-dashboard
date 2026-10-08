/**
 * Tag shape control (#663): a radiogroup of Rectangle, Squircle and Pill
 * previews, a custom border-radius field with a live sample, and a reset
 * button. Choosing a value saves it and triggers TAG_CHIP_RADIUS_EVENT so
 * every open window republishes the radius.
 */
import { Setting } from "obsidian";
import { setCssProps } from "../../utils/platform-utils";
import {
  DEFAULT_TAG_CHIP_RADIUS,
  TAG_CHIP_RADIUS_CSS_VAR,
  TAG_CHIP_RADIUS_EVENT,
  TAG_CHIP_RADIUS_PRESETS,
  findTagChipRadiusPreset,
  normalizeTagChipRadius,
  parseTagChipRadius,
} from "../../utils/tag-chip-radius";

/** The slice of the plugin this control reads and writes. */
export interface TagShapeControlHost {
  settings: { display: { tagChipRadius: string } };
  app: { workspace: { trigger: (name: string) => void } };
  saveSettings: () => Promise<void>;
}

const SAMPLE_TAG_COLOR = "var(--interactive-accent)";
const INVALID_RADIUS_MESSAGE =
  "Enter one to four non-negative lengths or percentages, such as 8px or 50%. Use / for elliptical corners. Keeping the last valid shape.";

let controlCounter = 0;

function createSampleChip(parent: HTMLElement, label: string): HTMLElement {
  const chip = parent.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-tag-shape-chip",
    text: label,
  });
  setCssProps(chip, { "--tag-color": SAMPLE_TAG_COLOR });
  return chip;
}

export function renderTagShapeControl(
  containerEl: HTMLElement,
  plugin: TagShapeControlHost,
): void {
  const idBase = `rss-dashboard-tag-shape-${++controlCounter}`;
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

  const customWrap = root.createDiv({ cls: "rss-dashboard-tag-shape-custom" });
  const inputId = `${idBase}-input`;
  const errorId = `${idBase}-error`;
  customWrap.createEl("label", {
    cls: "rss-dashboard-tag-shape-custom-label",
    text: "Custom radius",
    attr: { for: inputId },
  });
  const input = customWrap.createEl("input", {
    cls: "rss-dashboard-tag-shape-input",
    attr: {
      id: inputId,
      type: "text",
      spellcheck: "false",
      autocomplete: "off",
      placeholder: "50%",
      "aria-invalid": "false",
      "aria-describedby": errorId,
    },
  });
  const sample = createSampleChip(customWrap, "Sample");
  sample.addClass("rss-dashboard-tag-shape-sample");
  const errorEl = root.createDiv({
    cls: "rss-dashboard-tag-shape-error",
    attr: { id: errorId, role: "status", "aria-live": "polite" },
  });

  const showError = (message: string): void => {
    errorEl.setText(message);
    input.setAttribute("aria-invalid", message ? "true" : "false");
    customWrap.toggleClass("is-invalid", Boolean(message));
  };

  const syncPresetSelection = (): void => {
    const selected = findTagChipRadiusPreset(currentRadius);
    optionEls.forEach((el, id) => {
      const checked = selected?.id === id;
      el.setAttribute("aria-checked", checked ? "true" : "false");
      el.toggleClass("is-selected", checked);
    });
    // Roving tabindex: the checked radio is the one tab stop; with a custom
    // value no radio is checked, so the first one is.
    const tabStop = selected?.id ?? TAG_CHIP_RADIUS_PRESETS[0]?.id;
    optionEls.forEach((el, id) => {
      el.tabIndex = id === tabStop ? 0 : -1;
    });
    setCssProps(sample, { [TAG_CHIP_RADIUS_CSS_VAR]: currentRadius });
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
    input.value = value;
    showError("");
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

  input.value = currentRadius;
  input.addEventListener("input", () => {
    const parsed = parseTagChipRadius(input.value);
    if (parsed === null) {
      showError(INVALID_RADIUS_MESSAGE);
      return;
    }
    showError("");
    if (parsed !== currentRadius) commit(parsed);
  });

  // Lower-case "pill": the sentence-case lint rule rejects the capital and
  // "Pill" is not in the eslint brands list (see the #663 handoff note).
  const resetButton = root.createEl("button", {
    cls: "rss-dashboard-tag-shape-reset",
    text: "Reset to pill",
    attr: { type: "button" },
  });
  resetButton.addEventListener("click", () => choose(DEFAULT_TAG_CHIP_RADIUS));

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
