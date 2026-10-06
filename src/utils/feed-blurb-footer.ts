// Feed-blurb footer strip (#247 slice 3a, #677): WordPress and similar feeds
// append "The post <title> appeared first on <site>." to an item's blurb. The
// match is structural, not English wording: a trailing block that links to the
// item's own title is a footer. A "Discuss this article" style block right
// after it goes too. On ambiguity nothing is stripped, since hiding real
// publisher text is worse than showing a footer.

const MAX_FOOTER_BLOCK_LENGTH = 300;
const MAX_TRAILING_LINK_BLOCK_LENGTH = 100;
/** How many trailing blocks are searched for the title link. */
const MAX_FOOTER_BLOCKS = 3;

function normalizeForTitleMatch(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function blockText(block: Element): string {
  return (block.textContent ?? "").replace(/\s+/g, " ").trim();
}

function linksToTitle(block: Element, normalizedTitle: string): boolean {
  return Array.from(block.querySelectorAll("a")).some(
    (link) =>
      normalizeForTitleMatch(link.textContent ?? "") === normalizedTitle,
  );
}

function hasLink(block: Element): boolean {
  return block.querySelector("a") !== null;
}

function topLevelBlocks(body: HTMLElement): ChildNode[] {
  return Array.from(body.childNodes).filter(
    (node) => node.nodeType !== 3 || (node.textContent ?? "").trim() !== "",
  );
}

/**
 * Index of the first footer block, or -1 when the blurb does not end in one.
 * Blocks after the footer must themselves be short link blocks.
 */
function findFooterStart(blocks: ChildNode[], normalizedTitle: string): number {
  const earliest = Math.max(0, blocks.length - MAX_FOOTER_BLOCKS);
  for (let i = blocks.length - 1; i >= earliest; i--) {
    const node = blocks[i];
    if (!node || node.nodeType !== 1) return -1;
    const block = node as Element;
    if (
      linksToTitle(block, normalizedTitle) &&
      blockText(block).length <= MAX_FOOTER_BLOCK_LENGTH
    ) {
      return i;
    }
    if (
      !hasLink(block) ||
      blockText(block).length > MAX_TRAILING_LINK_BLOCK_LENGTH
    ) {
      return -1;
    }
  }
  return -1;
}

/**
 * Returns the blurb without a trailing "appeared first on" footer, or the
 * input unchanged when there is none. `title` is the item's title; without it
 * nothing is stripped.
 */
export function stripFeedBlurbFooter(html: string, title: string): string {
  const normalizedTitle = normalizeForTitleMatch(title);
  if (!html || !normalizedTitle) return html;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return html;
  }
  const blocks = topLevelBlocks(doc.body);
  const start = findFooterStart(blocks, normalizedTitle);
  if (start < 0) return html;

  for (const node of blocks.slice(start)) node.remove();
  return doc.body.innerHTML.trim();
}
