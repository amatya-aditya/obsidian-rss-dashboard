/**
 * Grouped reference for the `{{...}}` variables a saved-note template can use.
 *
 * The Article Saving tab renders it today; the template create/edit dialogs can
 * render the same content later. Every `TEMPLATE_VARIABLES` key, plus
 * `{{content}}` and `{{date:YYYY/MM/DD}}` (the one entry for the renderer's
 * `date:<format>` family, which it handles itself),
 * must appear here exactly once; a unit test enforces it.
 */

import { Notice, setTooltip } from "obsidian";
import { copyTextToClipboard } from "../utils/export-utils";

interface TemplateVariableHelpEntry {
  /** The placeholder as written in a template, without braces. */
  readonly name: string;
  readonly description: string;
}

interface TemplateVariableHelpGroup {
  readonly heading: string;
  readonly variables: readonly TemplateVariableHelpEntry[];
}

export const TEMPLATE_VARIABLE_HELP_GROUPS: readonly TemplateVariableHelpGroup[] =
  [
    {
      heading: "Article dates",
      variables: [
        {
          name: "date",
          description:
            "The article date in a long, readable format. {{dateShort}}, {{date:YYYY/MM/DD}}, {{isoDate}}, and {{isoDateTime}} are other formats of this same article timestamp. In notes saved from the web viewer, {{date}} is the save date instead.",
        },
        {
          name: "dateShort",
          description: "The article date as YYYY-MM-DD.",
        },
        {
          name: "date:YYYY/MM/DD",
          description:
            "The article date in a custom format. Put any Moment.js format after date: — for example {{date:DD/MM/YYYY}}, {{date:MM-DD-YYYY}}, {{date:YYYY-MM-DD HH:mm}}, or {{date:D MMMM YYYY}}. Tokens are case-sensitive: MM is the month and mm the minutes, DD the day of the month and dd the weekday.",
        },
        {
          name: "isoDate",
          description: "The article date as a full ISO 8601 timestamp in UTC.",
        },
        {
          name: "isoDateTime",
          description: "The same full ISO 8601 timestamp as {{isoDate}}.",
        },
      ],
    },
    {
      heading: "First-seen dates",
      variables: [
        {
          name: "firstSeen",
          description:
            "Not derived from the article timestamp. When the dashboard first saw the article, independent of the “Use first-seen date for undated items” display setting. If none was recorded, this falls back to the article date (the publish date, or the save date when there is none), which is not a true first-seen value.",
        },
        {
          name: "firstSeenISO",
          description:
            "The first-seen date as a local YYYY-MM-DD date, such as 2024-04-30. Independent of the article timestamp, and uses the same fallback as {{firstSeen}}.",
        },
      ],
    },
    {
      heading: "Save date and time",
      variables: [
        {
          name: "saveDate",
          description:
            "The local date the article was saved, as YYYY-MM-DD. The save moment is independent of the article timestamp.",
        },
        {
          name: "saveTime12",
          description:
            "The local save time in 12-hour format, such as 02:45 PM. Taken from the same save moment as {{saveDate}}.",
        },
        {
          name: "saveTime24",
          description:
            "The local save time in 24-hour format, such as 14:45. Taken from the same save moment as {{saveDate}}.",
        },
      ],
    },
    {
      heading: "Article and feed details",
      variables: [
        { name: "title", description: "The article title." },
        {
          name: "author",
          description:
            "The article author. When the feed lists several authors, their names are joined with a comma and a space, such as Ada, Grace. There is no separate authors variable.",
        },
        {
          name: "feedTitle",
          description: "The title of the feed the article came from.",
        },
        {
          name: "source",
          description:
            "The feed title. This currently produces the same value as {{feedTitle}}.",
        },
        {
          name: "guid",
          description: "The article identifier supplied by the feed.",
        },
        {
          name: "tags",
          description:
            "Comma-separated tag names. Add brackets in your template to format them as a YAML list, such as tags: [{{tags}}].",
        },
        {
          name: "language",
          description:
            "The language code, such as en-US, from the article page or the feed. The line is left out when the language is unknown.",
        },
      ],
    },
    {
      heading: "Content",
      variables: [
        {
          name: "summary",
          description:
            "A plain-text cut of about 220 characters from the feed item’s content or description.",
        },
        {
          name: "description",
          description:
            "The article page’s own description after a successful full fetch. Otherwise, the feed description, when it passes the quality check.",
        },
        {
          name: "excerpt",
          description:
            "A short preview, only when there is no {{description}}.",
        },
        {
          name: "content",
          description:
            "The content selected for this save. A saved template can set its own “Save version”, which wins over the “Default save version” setting; otherwise the setting chooses between Fetched content (the full article) and RSS content (the feed item’s content, which falls back to the feed description, then the summary). {{content}} only controls where that content is placed in the template.",
        },
        {
          name: "contentSource",
          description:
            "Which version this save wrote: RSS content or Fetched content. It reports the version written, not the one requested, so a save that asked for Fetched content and fell back to the feed item’s own text reads RSS content. This is not the feed title, which is {{source}}.",
        },
      ],
    },
    {
      heading: "Links and media",
      variables: [
        { name: "link", description: "The article’s URL." },
        {
          name: "image",
          description:
            "The article’s image URL, when available. When your note puts it in the note body, the saved note adds no image of its own above the content, so the image appears once, where you placed it.",
        },
      ],
    },
  ];

