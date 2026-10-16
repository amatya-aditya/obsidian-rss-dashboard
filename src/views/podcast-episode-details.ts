import { FeedItem } from "../types/types";
import { sanitizeAndAppendHtml } from "../utils/safe-html";
import { itemAuthorText } from "../utils/item-author";

interface EpisodeMetaEntry {
  label: string;
  value: string;
  href?: string;
}

function stripWhitespace(input: string): string {
  return (input || "").replace(/\s+/g, "");
}

export function selectEpisodeNotesHtml(item: FeedItem): string {
  const content = (item.content || "").trim();
  const description = (item.description || "").trim();
  const itunesSummary = (item.itunes?.summary || "").trim();
  const summary = (item.summary || "").trim();

  if (content) {
    const meaningfullyDifferent =
      content.length > 40 &&
      stripWhitespace(content) !== stripWhitespace(description);
    if (!description || meaningfullyDifferent) {
      return content;
    }
  }

  return description || itunesSummary || summary || "";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded =
    value >= 10 || unitIndex === 0
      ? Math.round(value)
      : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

function buildLeadingMetaEntries(item: FeedItem): EpisodeMetaEntry[] {
  const entries: EpisodeMetaEntry[] = [];

  if (item.pubDate) {
    const d = new Date(item.pubDate);
    entries.push({
      label: "Published",
      value: Number.isNaN(d.getTime()) ? item.pubDate : d.toLocaleString(),
    });
  }

  const duration = (item.duration || item.itunes?.duration || "").trim();
  if (duration) entries.push({ label: "Duration", value: duration });

  const author = itemAuthorText(item).trim();
  if (author) entries.push({ label: "Author", value: author });

  if (typeof item.explicit === "boolean") {
    entries.push({ label: "Explicit", value: item.explicit ? "Yes" : "No" });
  }

  return entries;
}

function buildTrailingMetaEntries(item: FeedItem): EpisodeMetaEntry[] {
  const entries: EpisodeMetaEntry[] = [];

  if (typeof item.season === "number")
    entries.push({ label: "Season", value: String(item.season) });
  if (typeof item.episode === "number")
    entries.push({ label: "Episode", value: String(item.episode) });

  const episodeType = (item.episodeType || "").trim();
  if (episodeType) entries.push({ label: "Type", value: episodeType });

  const category = (item.category || "").trim();
  if (category) entries.push({ label: "Category", value: category });

  const link = (item.link || "").trim();
  if (link) entries.push({ label: "Link", value: "Open episode", href: link });

  const enclosureLen = (item.enclosure?.length || "").trim();
  if (enclosureLen) {
    const n = Number(enclosureLen);
    const formatted = Number.isFinite(n) ? formatBytes(n) : "";
    entries.push({ label: "Size", value: formatted || enclosureLen });
  }

  return entries;
}

function renderMetaGrid(body: HTMLElement, entries: EpisodeMetaEntry[]): void {
  const grid = body.createDiv({ cls: "podcast-episode-meta-grid" });
  entries.forEach((entry) => {
    grid.createDiv({
      cls: "podcast-episode-meta-label",
      text: entry.label,
    });
    const valueEl = grid.createDiv({ cls: "podcast-episode-meta-value" });
    if (entry.href) {
      const a = valueEl.createEl("a", {
        text: entry.value,
        attr: { href: entry.href },
      });
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else {
      valueEl.textContent = entry.value;
    }
  });
}

function renderNotes(body: HTMLElement, notesHtml: string): void {
  const notes = body.createDiv({ cls: "podcast-episode-notes" });
  notes.createDiv({
    cls: "podcast-episode-notes-title",
    text: "Show notes",
  });
  const notesBody = notes.createDiv({ cls: "podcast-episode-notes-body" });
  sanitizeAndAppendHtml(notesBody, notesHtml);
}

export function renderEpisodeDetails(
  playerEl: HTMLElement,
  item: FeedItem,
  theme: string,
): void {
  const notesHtml = selectEpisodeNotesHtml(item);
  const entries = [
    ...buildLeadingMetaEntries(item),
    ...buildTrailingMetaEntries(item),
  ];

  const hasNotes = Boolean(notesHtml && notesHtml.trim());
  const hasMeta = entries.length > 0;
  if (!hasNotes && !hasMeta) return;

  const details = playerEl.createEl("details", {
    cls: "podcast-episode-details",
  });
  details.setAttribute("data-podcast-theme", theme);

  details.createEl("summary", { text: "Episode details" });
  const body = details.createDiv({ cls: "podcast-episode-details-body" });

  if (hasMeta) renderMetaGrid(body, entries);
  if (hasNotes) renderNotes(body, notesHtml);
}
