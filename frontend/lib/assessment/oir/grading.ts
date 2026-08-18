/**
 * Marking one OIR answer against one answer key.
 *
 * Pure and data-free: it holds no questions, no keys and no attempt state, so
 * it can be reasoned about and tested on its own. The bank that carries actual
 * keys is `server-only`; this module is the comparison those keys are fed to.
 *
 * The two sides are deliberately the same six-kind union — see `types.ts` — so
 * marking is a comparison rather than a translation. A key and an answer of
 * different kinds is not a near miss to be salvaged; it is a question answered
 * in a form it never asked for, and it is wrong.
 *
 * Two rules the source book does not state, decided once and applied uniformly:
 *
 *   - No partial credit. A question asking for two figures or three ordered
 *     values is right when every part is right and wrong otherwise. Splitting
 *     a mark would be inventing a scheme the paper does not define.
 *
 *   - Written values are compared with surrounding whitespace removed and
 *     without regard to case. Set 01's written keys are single letters and
 *     digits; a candidate typing "d" for "D" meant the answer they gave, and
 *     the input offers no hint that capitals are required. Nothing further is
 *     normalised — no punctuation stripped, no spelling repaired, no synonyms.
 */
import type { OirAnswer, OirAnswerKey } from "@/lib/assessment/oir/types";

/**
 * The one normalisation applied to a written value.
 *
 * Kept in a named function rather than inlined at four call sites so that what
 * counts as "the same answer" is stated once and can be pointed at.
 */
export function normaliseWritten(value: string): string {
  return value.trim().toLocaleUpperCase("en-US");
}

const sameWritten = (a: string, b: string): boolean =>
  normaliseWritten(a) === normaliseWritten(b);

/** Ordered comparison: position matters, so "8, 13" is not "13, 8". */
const sameOrdered = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => sameWritten(value, b[index]));

/**
 * Set comparison: the same choices in any order, and no others.
 *
 * Length alone is not enough — a candidate could select the same option twice
 * were the store to allow it — so membership is checked both ways.
 */
const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const left = new Set(a.map(normaliseWritten));
  const right = new Set(b.map(normaliseWritten));
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
};

/**
 * Whether an answer matches its key.
 *
 * `null` means the question was never answered. That is not the same as a wrong
 * answer, and the caller is expected to keep the two apart; this returns false
 * for both only because an unanswered question earns no mark either way.
 */
export function isCorrect(answer: OirAnswer | null, key: OirAnswerKey): boolean {
  if (answer === null) return false;
  if (answer.kind !== key.kind) return false;

  switch (key.kind) {
    case "single-option":
      // Option ids are the numbers printed on the paper or inside the figure.
      return answer.kind === "single-option" && sameWritten(answer.optionId, key.optionId);
    case "multiple-options":
      return answer.kind === "multiple-options" && sameSet(answer.optionIds, key.optionIds);
    case "boolean":
      // Actual booleans on both sides, never the words "Yes" and "No".
      return answer.kind === "boolean" && answer.value === key.value;
    case "short-text":
      return answer.kind === "short-text" && sameWritten(answer.value, key.value);
    case "multi-token":
      return answer.kind === "multi-token" && sameOrdered(answer.values, key.values);
    case "ordered-sequence":
      return answer.kind === "ordered-sequence" && sameOrdered(answer.values, key.values);
  }
}
