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

