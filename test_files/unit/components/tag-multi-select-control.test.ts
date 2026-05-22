import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	Tag,
} from "../../../src/types/types";
import {
	addTagMultiSelectControl,
} from "../../../src/components/tag-multi-select-control";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function makeContainer(): HTMLElement {
	return document.createElement("div");
}

function setup(opts: {
	availableTags: Tag[];
	selectedTagNames: string[];
	onChange?: ReturnType<typeof vi.fn>;
}): {
	wrapper: HTMLElement;
	onChange: ReturnType<typeof vi.fn>;
} {
	const onChange = vi.fn();
	const container = makeContainer();

	addTagMultiSelectControl({
		setting: {
			controlEl: container,
		} as unknown as import("obsidian").Setting,
		availableTags: opts.availableTags,
		selectedTagNames: opts.selectedTagNames,
		onChange,
	});

	const wrapper = container.querySelector<HTMLElement>(
		".rss-dashboard-tag-multi-select",
	);
	expect(wrapper).not.toBeNull();
	return { wrapper: wrapper!, onChange };
}

beforeEach(() => {
	installObsidianDomPolyfills();
	vi.restoreAllMocks();
});

describe("tag-multi-select", () => {

	it("renders a chip div for each available tag", () => {
		const { wrapper } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
				{ name: "Tech", color: "#228811" },
			],
			selectedTagNames: [],
		});
		const chips = wrapper.querySelectorAll(".rss-dashboard-tag-chip");
		expect(chips).toHaveLength(2);
	});

	it("marks preselected tags with aria-pressed=true and unselected chips with aria-pressed=false", () => {
		const { wrapper } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
				{ name: "Tech", color: "#228811" },
			],
			selectedTagNames: ["News"],
		});
		const selected = wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip[aria-pressed='true']",
		);
		expect(selected).toHaveLength(1);
		expect(selected[0].textContent).toBe("News");

		const unselected = wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip[aria-pressed='false']",
		);
		expect(unselected).toHaveLength(1);
		expect(unselected[0].textContent).toBe("Tech");
	});

	it("clicks a chip and onChange fires with normalised array", () => {
		const { wrapper, onChange } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
				{ name: "Tech", color: "#228811" },
			],
			selectedTagNames: ["News"],
		});
		const [, techChip] = Array.from(wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip",
		));

		techChip.click();

		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith(["News", "Tech"]);
	});

	it("clicks a selected chip and onChange fires with chip removed", () => {
		const { wrapper, onChange } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
				{ name: "Tech", color: "#228811" },
			],
			selectedTagNames: ["News", "Tech"],
		});
		const [newsChip] = Array.from(wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip",
		));

		newsChip.click();

		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith(["Tech"]);
	});

	it("dedupes repeated names in selectedTagNames and preserves order", () => {
		const { wrapper } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
				{ name: "Tech", color: "#228811" },
				{ name: "Video", color: "#881122" },
			],
			selectedTagNames: ["News", "Tech", "News", "Tech"],
		});
		const selected = wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip[aria-pressed='true']",
		);
		expect(selected).toHaveLength(2);
		expect(selected[0].textContent).toBe("News");
		expect(selected[1].textContent).toBe("Tech");
	});

	it("ignores names not in availableTags", () => {
		const { wrapper } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
			],
			selectedTagNames: ["News", "Ghost"],
		});
		const chips = wrapper.querySelectorAll(".rss-dashboard-tag-chip");
		expect(chips).toHaveLength(1);
		expect(chips[0].textContent).toBe("News");
		expect(
			wrapper.querySelectorAll(".rss-dashboard-tag-chip[aria-pressed='true']"),
		).toHaveLength(1);
	});

	it("clicks all available tags and emits the final deduped state", () => {
		const { wrapper, onChange } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
			],
			selectedTagNames: [],
		});

		const chips = wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip",
		);
		chips.forEach((chip: HTMLElement) => chip.click());

		expect(onChange).toHaveBeenLastCalledWith(["News"]);
	});

	it("does not mutate the availableTags array", () => {
		const availableTags: Tag[] = [
			{ name: "News", color: "#111122" },
			{ name: "Tech", color: "#228811" },
		];
		setup({
			availableTags,
			selectedTagNames: ["News"],
		});
		expect(availableTags).toEqual([
			{ name: "News", color: "#111122" },
			{ name: "Tech", color: "#228811" },
		]);
	});

	it("renders a visible empty-state element when no tags are available", () => {
		const onChange = vi.fn();
		const container = makeContainer();

		addTagMultiSelectControl({
			setting: {
				controlEl: container,
			} as unknown as import("obsidian").Setting,
			availableTags: [],
			selectedTagNames: [],
			noneLabel: "(none selected)",
			onChange,
		});

		const wrapper = container.querySelector<HTMLElement>(
			".rss-dashboard-tag-multi-select",
		);
		expect(wrapper).not.toBeNull();
		if (wrapper == null) return;
		expect(
			wrapper.querySelectorAll(".rss-dashboard-tag-chip"),
		).toHaveLength(0);

		const emptyEl = wrapper.querySelector<HTMLElement>(
			".rss-dashboard-tag-multi-select-empty",
		);
		expect(emptyEl).not.toBeNull();
		expect(emptyEl!.textContent).toBe("(none selected)");
		expect(wrapper.classList.contains("rss-dashboard-tag-multi-select--empty")).toBe(true);
	});

	it("keyboard Enter fires onChange with the toggled state", () => {
		const { wrapper, onChange } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
			],
			selectedTagNames: [],
		});
		const [chip] = Array.from(wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip",
		));

		chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(onChange).toHaveBeenCalledWith(["News"]);
	});

	it("keyboard Space fires onChange with the toggled state", () => {
		const { wrapper, onChange } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
			],
			selectedTagNames: [],
		});
		const [chip] = Array.from(wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip",
		));

		chip.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		expect(onChange).toHaveBeenCalledWith(["News"]);
	});

	it("repeated toggle on the same chip emits toggle-off without requiring parent re-render", () => {
		const { wrapper, onChange } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
			],
			selectedTagNames: [],
		});
		const [chip] = Array.from(wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip",
		));

		// Click once — selects
		chip.click();

		expect(onChange).toHaveBeenLastCalledWith(["News"]);

		// Click again — deselects (uses live state, not initial snapshot)
		chip.click();
		expect(onChange).toHaveBeenLastCalledWith([]);
	});

	it("heterogeneous sequential clicks on two chips emit cumulative correct state", () => {
		const { wrapper, onChange } = setup({
			availableTags: [
				{ name: "News", color: "#111122" },
				{ name: "Tech", color: "#228811" },
			],
			selectedTagNames: [],
		});
		const chips = wrapper.querySelectorAll<HTMLElement>(
			".rss-dashboard-tag-chip",
		);

		// Select Tech, then News — second click uses live state including Tech
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		chips[1]!.click();
		expect(onChange).toHaveBeenLastCalledWith(["Tech"]);

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		chips[0]!.click();
		expect(onChange).toHaveBeenLastCalledWith(["News", "Tech"]);
	});

});
