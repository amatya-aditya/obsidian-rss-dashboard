export type DashboardFilterLogic = "AND" | "OR";

const STATUS_ORDER: string[] = [
  "unread",
  "read",
  "saved",
  "starred",
  "podcasts",
  "videos",
  "tagged",
  "untagged",
];

const STATUS_LABELS: Record<string, string> = {
  unread: "Unread",
  read: "Read",
  saved: "Saved",
  starred: "Starred",
  podcasts: "Podcasts",
  videos: "Videos",
  tagged: "Tagged",
  untagged: "Untagged",
};

function getLogicWord(logic: DashboardFilterLogic): "and" | "or" {
  return logic === "AND" ? "and" : "or";
}

function normalizeStringSet(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v === "string") out.add(v);
  }
  return out;
}

function getSortedTagNames(tagFilters: Iterable<string>): string[] {
  return Array.from(tagFilters).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function hasMediaTypeStatuses(statusFilters: Set<string>): boolean {
  return statusFilters.has("podcasts") || statusFilters.has("videos");
}

export function formatDashboardMultiFiltersTitle(options: {
  baseTitle: string;
  statusFilters: Iterable<string>;
  tagFilters: Iterable<string>;
  logic: DashboardFilterLogic;
}): { title: string; tooltip: string | null } {
  const status = normalizeStringSet(options.statusFilters);
  const tags = normalizeStringSet(options.tagFilters);
  const logicWord = getLogicWord(options.logic);

  const hasTagNames = tags.size > 0;
  if (hasTagNames) {
    // Avoid redundant/confusing combinations in the title when explicit tag names
    // are present.
    status.delete("tagged");
    status.delete("untagged");
  }

  const parts: string[] = [];
  for (const id of STATUS_ORDER) {
    if (!status.has(id)) continue;
    const label = STATUS_LABELS[id];
    if (label) parts.push(label);
  }

  if (hasTagNames) {
    const tagNames = getSortedTagNames(tags);
    parts.push(`Tags: ${tagNames.join(", ")}`);
  }

  if (parts.length === 0) {
    return { title: options.baseTitle, tooltip: null };
  }

  const phrase = parts.join(` ${logicWord} `);
  const noun = hasMediaTypeStatuses(status) ? "items" : "articles";

  const base = options.baseTitle.trim();
  const lowerBase = base.toLowerCase();
  const title =
    lowerBase === "all articles" || lowerBase === "all items"
      ? `All ${phrase} ${noun}`
      : `${base} — ${phrase}`;

  const tooltip = `Active filters (${options.logic}): ${parts.join(", ")}`;
  return { title, tooltip };
}

export function formatDashboardMultiFiltersSummary(options: {
  statusFilters: Iterable<string>;
  tagFilters: Iterable<string>;
  logic: DashboardFilterLogic;
}): { text: string; tooltip: string | null } {
  const { title, tooltip } = formatDashboardMultiFiltersTitle({
    baseTitle: "All articles",
    statusFilters: options.statusFilters,
    tagFilters: options.tagFilters,
    logic: options.logic,
  });

  // For settings buttons, avoid repeating the "All ..." prefix.
  if (tooltip === null) {
    return { text: "All", tooltip: null };
  }

  const normalized = title.startsWith("All ") ? title.slice(4) : title;
  const text = normalized.endsWith(" articles")
    ? normalized.slice(0, -" articles".length)
    : normalized.endsWith(" items")
      ? normalized.slice(0, -" items".length)
      : normalized;

  return { text: text.trim(), tooltip };
}

export function formatDashboardMultiFiltersSummaryCompact(options: {
  statusFilters: Iterable<string>;
  tagFilters: Iterable<string>;
  logic: DashboardFilterLogic;
  maxItems?: number;
}): { text: string; tooltip: string | null } {
  const status = normalizeStringSet(options.statusFilters);
  const tags = normalizeStringSet(options.tagFilters);
  const logicWord = getLogicWord(options.logic);
  const maxItems = Math.max(1, options.maxItems ?? 2);

  const { tooltip } = formatDashboardMultiFiltersTitle({
    baseTitle: "All articles",
    statusFilters: status,
    tagFilters: tags,
    logic: options.logic,
  });

  if (tooltip === null) {
    return { text: "All", tooltip: null };
  }

  const hasTagNames = tags.size > 0;
  if (hasTagNames) {
    // Keep compact summaries readable by collapsing tag names into a single
    // short token, and avoid redundant tagged/untagged statuses.
    status.delete("tagged");
    status.delete("untagged");
  }

  const parts: Array<{ label: string; isTags: boolean }> = [];
  for (const id of STATUS_ORDER) {
    if (!status.has(id)) continue;
    const label = STATUS_LABELS[id];
    if (label) parts.push({ label, isTags: false });
  }

  if (hasTagNames) {
    const tagCount = tags.size;
    parts.push({
      label: tagCount === 1 ? "Tags (1)" : `Tags (${tagCount})`,
      isTags: true,
    });
  }

  if (parts.length === 0) {
    return { text: "All", tooltip };
  }

  let displayed: Array<{ label: string; isTags: boolean }> = [];
  if (parts.length <= maxItems) {
    displayed = parts;
  } else {
    const tagPart = parts.find((p) => p.isTags);
    if (tagPart && maxItems >= 2) {
      const firstNonTag = parts.find((p) => !p.isTags);
      displayed = firstNonTag ? [firstNonTag, tagPart] : [tagPart];
    } else {
      displayed = parts.slice(0, maxItems);
    }
  }

  const remaining = Math.max(0, parts.length - displayed.length);
  const baseText = displayed.map((p) => p.label).join(` ${logicWord} `);
  const text = remaining > 0 ? `${baseText} +${remaining}` : baseText;

  return { text: text.trim(), tooltip };
}

export interface ArticlesTitleInput {
  /** Title of the open feed, or null when no single feed is open. */
  currentFeedTitle: string | null;
  currentFolder: string | null;
  selectedTags: readonly string[];
  selectedFolders: readonly string[];
  selectedFeeds: readonly string[];
  /** `settings.sidebarTagFilterMode`; a missing or empty value means "or". */
  tagFilterMode: string | undefined;
  /** Called only on the branches that show a feed count. */
  getTotalFeedsInSelection: () => number;
}

function getSpecialFolderTitle(currentFolder: string | null): string | null {
  if (currentFolder === "starred") {
    return "Starred items";
  } else if (currentFolder === "unread") {
    return "Unread items";
  } else if (currentFolder === "read") {
    return "Read items";
  } else if (currentFolder === "saved") {
    return "Saved items";
  } else if (currentFolder === "videos") {
    return "Videos";
  } else if (currentFolder === "podcasts") {
    return "Podcasts";
  }
  return null;
}

function formatFeedCount(totalFeeds: number): string {
  return totalFeeds === 1 ? "1 feed" : `${totalFeeds} feeds`;
}

function formatTagSelectionTitle(input: ArticlesTitleInput): string {
  const mode = (input.tagFilterMode || "or").toUpperCase();
  const tagsPart = `Tags (${mode}): ${input.selectedTags.join(", ")}`;
  if (
    (input.selectedFolders && input.selectedFolders.length > 0) ||
    (input.selectedFeeds && input.selectedFeeds.length > 0)
  ) {
    // Combine folders/feeds and tags when both are active
    const parts = [];
    const totalFeeds = input.getTotalFeedsInSelection();
    if (input.selectedFolders && input.selectedFolders.length > 0) {
      parts.push(
        `Folders: ${input.selectedFolders.join(", ")} (Feeds: ${totalFeeds})`,
      );
    } else {
      parts.push(formatFeedCount(totalFeeds));
    }
    const selectionPart = parts.join(" & ");
    return `${selectionPart} & ${tagsPart}`;
  }
  return tagsPart;
}

function formatFolderFeedSelectionTitle(input: ArticlesTitleInput): string {
  const totalFeeds = input.getTotalFeedsInSelection();
  const parts = [];
  if (input.selectedFolders && input.selectedFolders.length > 0) {
    parts.push(
      `Folders: ${input.selectedFolders.join(", ")} (Feeds: ${totalFeeds})`,
    );
  } else {
    parts.push(formatFeedCount(totalFeeds));
  }
  return parts.join(" & ");
}

export function formatArticlesTitle(input: ArticlesTitleInput): string {
  if (input.currentFeedTitle !== null) {
    return input.currentFeedTitle;
  }
  const specialFolderTitle = getSpecialFolderTitle(input.currentFolder);
  if (specialFolderTitle !== null) {
    return specialFolderTitle;
  } else if (input.selectedTags.length > 0) {
    return formatTagSelectionTitle(input);
  } else if (
    (input.selectedFolders && input.selectedFolders.length > 0) ||
    (input.selectedFeeds && input.selectedFeeds.length > 0)
  ) {
    return formatFolderFeedSelectionTitle(input);
  } else if (input.currentFolder) {
    return input.currentFolder;
  } else {
    return "All articles";
  }
}
