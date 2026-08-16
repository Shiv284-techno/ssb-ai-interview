import "server-only";

import {
  joinWords,
  normalise,
  type PdfLine,
  type PdfWord,
} from "@/lib/interview/profile/pdf/model";

/**
 * Turning a table's printed header into column boundaries, and then sorting a
 * row's runs into cells by x coordinate.
 *
 * The anchors come from the header the form actually prints, read out of the
 * PDF at run time — no x positions are hard-coded here, so a reflowed or
 * re-exported form still works as long as it keeps its column headings.
 *
 * Pure: no PDF library, no I/O.
 */

/** The horizontal extent of one printed column heading. */
export interface ColumnAnchor {
  readonly x: number;
  readonly right: number;
}

/**
 * Locates one anchor per expected column.
 *
 * Header words are visited left to right and matched against the expected
 * column tokens **in order**, so the repeated "Max / Marks / %" triplets of the
 * marks tables land in the right group, and words that belong to a wrapped
 * group heading ("Theroy", "Practical/Sessionals") are simply skipped because
 * they match no token at the position under consideration.
 *
 * Returns null when the header is incomplete, which is the signal that this run
 * of lines is not the header after all.
 */
export function findColumnAnchors(
  words: readonly PdfWord[],
  columnTokens: readonly string[],
): ColumnAnchor[] | null {
  const candidates = [...words].sort((a, b) => a.x - b.x);
  const anchors: ColumnAnchor[] = [];
  let tokenIndex = 0;

  for (const word of candidates) {
    if (tokenIndex >= columnTokens.length) break;
    if (!normalise(word.text).startsWith(columnTokens[tokenIndex])) continue;

    anchors.push({ x: word.x, right: word.x + word.width });
    tokenIndex += 1;
  }

  return tokenIndex === columnTokens.length ? anchors : null;
}

/**
 * The x positions that separate the columns: the midpoint of the gap between
 * one heading's right edge and the next heading's left edge. Using the middle
 * of the gap, rather than a heading's own edge, keeps both left-aligned and
 * centred cell contents on the correct side.
 */
export function columnBoundaries(anchors: readonly ColumnAnchor[]): number[] {
  const boundaries: number[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    boundaries.push((anchors[index].right + anchors[index + 1].x) / 2);
  }
  return boundaries;
}

/**
 * Sorts a row's runs into cells. A cell with nothing in it stays an empty
 * string, which the PIQ parser then reads as null — a blank on the form must
 * not become an invented value.
 */
export function assignCells(
  line: PdfLine,
  boundaries: readonly number[],
): string[] {
  const buckets: PdfWord[][] = Array.from(
    { length: boundaries.length + 1 },
    () => [],
  );

  for (const word of line.words) {
    let column = 0;
    while (column < boundaries.length && word.x >= boundaries[column]) {
      column += 1;
    }
    buckets[column].push(word);
  }

  return buckets.map((words) => joinWords(words));
}

/** Renders cells in the form's column order as one normalised row. */
export function toPipeRow(cells: readonly string[]): string {
  return cells.join(" | ");
}
