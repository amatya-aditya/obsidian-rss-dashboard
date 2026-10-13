/**
 * Grouped reference for the `{{...}}` variables a saved-note template can use.
 *
 * The Article Saving tab renders it today; the template create/edit dialogs can
 * render the same content later. Every `TEMPLATE_VARIABLES` key, plus
 * `{{content}}` and `{{date:FORMAT}}` (which the renderer handles itself),
 * must appear here exactly once; a unit test enforces it.
 */

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
            "The article date in a long, readable format. It shares the article timestamp with {{dateShort}}, {{date:FORMAT}}, {{isoDate}}, and {{isoDateTime}}. In notes saved from the web viewer, it is the save date.",
        },
        {
          name: "dateShort",
          description:
            "The article timestamp as YYYY-MM-DD. Derived from the same article date as {{date}}.",
        },
        {
          name: "date:FORMAT",
          description:
            "The article timestamp in a custom Moment.js format, such as {{date:YYYY/MM/DD}}. Derived from the same article date as {{date}}.",
        },
        {
          name: "isoDate",
          description:
            "The full ISO 8601 timestamp of the article date, in UTC. All the other article dates are formats of this one timestamp.",
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
            "An independent value, not derived from the article timestamp. When the dashboard first saw the article, independent of the “Use first-seen date for undated items” display setting. If none was recorded, this falls back to the article date (the publish date, or the save date when there is none), which is not a true first-seen value.",
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
            "The content selected for this save. The “Save full content” setting chooses whether RSS Dashboard fetches the full article or uses the feed item’s content, which falls back to the feed description, then the summary. {{content}} only controls where that content is placed in the template.",
        },
      ],
    },
    {
      heading: "Links and media",
      variables: [
        { name: "link", description: "The article’s URL." },
        {
          name: "image",
          description: "The article’s image URL, when available.",
        },
      ],
    },
  ];

/**
 * Render the grouped variable reference into `container`: an `h4` per group,
 * then a list of each variable in `<code>` with its description. Groups are set
 * apart by heading text, never by colour alone (WCAG 2.2 SC 1.3.1).
 */
export function renderTemplateVariableHelp(container: HTMLElement): void {
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
      item.createEl("code", { text: `{{${variable.name}}}` });
      item.appendText(` — ${variable.description}`);
    }
  }
}
