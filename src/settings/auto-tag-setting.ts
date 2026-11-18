import { Setting } from "obsidian";
import type { App } from "obsidian";
import type { Tag } from "../types/types";
import { AccessibleModal } from "../utils/accessible-modal";
import {
  applyTagAppearance,
  type TagAppearanceSettings,
} from "../utils/tag-colors";

interface AutoTagSettingOptions {
  app: App;
  appearance: TagAppearanceSettings;
  selectedNames: readonly string[];
  pickerTitle: string;
  onApply: (names: string[]) => Promise<void>;
}

function addChip(
  parent: HTMLElement,
  tag: Tag,
  appearance: TagAppearanceSettings,
): void {
  const chip = parent.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-settings-tag-chip",
    text: tag.name,
  });
  applyTagAppearance(chip, tag, appearance);
}

class AutoTagPicker extends AccessibleModal {
  constructor(
    private readonly options: AutoTagSettingOptions,
    private readonly selected: ReadonlySet<string>,
  ) {
    super(options.app);
  }

  onOpen(): void {
    const { contentEl, options } = this;
    contentEl.addClass("rss-dashboard-auto-tag-dialog");
    new Setting(contentEl).setName(options.pickerTitle).setHeading();
    const list = contentEl.createDiv({ cls: "rss-dashboard-auto-tag-options" });
    const choices = options.appearance.availableTags.map((tag) => {
      const label = list.createEl("label");
      const input = label.createEl("input", { type: "checkbox" });
      input.checked = this.selected.has(tag.name);
      addChip(label, tag, options.appearance);
      return { name: tag.name, input };
    });
    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("Apply")
          .setCta()
          .onClick(() => {
            const next = choices
              .filter(({ input }) => input.checked)
              .map(({ name }) => name);
            this.close();
            void options.onApply(next);
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function addAutoTagControl(
  setting: Setting,
  options: AutoTagSettingOptions,
): void {
  const { availableTags } = options.appearance;
  let selected = new Set(options.selectedNames.map((name) => name.trim()));
  setting.setClass("rss-dashboard-auto-tag-setting");
  const field = setting.controlEl.createDiv({
    cls: "rss-dashboard-tag-multi-select rss-dashboard-auto-tag-field",
  });
  field.toggleClass(
    "rss-dashboard-tag-multi-select--empty",
    availableTags.length === 0,
  );
  const chips = field.createEl("ul", {
    cls: "rss-dashboard-auto-tag-selected",
    attr: { "aria-label": "Selected tags", role: "list" },
  });
  const refresh = () => {
    chips.empty();
    for (const tag of availableTags) {
      if (selected.has(tag.name))
        addChip(chips.createEl("li"), tag, options.appearance);
    }
    chips.hidden = chips.childElementCount === 0;
  };
  const add = field.createEl("button", {
    cls: "rss-dashboard-tag-multi-select-trigger rss-dashboard-auto-tag-add",
    text: "Add tag",
    attr: {
      type: "button",
      "aria-label": `Add tag: ${setting.nameEl.textContent ?? ""}`,
      "aria-haspopup": "dialog",
    },
  });
  add.disabled = availableTags.length === 0;
  add.addEventListener("click", () => {
    new AutoTagPicker(
      {
        ...options,
        onApply: async (names) => {
          if (
            names.length === selected.size &&
            names.every((name) => selected.has(name))
          )
            return;
          selected = new Set(names);
          refresh();
          await options.onApply(names);
        },
      },
      selected,
    ).open();
  });
  refresh();
}
