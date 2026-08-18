/**
 * OIR set ingestion — authoring/build-time tool, not application runtime.
 *
 * Reads one set out of the OIR practice book and emits structured question
 * records plus clean candidate-facing figures.
 *
 * STRATEGY: PDF coordinates + rendered-page pixels -> curated/verified records.
 *
 * The text layer of this book is INCOMPLETE. Content that renders is sometimes
 * absent from it entirely: Q31's fourth option on page 8 and Q50's explanation
 * on page 16 are printed below the running footer and cannot be extracted by
 * pdfjs or pdftotext, and none of the publisher's branding is extractable
 * either. So the text layer is treated as a description of the TEXT only, and
 * the rendered page is the authority on everything else.
 *
 * DESIGN NOTES, most of them arrived at the hard way:
 *
 * 1. Text is driven by COORDINATES, never by flat text. The book overflows
 *    lines past the page footer — "7. Answer: (3)" sits below it — and a flat
 *    extraction fuses the two into "S7S.BAOnIRswPReArC:T(I3CE)". Coordinates
 *    separate them exactly.
 *
 * 2. Figures are found in the PIXELS. The page is rendered, the text lines are
 *    masked out, and whatever ink survives is a figure, cropped to its own
 *    bounding box. The previous gap-based approach cropped whole inter-line
 *    bands, which dragged the next question's stem into 22 of 36 figures,
 *    invented a blank figure for Q29 where the source only had paragraph
 *    spacing, and missed Q24's series entirely because the band was 27pt and
 *    the threshold was 30pt. Masking text and keeping ink has none of those
 *    failure modes: it cannot include text that the mask removed, and it cannot
 *    emit a figure where there is no ink.
 *
 * 3. Image placement matrices are NOT used. They carry a systematic offset that
 *    could not be shown to be page-invariant, and a magic constant that is
 *    wrong on one page silently attaches the wrong picture to a question.
 *
 * 4. Anything the tool cannot recover reliably is OMITTED with a recorded
 *    reason. The candidate-facing bank must never contain a question whose stem,
 *    options, figures or answer are incomplete or ambiguous. A short verified
 *    bank beats a complete guessed one.
 *
 * 5. Human-verified facts live in curated/set-NN.json with their evidence, and
 *    may only FILL fields the extractor could not resolve — never overwrite one
 *    it did. That keeps curation auditable and stops it from masking a
 *    regression.
 *
 * Fails loudly. It never guesses and writes nothing unless every check passes.
 *
 * Prerequisites: pdftoppm and pdfinfo (poppler) on PATH. pdfjs-dist and sharp
 * are already project dependencies of frontend/; this tool borrows both rather
 * than adding any.
 *
 * Usage:
 *   node tools/oir-ingest/extract-set.mjs --set 1
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_PDF = join(REPO, "docs", "SSB_OIR_PRACTICE_BOOK_SETS_01-32.pdf");
const require = createRequire(join(REPO, "frontend", "package.json"));
const sharp = require("sharp");

/** Recorded on every item and asset. */
const PROVENANCE = {
  kind: "original",
  author: "SSB AI Interviewer platform",
  createdAt: new Date(0).toISOString(),
};

const EXPECTED_QUESTIONS = 50;
const RENDER_DPI = 200;
/** A pixel darker than this counts as ink. */
const INK_THRESHOLD = 200;

/**
 * Vertical extent of a text line relative to its baseline, as a multiple of the
 * font size. Generous on both sides: the mask must cover every glyph, because
 * any text row it misses becomes a "figure".
 */
const TEXT_ASCENT_RATIO = 0.95;
const TEXT_DESCENT_RATIO = 0.35;
const TEXT_BAND_PADDING_PT = 1.5;
const DEFAULT_FONT_SIZE_PT = 11;

/**
 * Page furniture, measured from the rendered pages rather than assumed:
 * the running footer inks y=28.6..33.7 and the publisher's branding y=0.5..7.0
 * on every page of the set.
 */
const FOOTER_BAND = { low: 25.5, high: 35.0 };
const BRANDING_BAND = { low: 0, high: 8.5 };
const HEADER_BAND_LOW = 728;

/** Ink between the branding and the footer is content the text layer never described. */
const HAZARD_BAND = { low: BRANDING_BAND.high, high: FOOTER_BAND.low };
/** Ignore a hazard smaller than this; a stray anti-aliasing speck is not content. */
const HAZARD_MIN_INK_PIXELS = 40;

/** Whitespace kept around a figure's ink so nothing is shaved off the diagram. */
const FIGURE_MARGIN_PT = 4;
/** Below this a surviving ink island is a rendering artefact, not a figure. */
const FIGURE_MIN_HEIGHT_PT = 8;
const FIGURE_MIN_INK_PIXELS = 200;

/** A curated fact has to say what establishes it, not merely assert it. */
const MIN_CURATION_EVIDENCE = 40;
/** A written OIR answer is a letter, a digit, or a very short token. */
const SHORT_TEXT_MAX_LENGTH = 16;

class IngestError extends Error {}

