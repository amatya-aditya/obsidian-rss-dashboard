/**
 * Each template chain's steps, in the order it applied them before the
 * registry existed (#673). The chains still differ: the web viewer
 * follow-ups in docs/plans/247-article-metadata-enrichment.md align them.
 */
import type { TemplateStep, VariableStep } from "./render-template";
import type { TemplateVariableName } from "./template-variables";

function fill(
  name: TemplateVariableName,
  options: Omit<VariableStep, "kind" | "name"> = {},
): VariableStep {
  return { kind: "variable", name, ...options };
}

function fillYaml(
  name: TemplateVariableName,
  options: Omit<VariableStep, "kind" | "name" | "yamlEscape"> = {},
): VariableStep {
  return fill(name, { ...options, yamlEscape: true });
}

const DATE_FORMAT: TemplateStep = { kind: "dateFormat" };
const CONTENT: TemplateStep = { kind: "content" };

/** The web viewer's `{{source}}` and `{{feedTitle}}` for a page with no feed (#266). */
const WEB_VIEWER_SOURCE = "Web viewer";

/** `ArticleSaver` fills the dates first in both of its templates. */
const ARTICLE_SAVER_DATES: readonly TemplateStep[] = [
  fill("date"),
  fill("dateShort"),
  fill("isoDate"),
  fill("isoDateTime"),
  fill("firstSeen"),
  fill("firstSeenISO"),
  fill("saveDate"),
  fill("saveTime12"),
  fill("saveTime24"),
  DATE_FORMAT,
];

/** `ArticleSaver`'s note template. */
export const ARTICLE_SAVER_NOTE_STEPS: readonly TemplateStep[] = [
  ...ARTICLE_SAVER_DATES,
  fill("title"),
  fill("link"),
  fill("author"),
  fill("source"),
  fill("feedTitle"),
  fill("summary"),
  fill("description"),
  fill("excerpt"),
  fill("language"),
  CONTENT,
  fill("tags"),
  fill("guid"),
  fill("image"),
];

/** `ArticleSaver`'s frontmatter template, including the summary fix already on dev (#674). */
export const ARTICLE_SAVER_FRONTMATTER_STEPS: readonly TemplateStep[] = [
  ...ARTICLE_SAVER_DATES,
  fillYaml("title"),
  fill("tags"),
  fillYaml("source"),
  fillYaml("link"),
  fillYaml("author"),
  fillYaml("feedTitle"),
  fillYaml("summary"),
  fillYaml("description"),
  fillYaml("excerpt"),
  fillYaml("language"),
  fillYaml("guid"),
  fillYaml("image"),
];

/** Filename patterns use saved-note values except for article body content. */
export const ARTICLE_FILENAME_STEPS: readonly TemplateStep[] = [
  ...ARTICLE_SAVER_DATES,
  fill("title"),
  fill("link"),
  fill("author"),
  fill("source"),
  fill("feedTitle"),
  fill("summary"),
  fill("tags"),
  fill("guid"),
  fill("image"),
];

/**
 * The web viewer's note template. `{{date}}` is the save date, and
 * `{{dateShort}}`, `{{firstSeen}}`, `{{date:FORMAT}}`, `{{feedTitle}}`,
 * `{{tags}}` and `{{guid}}` stay unfilled.
 */
export const WEB_VIEWER_NOTE_STEPS: readonly TemplateStep[] = [
  fill("title"),
  fill("date", { value: "saveDateLong" }),
  fill("dateShort"),
  fill("isoDate"),
  fill("isoDateTime"),
  fill("firstSeen"),
  fill("firstSeenISO"),
  DATE_FORMAT,
  fill("saveDate"),
  fill("saveTime12"),
  fill("saveTime24"),
  fill("link"),
  fill("author"),
  fill("source", { defaultValue: WEB_VIEWER_SOURCE }),
  fill("feedTitle", { defaultValue: WEB_VIEWER_SOURCE }),
  fill("guid"),
  fill("tags"),
  fill("summary"),
  CONTENT,
  fill("image"),
];

/**
 * The web viewer's frontmatter template. `{{dateShort}}`, `{{firstSeen}}`,
 * `{{date:FORMAT}}` and `{{summary}}` stay unfilled.
 */
export const WEB_VIEWER_FRONTMATTER_STEPS: readonly TemplateStep[] = [
  fillYaml("title"),
  fill("date"),
  fill("isoDate"),
  fill("isoDateTime"),
  fill("saveDate"),
  fill("saveTime12"),
  fill("saveTime24"),
  fill("tags"),
  fillYaml("source", { defaultValue: WEB_VIEWER_SOURCE }),
  fillYaml("link"),
  fillYaml("author"),
  fillYaml("feedTitle", { defaultValue: WEB_VIEWER_SOURCE }),
  fillYaml("guid"),
  fillYaml("image"),
];
