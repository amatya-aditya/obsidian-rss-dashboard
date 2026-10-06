import { moment } from "obsidian";
import type { FeedItem } from "../../types/types";
import { resolveItemDescriptions } from "../../utils/article-metadata-persistence";
import { itemAuthorText } from "../../utils/item-author";
import { resolveDisplayDate } from "../feed-parser/feed-retention";
import type { TemplateVariableName } from "./template-variables";

/**
 * What each template variable resolves to for one item, built once per
 * render rather than looked up variable by variable (#266).
 */
export type ArticleTemplateValues = Readonly<
  Record<TemplateVariableName, string>
> & {
  /**
   * The save date in `{{date}}`'s long format. The web viewer's note
   * template fills `{{date}}` with it.
   */
  readonly saveDateLong: string;
  /** The article date that `{{date:FORMAT}}` formats. */
  readonly articleDate: Date;
};

/** What a call site decides for itself before the values are built. */
export interface ArticleTemplateInputs {
  /** The date the article's date variables describe. */
  readonly articleDate: Date;
  /** When the article is saved. */
  readonly now: Date | (() => Date);
  /** The web viewer note reads its long save date independently. */
  readonly saveDateLong?: () => Date;
  /** The item's tag names, after the call site's saved-tag rule. */
  readonly tagNames: readonly string[];
  /** The call site's `{{image}}` URL. */
  readonly image: string | (() => string);
}

export function formatMoment(date: Date, formatStr: string): string {
  type MomentFactory = (input: Date) => { format: (fmt: string) => string };
  return (moment as unknown as MomentFactory)(date).format(formatStr);
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The date to stamp into saved-note frontmatter/templates: the real
 * `pubDate` when it resolves to an actual instant, falling back to
 * `firstSeenMs` (when `useFirstSeenDateFallback` is enabled) when there's
 * no real date, and only reaching for "now" when neither is available.
 */
export function resolveSavedArticleDate(
  item: FeedItem,
  useFirstSeenDateFallback: boolean,
): Date {
  return resolveDisplayDate(item, useFirstSeenDateFallback) ?? new Date();
}

/** The item's tag names, in order, without blank ones. */
export function itemTagNames(item: FeedItem): string[] {
  return (item.tags ?? [])
    .map((tag) => tag.name)
    .filter(
      (name): name is string => typeof name === "string" && name.trim() !== "",
    );
}

export function buildArticleTemplateValues(
  item: FeedItem,
  inputs: ArticleTemplateInputs,
): ArticleTemplateValues {
  const { articleDate } = inputs;
  const isoDateTime = articleDate.toISOString();

  const firstSeenMs = item.firstSeenMs;
  const firstSeenDate =
    typeof firstSeenMs === "number" && !Number.isNaN(firstSeenMs)
      ? new Date(firstSeenMs)
      : articleDate;

  // Parsing the blurb is only worth doing for a template that uses it.
  let descriptions: ReturnType<typeof resolveItemDescriptions> | undefined;
  const describeItem = () => (descriptions ??= resolveItemDescriptions(item));
  const date = formatLongDate(articleDate);
  const firstSeen = formatLongDate(firstSeenDate);
  const firstSeenISO = formatMoment(firstSeenDate, "YYYY-MM-DD");
  const saveDateLong = inputs.saveDateLong
    ? formatLongDate(inputs.saveDateLong())
    : undefined;
  // Read the save clock after preparing article dates, as the legacy chains did.
  const now = typeof inputs.now === "function" ? inputs.now() : inputs.now;

  return {
    title: item.title,
    link: item.link,
    author: itemAuthorText(item),
    source: item.feedTitle,
    feedTitle: item.feedTitle,
    summary: item.summary || "",
    get description() {
      return describeItem().description;
    },
    get excerpt() {
      return describeItem().excerpt;
    },
    language: item.language ?? "",
    tags: inputs.tagNames.join(", "),
    guid: item.guid,
    image: typeof inputs.image === "function" ? inputs.image() : inputs.image,
    date,
    dateShort: formatMoment(articleDate, "YYYY-MM-DD"),
    isoDate: isoDateTime,
    isoDateTime,
    firstSeen,
    firstSeenISO,
    saveDate: formatMoment(now, "YYYY-MM-DD"),
    saveTime12: formatMoment(now, "hh:mm A"),
    saveTime24: formatMoment(now, "HH:mm"),
    saveDateLong: saveDateLong ?? formatLongDate(now),
    articleDate,
  };
}
