/** A saved-note template variable, written as `{{name}}` in a template. */
export interface TemplateVariable {
  /** Matches every occurrence of the variable's placeholder. */
  readonly placeholder: RegExp;
  /**
   * Leave out each line holding the placeholder when the value is empty,
   * rather than writing the empty value in place. `{{language}}` (#266) and
   * `{{contentSource}}` (#1248) set it, so an unknown language writes no
   * `language:` line, and a save that cannot name the version it wrote writes
   * no `contentSource:` row.
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
  contentSource: { placeholder: /{{contentSource}}/g, omitIfEmpty: true },
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

/** A leading `---` block, the frontmatter a saved template may open with. */
const LEADING_FRONTMATTER = /^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Whether a template puts `{{image}}` in the note body, rather than only in a
 * leading frontmatter property. A template that does decides where the image
 * goes, so the saver does not also lead `{{content}}` with a hero of its own.
 */
export function templatePlacesImage(template: string): boolean {
  const body = template.replace(LEADING_FRONTMATTER, "");
  return body.search(TEMPLATE_VARIABLES.image.placeholder) !== -1;
}
