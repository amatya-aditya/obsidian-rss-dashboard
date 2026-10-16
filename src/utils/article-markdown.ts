/**
 * The HTML-to-Markdown conversion the saver's content paths share: the
 * fetched-article body, the fetch-failure fallback, an RSS-content save, and
 * the Web Viewer save. One converter is what keeps those paths in parity.
 */
import TurndownService from "turndown";
import { stripNonContentHtmlNodes } from "./html-text";
import { addMathTurndownRule, protectMathForMarkdown } from "./math-rendering";
import { normalizeSubstackImageUrl } from "./substack-image-url";
import {
  addYouTubeEmbedTurndownRule,
  protectYouTubeEmbedsForMarkdown,
} from "./youtube-embed";

/**
 * Rewrites a link that wraps block content or an image so Turndown renders its
 * label (or unwraps the image) instead of collapsing the whole link.
 */
function normalizeBlockLinksForMarkdown(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    doc.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href") || "";
      const hasInlineImage = !!link.querySelector("img, picture img");
      const hasBlockContent = !!link.querySelector(
        "address, article, aside, blockquote, br, dd, div, dl, dt, figcaption, figure, footer, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, ul",
      );
      if (!hasBlockContent && !hasInlineImage) return;

      link.querySelectorAll("br").forEach((br) => {
        br.replaceWith(doc.createTextNode(" "));
      });

      const label = (link.textContent || "").replace(/\s+/g, " ").trim();
      if (label) {
        link.textContent = label;
        return;
      }

      if (hasInlineImage && hasBlockContent) {
        // A label-less block link does not survive the Markdown conversion as
        // a link, so unwrap it and keep its contents (the image), as before.
        const fragment = doc.win.createFragment();
        while (link.firstChild) {
          fragment.appendChild(link.firstChild);
        }

        link.replaceWith(fragment);
        return;
      }

      // An image-only link keeps its anchor, so the image stays a link in the
      // saved note (#1194). Only labelled anchors are flattened to text above.
      if (hasInlineImage && href) {
        link.setAttribute("href", normalizeSubstackImageUrl(href));
      }
    });

    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

/** Converts saved-article HTML to Markdown with the shared article rules. */
export function articleHtmlToMarkdown(html: string): string {
  const turndownService = new TurndownService();
  addMathTurndownRule(turndownService);
  addYouTubeEmbedTurndownRule(turndownService);

  const cleaned = stripNonContentHtmlNodes(
    protectYouTubeEmbedsForMarkdown(html),
  );
  const normalized = normalizeBlockLinksForMarkdown(cleaned);
  return turndownService.turndown(protectMathForMarkdown(normalized));
}