function fail(message) {
  throw new IngestError(message);
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

function joinWords(words) {
  let out = "";
  let previousRight = null;
  for (const word of words) {
    if (previousRight !== null && word.x - previousRight >= 1) out += " ";
    out += word.text;
    previousRight = word.x + word.width;
  }
  return out.replace(/\s+/g, " ").trim();
}

async function readPageLines(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const words = content.items
    .filter((item) => item.str && item.str.trim().length > 0)
    .map((item) => ({
      text: item.str,
      x: Number(item.transform[4].toFixed(2)),
      y: Number(item.transform[5].toFixed(2)),
      width: Number((item.width ?? 0).toFixed(2)),
      height: Number((item.height ?? 0).toFixed(2)) || DEFAULT_FONT_SIZE_PT,
      right: Number((item.transform[4] + (item.width ?? 0)).toFixed(2)),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const grouped = [];
  for (const word of words) {
    const current = grouped[grouped.length - 1];
    if (current && Math.abs(current.y - word.y) <= 2) current.words.push(word);
    else grouped.push({ y: word.y, words: [word] });
  }
  page.cleanup();

  return grouped.map((line) => {
    const ordered = [...line.words].sort((a, b) => a.x - b.x);
    return {
      page: pageNumber,
      y: line.y,
      x: Math.min(...ordered.map((w) => w.x)),
      right: Math.max(...ordered.map((w) => w.right)),
      fontSize: Math.max(...ordered.map((w) => w.height)),
      text: joinWords(ordered),
    };
  });
}

// ---------------------------------------------------------------------------
// Answer-key classification
// ---------------------------------------------------------------------------

/**
 * Classifies an answer exactly as written. Anything unrecognised is an error,
 * never a best guess — a wrong key is worse than a missing one.
 *
 * The question's own shape decides between forms that look alike on the page.
 * "5" means option 5 when the question prints five options and means the digit
 * five when it prints none; "8 and 13" means two option numbers when there are
 * options to number and means two values to write when there are not.
 */
function classifyAnswer(raw, { number, optionCount, figureCount }) {
  const value = raw.trim();
  const choosable = optionCount > 0 || figureCount > 0;

  if (value.length === 0) {
    // The answer exists only as a worked figure — an arithmetic diagram with a
    // boxed digit. No key can be read from the text, so it is left unresolved
    // for curation to fill from the rendered page, or for omission.
    return { kind: "unresolved", reason: "the source prints this answer only as a figure" };
  }

  // "(5) River" — an option number followed by its label.
  const labelled = /^\((\d+)\)\s+(.+)$/.exec(value);
  if (labelled) return { kind: "single-option", optionId: labelled[1], label: labelled[2] };

  // "(3)"
  const single = /^\((\d+)\)$/.exec(value);
  if (single) return { kind: "single-option", optionId: single[1] };

  // "Yes" / "No"
  if (/^(Yes|No)$/i.test(value)) return { kind: "boolean", value: /^yes$/i.test(value) };

  // "2 and 3" — option numbers when the question offers choices, otherwise two
  // values the candidate writes down, in the order the series produces them.
  const conjunction = /^(\d+)\s+and\s+(\d+)$/i.exec(value);
  if (conjunction) {
    return choosable
      ? { kind: "multiple-options", optionIds: [conjunction[1], conjunction[2]] }
      : { kind: "ordered-sequence", values: [conjunction[1], conjunction[2]] };
  }

  // "2, 1, 2" — digits, order significant, repeats allowed.
  if (/^\d+(\s*,\s*\d+)+$/.test(value)) {
    return { kind: "ordered-sequence", values: value.split(",").map((v) => v.trim()) };
  }

  // "JHG, FDC" — alphabetic tokens.
  if (/^[A-Z]+(\s*,\s*[A-Z]+)+$/.test(value)) {
    return { kind: "multi-token", values: value.split(",").map((v) => v.trim()) };
  }

  // A bare number against a question that prints options is that option.
  if (/^\d{1,2}$/.test(value) && choosable) {
    return { kind: "single-option", optionId: value };
  }

  // "D", "L" — a letter or short token written on the answer sheet.
  if (/^[A-Za-z0-9]{1,4}$/.test(value)) return { kind: "short-text", value };

  fail(
    `Q${number}: answer ${JSON.stringify(value)} matches no known form. ` +
      `Add a rule deliberately rather than letting it be guessed.`,
  );
}

// ---------------------------------------------------------------------------
// Rendered-page analysis
// ---------------------------------------------------------------------------

function pageGeometry(pageNumber) {
  const output = execFileSync(
    "pdfinfo",
    ["-box", "-f", String(pageNumber), "-l", String(pageNumber), SOURCE_PDF],
    { encoding: "utf8" },
  );
  const media = /MediaBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(output);
  if (!media) fail(`page ${pageNumber}: could not read the MediaBox`);
  return { top: Number(media[4]), right: Number(media[3]) };
}

/**
 * Renders a page once and reduces it to per-row ink statistics. Everything
 * downstream — figure detection, hazard detection and the crops themselves —
 * comes from this single render, so what is analysed is exactly what is shipped.
 */
async function renderPage(pageNumber, scratchDir) {
  const prefix = join(scratchDir, `page-${pageNumber}`);
  execFileSync(
    "pdftoppm",
    ["-png", "-r", String(RENDER_DPI), "-f", String(pageNumber), "-l", String(pageNumber), SOURCE_PDF, prefix],
    { stdio: "pipe" },
  );
  const rendered = readdirSync(scratchDir).find(
    (f) => f.startsWith(`page-${pageNumber}-`) && f.endsWith(".png"),
  );
  if (!rendered) fail(`page ${pageNumber}: pdftoppm produced no output`);
  const file = join(scratchDir, rendered);

  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rowInk = new Int32Array(info.height);
  const rowLeft = new Int32Array(info.height).fill(info.width);
  const rowRight = new Int32Array(info.height).fill(-1);

  for (let y = 0; y < info.height; y += 1) {
    const base = y * info.width;
    for (let x = 0; x < info.width; x += 1) {
      if (data[base + x] < INK_THRESHOLD) {
        rowInk[y] += 1;
        if (x < rowLeft[y]) rowLeft[y] = x;
        if (x > rowRight[y]) rowRight[y] = x;
      }
    }
  }

  const geometry = pageGeometry(pageNumber);
  return {
    pageNumber,
    file,
    data,
    width: info.width,
    height: info.height,
    rowInk,
    rowLeft,
    rowRight,
    geometry,
    ink: (row, col) => data[row * info.width + col] < INK_THRESHOLD,
    toRow: (yPt) => Math.round(((geometry.top - yPt) * RENDER_DPI) / 72),
    toPt: (row) => geometry.top - ((row + 0.5) * 72) / RENDER_DPI,
  };
}

/**
 * The rectangle a piece of page furniture actually inks, measured rather than
 * assumed. The running header's "|" separator descends a good deal further than
 * its font metrics suggest — far enough to share rows with the option numbers
 * of a figure that starts at the top of a page — so the distinction between
 * "next to the header" and "underneath the header" has to come from pixels.
 */
function measureRect(render, line) {
  const band = textBand(line);
  const rowFrom = Math.max(0, render.toRow(band.high));
  const rowTo = Math.min(render.height - 1, render.toRow(band.low));
  const colFrom = Math.max(0, Math.floor(((line.x - 2) * RENDER_DPI) / 72));
  const colTo = Math.min(render.width - 1, Math.ceil(((line.right + 2) * RENDER_DPI) / 72));

  let top = null;
  let bottom = null;
  let left = render.width;
  let right = -1;
  for (let row = rowFrom; row <= rowTo; row += 1) {
    for (let col = colFrom; col <= colTo; col += 1) {
      if (!render.ink(row, col)) continue;
      if (top === null) top = row;
      bottom = row;
      if (col < left) left = col;
      if (col > right) right = col;
    }
  }
  return top === null ? null : { rowFrom: top, rowTo: bottom, colFrom: left, colTo: right };
}

const insideRect = (rects, row, col) =>
  rects.some((r) => row >= r.rowFrom && row <= r.rowTo && col >= r.colFrom && col <= r.colTo);

/**
 * The rectangles the running header and footer occupy, derived once for the
 * whole set by intersecting what each page measures.
 *
 * Measuring one page in isolation does not work: on a page whose figure starts
 * at the very top, the diagram's own box rules fall inside the header's band and
 * inflate the rectangle, which then swallows the figure. The furniture is
 * identical on every page, so whatever every page agrees on is the furniture and
 * whatever only one page shows is that page's content.
 */
function furnitureProfile(renders, linesByPage, isPageFurniture) {
  const byRole = new Map();
  for (const [page, render] of renders) {
    for (const line of linesByPage.get(page)) {
      if (!isPageFurniture(line)) continue;
      const role = line.y > 700 ? "header" : "footer";
      const rect = measureRect(render, line);
      if (!rect) continue;
      const current = byRole.get(role);
      // The header is byte-identical on every page, so intersecting the
      // measurements strips whatever one page's diagram contributed. The footer
      // is not — its page number changes width — so it is unioned instead, which
      // is safe because no figure in this set reaches down into the footer.
      const combine =
        role === "header"
          ? {
              rowFrom: Math.max(current?.rowFrom ?? rect.rowFrom, rect.rowFrom),
              rowTo: Math.min(current?.rowTo ?? rect.rowTo, rect.rowTo),
              colFrom: Math.max(current?.colFrom ?? rect.colFrom, rect.colFrom),
              colTo: Math.min(current?.colTo ?? rect.colTo, rect.colTo),
            }
          : {
              rowFrom: Math.min(current?.rowFrom ?? rect.rowFrom, rect.rowFrom),
              rowTo: Math.max(current?.rowTo ?? rect.rowTo, rect.rowTo),
              colFrom: Math.min(current?.colFrom ?? rect.colFrom, rect.colFrom),
              colTo: Math.max(current?.colTo ?? rect.colTo, rect.colTo),
            };
      byRole.set(role, combine);
    }
  }
  return [...byRole.values()];
}

/**
 * Walks the furniture rows next to a figure and reports whether any ink there
 * belongs to something other than the furniture itself — which would mean part
 * of the diagram is printed underneath it and cannot be cropped out.
 */
function hiddenInk(render, rects, furnitureRow, startRow, step) {
  for (let row = startRow; row >= 0 && row < render.height && furnitureRow[row] === 1; row += step) {
    if (render.rowInk[row] === 0) continue;
    for (let col = 0; col < render.width; col += 1) {
      if (render.ink(row, col) && !insideRect(rects, row, col)) return true;
    }
  }
  return false;
}

/** The vertical extent a text line's glyphs occupy, in PDF points. */
function textBand(line) {
  const size = line.fontSize || DEFAULT_FONT_SIZE_PT;
  return {
    low: line.y - size * TEXT_DESCENT_RATIO - TEXT_BAND_PADDING_PT,
    high: line.y + size * TEXT_ASCENT_RATIO + TEXT_BAND_PADDING_PT,
  };
}

const overlaps = (a, b) => a.low < b.high && b.low < a.high;

/**
 * Finds the figures on one page.
 *
 * Masks out every band the text layer accounts for, plus the header, footer and
 * branding, then keeps whatever ink survives. Surviving ink is a figure by
 * definition: it renders, and nothing in the text layer claims it.
 */
function detectFigures(render, pageLines, region, isPageFurniture, profile) {
  const masked = new Uint8Array(render.height);
  const furnitureRow = new Uint8Array(render.height);
  const maskRows = (from, to, asFurniture) => {
    for (let row = Math.max(0, from); row <= Math.min(render.height - 1, to); row += 1) {
      masked[row] = 1;
      if (asFurniture) furnitureRow[row] = 1;
    }
  };
  // Bands convert to rows once, on the way in. Converting back to points and
  // round-tripping loses a row to rounding, and that row is the one the footer
  // is printed on.
  const maskBand = (band, asFurniture) =>
    maskRows(render.toRow(band.high), render.toRow(band.low), asFurniture);

  // Furniture is measured from its pixels; question text from its font metrics.
  // The two are tracked apart because a diagram may legitimately butt against a
  // line of question text, whereas anything sharing rows with the header or
  // footer is partly hidden underneath them.
  const rects = [...profile];
  for (const line of pageLines) {
    if (!isPageFurniture(line)) maskBand(textBand(line), false);
  }
  for (const rect of rects) maskRows(rect.rowFrom, rect.rowTo, true);
  // The publisher's branding is not in the text layer at all, so it is masked by
  // its measured position rather than by a line.
  maskBand(BRANDING_BAND, true);
  rects.push({
    rowFrom: Math.max(0, render.toRow(BRANDING_BAND.high)),
    rowTo: render.height - 1,
    colFrom: 0,
    colTo: render.width - 1,
  });
  // Outside the question region — above its ceiling or below its floor — is not
  // this page's question content at all.
  maskBand({ low: region.high, high: render.geometry.top }, false);
  maskBand({ low: 0, high: region.low }, false);

  // The page is now a series of unmasked regions separated by text. A figure is
  // whatever ink one region holds — all of it, including the internal white
  // space between a row of option pictures and the numbers labelling them.
  // Grouping by region rather than by distance is what keeps a diagram whole:
  // any distance threshold splits the taller two-row figures into fragments.
  const regions = [];
  let current = null;
  for (let row = 0; row < render.height; row += 1) {
    if (!masked[row] && current === null) current = { from: row, to: row };
    else if (!masked[row]) current.to = row;
    else if (current !== null) {
      regions.push(current);
      current = null;
    }
  }
  if (current !== null) regions.push(current);

  const minHeightRows = Math.round((FIGURE_MIN_HEIGHT_PT * RENDER_DPI) / 72);
  const figures = [];
  const residue = [];

  for (const bounds of regions) {
    let ink = 0;
    let top = null;
    let bottom = null;
    let left = render.width;
    let right = -1;
    for (let row = bounds.from; row <= bounds.to; row += 1) {
      if (render.rowInk[row] === 0) continue;
      ink += render.rowInk[row];
      if (top === null) top = row;
      bottom = row;
      if (render.rowLeft[row] < left) left = render.rowLeft[row];
      if (render.rowRight[row] > right) right = render.rowRight[row];
    }
    if (top === null) continue;

    const run = { from: top, to: bottom, ink, left, right, bounds };
    // A diagram that continues into furniture rows is partly hidden under the
    // header or footer. Sitting next to furniture is fine; what disqualifies it
    // is ink inside those rows that the furniture itself did not put there.
    const truncated =
      hiddenInk(render, rects, furnitureRow, bounds.from - 1, -1) ||
      hiddenInk(render, rects, furnitureRow, bounds.to + 1, +1);

    if (truncated) residue.push({ ...run, why: "continues underneath the running header or footer" });
    else if (bottom - top < minHeightRows || ink < FIGURE_MIN_INK_PIXELS) {
      residue.push({ ...run, why: "too small to be a whole diagram" });
    } else figures.push(run);
  }

  // Ink that is neither question text, nor furniture, nor a whole figure is
  // unexplained. It is never discarded silently — it is reported, and the
  // question it falls in is omitted.
  return { figures, rects, residue: residue.filter((r) => r.ink >= HAZARD_MIN_INK_PIXELS) };
}

/** Ink the text layer never described, sitting between the branding and the footer. */
function detectHazards(render) {
  const from = Math.max(0, render.toRow(HAZARD_BAND.high));
  const to = Math.min(render.height - 1, render.toRow(HAZARD_BAND.low));
  let ink = 0;
  let top = null;
  let bottom = null;
  for (let row = from; row <= to; row += 1) {
    if (render.rowInk[row] === 0) continue;
    ink += render.rowInk[row];
    if (top === null) top = row;
    bottom = row;
  }
  if (ink < HAZARD_MIN_INK_PIXELS) return null;
  return {
    ink,
    topY: Number(render.toPt(top).toFixed(1)),
    bottomY: Number(render.toPt(bottom).toFixed(1)),
  };
}

/** Writes one figure, cropped to its own ink with a fixed margin. */
async function writeFigure(render, run, rects, outputPath) {
  const marginRows = Math.round((FIGURE_MARGIN_PT * RENDER_DPI) / 72);
  // Clamped to the region the figure was found in, so the margin can never
  // reach into an adjacent line of text or into page furniture.
  const top = Math.max(0, run.bounds.from, run.from - marginRows);
  const bottom = Math.min(render.height - 1, run.bounds.to, run.to + marginRows);
  const left = Math.max(0, run.left - marginRows);
  const right = Math.min(render.width - 1, run.right + marginRows);

  const bottomY = render.toPt(bottom);
  // Region clamping should already make this impossible; assert it anyway,
  // because a figure carrying the publisher's furniture is exactly the class of
  // defect that is easy to ship and hard to notice.
  for (const rect of rects) {
    if (top <= rect.rowTo && rect.rowFrom <= bottom && left <= rect.colTo && rect.colFrom <= right) {
      fail(
        `page ${render.pageNumber}: a figure crop at y=${bottomY.toFixed(1)}-` +
          `${render.toPt(top).toFixed(1)} overlaps page furniture. Refusing to emit it.`,
      );
    }
  }

  await sharp(render.file)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toFile(outputPath);

  return {
    topY: Number(render.toPt(top).toFixed(1)),
    bottomY: Number(bottomY.toFixed(1)),
  };
}

// ---------------------------------------------------------------------------
// Options and stem
// ---------------------------------------------------------------------------

const OPTION_LINE_START = /^\(\s*(\d+)\s*\)/;

/**
 * Splits a question's body into stem lines and option lines.
 *
 * A line is part of the printed option list only when it BEGINS with a bracketed
 * number at the left margin. Q18 of Set 01 is why: it is a three-blank sentence
 * whose every line carries a bracketed set of choices mid-sentence, and a rule
 * that merely looked for "(1)... (2)..." anywhere on a line turned its first
 * line into a four-option list and dropped it from the stem.
 */
function splitBody(body) {
  const stemLines = [];
  const optionLines = [];
  let expecting = 1;
  for (const line of body) {
    const match = OPTION_LINE_START.exec(line.text);
    if (match && line.x < 60 && Number(match[1]) === expecting) {
      optionLines.push(line);
      const ids = [...line.text.matchAll(/\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
      expecting = ids[ids.length - 1] + 1;
      continue;
    }
    stemLines.push(line);
  }

  const options = [];
  for (const line of optionLines) {
    const parts = line.text.split(/\(\s*(\d+)\s*\)/).slice(1);
    for (let i = 0; i < parts.length; i += 2) {
      options.push({ id: parts[i], text: (parts[i + 1] ?? "").trim() });
    }
  }
  return {
    stem: stemLines.map((l) => l.text).join(" ").replace(/^\d{1,2}\.\s*/, "").replace(/\s+/g, " ").trim(),
    options,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const setArgIndex = process.argv.indexOf("--set");
  const setNumber = setArgIndex === -1 ? 1 : Number(process.argv[setArgIndex + 1]);
  if (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > 32) {
    fail("--set must be an integer from 1 to 32");
  }
  if (setNumber !== 1) {
    fail("only Set 01 is approved for ingestion; Sets 02-32 are not yet in scope");
  }
  const setSlug = `set-${String(setNumber).padStart(2, "0")}`;

  const curatedPath = join(REPO, "tools", "oir-ingest", "curated", `${setSlug}.json`);
  const curated = existsSync(curatedPath) ? JSON.parse(readFileSync(curatedPath, "utf8")) : { entries: [] };

  const pdfjs = await import(
    pathToFileURL(join(REPO, "frontend", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")).href
  );
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(SOURCE_PDF)),
    verbosity: 0,
  }).promise;

  // --- locate the set -------------------------------------------------------
  let startPage = null;
  let nextSetPage = null;
  for (let p = 1; p <= doc.numPages; p += 1) {
    const lines = await readPageLines(doc, p);
    const header = lines.find((l) => /SET\s+0?(\d+)/i.test(l.text) && /SSB OIR PRACTICE/i.test(l.text));
    if (!header) continue;
    const found = Number(/SET\s+0?(\d+)/i.exec(header.text)[1]);
    if (found === setNumber && startPage === null) startPage = p;
    if (startPage !== null && found === setNumber + 1) { nextSetPage = p; break; }
  }
  if (startPage === null) fail(`could not find the first page of set ${setNumber}`);
  if (nextSetPage === null) fail(`could not find where set ${setNumber} ends`);
  const endPage = nextSetPage - 1;

  const linesByPage = new Map();
  const lines = [];
  for (let p = startPage; p <= endPage; p += 1) {
    const pageLines = await readPageLines(doc, p);
    linesByPage.set(p, pageLines);
    lines.push(...pageLines);
  }

  const markerIndex = lines.findIndex((l) => /ANSWERS AND EXPLANATIONS/i.test(l.text));
  if (markerIndex === -1) fail(`set ${setNumber}: no "ANSWERS AND EXPLANATIONS" marker found`);
  const marker = lines[markerIndex];

  const isFurniture = (l) =>
    /^SSB OIR PRACTICE/i.test(l.text) || /PAGE \d+$/i.test(l.text) ||
    /ANSWERS AND EXPLANATIONS/i.test(l.text) || /^OIR\s*-\s*SET/i.test(l.text);
  // The running header and footer are printed OVER the page; the set title and
  // the answers marker are ordinary lines that merely never belong to a
  // question. Only the former can hide part of a diagram.
  const isPageFurniture = (l) => /^SSB OIR PRACTICE/i.test(l.text);

  const questionLines = lines.slice(0, markerIndex).filter((l) => !isFurniture(l));
  const answerLines = lines.slice(markerIndex + 1).filter((l) => !isFurniture(l));

  // --- question and answer starts ------------------------------------------
  const questionStarts = [];
  for (const line of questionLines) {
    const m = /^(\d{1,2})\.(\s|$)/.exec(line.text);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > EXPECTED_QUESTIONS || line.x > 45) continue;
    questionStarts.push({ number: n, line });
  }
  for (let q = 1; q <= EXPECTED_QUESTIONS; q += 1) {
    if (!questionStarts.some((s) => s.number === q)) fail(`Q${q}: no question found`);
  }
  if (questionStarts.length !== EXPECTED_QUESTIONS) {
    fail(`expected ${EXPECTED_QUESTIONS} questions, found ${questionStarts.length}`);
  }
  for (let i = 1; i < questionStarts.length; i += 1) {
    if (questionStarts[i].number !== questionStarts[i - 1].number + 1) {
      fail(`question order is not sequential around Q${questionStarts[i].number}`);
    }
  }

  const answerStarts = [];
  for (let i = 0; i < answerLines.length; i += 1) {
    const m = /^(\d{1,2})\.\s*Answer\s*:\s*(.*)$/.exec(answerLines[i].text);
    if (!m) continue;
    answerStarts.push({ number: Number(m[1]), raw: m[2], index: i, line: answerLines[i] });
  }
  for (let q = 1; q <= EXPECTED_QUESTIONS; q += 1) {
    if (!answerStarts.some((a) => a.number === q)) fail(`Q${q}: no answer found`);
  }
  for (let i = 1; i < answerStarts.length; i += 1) {
    if (answerStarts[i].number !== answerStarts[i - 1].number + 1) {
      fail(`answer order is not sequential around Q${answerStarts[i].number}`);
    }
  }

  // --- output tree ----------------------------------------------------------
  const outDir = join(REPO, "content", "oir", setSlug);
  const figuresDir = join(outDir, "figures");
  const scratchDir = join(outDir, ".render");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(figuresDir, { recursive: true });
  mkdirSync(scratchDir, { recursive: true });

  // --- render every question page ------------------------------------------
  const questionPages = [...new Set(questionLines.map((l) => l.page))].sort((a, b) => a - b);
  const renders = new Map();
  for (const p of questionPages) renders.set(p, await renderPage(p, scratchDir));
  const furniture = furnitureProfile(renders, linesByPage, isPageFurniture);

  /** Reasons a question cannot be served, keyed by question number. */
  const omissions = new Map();
  const omit = (number, reason) => {
    if (!omissions.has(number)) omissions.set(number, []);
    omissions.get(number).push(reason);
  };

  /**
   * The question a point on the page belongs to: the last question to have
   * started at or above it, or — at the very top of a page — the one still
   * running from the previous page.
   */
  function ownerAt(page, yPt) {
    const started = questionStarts.filter(
      (q) => q.line.page < page || (q.line.page === page && q.line.y >= yPt),
    );
    if (started.length > 0) return started[started.length - 1];
    return questionStarts.find((q) => q.line.page === page) ?? null;
  }

  // --- hazards: rendered content the text layer never described -------------
  const hazards = [];
  for (const p of questionPages) {
    const hazard = detectHazards(renders.get(p));
    if (!hazard) continue;
    const owner = ownerAt(p, hazard.topY);
    hazards.push({ page: p, ...hazard, question: owner?.number ?? null });
    if (owner) {
      omit(
        owner.number,
        `page ${p} renders content at y=${hazard.bottomY}-${hazard.topY} that is absent from the ` +
          `PDF text layer and cannot be recovered by this pipeline. It falls inside this question, ` +
          `so the question may be incomplete.`,
      );
    }
  }

  // --- figures --------------------------------------------------------------
  const figuresByQuestion = new Map();
  for (const p of questionPages) {
    const render = renders.get(p);
    const pageLines = linesByPage.get(p);
    // On the page where the answers begin, question content stops at the marker.
    const region = {
      low: p === marker.page ? marker.y + 6 : 0,
      high: render.geometry.top,
    };
      const { figures: found, residue, rects } = detectFigures(
      render, pageLines, region, isPageFurniture, furniture,
    );

    for (const leftover of residue) {
      const topY = Number(render.toPt(leftover.from).toFixed(1));
      const bottomY = Number(render.toPt(leftover.to).toFixed(1));
      const owner = ownerAt(p, topY);
      hazards.push({ page: p, topY, bottomY, ink: leftover.ink, why: leftover.why, question: owner?.number ?? null });
      if (owner) {
        omit(
          owner.number,
          `page ${p} renders ink at y=${bottomY}-${topY} that ${leftover.why}; the diagram cannot ` +
            `be recovered whole, so this question may be incomplete.`,
        );
      }
    }

    for (const run of found) {
      const topY = render.toPt(run.from);
      const owner = ownerAt(p, topY);
      if (!owner) {
        fail(`page ${p}: a figure at y~${topY.toFixed(1)} belongs to no question. Refusing to guess.`);
      }
      const existing = figuresByQuestion.get(owner.number) ?? [];
      const name = `q${String(owner.number).padStart(2, "0")}-fig${existing.length + 1}`;
      const bounds = await writeFigure(render, run, rects, join(figuresDir, `${name}.png`));
      existing.push({ name, page: p, ...bounds });
      figuresByQuestion.set(owner.number, existing);
    }
  }

  // --- assemble -------------------------------------------------------------
  const records = [];
  for (let i = 0; i < questionStarts.length; i += 1) {
    const start = questionStarts[i];
    const next = questionStarts[i + 1] ?? null;
    const startIdx = questionLines.indexOf(start.line);
    const endIdx = next ? questionLines.indexOf(next.line) : questionLines.length;
    const { stem, options } = splitBody(questionLines.slice(startIdx, endIdx));
    const figures = figuresByQuestion.get(start.number) ?? [];

    const answer = answerStarts.find((a) => a.number === start.number);
    let answerKey = classifyAnswer(answer.raw, {
      number: start.number,
      optionCount: options.length,
      figureCount: figures.length,
    });

    // Pictorial choices are numbered inside the diagram, and the source draws
    // those numerals as graphics: no extractor can read them. They are curated
    // with evidence instead, and a figure-bearing question WITHOUT an entry is
    // refused rather than served with an answer space nothing can check.
    const pictorialEntry = curated.entries.find(
      (e) => e.question === start.number && e.field === "pictorialOptions",
    );
    if (figures.length > 0 && !pictorialEntry) {
      // Omitted rather than fatal: the questions this catches today are the ones
      // already being dropped for damaged figures, and recording labels for a
      // diagram nobody will be shown would be busywork. What it must never do is
      // let the question through with an answer space nothing can check.
      omit(
        start.number,
        "the figure's numbered choices have not been recorded, so an answer against it could " +
          "not be checked. Add a curated pictorialOptions entry to serve this question.",
      );
    }
    const pictorialOptionIds = pictorialEntry ? pictorialEntry.value : [];
    if (!Array.isArray(pictorialOptionIds) || pictorialOptionIds.some((id) => !/^[0-9]{1,2}$/.test(id))) {
      fail(`Q${start.number}: curated pictorialOptions must be a list of numeric labels`);
    }
    if (new Set(pictorialOptionIds).size !== pictorialOptionIds.length) {
      fail(`Q${start.number}: curated pictorialOptions repeats a label`);
    }

    const curations = [];
    for (const entry of curated.entries.filter((e) => e.question === start.number)) {
      if (entry.field === "pictorialOptions") {
        if (!entry.evidence || entry.evidence.trim().length < MIN_CURATION_EVIDENCE) {
          fail(`Q${start.number}: the curated pictorialOptions entry cites no substantive evidence`);
        }
        curations.push({ field: entry.field, evidence: entry.evidence });
        continue;
      }
      if (entry.field !== "answerKey") fail(`Q${start.number}: unsupported curated field ${entry.field}`);
      if (answerKey.kind !== "unresolved") {
        fail(
          `Q${start.number}: a curated answer key was supplied but the extractor resolved one ` +
            `itself. Curation may only fill what extraction could not — remove one of them.`,
        );
      }
      answerKey = entry.value;
      curations.push({ field: entry.field, evidence: entry.evidence });
    }

    const explanationEnd =
      answerStarts.find((a) => a.number === start.number + 1)?.index ?? answerLines.length;
    const explanation = answerLines
      .slice(answer.index + 1, explanationEnd)
      .map((l) => l.text)
      .join(" ")
      .trim();

    // "figure" now means the diagram genuinely carries numbered choices. A
    // question with a figure but no choices in it — Q20's worked subtraction,
    // Q3's pair of cubes answered Yes or No — is "none", which is what it
    // always was in substance.
    const optionSource =
      options.length > 0 ? "text" : pictorialOptionIds.length > 0 ? "figure" : "none";

    /**
     * What a written answer has to look like.
     *
     * Derived from the answer key's SHAPE — never from its value, and never
     * from the wording of the stem. A candidate needs to know whether to write
     * "Yes", one letter, or two numbers in order; the source states that in
     * prose, and prose is not something a renderer can parse reliably. Recording
     * it here means the browser can draw the right input without the question
     * text being sniffed at run time.
     *
     * Null unless the question is answered by writing. The count is not a
     * secret: the paper prints one blank per value.
     */
    let responseFormat = null;
    {
      switch (answerKey.kind) {
        case "single-option":
          responseFormat = { kind: "single-option" };
          break;
        case "multiple-options":
          // "Which TWO of the following" is printed in the stem, but a renderer
          // must not have to read English to know it needs checkboxes.
          responseFormat = { kind: "multiple-options", count: answerKey.optionIds.length };
          break;
        case "boolean":
          responseFormat = { kind: "boolean" };
          break;
        case "short-text":
          responseFormat = { kind: "short-text", maxLength: SHORT_TEXT_MAX_LENGTH };
          break;
        case "multi-token":
        case "ordered-sequence":
          responseFormat = { kind: answerKey.kind, count: answerKey.values.length };
          break;
        default:
          // Reached only by a question whose choices were lost, so its key
          // names an option that no longer exists. Already destined for
          // omission; recorded here too rather than crashing the build.
          omit(
            start.number,
            `it is answered by writing but its key is ${answerKey.kind}, which no input can ` +
              `represent, so there is no way for a candidate to give the answer it expects.`,
          );
      }
    }

    // --- candidate-readiness ------------------------------------------------
    if (stem.length === 0 && figures.length === 0) {
      omit(start.number, "neither stem text nor a figure was captured");
    }
    if (answerKey.kind === "unresolved") {
      omit(start.number, `answer key unresolved: ${answerKey.reason}`);
    }
    if (answerKey.kind === "single-option" || answerKey.kind === "multiple-options") {
      const ids = answerKey.kind === "single-option" ? [answerKey.optionId] : answerKey.optionIds;
      if (optionSource === "text") {
        for (const id of ids) {
          if (!options.some((o) => o.id === id)) {
            omit(start.number, `the answer selects option ${id}, which the question does not print`);
          }
        }
      } else if (optionSource === "figure") {
        // The curated labels are now a real answer space, so a key naming a
        // choice the diagram does not show is caught here rather than surviving
        // to be graded against nothing.
        for (const id of ids) {
          if (!pictorialOptionIds.includes(id)) {
            omit(start.number, `the answer selects option ${id}, which the figure does not show`);
          }
        }
      } else {
        omit(start.number, `the answer selects option ${ids.join(" and ")}, but the question offers no options`);
      }
    }

    records.push({
      number: start.number,
      stem,
      options,
      optionSource,
      pictorialOptionIds,
      responseFormat,
      figures,
      answerKey,
      curations,
      explanation: explanation.length > 0 ? explanation : null,
      sourcePages: { question: start.line.page, answer: answer.line.page },
    });
  }

  // Figures belonging to an omitted question are not shipped.
  const omittedNumbers = new Set(omissions.keys());
  for (const record of records) {
    if (!omittedNumbers.has(record.number)) continue;
    for (const figure of record.figures) rmSync(join(figuresDir, `${figure.name}.png`), { force: true });
  }

  const verified = records.filter((r) => !omittedNumbers.has(r.number));
  const omitted = records.filter((r) => omittedNumbers.has(r.number));

  const questions = verified.map((r) => ({
    id: `oir.${String(r.number).padStart(4, "0")}`,
    type: "oir-question",
    setNumber,
    position: r.number,
    usedBy: ["oir"],
    version: 1,
    status: "active",
    provenance: PROVENANCE,
    tags: [],
    difficulty: null,
    authoredAt: new Date(0).toISOString(),
    editorialNote: null,
    stem: r.stem,
    options: r.options,
    optionSource: r.optionSource,
    pictorialOptionIds: r.pictorialOptionIds,
    responseFormat: r.responseFormat,
    figures: r.figures.map((f) => `oir/${setSlug}/figures/${f.name}.png`),
    answerKey: r.answerKey,
    explanation: r.explanation,
    curations: r.curations,
    sourcePages: r.sourcePages,
  }));

  // --- final checks ---------------------------------------------------------
  for (const q of questions) {
    if (!q.provenance) fail(`${q.id}: provenance missing`);
    if (!q.answerKey || q.answerKey.kind === "unresolved") fail(`${q.id}: answer key unresolved`);
    if (JSON.stringify(q).includes("data:")) fail(`${q.id}: inline binary data detected`);
    if (q.stem.length === 0 && q.figures.length === 0) fail(`${q.id}: empty question`);
    if (/answer\s*:/i.test(q.stem) || q.options.some((o) => /answer\s*:/i.test(o.text))) {
      fail(`${q.id}: answer text leaked into candidate-facing content`);
    }
  }

  const figureFiles = readdirSync(figuresDir).filter((f) => f.endsWith(".png"));
  const referenced = new Set(questions.flatMap((q) => q.figures.map((f) => f.split("/").pop())));
  for (const name of referenced) {
    if (!figureFiles.includes(name)) fail(`figure ${name} is referenced but was not produced`);
  }
  for (const file of figureFiles) {
    if (!referenced.has(file)) fail(`figure ${file} was produced but no question references it`);
  }

  rmSync(scratchDir, { recursive: true, force: true });

  writeFileSync(
    join(outDir, "questions.json"),
    `${JSON.stringify(
      {
        setNumber,
        sourcePageRange: { first: startPage, last: endPage },
        answersMarker: { page: marker.page, y: marker.y },
        provenance: PROVENANCE,
        sourceQuestionCount: EXPECTED_QUESTIONS,
        questionCount: questions.length,
        omittedCount: omitted.length,
        omitted: omitted.map((r) => ({
          position: r.number,
          sourcePages: r.sourcePages,
          reasons: omissions.get(r.number),
        })),
        hazards,
        questions,
      },
      null,
      2,
    )}\n`,
  );

  const shapes = {};
  for (const q of questions) shapes[q.answerKey.kind] = (shapes[q.answerKey.kind] ?? 0) + 1;

  console.log(`set ${setNumber}: pages ${startPage}-${endPage} (answers from p${marker.page})`);
  console.log(`source questions : ${EXPECTED_QUESTIONS}`);
  console.log(`verified         : ${questions.length}`);
  console.log(`omitted          : ${omitted.length}${omitted.length ? ` (${omitted.map((r) => r.number).join(", ")})` : ""}`);
  console.log(`figures          : ${figureFiles.length}`);
  console.log(`with figures     : ${questions.filter((q) => q.figures.length > 0).length}`);
  console.log(`answer kinds     : ${JSON.stringify(shapes)}`);
  console.log(`curated fields   : ${questions.reduce((n, q) => n + q.curations.length, 0)}`);
  for (const [number, reasons] of [...omissions.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  OMITTED Q${number}: ${reasons.join(" | ")}`);
  }
  for (const hazard of hazards) {
    console.log(`  HAZARD page ${hazard.page} y=${hazard.bottomY}-${hazard.topY} (Q${hazard.question ?? "?"})`);
  }

  await doc.destroy();
}

main().catch((error) => {
  if (error instanceof IngestError) {
    console.error(`\nINGESTION FAILED\n  ${error.message}\n`);
  } else {
    console.error(`\nINGESTION FAILED (unexpected)\n  ${error.stack ?? error.message}\n`);
  }
  process.exit(1);
});
