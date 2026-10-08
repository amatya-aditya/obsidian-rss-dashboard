import type { KeywordFilterRule } from "../types/types";
import {
  createSegmentedButton,
  renderKeywordFilterRuleRow,
} from "./keyword-filter-rule-row";

export interface KeywordFilterEditorState {
  includeLogic: "AND" | "OR";
  rules: KeywordFilterRule[];
  overrideGlobalRules?: boolean;
}

interface KeywordFilterEditorOptions {
  containerEl: HTMLElement;
  state: KeywordFilterEditorState;
  showOverrideToggle?: boolean;
  onChange: (next: KeywordFilterEditorState) => void;
}

export function createDefaultKeywordFilterRule(): KeywordFilterRule {
  return {
    id: `keyword-filter-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: "include",
    keyword: "",
    matchMode: "partial",
    applyToTitle: true,
    applyToSummary: true,
    applyToContent: true,
    applyToURL: false,
    enabled: true,
    createdAt: Date.now(),
  };
}

export function renderKeywordFilterEditor(
  options: KeywordFilterEditorOptions,
): void {
  const { containerEl, state, showOverrideToggle, onChange } = options;
  containerEl.empty();

  const controlsRow = containerEl.createDiv({
    cls: "rss-keyword-filter-editor-controls",
  });

  if (showOverrideToggle) {
    const overrideWrapper = controlsRow.createDiv({
      cls: "rss-keyword-filter-toggle-row",
    });
    const overrideCheckbox = overrideWrapper.createEl("input", {
      cls: "rss-keyword-filter-checkbox",
      attr: { type: "checkbox" },
    });
    overrideCheckbox.checked = !!state.overrideGlobalRules;
    const overrideLabel = overrideWrapper.createEl("label", {
      text: "Override global rules",
    });
    overrideLabel.addClass("rss-keyword-filter-label");
    overrideLabel.addEventListener("click", () => {
      overrideCheckbox.checked = !overrideCheckbox.checked;
      onChange({
        ...state,
        overrideGlobalRules: overrideCheckbox.checked,
      });
    });
    overrideCheckbox.addEventListener("change", () => {
      onChange({
        ...state,
        overrideGlobalRules: overrideCheckbox.checked,
      });
    });
  }

  const includeLogicRow = controlsRow.createDiv({
    cls: "rss-keyword-filter-logic-row",
  });
  includeLogicRow.createSpan({
    cls: "rss-keyword-filter-logic-label",
    text: "Include logic:",
  });
  const logicSegmented = includeLogicRow.createDiv({
    cls: "rss-keyword-filter-segmented",
  });
  const andBtn = createSegmentedButton(logicSegmented, "AND", "AND");
  const orBtn = createSegmentedButton(logicSegmented, "OR", "OR");

  const updateLogicSegmentedState = () => {
    const isAnd = state.includeLogic === "AND";
    andBtn.classList.toggle("is-active", isAnd);
    orBtn.classList.toggle("is-active", !isAnd);
  };

  andBtn.addEventListener("click", () => {
    if (state.includeLogic === "AND") return;
    onChange({
      ...state,
      includeLogic: "AND",
    });
  });

  orBtn.addEventListener("click", () => {
    if (state.includeLogic === "OR") return;
    onChange({
      ...state,
      includeLogic: "OR",
    });
  });

  updateLogicSegmentedState();

  controlsRow.createDiv({
    cls: "rss-keyword-filter-logic-help",
    text: "AND logic: include rules pass only when all enabled include rules match. OR logic: include rules pass when any enabled include rule matches. Exclude rules always remove matches.",
  });

  const rulesContainer = containerEl.createDiv({
    cls: "rss-keyword-filter-rules-container",
  });

  if (state.rules.length === 0) {
    rulesContainer.createDiv({
      cls: "rss-keyword-filter-empty",
      text: "No keyword rules configured.",
    });
  } else {
    state.rules.forEach((rule, index) => {
      renderKeywordFilterRuleRow(rulesContainer, state, rule, index, onChange);
    });
  }

  const addRuleBtn = containerEl.createEl("button", {
    cls: "rss-keyword-filter-add-btn",
    text: "Add new rule...",
  });
  addRuleBtn.addEventListener("click", () => {
    onChange({
      ...state,
      rules: [...state.rules, createDefaultKeywordFilterRule()],
    });
  });
}
