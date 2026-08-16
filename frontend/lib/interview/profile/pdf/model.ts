import "server-only";

/**
 * The geometric model the PIQ extraction adapter works in.
 *
 * A PDF has no notion of lines, rows, or cells — only glyphs at coordinates.
 * Everything in this file turns positions into structure, and it does so with
 * arithmetic on those positions rather than by counting spaces in a rendered
 * string. Whitespace counting is what destroyed the table columns in the
 * previous, text-only attempt: two columns a single space apart are
 * indistinguishable from one column, whereas their x coordinates are not.
 *
 * Pure: no PDF library, no I/O, no clock. Every function here can be tested
 * against hand-written coordinates with no PDF present at all.
 */

/**
 * One text run as the PDF emits it. Word-processor tables emit each cell as its
 * own run, so a run never straddles a column boundary in this document.
 */
export interface PdfWord {
  /** 1-based. */
  readonly page: number;
  readonly text: string;
  /** Left edge, in PDF user units (points), origin at the bottom-left. */
  readonly x: number;
  /** Baseline. Larger y is higher up the page. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Runs that share a baseline, left to right. */
export interface PdfLine {
  readonly page: number;
  readonly y: number;
  readonly words: readonly PdfWord[];
}

/**
 * Baselines within this many points are the same visual line. Three points
 * keeps a slightly-raised run ("Income per" sitting 2.2pt above "Relation") on
 * its own row while still separating genuinely stacked lines, which in this
 * form are never closer than about 12pt.
 */
export const DEFAULT_Y_TOLERANCE = 3;

/** Groups runs into visual lines, top to bottom, each ordered left to right. */
export function groupIntoLines(
  words: readonly PdfWord[],
  yTolerance: number = DEFAULT_Y_TOLERANCE,
): PdfLine[] {
  const sorted = [...words].sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x,
  );

  const lines: { page: number; y: number; words: PdfWord[] }[] = [];
  for (const word of sorted) {
    const current = lines[lines.length - 1];
    if (
      current !== undefined &&
      current.page === word.page &&
      Math.abs(current.y - word.y) <= yTolerance
    ) {
      current.words.push(word);
      continue;
    }
    lines.push({ page: word.page, y: word.y, words: [word] });
  }

  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Rebuilds the text of a run sequence.
 *
 * A space is inserted only where the runs are actually apart. The PDF splits
 * words mid-token ("Screened O" + "ut"), and joining those with a space would
 * invent one that the page does not show.
 */
export function joinWords(words: readonly PdfWord[]): string {
  let out = "";
  let previousRight: number | null = null;

  for (const word of words) {
    if (previousRight !== null && word.x - previousRight >= 1) out += " ";
    out += word.text;
    previousRight = word.x + word.width;
  }

  return out.replace(/\s+/g, " ").trim();
}

export function lineText(line: PdfLine): string {
  return joinWords(line.words);
}

/**
 * Splits one visual line wherever the horizontal gap exceeds `minGap`.
 *
 * The form places unrelated fields side by side — an address and its
 * "(Population in Lacs)", "Dated :" and "( Signature of Candidate)". They look
 * like one line to a text extractor and merge into a single value. The gap
 * between them is large and the gap inside a phrase is not, so the split is a
 * measurement rather than a guess.
 */
export function splitLineByGaps(line: PdfLine, minGap: number): PdfLine[] {
  const segments: PdfWord[][] = [];
  let current: PdfWord[] = [];
  let previousRight: number | null = null;

  for (const word of line.words) {
    if (
      previousRight !== null &&
      current.length > 0 &&
      word.x - previousRight >= minGap
    ) {
      segments.push(current);
      current = [];
    }
    current.push(word);
    previousRight = word.x + word.width;
  }
  if (current.length > 0) segments.push(current);

  return segments.map((words) => ({ page: line.page, y: line.y, words }));
}

/** Lowercases and drops punctuation, for comparing against known labels. */
export function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9%]+/g, "");
}

/** Normalised words of a string, for vocabulary checks. */
export function normalisedTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
}
