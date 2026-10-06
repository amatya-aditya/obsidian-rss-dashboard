/** A saved-note template variable, written as `{{name}}` in a template. */
export interface TemplateVariable {
  /** Matches every occurrence of the variable's placeholder. */
  readonly placeholder: RegExp;
  /**
   * Leave out each line holding the placeholder when the value is empty,
   * rather than writing the empty value in place. Only `{{language}}` sets it,
   * so an unknown language writes no `lang:` line (#266).
   */
  readonly omitIfEmpty: boolean;
}

const VARIABLES = {
  title: { placeholder: /{{title}}/g, omitIfEmpty: false },
  date: { placeholder: /{{date}}/g, omitIfEmpty: false },
  dateShort: { placeholder: /{{dateShort}}/g, omitIfEmpty: false },
  isoDate: { placeholder: /{{isoDate}}/g, omitIfEmpty: false },
  isoDateTime: { placeholder: /{{isoDateTime}}/g, omitIfEmpty: false },
  firstSeen: { placeholder: /{{firstSeen}}/g, omitIfEmpty: false },
  firstSeenISO: { placeholder: /{{firstSeenISO}}/g, omitIfEmpty: false },
  saveDate: { placeholder: /{{saveDate}}/g, omitIfEmpty: false },
  saveTime12: { placeholder: /{{saveTime12}}/g, omitIfEmpty: false },
  saveTime24: { placeholder: /{{saveTime24}}/g, omitIfEmpty: false },
  link: { placeholder: /{{link}}/g, omitIfEmpty: false },
  author: { placeholder: /{{author}}/g, omitIfEmpty: false },
  source: { placeholder: /{{source}}/g, omitIfEmpty: false },
  feedTitle: { placeholder: /{{feedTitle}}/g, omitIfEmpty: false },
  summary: { placeholder: /{{summary}}/g, omitIfEmpty: false },
  description: { placeholder: /{{description}}/g, omitIfEmpty: false },
  excerpt: { placeholder: /{{excerpt}}/g, omitIfEmpty: false },
  language: { placeholder: /{{language}}/g, omitIfEmpty: true },
  tags: { placeholder: /{{tags}}/g, omitIfEmpty: false },
  guid: { placeholder: /{{guid}}/g, omitIfEmpty: false },
  image: { placeholder: /{{image}}/g, omitIfEmpty: false },
} satisfies Record<string, TemplateVariable>;

export type TemplateVariableName = keyof typeof VARIABLES;

/**
 * The variables saved-note templates fill. `{{content}}` and
 * `{{date:FORMAT}}` are not listed: the renderer handles them itself.
 */
export const TEMPLATE_VARIABLES: Readonly<
  Record<TemplateVariableName, TemplateVariable>
> = VARIABLES;
