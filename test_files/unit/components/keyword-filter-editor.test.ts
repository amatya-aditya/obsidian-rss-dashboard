import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderKeywordFilterEditor,
  type KeywordFilterEditorState,
} from "../../../src/components/keyword-filter-editor";
import type { KeywordFilterRule } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createRule(overrides: Partial<KeywordFilterRule> = {}): KeywordFilterRule {
  return {
    id: "r1",
    type: "include",
    keyword: "alpha",
    matchMode: "partial",
    applyToTitle: true,
    applyToSummary: false,
    applyToContent: false,
    enabled: true,
    createdAt: 0,
    ...overrides,
  };
}

function setupEditor(initial: KeywordFilterEditorState, opts?: { showOverrideToggle?: boolean }) {
  const containerEl = document.body.createDiv();
  let state: KeywordFilterEditorState = initial;
  const onChange = vi.fn((next: KeywordFilterEditorState) => {
    state = next;
    render();
  });

  const render = () => {
    renderKeywordFilterEditor({
      containerEl,
      state,
      showOverrideToggle: opts?.showOverrideToggle,
      onChange,
    });
  };

  render();
  return { containerEl, getState: () => state, onChange };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderKeywordFilterEditor", () => {
  it("renders empty state and Add new rule appends a default rule", () => {
    const { getState } = setupEditor({ includeLogic: "AND", rules: [] });

    expect(document.body.querySelector(".rss-keyword-filter-empty")?.textContent).toContain(
      "No keyword rules configured",
    );

    const addBtn = document.body.querySelector(".rss-keyword-filter-add-btn") as HTMLButtonElement;
    expect(addBtn).toBeTruthy();

    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.42);

    addBtn.click();

    const state = getState();
    expect(state.rules).toHaveLength(1);
    expect(state.rules[0]).toMatchObject({
      type: "include",
      keyword: "",
      matchMode: "partial",
      applyToTitle: true,
      applyToSummary: true,
      applyToContent: true,
      applyToLink: false,
      enabled: true,
      createdAt: 123,
    });

    expect(document.body.querySelector(".rss-keyword-filter-rule-row")).toBeTruthy();
    expect(document.body.querySelector(".rss-keyword-filter-rule-title")?.textContent).toBe(
      "Rule 1",
    );
  });

  it("toggles include logic AND/OR via segmented buttons", () => {
    const { getState } = setupEditor({ includeLogic: "AND", rules: [createRule()] });

    const getBtns = () => {
      const andBtn = document.body.querySelector(
        '.rss-keyword-filter-logic-row [data-value="AND"]',
      ) as HTMLButtonElement;
      const orBtn = document.body.querySelector(
        '.rss-keyword-filter-logic-row [data-value="OR"]',
      ) as HTMLButtonElement;
      return { andBtn, orBtn };
    };

    expect(getBtns().andBtn.classList.contains("is-active")).toBe(true);
    expect(getBtns().orBtn.classList.contains("is-active")).toBe(false);

    getBtns().orBtn.click();
    expect(getState().includeLogic).toBe("OR");
    expect(getBtns().andBtn.classList.contains("is-active")).toBe(false);
    expect(getBtns().orBtn.classList.contains("is-active")).toBe(true);
  });

  it("supports override global rules toggle when enabled", () => {
    const { getState } = setupEditor(
      { includeLogic: "AND", rules: [], overrideGlobalRules: false },
      { showOverrideToggle: true },
    );

    const checkbox = document.body.querySelector(
      ".rss-keyword-filter-toggle-row input[type=checkbox]",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(getState().overrideGlobalRules).toBe(true);
  });

  it("edits a rule: type, match mode, keyword, and location toggles", () => {
    const { getState } = setupEditor({ includeLogic: "AND", rules: [createRule()] });

    const includeBtn = document.body.querySelector(
      '.rss-keyword-filter-rule-type-row [data-value="include"]',
    ) as HTMLButtonElement;
    const excludeBtn = document.body.querySelector(
      '.rss-keyword-filter-rule-type-row [data-value="exclude"]',
    ) as HTMLButtonElement;
    expect(includeBtn.classList.contains("is-active")).toBe(true);
    excludeBtn.click();
    expect(getState().rules[0].type).toBe("exclude");

    const exactBtn = document.body.querySelector(
      '.rss-keyword-filter-rule-match-row [data-value="exact"]',
    ) as HTMLButtonElement;
    exactBtn.click();
    expect(getState().rules[0].matchMode).toBe("exact");

    const input = document.body.querySelector(".rss-keyword-filter-input") as HTMLInputElement;
    input.value = "beta";
    input.dispatchEvent(new Event("change"));
    expect(getState().rules[0].keyword).toBe("beta");

    const summaryLabel = Array.from(
      document.body.querySelectorAll(".rss-keyword-filter-location-toggle label"),
    ).find((el) => el.textContent === "Summary") as HTMLLabelElement;
    expect(summaryLabel).toBeTruthy();
    summaryLabel.click();
    expect(getState().rules[0].applyToSummary).toBe(true);

    const linkLabel = Array.from(
      document.body.querySelectorAll(".rss-keyword-filter-location-toggle label"),
    ).find((el) => el.textContent === "Link") as HTMLLabelElement;
    expect(linkLabel).toBeTruthy();
    linkLabel.click();
    expect(getState().rules[0].applyToLink).toBe(true);
  });

  it("disables rule controls when a rule is disabled and delete removes rule", () => {
    const { getState } = setupEditor({ includeLogic: "AND", rules: [createRule()] });

    const enabledBtn = document.body.querySelector(
      ".rss-keyword-filter-enabled-btn",
    ) as HTMLButtonElement;
    enabledBtn.click();
    expect(getState().rules[0].enabled).toBe(false);

    const row = document.body.querySelector(".rss-keyword-filter-rule-row") as HTMLElement;
    expect(row.classList.contains("is-disabled")).toBe(true);

    const excludeBtn = document.body.querySelector(
      '.rss-keyword-filter-rule-type-row [data-value="exclude"]',
    ) as HTMLButtonElement;
    expect(excludeBtn.disabled).toBe(true);
    excludeBtn.click();
    expect(getState().rules[0].type).toBe("include");

    const deleteBtn = document.body.querySelector(
      ".rss-keyword-filter-delete-header",
    ) as HTMLButtonElement;
    deleteBtn.click();
    expect(getState().rules).toHaveLength(0);
    expect(document.body.querySelector(".rss-keyword-filter-empty")).toBeTruthy();
  });
});
