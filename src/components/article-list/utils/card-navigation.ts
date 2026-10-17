export type CardNavigationDirection = "left" | "right" | "up" | "down";

export interface PositionedCard {
  guid: string;
  rect: DOMRect;
}

const ROW_TOLERANCE = 6;

function findRowForCard(
  rows: PositionedCard[][],
  entry: PositionedCard,
): PositionedCard[] | undefined {
  // Compare against every member, not just the first: a card can sit within
  // the row tolerance of a later card while being further than the tolerance
  // from the row's first card (see #1262).
  return rows.find((row) =>
    row.some(
      (member) => Math.abs(member.rect.top - entry.rect.top) <= ROW_TOLERANCE,
    ),
  );
}

export function groupCardsIntoRows(cards: HTMLElement[]): PositionedCard[][] {
  const positionedCards = cards
    .map((card) => ({
      guid: card.dataset.articleGuid ?? null,
      rect: card.getBoundingClientRect(),
    }))
    .filter((entry): entry is PositionedCard => entry.guid !== null);
  const rows: PositionedCard[][] = [];
  positionedCards.forEach((entry) => {
    const existingRow = findRowForCard(rows, entry);
    if (existingRow) {
      existingRow.push(entry);
      return;
    }
    rows.push([entry]);
  });
  rows.forEach((row) => row.sort((a, b) => a.rect.left - b.rect.left));
  rows.sort((a, b) => (a[0]?.rect.top ?? 0) - (b[0]?.rect.top ?? 0));
  return rows;
}

function resolveHorizontalTarget(
  currentRow: PositionedCard[],
  currentColumnIndex: number,
  direction: "left" | "right",
): string | null {
  if (direction === "left") {
    return currentColumnIndex > 0
      ? (currentRow[currentColumnIndex - 1]?.guid ?? null)
      : null;
  }
  return currentColumnIndex < currentRow.length - 1
    ? (currentRow[currentColumnIndex + 1]?.guid ?? null)
    : null;
}

function resolveVerticalTarget(
  rows: PositionedCard[][],
  currentRowIndex: number,
  currentColumnIndex: number,
  direction: "up" | "down",
): string | null {
  const targetRowIndex =
    direction === "up" ? currentRowIndex - 1 : currentRowIndex + 1;
  if (targetRowIndex < 0 || targetRowIndex >= rows.length) {
    return null;
  }

  const targetRow = rows[targetRowIndex];
  if (!targetRow) {
    return null;
  }
  const targetColumnIndex = Math.min(currentColumnIndex, targetRow.length - 1);

  return targetRow[targetColumnIndex]?.guid ?? null;
}

export function resolveCardNavigationTarget(
  rows: PositionedCard[][],
  currentGuid: string,
  direction: CardNavigationDirection,
): string | null {
  const currentRowIndex = rows.findIndex((row) =>
    row.some((entry) => entry.guid === currentGuid),
  );
  if (currentRowIndex === -1) {
    return null;
  }

  const currentRow = rows[currentRowIndex];
  if (!currentRow) {
    return null;
  }
  const currentColumnIndex = currentRow.findIndex(
    (entry) => entry.guid === currentGuid,
  );
  if (currentColumnIndex === -1) {
    return null;
  }

  if (direction === "left" || direction === "right") {
    return resolveHorizontalTarget(currentRow, currentColumnIndex, direction);
  }
  return resolveVerticalTarget(
    rows,
    currentRowIndex,
    currentColumnIndex,
    direction,
  );
}
