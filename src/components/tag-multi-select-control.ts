import { setIcon } from "obsidian";
import type { Tag } from "../types/types";
import type { TagAppearanceSettings } from "../utils/tag-colors";
import { createTagMultiSelectMenuController } from "./tag-multi-select-menu";

export interface TagMultiSelectControlOptions {
  setting: import("obsidian").Setting;
  availableTags: ReadonlyArray<Tag>;
  tagAppearanceSettings?: TagAppearanceSettings;
  selectedTagNames: ReadonlyArray<string>;
  noneLabel?: string;
  triggerEmptyLabel?: string;
  menuTitle?: string;
  mobileSheetTitle?: string;
  onChange: (selectedTagNames: string[]) => void | Promise<void>;
}

const CLS_WRAPPER = "rss-dashboard-tag-multi-select";
const CLS_EMPTY = `${CLS_WRAPPER}--empty`;
const CLS_TRIGGER = `${CLS_WRAPPER}-trigger`;
const CLS_TRIGGER_LABEL = `${CLS_TRIGGER}-label`;

export function addTagMultiSelectControl(
  opts: TagMultiSelectControlOptions,
): void {
  const {
    setting,
    availableTags,
    tagAppearanceSettings,
    onChange,
    menuTitle = "Select tags",
    mobileSheetTitle = menuTitle,
  } = opts;

  const selectedSet = normalizeSelection(opts.selectedTagNames, availableTags);
  const controlEl = setting.controlEl;
  const wrapper = controlEl.createDiv({ cls: CLS_WRAPPER });
  const trigger = wrapper.createEl("button", {
    cls: CLS_TRIGGER,
    attr: {
      type: "button",
      "aria-label": menuTitle,
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
    },
  });
  const triggerLabel = trigger.createSpan({ cls: CLS_TRIGGER_LABEL });
  const triggerIcon = trigger.createSpan();
  setIcon(triggerIcon, "chevrons-up-down");

  const syncWrapperState = () => {
    const isEmpty = availableTags.length === 0;
    wrapper.classList.toggle(CLS_EMPTY, isEmpty);
    trigger.disabled = isEmpty;
    trigger.setAttr("aria-disabled", isEmpty ? "true" : "false");
    triggerLabel.textContent = getSummaryLabel(
      selectedSet,
      availableTags,
      opts,
    );
  };

  const menuController = createTagMultiSelectMenuController({
    trigger,
    availableTags,
    tagAppearanceSettings,
    selectedSet,
    emptySummary: getSummaryLabel(selectedSet, availableTags, opts),
    mobileSheetTitle,
    onSelectionChange: (next) => {
      selectedSet.clear();
      for (const name of next) {
        selectedSet.add(name);
      }
      syncWrapperState();
    },
    onChange,
  });

  trigger.addEventListener("click", () => {
    if (trigger.disabled) return;
    menuController.toggle();
  });

  syncWrapperState();
}

function normalizeSelection(
  selectedTagNames: ReadonlyArray<string>,
  availableTags: ReadonlyArray<Tag>,
): Set<string> {
  const availableNameSet = new Set(availableTags.map((tag) => tag.name));
  const selectedSet = new Set<string>();

  for (const rawName of selectedTagNames) {
    const trimmed = rawName.trim();
    if (trimmed && availableNameSet.has(trimmed)) {
      selectedSet.add(trimmed);
    }
  }

  return selectedSet;
}

function getSummaryLabel(
  selectedSet: ReadonlySet<string>,
  availableTags: ReadonlyArray<Tag>,
  opts: Pick<TagMultiSelectControlOptions, "noneLabel" | "triggerEmptyLabel">,
): string {
  const emptyLabel = opts.triggerEmptyLabel ?? opts.noneLabel ?? "None";
  const selectedNames = availableTags
    .filter((tag) => selectedSet.has(tag.name))
    .map((tag) => tag.name);

  if (selectedNames.length === 0) {
    return emptyLabel;
  }
  if (selectedNames.length === 1) {
    return selectedNames[0] ?? emptyLabel;
  }
  return `${selectedNames.length} tags selected`;
}
