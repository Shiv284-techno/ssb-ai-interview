import "server-only";

/**
 * The nine tables of `docs/SSB PIQ-FORM-pdf.pdf`, described by what the form
 * prints rather than by where it prints it.
 *
 * `columnTokens` lists the leaf column headings in the form's own left-to-right
 * order, and that order is exactly the order `piq-parser.ts` reads cells in. No
 * column is invented and none is dropped: change one list here and the parser's
 * expectations must change with it.
 *
 * `headerVocabulary` is every word that may appear in a wrapped continuation of
 * the heading — "Month" under "Income per", "Obtained" under "Marks", "Screened
 * Out (s/o)" under "Recommended(R)". A following line counts as more heading
 * only if every word in it comes from this list, so a data row is never
 * swallowed by the header.
 */

export interface PiqTableDefinition {
  readonly id: string;
  readonly questionNumber: number;
  /** Normalised prefix of the heading line that opens the table. */
  readonly heading: string;
  /** Leaf column headings, in the form's column order. */
  readonly columnTokens: readonly string[];
  readonly headerVocabulary: readonly string[];
  /**
   * Normalised prefixes of a line that closes the table when no question
   * number does. Q33's last row is followed by the declaration, not by Q34.
   */
  readonly endsBefore?: readonly string[];
}

/** Shared by Q23-Q26: Max Marks / Marks Obtained / % under three groups. */
const MARKS_COLUMN_TAIL = [
  "max",
  "marks",
  "%",
  "max",
  "marks",
  "%",
  "max",
  "marks",
  "%",
  "outstanding",
] as const;

const MARKS_VOCABULARY = [
  "subject",
  "year",
  "semester",
  "theroy",
  "theory",
  "practical",
  "sessionals",
  "total",
  "max",
  "marks",
  "obtained",
  "obtaine",
  "d",
  "%",
  "outstanding",
  "achievements",
  "if",
  "any",
] as const;

/**
 * Ordered longest heading first, so "Post Graduation" is never read as the
 * "Graduation" table — the same precedence the PIQ parser uses.
 */
export const PIQ_TABLES: readonly PiqTableDefinition[] = [
  {
    id: "family",
    questionNumber: 20,
    heading: "particularsofparents",
    columnTokens: ["relation", "name", "age", "education", "occupation", "income"],
    headerVocabulary: ["relation", "name", "age", "years", "education", "occupation", "income", "per", "month"],
  },
  {
    id: "matric-marks",
    questionNumber: 23,
    heading: "matrichighersecondary",
    columnTokens: ["subject", ...MARKS_COLUMN_TAIL],
    headerVocabulary: MARKS_VOCABULARY,
  },
  {
    id: "senior-secondary-marks",
    questionNumber: 24,
    heading: "senior102equivalent",
    columnTokens: ["subject", ...MARKS_COLUMN_TAIL],
    headerVocabulary: MARKS_VOCABULARY,
  },
  {
    id: "post-graduation-marks",
    questionNumber: 26,
    heading: "postgraduation",
    columnTokens: ["year", ...MARKS_COLUMN_TAIL],
    headerVocabulary: MARKS_VOCABULARY,
  },
  {
    id: "graduation-marks",
    questionNumber: 25,
    heading: "graduation",
    columnTokens: ["year", ...MARKS_COLUMN_TAIL],
    headerVocabulary: MARKS_VOCABULARY,
  },
  {
    id: "sports",
    questionNumber: 27,
    heading: "participationinsports",
    columnTokens: ["ser", "sports", "from", "to", "level", "level", "special"],
    headerVocabulary: [
      "ser", "no", "sports", "game", "played", "period", "from", "to", "level", "at",
      "which", "school", "collage", "university", "district", "state", "national",
      "international", "for", "service", "candidates", "unit", "brigade", "division",
      "corps", "command", "services", "special", "achievements", "if", "any",
    ],
  },
  {
    id: "hobbies",
    questionNumber: 28,
    heading: "hobbiesinterest",
    columnTokens: ["ser", "hobby", "from", "to", "level", "special"],
    headerVocabulary: [
      "ser", "no", "hobby", "period", "from", "to", "level", "at", "which",
      "participated", "special", "achievements", "if", "any",
    ],
  },
  {
    id: "extracurricular",
    questionNumber: 29,
    heading: "extracurricularactivities",
    columnTokens: ["ser", "extracurricular", "from", "to", "level", "special"],
    headerVocabulary: [
      "ser", "no", "extracurricular", "activities", "period", "from", "to", "level",
      "at", "which", "participated", "special", "achievements", "if", "any",
    ],
  },
  {
    id: "previous-ssb-attempts",
    questionNumber: 33,
    heading: "chancesavailedforcommissioninarmedforces",
    columnTokens: ["ser", "ssb", "entry", "places", "date", "batch", "recommended"],
    headerVocabulary: [
      "ser", "no", "ssb", "entry", "places", "of", "date", "batch", "chest",
      "recommended", "r", "not", "nr", "screened", "out", "s", "o",
    ],
    endsBefore: ["dated", "signatureofcandidate"],
  },
];

/** Section banners; they close any open table. */
export const PIQ_BANNERS: readonly string[] = [
  "personalinformationquestionnaire",
  "personalfamily",
  "educationalqualifications",
  "sportshobbies",
  "previousattendanceinssb",
];

/**
 * Page furniture printed by the form's publisher. It is not part of the
 * questionnaire, so it must not be read as a table row — but it is still
 * emitted, so the parser records it in `unparsed` rather than losing it.
 */
export function isPageFurniture(text: string): boolean {
  return /nationaldefenceinstitute|^\+?\d[\d\s]{8,}$/i.test(
    text.replace(/\s+/g, ""),
  );
}
