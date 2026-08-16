import "server-only";

import {
  assignCells,
  columnBoundaries,
  findColumnAnchors,
  toPipeRow,
  type ColumnAnchor,
} from "@/lib/interview/profile/pdf/columns";
import {
  groupIntoLines,
  lineText,
  normalise,
  normalisedTokens,
  splitLineByGaps,
  type PdfLine,
  type PdfWord,
} from "@/lib/interview/profile/pdf/model";
import {
  PIQ_BANNERS,
  PIQ_TABLES,
  isPageFurniture,
  type PiqTableDefinition,
} from "@/lib/interview/profile/pdf/piq-tables";

/**
 * The PIQ PDF extraction adapter.
 *
 *   PDF bytes -> words with coordinates -> visual lines -> reconstructed table
 *   rows -> normalised text -> parsePIQText()
 *
 * The adapter owns every question of geometry so the PIQ parser owns none of
 * them: the parser continues to read plain lines and pipe-delimited rows, and
 * has no idea a PDF was ever involved.
 *
 * Server-only. It reads bytes handed to it and returns text; it opens no file,
 * makes no network request, reads no environment variable, and logs nothing —
 * in particular it never logs extracted content, which on a filled form is a
 * candidate's name, address, date of birth, and family details.
 */

/** Beyond this horizontal gap, two runs are separate fields, not one phrase. */
const FIELD_GAP = 25;
/** A wrapped heading continues within this vertical distance. */
const HEADER_CONTINUATION_GAP = 20;
/**
 * How far past a table heading to look for its column headings. Q25 and Q26
 * print a dozen scalar fields between the title and the marks table.
 */
const HEADER_SEARCH_LINES = 16;
/**
 * How many stacked lines one heading may occupy. Q27 wraps its headings over
 * seven lines, with "From" and "To" on the last of them.
 */
const MAX_HEADER_LINES = 8;

export interface PiqTableExtraction {
  readonly id: string;
  readonly questionNumber: number;
  readonly columnCount: number;
  /** Column boundary x positions read from the form's own headings. */
  readonly boundaries: readonly number[];
  /** One pipe-delimited row per data line found under the heading. */
  readonly rows: readonly string[];
}

export interface PiqExtraction {
  readonly pageCount: number;
  readonly wordCount: number;
  /** Normalised text, ready for `parsePIQText`. */
  readonly text: string;
  readonly tables: readonly PiqTableExtraction[];
}

// ---------------------------------------------------------------------------
// Normalisation — pure, and testable without a PDF
// ---------------------------------------------------------------------------

function isBanner(text: string): boolean {
  const folded = normalise(text);
  return PIQ_BANNERS.some((banner) => folded.startsWith(banner));
}

/** Strips a leading question number so the heading itself can be matched. */
function withoutQuestionNumber(text: string): string {
  return text.replace(/^\s*\d{1,2}[.)]\s*/, "");
}

function tableFor(text: string): PiqTableDefinition | undefined {
  const heading = normalise(withoutQuestionNumber(text));
  return PIQ_TABLES.find((table) => heading.startsWith(table.heading));
}

/**
 * True when a line ends the table above it: a new numbered question, a section
 * banner, or the publisher's page furniture.
 *
 * A numbered question must be followed by a letter. The serial column of the
 * Q33 and Q25 tables prints bare "8." and "9.", and treating those as the next
 * question would truncate the table at its eighth row.
 */
function endsTable(
  line: PdfLine,
  tablePage: number,
  table?: PiqTableDefinition,
): boolean {
  if (line.page !== tablePage) return true;

  const text = lineText(line);
  if (isBanner(text)) return true;
  if (isPageFurniture(text)) return true;

  // Some tables are followed by an unnumbered field rather than by the next
  // question — Q33 is followed by "Dated :" — so each table names what closes
  // it when a question number will not.
  const folded = normalise(text);
  if (table?.endsBefore?.some((prefix) => folded.startsWith(prefix))) return true;

  return /^\s*\d{1,2}[.)]\s*[A-Za-z]/.test(text);
}

interface LocatedHeader {
  readonly anchors: readonly ColumnAnchor[];
  readonly headerLines: readonly PdfLine[];
  /** Index of the first data line. */
  readonly dataStart: number;
}

/**
 * Finds the column headings beneath a table's title.
 *
 * The smallest run of consecutive lines that yields every expected column wins,
 * so a heading spread over four lines is assembled while a one-line heading
 * does not swallow the first data row. Wrapped remnants ("Month", "Obtained",
 * "Screened Out (s/o)") are then absorbed while they stay close vertically and
 * contain only heading vocabulary.
 */
