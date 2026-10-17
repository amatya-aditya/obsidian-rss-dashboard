/**
 * The minimal article template: a note body with no frontmatter.
 *
 * The Article Saving tab's Clear button writes it into the default article
 * template box, and the saver treats it as the whole note — a cleared template
 * saves content only, with no plugin frontmatter prepended (#1246).
 */
export const MINIMAL_ARTICLE_TEMPLATE = "{{content}}";

/** True when `template` is the minimal content-only template, ignoring surrounding whitespace. */
export function isMinimalArticleTemplate(template: string): boolean {
  return template.trim() === MINIMAL_ARTICLE_TEMPLATE;
}