/**
 * Tokens inside a description. The `tags: [{{tags}}]` example is matched whole,
 * because its brackets are the point of that example; every other `{{...}}` is
 * a chip of its own.
 */
const DESCRIPTION_TOKEN_PATTERN = /tags: \[\{\{tags\}\}\]|\{\{[^{}]+\}\}/g;

/**
 * Add a copy chip to `parent`: a button wrapping a `<code>`. `copyValue` is
 * what lands on the clipboard. A chip that only repeats another entry's
 * placeholder stays out of the tab order, so Tab visits each variable once.
 */
function renderCopyChip(
  parent: HTMLElement,
  label: string,
  copyValue: string,
  inTabOrder: boolean,
  inline = false,
): void {
  const chip = parent.createEl("button", {
    cls: inline
      ? "rss-dashboard-variable-chip is-inline"
      : "rss-dashboard-variable-chip",
    attr: { type: "button" },
  });
  chip.createEl("code", { text: label });
  setTooltip(chip, `Copy ${copyValue}`);
  if (!inTabOrder) chip.setAttribute("tabindex", "-1");
  chip.addEventListener("click", () => {
    void copyTextToClipboard(copyValue).then((result) => {
      new Notice(
        result === "copied"
          ? `Copied ${copyValue}`
          : `Couldn't copy ${copyValue}`,
      );
    });
  });
}

/** Write a description into `parent`, turning each `{{...}}` token into a chip. */
function renderDescription(
  parent: HTMLElement,
  description: string,
  leadingTokens: ReadonlySet<string>,
): void {
  let cursor = 0;
  for (const match of description.matchAll(DESCRIPTION_TOKEN_PATTERN)) {
    const token = match[0];
    parent.appendText(description.slice(cursor, match.index));
    renderCopyChip(parent, token, token, !leadingTokens.has(token), true);
    cursor = match.index + token.length;
  }
  parent.appendText(description.slice(cursor));
}

/**
 * Render the grouped variable reference into `container`: an `h4` per group,
 * then a list of each variable as a copy chip with its description. Every
 * `{{...}}` in a description is a chip too. Groups are set apart by heading
 * text, never by colour alone (WCAG 2.2 SC 1.3.1).
 */
export function renderTemplateVariableHelp(container: HTMLElement): void {
  const leadingTokens = new Set(
    TEMPLATE_VARIABLE_HELP_GROUPS.flatMap((group) =>
      group.variables.map((variable) => `{{${variable.name}}}`),
    ),
  );
  container.createEl("p", {
    text: "These placeholders are replaced when an article is saved.",
  });
  for (const group of TEMPLATE_VARIABLE_HELP_GROUPS) {
    container.createEl("h4", {
      text: group.heading,
      cls: "rss-dashboard-variable-group-heading",
    });
    const list = container.createEl("ul", {
      cls: "rss-dashboard-variable-list",
    });
    for (const variable of group.variables) {
      const item = list.createEl("li");
      const token = `{{${variable.name}}}`;
      renderCopyChip(item, token, token, true);
      item.appendText(" — ");
      renderDescription(item, variable.description, leadingTokens);
    }
  }
}