function locateHeader(
  lines: readonly PdfLine[],
  from: number,
  table: PiqTableDefinition,
): LocatedHeader | null {
  const page = lines[from]?.page;
  if (page === undefined) return null;

  const searchLimit = Math.min(lines.length, from + HEADER_SEARCH_LINES);

  for (let start = from; start < searchLimit; start += 1) {
    if (lines[start].page !== page) break;
    // Never search past the end of this table, or Q23 would adopt Q24's
    // headings when its own are missing.
    if (endsTable(lines[start], page)) break;

    for (let size = 1; size <= MAX_HEADER_LINES && start + size <= lines.length; size += 1) {
      const window = lines.slice(start, start + size);
      if (window.some((line) => line.page !== page)) break;

      const anchors = findColumnAnchors(
        window.flatMap((line) => line.words),
        table.columnTokens,
      );
      if (!anchors) continue;

      let end = start + size;
      let previousY = window[window.length - 1].y;
      while (end < lines.length && lines[end].page === page) {
        const candidate = lines[end];
        if (previousY - candidate.y > HEADER_CONTINUATION_GAP) break;

        const tokens = normalisedTokens(lineText(candidate));
        if (tokens.length === 0) break;
        if (!tokens.every((token) => table.headerVocabulary.includes(token))) break;

        previousY = candidate.y;
        end += 1;
      }

      return { anchors, headerLines: lines.slice(start, end), dataStart: end };
    }
  }

  return null;
}

/**
 * Converts positioned words into the line-and-pipe-row text the PIQ parser
 * reads. Pure: the same words always produce the same text.
 */
export function normalisePiqLines(words: readonly PdfWord[]): {
  text: string;
  tables: PiqTableExtraction[];
} {
  const lines = groupIntoLines(words);
  const out: string[] = [];
  const tables: PiqTableExtraction[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const text = lineText(line);

    if (isBanner(text)) {
      out.push(text);
      index += 1;
      continue;
    }

    const table = tableFor(text);
    if (table) {
      out.push(text);
      index += 1;

      const header = locateHeader(lines, index, table);
      if (!header) continue;

      // Emitted so the parser recognises and skips it, rather than reading the
      // column headings as though a candidate had written them.
      const boundaries = columnBoundaries(header.anchors);
      out.push(toPipeRow(assignCells(header.headerLines[0], boundaries)));

      const rows: string[] = [];
      index = header.dataStart;
      while (index < lines.length && !endsTable(lines[index], line.page, table)) {
        const cells = assignCells(lines[index], boundaries);
        if (cells.some((cell) => cell.length > 0)) {
          const row = toPipeRow(cells);
          rows.push(row);
          out.push(row);
        }
        index += 1;
      }

      tables.push({
        id: table.id,
        questionNumber: table.questionNumber,
        columnCount: table.columnTokens.length,
        boundaries,
        rows,
      });
      continue;
    }

    // Outside tables, split where the page puts real horizontal space, so an
    // address does not swallow "(Population in Lacs)" and "Dated :" does not
    // swallow "( Signature of Candidate)".
    const segments = splitLineByGaps(line, FIELD_GAP)
      .map((segment) => lineText(segment))
      .filter((segmentText) => segmentText.length > 0);

    for (const segment of segments) {
      const previous = out[out.length - 1];
      // The form indents its question numbers, leaving "1." far enough from
      // "Selection Board No." to look like a field of its own. It is not —
      // rejoining them keeps the number with the label it introduces, which
      // the parser needs to tell an ambiguous short label apart from prose.
      if (previous !== undefined && /^\d{1,2}[.)]$/.test(previous)) {
        out[out.length - 1] = `${previous} ${segment}`;
        continue;
      }
      out.push(segment);
    }
    index += 1;
  }

  return { text: out.join("\n"), tables };
}

// ---------------------------------------------------------------------------
// PDF binding — the only impure part
// ---------------------------------------------------------------------------

interface PdfTextItemLike {
  readonly str?: unknown;
  readonly transform?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
}

function toWord(item: PdfTextItemLike, page: number): PdfWord | null {
  const { str, transform, width, height } = item;
  if (typeof str !== "string" || str.trim().length === 0) return null;
  if (!Array.isArray(transform) || transform.length < 6) return null;

  const x = transform[4];
  const y = transform[5];
  if (typeof x !== "number" || typeof y !== "number") return null;

  return {
    page,
    text: str,
    x,
    y,
    width: typeof width === "number" ? width : 0,
    height: typeof height === "number" ? height : 0,
  };
}

/** Reads every positioned text run from the document, page by page. */
export async function extractPiqWords(data: Uint8Array): Promise<PdfWord[]> {
  // Imported lazily and from the legacy build: this keeps the PDF engine out of
  // any bundle that does not extract, and the legacy build is the one that runs
  // under Node rather than in a browser.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const document = await pdfjs.getDocument({
    // A copy, because the reader detaches the buffer it is given.
    data: new Uint8Array(data),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  try {
    const words: PdfWord[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        for (const item of content.items) {
          const word = toWord(item as PdfTextItemLike, pageNumber);
          if (word) words.push(word);
        }
      } finally {
        page.cleanup();
      }
    }
    return words;
  } finally {
    await document.destroy();
  }
}

/**
 * Converts a PIQ PDF into the normalised text `parsePIQText` expects.
 *
 * Nothing about the document is logged or reported outward beyond counts; the
 * extracted text is returned to the caller and nowhere else.
 */
export async function extractPIQPdf(data: Uint8Array): Promise<PiqExtraction> {
  const words = await extractPiqWords(data);
  const pageCount = words.reduce((highest, word) => Math.max(highest, word.page), 0);
  const { text, tables } = normalisePiqLines(words);

  return { pageCount, wordCount: words.length, text, tables };
}
