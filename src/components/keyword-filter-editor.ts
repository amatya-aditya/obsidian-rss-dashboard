import type { KeywordFilterRule } from "../types/types";

export interface KeywordFilterEditorState {
  includeLogic: "AND" | "OR";
  rules: KeywordFilterRule[];
  overrideGlobalFilters?: boolean;
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
    overrideCheckbox.checked = !!state.overrideGlobalFilters;
    const overrideLabel = overrideWrapper.createEl("label", {
      text: "Override global filters",
    });
    overrideLabel.addClass("rss-keyword-filter-label");
    overrideLabel.addEventListener("click", () => {
      overrideCheckbox.checked = !overrideCheckbox.checked;
      onChange({
        ...state,
        overrideGlobalFilters: overrideCheckbox.checked,
      });
    });
    overrideCheckbox.addEventListener("change", () => {
      onChange({
        ...state,
        overrideGlobalFilters: overrideCheckbox.checked,
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
  const logicSelect = includeLogicRow.createEl("select", {
    cls: "rss-keyword-filter-select",
  });
  logicSelect.createEl("option", { text: "AND", value: "AND" });
  logicSelect.createEl("option", { text: "Either/or", value: "OR" });
  logicSelect.value = state.includeLogic;
  logicSelect.addEventListener("change", () => {
    onChange({
      ...state,
      includeLogic: logicSelect.value as "AND" | "OR",
    });
  });

  const rulesContainer = containerEl.createDiv({
    cls: "rss-keyword-filter-rules-container",
  });

  const headerRow = rulesContainer.createDiv({
    cls: "rss-keyword-filter-rules-header",
  });
  headerRow.createDiv({
    cls: "rss-keyword-filter-rules-header-enabled",
    text: "Enabled",
  });
  headerRow.createDiv({
    cls: "rss-keyword-filter-rules-header-rule",
    text: "Rule",
  });

  if (state.rules.length === 0) {
    rulesContainer.createDiv({
      cls: "rss-keyword-filter-empty",
      text: "No filter rules configured.",
    });
  } else {
    state.rules.forEach((rule, index) => {
      const row = rulesContainer.createDiv({
        cls:
          "rss-keyword-filter-rule-row" + (rule.enabled ? "" : " is-disabled"),
      });

      const enabledCol = row.createDiv({
        cls: "rss-keyword-filter-rule-enabled-col",
      });
      const ruleCol = row.createDiv({ cls: "rss-keyword-filter-rule-col" });

      const topRow = ruleCol.createDiv({ cls: "rss-keyword-filter-rule-top" });

      const enabledToggle = enabledCol.createEl("input", {
        cls: "rss-keyword-filter-checkbox",
        attr: { type: "checkbox" },
      });
      enabledToggle.checked = rule.enabled;
      enabledToggle.title = "Enable rule";
      enabledToggle.addEventListener("change", () => {
        onChange({
          ...state,
          rules: updateRule(state.rules, index, { enabled: enabledToggle.checked }),
        });
      });

      const typeSelect = topRow.createEl("select", {
        cls: "rss-keyword-filter-select",
      });
      typeSelect.createEl("option", { text: "Include", value: "include" });
      typeSelect.createEl("option", { text: "Exclude", value: "exclude" });
      typeSelect.value = rule.type;
      typeSelect.disabled = !rule.enabled;
      typeSelect.addEventListener("change", () => {
        onChange({
          ...state,
          rules: updateRule(state.rules, index, {
            type: typeSelect.value as "include" | "exclude",
          }),
        });
      });

      const keywordInput = topRow.createEl("input", {
        cls: "rss-keyword-filter-input",
        attr: { type: "text", placeholder: "Keyword or phrase" },
      });
      keywordInput.value = rule.keyword || "";
      keywordInput.disabled = !rule.enabled;
      keywordInput.addEventListener("change", () => {
        onChange({
          ...state,
          rules: updateRule(state.rules, index, {
            keyword: keywordInput.value,
          }),
        });
      });

      const matchModeSelect = topRow.createEl("select", {
        cls: "rss-keyword-filter-select",
      });
      matchModeSelect.createEl("option", { text: "Exact", value: "exact" });
      matchModeSelect.createEl("option", { text: "Partial", value: "partial" });
      matchModeSelect.value = rule.matchMode;
      matchModeSelect.disabled = !rule.enabled;
      matchModeSelect.addEventListener("change", () => {
        onChange({
          ...state,
          rules: updateRule(state.rules, index, {
            matchMode: matchModeSelect.value as "exact" | "partial",
          }),
        });
      });

      const removeBtn = topRow.createEl("button", {
        cls: "rss-keyword-filter-delete",
        attr: { "aria-label": "Delete rule" },
      });
      removeBtn.setText("X");
      removeBtn.disabled = !rule.enabled;
      removeBtn.addEventListener("click", () => {
        onChange({
          ...state,
          rules: state.rules.filter((_, i) => i !== index),
        });
      });

      const locationsRow = ruleCol.createDiv({
        cls: "rss-keyword-filter-locations-row",
      });

      renderLocationToggle(
        locationsRow,
        "Title",
        rule.applyToTitle,
        !rule.enabled,
        (checked) =>
          onChange({
            ...state,
            rules: updateRule(state.rules, index, { applyToTitle: checked }),
          }),
      );
      renderLocationToggle(
        locationsRow,
        "Summary",
        rule.applyToSummary,
        !rule.enabled,
        (checked) =>
          onChange({
            ...state,
            rules: updateRule(state.rules, index, { applyToSummary: checked }),
          }),
      );
      renderLocationToggle(
        locationsRow,
        "Content",
        rule.applyToContent,
        !rule.enabled,
        (checked) =>
          onChange({
            ...state,
            rules: updateRule(state.rules, index, { applyToContent: checked }),
          }),
      );
    });
  }

  const addRuleBtn = containerEl.createEl("button", {
    cls: "rss-keyword-filter-add-btn",
    text: "Add rule",
  });
  addRuleBtn.addEventListener("click", () => {
    onChange({
      ...state,
      rules: [...state.rules, createDefaultKeywordFilterRule()],
    });
  });
}

function updateRule(
  rules: KeywordFilterRule[],
  index: number,
  updates: Partial<KeywordFilterRule>,
): KeywordFilterRule[] {
  return rules.map((rule, i) => (i === index ? { ...rule, ...updates } : rule));
}

function renderLocationToggle(
  containerEl: HTMLElement,
  label: string,
  checked: boolean,
  disabled: boolean,
  onChange: (checked: boolean) => void,
): void {
  const wrap = containerEl.createDiv({
    cls: "rss-keyword-filter-location-toggle",
  });
  const checkbox = wrap.createEl("input", {
    cls: "rss-keyword-filter-checkbox",
    attr: { type: "checkbox" },
  });
  checkbox.checked = checked;
  checkbox.disabled = disabled;
  checkbox.addEventListener("change", () => {
    onChange(checkbox.checked);
  });
  const text = wrap.createEl("label", { text: label });
  text.addClass("rss-keyword-filter-label");
  text.addEventListener("click", () => {
    checkbox.checked = !checkbox.checked;
    onChange(checkbox.checked);
  });
}
