import { setTooltip } from "obsidian";
import type { FeedItem } from "../types/types";
import { getOpenableHttpHref } from "./url-utils";

import { moveFocusIfRemoved } from "./focus-utils";

const SOURCE_FOOTER_CLASS = "rss-reader-source-footer";
const SOURCE_FOOTER_LABEL = "Source";

/**
 * Removes any source footer elements currently in `container` (#1538).
 * If `focusFallback` is supplied and a removed footer held keyboard focus,
 * moves focus to `focusFallback`.
 */
export function clearSourceFooter(
  container: HTMLElement,
  focusFallback?: HTMLElement | null,
): void {
  for (const child of Array.from(container.children)) {
    if (child.classList.contains(SOURCE_FOOTER_CLASS)) {
      if (child.instanceOf(HTMLElement)) {
        moveFocusIfRemoved(child, focusFallback);
      }
      child.remove();
    }
  }
}

/**
 * Appends the article's source URL below the reader content (#1507): a muted
 * "Source" label and the full `item.link` as an external anchor. It is reader
 * UI only, a sibling of the content container, so saving and copying read the
 * content string and never see it. A link that is not an openable http(s) URL
 * renders nothing, so a feed cannot put a `javascript:` or `file:` href here.
 * It replaces a footer the container already holds, so a podcast player that
 * switches episode in place can call it again with the new episode.
 */
export function renderSourceFooter(
  container: HTMLElement,
  item: FeedItem,
): void {
  clearSourceFooter(container);
  const href = getOpenableHttpHref(item.link);
  if (!href) return;

  const footer = container.createDiv({ cls: SOURCE_FOOTER_CLASS });
  footer.createSpan({
    cls: "rss-reader-source-footer-label",
    text: SOURCE_FOOTER_LABEL,
  });
  const link = footer.createEl("a", {
    cls: "rss-reader-source-footer-link",
    text: href,
    href,
  });
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  setTooltip(link, href);
}
