import type { KeywordFilterRule } from "../types/types";
import type { KeywordFilterEditorState } from "./keyword-filter-editor";

export function updateRule(
  rules: KeywordFilterRule[],
  index: number,
  updates: Partial<KeywordFilterRule>,
): KeywordFilterRule[] {
  return rules.map((rule, i) => (i === index ? { ...rule, ...updates } : rule));
}

export function createSegmentedButton(
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

export function renderKeywordFilterRuleRow(
  rulesContainer: HTMLElement,
  state: KeywordFilterEditorState,
  rule: KeywordFilterRule,
  index: number,
  onChange: (next: KeywordFilterEditorState) => void,
): void {
  const row = rulesContainer.createDiv({
    cls: "rss-keyword-filter-rule-row" + (rule.enabled ? "" : " is-disabled"),
  });

  const ruleCol = row.createDiv({ cls: "rss-keyword-filter-rule-col" });
  renderRuleHeader(ruleCol, state, rule, index, onChange);

  const ruleBody = ruleCol.createDiv({
    cls: "rss-keyword-filter-rule-body",
  });

  renderRuleTypeRow(ruleBody, state, rule, index, onChange);
  renderMatchModeRow(ruleBody, state, rule, index, onChange);
  renderKeywordInput(ruleBody, state, rule, index, onChange);
  renderLocationToggles(ruleBody, state, rule, index, onChange);
}

function renderRuleHeader(
  ruleCol: HTMLElement,
  state: KeywordFilterEditorState,
  rule: KeywordFilterRule,
  index: number,
  onChange: (next: KeywordFilterEditorState) => void,
): void {
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
    cls: "rss-keyword-filter-enabled-btn" + (rule.enabled ? " is-checked" : ""),
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
    text: rule.enabled ? "✓" : "",
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

  removeBtn.setText("Delete rule");
  removeBtn.addEventListener("click", () => {
    onChange({
      ...state,
      rules: state.rules.filter((_, i) => i !== index),
    });
  });
}

function renderRuleTypeRow(
  ruleBody: HTMLElement,
  state: KeywordFilterEditorState,
  rule: KeywordFilterRule,
  index: number,
  onChange: (next: KeywordFilterEditorState) => void,
): void {
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
}

function renderMatchModeRow(
  ruleBody: HTMLElement,
  state: KeywordFilterEditorState,
  rule: KeywordFilterRule,
  index: number,
  onChange: (next: KeywordFilterEditorState) => void,
): void {
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
}

function renderKeywordInput(
  ruleBody: HTMLElement,
  state: KeywordFilterEditorState,
  rule: KeywordFilterRule,
  index: number,
  onChange: (next: KeywordFilterEditorState) => void,
): void {
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
}

function renderLocationToggles(
  ruleBody: HTMLElement,
  state: KeywordFilterEditorState,
  rule: KeywordFilterRule,
  index: number,
  onChange: (next: KeywordFilterEditorState) => void,
): void {
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
  renderLocationToggle(
    locationsRow,
    "URL",
    !!rule.applyToURL,
    !rule.enabled,
    (checked) =>
      onChange({
        ...state,
        rules: updateRule(state.rules, index, { applyToURL: checked }),
      }),
  );
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
