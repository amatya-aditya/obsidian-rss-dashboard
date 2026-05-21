import { setIcon } from "obsidian";
import type { Tag } from "../types/types";

export interface TagMultiSelectControlOptions {
	setting: import("obsidian").Setting;
	availableTags: ReadonlyArray<Tag>;
	selectedTagNames: ReadonlyArray<string>;
	noneLabel?: string;
	onChange: (selectedTagNames: string[]) => void | Promise<void>;
}

const CLS_WRAPPER = "rss-dashboard-tag-multi-select";
const CLS_CHIP = "rss-dashboard-tag-chip";
const CLS_SELECTED = `${CLS_CHIP}--selected`;
const CLS_EMPTY_STATE = `${CLS_WRAPPER}--empty`;
const CLS_EMPTY_TEXT = `rss-dashboard-tag-multi-select-empty`;
const ICON_CHECK = "checkmark";
const ICON_PLUS = "plus";
const ACCENT_COLOR_KEY = "--tag-chip-accent-color";

export function addTagMultiSelectControl(
	opts: TagMultiSelectControlOptions,
): void {
	const {
		setting,
		availableTags,
		selectedTagNames,
		onChange,
	} = opts;

	const { controlEl } = setting;
	const wrapper = controlEl.createDiv({ cls: CLS_WRAPPER });

	// Normalise + dedupe; ignore names not matching availableTags.
	const availableNameSet = new Set(availableTags.map((t) => t.name));
	const selectedSet = new Set<string>();
	for (const n of selectedTagNames) {
		const trimmed = n.trim();
		if (trimmed && availableNameSet.has(trimmed)) {
			selectedSet.add(trimmed);
		}
	}

	// Nothing to render when there are no available tags; show an explicit
	// empty-state element rather than leaving the control area blank.
	if (availableTags.length === 0) {
		const label = opts.noneLabel ?? "(none selected)";
		wrapper.addClass(CLS_EMPTY_STATE);
		wrapper.createSpan({
			cls: CLS_EMPTY_TEXT,
			text: label,
		});
		return;
	}

	for (const tag of availableTags) {
		const selected = selectedSet.has(tag.name);

		const chip = wrapper.createDiv({
			cls: `${CLS_CHIP}${selected ? ` ${CLS_SELECTED}` : ""}`,
		});
		chip.setAttr("role", "button");
		chip.setAttr("tabindex", "0");
		chip.setAttr("aria-pressed", selected ? "true" : "false");
		chip.style.setProperty(ACCENT_COLOR_KEY, tag.color);

		setIcon(chip.createSpan({ cls: `${CLS_CHIP}-icon` }), selected ? ICON_CHECK : ICON_PLUS);
		chip.createSpan({ cls: `${CLS_CHIP}-name`, text: tag.name });

		const handleToggle = () => {
			const next = recomputeSelected(tag.name, selectedSet, availableTags);
			// Mutate in place so every capture — before change propagates out
			// is based on the freshest derived state, not the original snapshot.
			selectedSet.clear();
			for (const name of next) {
				selectedSet.add(name);
			}
			void onChange(next);
		};

		chip.addEventListener("click", handleToggle);
		chip.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				handleToggle();
			}
		});
	}
}

/**
 * Return the new normalised, deduped, stable-order array after toggling
 * `name`. Result is always drawn from `availableTags` order.
 */
function recomputeSelected(
	toggledName: string,
	currentSet: Set<string>,
	availableTags: ReadonlyArray<Tag>,
): string[] {
	const next = new Set(currentSet);
	if (next.has(toggledName)) {
		next.delete(toggledName);
	} else {
		next.add(toggledName);
	}
	return availableTags
		.filter((t) => next.has(t.name))
		.map((t) => t.name);
}
