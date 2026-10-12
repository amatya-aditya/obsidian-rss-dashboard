import { setIcon } from "obsidian";

export type SupportedFeedType = "rss" | "podcast" | "youtube";

export function renderSupportedFormatBadges(containerEl: HTMLElement): {
  formatsEl: HTMLDivElement;
  rssBadge: HTMLSpanElement;
  podcastBadge: HTMLSpanElement;
  youtubeBadge: HTMLSpanElement;
  clearActiveBadge: () => void;
  setActiveBadge: (feedType: SupportedFeedType | null) => void;
} {
  const formatsEl = containerEl.createDiv({ cls: "supported-formats" });

  const rssBadge = formatsEl.createSpan({ cls: "format-badge rss" });
  const rssIcon = rssBadge.createSpan({ cls: "format-badge-icon" });
  setIcon(rssIcon, "rss");
  rssBadge.appendChild(activeDocument.createTextNode(" RSS"));

  const podcastBadge = formatsEl.createSpan({ cls: "format-badge podcast" });
  const podcastIcon = podcastBadge.createSpan({ cls: "format-badge-icon" });
  setIcon(podcastIcon, "headphones");
  podcastBadge.appendChild(activeDocument.createTextNode(" Apple Podcasts"));

  const youtubeBadge = formatsEl.createSpan({ cls: "format-badge youtube" });
  const youtubeIcon = youtubeBadge.createSpan({ cls: "format-badge-icon" });
  // Obsidian 1.14.4 ships no "youtube" icon, so use the "play" glyph the
  // sidebar also uses for video feeds (#1015).
  setIcon(youtubeIcon, "play");
  youtubeBadge.appendChild(activeDocument.createTextNode(" YouTube"));

  const clearActiveBadge = () => {
    rssBadge.removeClass("active");
    podcastBadge.removeClass("active");
    youtubeBadge.removeClass("active");
  };

  const setActiveBadge = (feedType: SupportedFeedType | null) => {
    clearActiveBadge();
    if (feedType === "rss") rssBadge.addClass("active");
    if (feedType === "podcast") podcastBadge.addClass("active");
    if (feedType === "youtube") youtubeBadge.addClass("active");
  };

  return {
    formatsEl,
    rssBadge,
    podcastBadge,
    youtubeBadge,
    clearActiveBadge,
    setActiveBadge,
  };
}
