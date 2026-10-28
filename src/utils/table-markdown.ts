/**
 * Turning a feed's `<table>` into a GitHub-Flavored Markdown pipe table.
 *
 * GFM has no way to express part of the HTML table model, so this rule fixes a
 * deterministic degradation for each gap rather than dropping content:
 *
 * - `colspan` puts the cell's content in the first column it spans and leaves
 *   the rest of the span empty; the table is widened to its widest row.
 * - `rowspan` is ignored: the spanning cell appears only in its own row.
 * - `align` on a header cell becomes the separator's `:---`, `:---:`, or
 *   `---:`; anything else is a plain `---`.
 * - Block content in a cell (a list, a paragraph, a `<br>`) becomes one line
 *   joined by `<br>`, so the row keeps a single physical line.
 * - A `|` in cell text is escaped so it does not split the row.
 *
 * A table with no rows, or one whose cells are all empty, produces no output:
 * a separator row with nothing above or below it is not a table.
 */

/** The subset of Turndown this rule needs, matching its sibling rule modules. */
interface TableTurndownService {
  addRule(
    name: string,
    rule: {
      filter: (node: Node) => boolean;
      replacement: (content: string, node: Node) => string;
    },
  ): void;
  turndown(input: string | Node): string;
}

const ALIGNMENT_SEPARATORS: Record<string, string> = {
  left: ":---",
  center: ":---:",
  right: "---:",
};

const DEFAULT_SEPARATOR = "---";

/** The cells a row owns, excluding any belonging to a nested table. */
function rowCells(row: Element): Element[] {
  return Array.from(row.children).filter(
    (child) => child.nodeName === "TD" || child.nodeName === "TH",
  );
}

/** A cell's column span, treating a missing or unusable value as one column. */
function colspanOf(cell: Element): number {
  const parsed = Number.parseInt(cell.getAttribute("colspan") || "1", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

function separatorFor(cell: Element): string {
  const align = (cell.getAttribute("align") || "").trim().toLowerCase();
  return ALIGNMENT_SEPARATORS[align] ?? DEFAULT_SEPARATOR;
}

/**
 * Escapes each pipe that would otherwise end the cell. A pipe that an odd run
 * of backslashes already escapes is left alone, as in a code span's `a\|b`:
 * adding another backslash there would leave an even run and split the cell.
 */
function escapeCellPipes(text: string): string {
  let escaped = "";
  let backslashes = 0;
  for (const char of text) {
    if (char === "|" && backslashes % 2 === 0) escaped += "\\";
    escaped += char;
    backslashes = char === "\\" ? backslashes + 1 : 0;
  }
  return escaped;
}

/** Flattens a cell's Markdown to one table-safe line. */
function flattenCellMarkdown(markdown: string): string {
  return escapeCellPipes(
    markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("<br>"),
  );
}

function formatRow(cells: string[], columnCount: number): string {
  const padded = cells.slice();
  while (padded.length < columnCount) padded.push("");
  return `| ${padded.join(" | ")} |`;
}

/** A row's cells as one entry per column, a spanned column left empty. */
function rowSlots(
  row: Element,
  cellToMarkdown: (cell: Element) => string,
): string[] {
  const slots: string[] = [];
  for (const cell of rowCells(row)) {
    slots.push(cellToMarkdown(cell));
    for (let spanned = 1; spanned < colspanOf(cell); spanned += 1) {
      slots.push("");
    }
  }
  return slots;
}

function tableToMarkdown(
  table: Element,
  cellToMarkdown: (cell: Element) => string,
): string {
  const rows = Array.from((table as HTMLTableElement).rows);
  const headerRow = rows[0];
  if (!headerRow) return "";

  const headerSlots = rowSlots(headerRow, cellToMarkdown);
  const alignments = rowCells(headerRow).flatMap((cell) =>
    [separatorFor(cell)].concat(
      Array<string>(colspanOf(cell) - 1).fill(DEFAULT_SEPARATOR),
    ),
  );
  const bodySlots = rows.slice(1).map((row) => rowSlots(row, cellToMarkdown));

  const allSlots = [headerSlots, ...bodySlots];
  const columnCount = allSlots.reduce(
    (widest, slots) => Math.max(widest, slots.length),
    0,
  );
  if (columnCount === 0) return "";
  if (allSlots.every((slots) => slots.every((slot) => slot === ""))) return "";

  while (alignments.length < columnCount) {
    alignments.push(DEFAULT_SEPARATOR);
  }

  return [
    formatRow(headerSlots, columnCount),
    formatRow(alignments, columnCount),
    ...bodySlots.map((slots) => formatRow(slots, columnCount)),
  ].join("\n");
}

/**
 * Installs the pipe-table rule. Cell content goes back through the same
 * service, so links, emphasis, and the other shared rules apply inside cells
 * exactly as they do outside a table.
 */
export function addTableTurndownRule(
  turndownService: TableTurndownService,
): void {
  turndownService.addRule("table", {
    filter: (node: Node) => node.nodeName === "TABLE",
    replacement: (_content: string, node: Node) =>
      tableToMarkdown(node as Element, (cell) =>
        flattenCellMarkdown(turndownService.turndown(cell.cloneNode(true))),
      ),
  });
}
