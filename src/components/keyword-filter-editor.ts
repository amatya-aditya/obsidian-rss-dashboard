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
    text: "AND logic combines all rules and filters only when all enabled rules match applicable content. OR logic filters content that matches any enabled rule.",
  });

  const rulesContainer = containerEl.createDiv({
    cls: "rss-keyword-filter-rules-container",
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

      const ruleCol = row.createDiv({ cls: "rss-keyword-filter-rule-col" });
      const headerRow = ruleCol.createDiv({
        cls: "rss-keyword-filter-rule-header",
      });
      const headerLeft = headerRow.createDiv({
        cls: "rss-keyword-filter-rule-header-left",
      });

      headerLeft.createSpan({
        cls: "rss-keyword-filter-rule-title",
        text: `Rule ${index + 1}`,
      });

      const enabledBtn = headerLeft.createEl("button", {
        cls:
          "rss-keyword-filter-enabled-btn" + (rule.enabled ? " is-checked" : ""),
        attr: {
          type: "button",
          "aria-pressed": rule.enabled ? "true" : "false",
          "aria-label": `Toggle enabled state for rule ${index + 1}`,
        },
      });
      enabledBtn.createSpan({
        cls:
          "rss-keyword-filter-enabled-btn-box" +
          (rule.enabled ? " is-checked" : ""),
        text: rule.enabled ? "\u2713" : "",
      });
      enabledBtn.createSpan({
        cls: "rss-keyword-filter-enabled-btn-label",
        text: "Enabled",
      });
      enabledBtn.addEventListener("click", () => {
        onChange({
          ...state,
          rules: updateRule(state.rules, index, { enabled: !rule.enabled }),
        });
      });

      const removeBtn = headerRow.createEl("button", {
        cls: "rss-keyword-filter-delete rss-keyword-filter-delete-header",
        attr: { "aria-label": `Delete rule ${index + 1}` },
      });
      // "X" is intentional icon-like prefix for quick visual scanning.
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      removeBtn.setText("X Delete rule");
      removeBtn.addEventListener("click", () => {
        onChange({
          ...state,
          rules: state.rules.filter((_, i) => i !== index),
        });
      });

      const ruleBody = ruleCol.createDiv({
        cls: "rss-keyword-filter-rule-body",
      });

      const typeRow = ruleBody.createDiv({
        cls: "rss-keyword-filter-rule-type-row",
      });
      typeRow.createSpan({
        cls: "rss-keyword-filter-inline-label",
        text: "Rule type:",
      });
      const typeSegmented = typeRow.createDiv({
        cls: "rss-keyword-filter-segmented rss-keyword-filter-rule-segmented",
      });
      const includeTypeBtn = createSegmentedButton(
        typeSegmented,
        "Include",
        "include",
      );
      const excludeTypeBtn = createSegmentedButton(
        typeSegmented,
        "Exclude",
        "exclude",
      );
      const isIncludeType = rule.type === "include";
      includeTypeBtn.classList.toggle("is-active", isIncludeType);
      excludeTypeBtn.classList.toggle("is-active", !isIncludeType);
      includeTypeBtn.disabled = !rule.enabled;
      excludeTypeBtn.disabled = !rule.enabled;
      includeTypeBtn.addEventListener("click", () => {
        if (!rule.enabled || rule.type === "include") return;
        onChange({
          ...state,
          rules: updateRule(state.rules, index, { type: "include" }),
        });
      });
      excludeTypeBtn.addEventListener("click", () => {
        if (!rule.enabled || rule.type === "exclude") return;
        onChange({
          ...state,
          rules: updateRule(state.rules, index, { type: "exclude" }),
        });
      });

      const matchModeRow = ruleBody.createDiv({
        cls: "rss-keyword-filter-rule-match-row",
      });
      matchModeRow.createSpan({
        cls: "rss-keyword-filter-inline-label",
        text: "Match mode:",
      });
      const matchModeSegmented = matchModeRow.createDiv({
        cls: "rss-keyword-filter-segmented rss-keyword-filter-rule-segmented",
      });
      const exactModeBtn = createSegmentedButton(
        matchModeSegmented,
        "Exact",
        "exact",
      );
      const partialModeBtn = createSegmentedButton(
        matchModeSegmented,
        "Partial",
        "partial",
      );
      const isExactMatch = rule.matchMode === "exact";
      exactModeBtn.classList.toggle("is-active", isExactMatch);
      partialModeBtn.classList.toggle("is-active", !isExactMatch);
      exactModeBtn.disabled = !rule.enabled;
      partialModeBtn.disabled = !rule.enabled;
      exactModeBtn.addEventListener("click", () => {
        if (!rule.enabled || rule.matchMode === "exact") return;
        onChange({
          ...state,
          rules: updateRule(state.rules, index, {
            matchMode: "exact",
          }),
        });
      });
      partialModeBtn.addEventListener("click", () => {
        if (!rule.enabled || rule.matchMode === "partial") return;
        onChange({
          ...state,
          rules: updateRule(state.rules, index, {
            matchMode: "partial",
          }),
        });
      });

      const keywordRow = ruleBody.createDiv({
        cls: "rss-keyword-filter-rule-keyword-row",
      });
      const keywordInput = keywordRow.createEl("input", {
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

      const locationsRow = ruleBody.createDiv({
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
    text: "Add new rule...",
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

function createSegmentedButton(
  containerEl: HTMLElement,
  text: string,
  value: string,
): HTMLButtonElement {
  return containerEl.createEl("button", {
    cls: "rss-keyword-filter-segmented-btn",
    text,
    attr: {
      type: "button",
      "data-value": value,
    },
  });
}
