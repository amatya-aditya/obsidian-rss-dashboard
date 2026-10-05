import { escapeYamlDoubleQuoted } from "../../utils/yaml-escape";
import { formatMoment, type ArticleTemplateValues } from "./template-values";
import {
  TEMPLATE_VARIABLES,
  type TemplateVariableName,
} from "./template-variables";

/** Fills one registry variable. */
export interface VariableStep {
  readonly kind: "variable";
  readonly name: TemplateVariableName;
  /** Fills the variable with another value than its own. */
  readonly value?: "saveDateLong";
  /** The call site's value when the item's is empty (#266). */
  readonly defaultValue?: string;
  /** Escapes the value for a double-quoted YAML scalar (#286). */
  readonly yamlEscape?: boolean;
}

/**
 * One substitution. A call site lists its steps in the order it applies them,
 * which shows in the note: a value holding a placeholder is filled by a later
 * step, but not by an earlier one.
 */
export type TemplateStep =
  | VariableStep
  /** Fills `{{date:FORMAT}}` placeholders from the article date. */
  | { readonly kind: "dateFormat" }
  /** Fills `{{content}}`, which the caller transforms itself. */
  | { readonly kind: "content" };

/** Fills a saved-note template by applying `steps` in order. */
export function renderArticleTemplate(
  template: string,
  steps: readonly TemplateStep[],
  values: ArticleTemplateValues,
  content = "",
): string {
  return steps.reduce(
    (text, step) => applyStep(text, step, values, content),
    template,
  );
}

function applyStep(
  text: string,
  step: TemplateStep,
  values: ArticleTemplateValues,
  content: string,
): string {
  switch (step.kind) {
    case "variable":
      return fillVariable(text, step, values);
    case "dateFormat":
      return text.replace(
        /{{date:(.+?)}}/g,
        (_match: string, format: string) => {
          return formatMoment(values.articleDate, format);
        },
      );
    case "content":
      // Use a replacer function for {{content}} so that special replacement
      // patterns in JS regex (like $$, $&, $`) are not interpreted — without
      // this, display math delimiters like $$x^2$$ would be collapsed to $x^2$.
      return text.replace(/{{content}}/g, () => content);
  }
}

function fillVariable(
  text: string,
  step: VariableStep,
  values: ArticleTemplateValues,
): string {
  const variable = TEMPLATE_VARIABLES[step.name];
  let value = values[step.value ?? step.name];
  if (step.defaultValue !== undefined && !value) value = step.defaultValue;
  if (step.yamlEscape) value = escapeYamlDoubleQuoted(value);

  if (variable.omitIfEmpty && value === "") {
    return text
      .split("\n")
      .filter((line) => line.search(variable.placeholder) === -1)
      .join("\n");
  }

  // Keep literal dollar sequences, matching the #672 fix already on dev.
  return text.replace(variable.placeholder, () => value);
}
