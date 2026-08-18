/**
 * OIR-specific content types.
 *
 * Client-safe: types and pure functions only, no data and no answer keys. The
 * bank that holds actual questions carries `import "server-only"`.
 *
 * These exist because an OIR question is not a plain multiple-choice question.
 * Roughly half of Set 01 presents its choices as numbered pictures rather than
 * as text, several ask the candidate to write a value instead of choosing, and
 * two are answered "Yes" or "No". A single `correctOptionId: string` cannot say
 * which of those a question is, and code that assumed it would mark a
 * fill-in-the-blank answer of "8 and 13" as "option 8".
 */
import type { MediaAssetId } from "@/lib/assessment/types";

/**
 * How a question presents its choices.
 *
 * `figure` means the choices are numbered inside the diagram, so an answer of
 * "3" refers to picture 3 and there is no option text anywhere. `none` means
 * the candidate writes a value rather than choosing one.
 */
export type OirOptionSource = "text" | "figure" | "none";

/**
 * Whether answering depends on reading a diagram.
 *
 * Derived structurally from whether the question carries a figure, not from any
 * judgement about the reasoning involved. The source book does not label its
 * questions, and inventing a taxonomy for them would be making something up.
 */
export type OirModality = "verbal" | "non-verbal";

/**
 * The answer to an OIR question, in the form the source states it.
 *
 * A discriminated union rather than a string, because grading each form is a
 * genuinely different operation and the compiler should refuse to confuse them.
 */
export type OirAnswerKey =
  /** One numbered choice: text option 3, or picture 3 when options are pictorial. */
  | {
      readonly kind: "single-option";
      readonly optionId: string;
      /** Present when the source repeated the option's text, e.g. "(5) River". */
      readonly label?: string;
    }
  /** Two or more numbered choices, order not significant: "2 and 3". */
  | { readonly kind: "multiple-options"; readonly optionIds: readonly string[] }
  /** Values written in order, one per blank: "2, 1, 2" or "8 and 13". */
  | { readonly kind: "ordered-sequence"; readonly values: readonly string[] }
  /** Alphabetic tokens written in order: "JHG, FDC". */
  | { readonly kind: "multi-token"; readonly values: readonly string[] }
  /** A single short value written on the answer sheet: "D", "8". */
  | { readonly kind: "short-text"; readonly value: string }
  /** "Yes" or "No". */
  | { readonly kind: "boolean"; readonly value: boolean };

export type OirAnswerKeyKind = OirAnswerKey["kind"];

/**
 * What a written answer must look like, on a question that offers no choices.
 *
 * Derived at ingestion from the answer key's SHAPE — never from its value, and
 * never from the wording of the stem. A renderer needs to know whether to draw
 * Yes/No, one box, or two ordered boxes; the source says so only in prose, and
 * prose is not something a browser should be parsing during an exam.
 *
 * The count is not a secret: the paper prints one blank per value. Null on any
 * question answered by choosing.
 */
export type OirResponseFormat =
  | { readonly kind: "single-option" }
  | { readonly kind: "multiple-options"; readonly count: number }
  | { readonly kind: "boolean" }
  | { readonly kind: "short-text"; readonly maxLength: number }
  | { readonly kind: "multi-token"; readonly count: number }
  | { readonly kind: "ordered-sequence"; readonly count: number };

/**
 * What a candidate submits.
 *
 * Deliberately the same set of forms as the key, so grading is a comparison
 * rather than a translation, and so there is exactly one OIR answer vocabulary
 * in the codebase. It differs in one respect: there is no `label`. That field
 * exists on a key only because the source book sometimes reprints the chosen
 * option's text beside it, which is editorial and nothing a candidate sends.
 */
export type OirAnswer =
  | { readonly kind: "single-option"; readonly optionId: string }
  | { readonly kind: "multiple-options"; readonly optionIds: readonly string[] }
  | { readonly kind: "ordered-sequence"; readonly values: readonly string[] }
  | { readonly kind: "multi-token"; readonly values: readonly string[] }
  | { readonly kind: "short-text"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean };

export const OIR_ANSWER_KEY_KINDS: readonly OirAnswerKeyKind[] = [
  "single-option",
  "multiple-options",
  "ordered-sequence",
  "multi-token",
  "short-text",
  "boolean",
];

/**
 * A figure belonging to a question.
 *
 * `needsAltText` is true while the description is still the authored
 * placeholder. No alt text is generated from the image: a made-up description
 * of a reasoning diagram would be worse than an honest admission that one is
 * missing, because a candidate relying on it would be answering a different
 * question from everyone else.
 */
export interface OirFigureRef {
  readonly mediaId: MediaAssetId;
  /** 1-based, in the order the source prints them. */
  readonly order: number;
  readonly needsAltText: boolean;
}

/**
 * Why a source question is not in the bank.
 *
 * Kept alongside the questions rather than discarded, so that "Set 01 has 46
 * questions" is a statement someone can check rather than a number to trust.
 */
export interface OirOmission {
  /** The question's number in the source book. */
  readonly position: number;
  readonly reasons: readonly string[];
  readonly sourcePages: OirSourcePages;
}

export interface OirSourcePages {
  readonly question: number;
  readonly answer: number;
}

/** A field filled in by a reviewer because the source could not be parsed for it. */
export interface OirCuration {
  readonly field: "answerKey" | "pictorialOptions";
  /** What establishes the value. Required, and checked for substance on load. */
  readonly evidence: string;
}

/**
 * Whether an answer key can be resolved against what the question actually
 * shows. A key naming option 4 on a question that prints three options is not
 * gradable, and must never reach a candidate.
 */
export function isAnswerKeyResolvable(question: {
  readonly answerKey: OirAnswerKey;
  readonly options: readonly { readonly id: string }[];
  readonly pictorialOptionIds: readonly string[];
}): boolean {
  const key = question.answerKey;
  if (key.kind !== "single-option" && key.kind !== "multiple-options") return true;
  const ids = key.kind === "single-option" ? [key.optionId] : key.optionIds;
  if (question.options.length > 0) {
    return ids.every((id) => question.options.some((option) => option.id === id));
  }
  // Pictorial choices are numbered inside the diagram. Which numbers exist is
  // recorded at ingestion from the rendered figure, so the key can be checked
  // against a real answer space rather than merely against "a figure exists".
  return (
    question.pictorialOptionIds.length > 0 &&
    ids.every((id) => question.pictorialOptionIds.includes(id))
  );
}

/** The modality a question has, given what it carries. */
export function modalityOf(question: { readonly figures: readonly unknown[] }): OirModality {
  return question.figures.length > 0 ? "non-verbal" : "verbal";
}
