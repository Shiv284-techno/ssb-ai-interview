import type {
  AttemptId,
  EvaluationId,
  IsoTimestamp,
  ObservationId,
  ResponseId,
  RubricCriterionId,
} from "@/lib/assessment/types";

/**
 * Infrastructure for recording what was noticed about an attempt — and
 * deliberately not for deciding what kind of person the candidate is.
 *
 * A real board reaches its judgements through trained assessors, over five
 * days, in person, with a conference at the end. Software that reads a
 * candidate's sentences and emits a "leadership score" is not doing that; it is
 * dressing a guess up as a measurement, and the number is more likely to be
 * believed for looking precise. So this layer stores three things: what the
 * candidate did (elsewhere, untouched), what an evaluator observed, and — only
 * where a rubric defines something genuinely countable — a score.
 *
 * `RubricScale` is the guard. It cannot be constructed without saying, in
 * `meaning`, what the number literally counts, and in `observable`, what a
 * person could point at to check it. "Questions answered correctly" passes.
 * "Officer-like qualities" does not, because there is nothing to point at.
 *
 * Raw responses are never modified by anything here. An evaluation references
 * them; it does not absorb or rewrite them.
 */

/**
 * Names this layer must never be used to score. Kept as data so the prohibition
 * is testable rather than only written down.
 */
export const PROHIBITED_SCORE_SUBJECTS: readonly string[] = [
  "personality",
  "personality type",
  "honesty",
  "confidence",
  "leadership",
  "olq",
  "officer like qualities",
  "officer-like qualities",
  "suitability",
  "intelligence",
  "nervousness",
  "trustworthiness",
  "character",
  "diagnosis",
  "mental health",
];

export type EvaluatorKind =
  /** A rule applied to a response, e.g. marking an OIR answer key. */
  | "automatic-rubric"
  /** A trained human assessor. */
  | "human-assessor"
  /** The candidate reviewing their own attempt. */
  | "self-review"
  /**
   * A model used as an aid. Its output is an observation for a human to weigh,
   * never a verdict, and it is labelled so nobody downstream can forget which.
   */
  | "model-assisted";

export interface Evaluator {
  readonly kind: EvaluatorKind;
  /** A rule name, an assessor reference, or a model identifier. Not a person's name. */
  readonly ref: string;
}

export type EvaluationStatus =
  | "not-started"
  | "in-progress"
  | "complete"
  /** The activity produced nothing that this evaluator can speak to. */
  | "not-applicable"
  /** Deliberately withheld — insufficient evidence, or a disputed attempt. */
  | "withheld";

/**
 * A pointer back to the exact material an observation rests on.
 *
 * Required: an observation without evidence is an opinion, and this model does
 * not store opinions about people.
 */
export interface EvidenceRef {
  readonly responseId: ResponseId;
  /** A character range within a free-text or spoken response, when relevant. */
  readonly span: { readonly start: number; readonly end: number } | null;
}

export interface Observation {
  readonly id: ObservationId;
  /**
   * What was observed, in descriptive terms — "the plan named who would do
   * each task", not "showed leadership".
   */
  readonly note: string;
  readonly evidence: readonly EvidenceRef[];
  /** The rubric criterion this speaks to, when it maps to one. */
  readonly criterionId: RubricCriterionId | null;
  readonly recordedAt: IsoTimestamp;
}

/**
 * A scale that can only describe something checkable.
 *
 * `count` is a tally of things that happened. `ordinal` is a ranked band whose
 * levels are spelled out in `labels`. Both demand `meaning` and `observable`,
 * which is what stops the scale being quietly repurposed to rate a person.
 */
export interface RubricScale {
  readonly kind: "count" | "ordinal";
  readonly min: number;
  readonly max: number;
  /** One label per level, for an ordinal scale; empty for a count. */
  readonly labels: readonly string[];
  /** What the number literally counts or ranks. */
  readonly meaning: string;
  /** What a person could point at in the response to verify it. */
  readonly observable: string;
}

export interface RubricCriterion {
  readonly id: RubricCriterionId;
  readonly title: string;
  readonly description: string;
  /**
   * Null where the criterion is a prompt for observation rather than something
   * to be scored — which is the honest default for most of this domain.
   */
  readonly scale: RubricScale | null;
}

export interface Rubric {
  readonly id: string;
  readonly title: string;
  readonly criteria: readonly RubricCriterion[];
}

export interface RubricScore {
  readonly criterionId: RubricCriterionId;
  readonly value: number;
  /** The observations that produced it. */
  readonly evidence: readonly EvidenceRef[];
}

export interface Evaluation {
  readonly id: EvaluationId;
  readonly attemptId: AttemptId;
  readonly evaluator: Evaluator;
  readonly status: EvaluationStatus;
  readonly rubricId: string | null;
  readonly observations: readonly Observation[];
  /** Only for criteria that carry a scale. */
  readonly scores: readonly RubricScore[];
  readonly producedAt: IsoTimestamp;
  /**
   * Free-text caveat from the evaluator — what the attempt could not show, what
   * was ambiguous. Carried alongside the findings rather than hidden behind
   * them.
   */
  readonly limitations: string | null;
}

/**
 * True when a scale describes something checkable rather than a trait.
 *
 * Deliberately conservative: it rejects a scale whose meaning or observable
 * mentions any prohibited subject, and one that leaves either blank. It cannot
 * catch every rewording — no string check can — so it is a guard rail for
 * honest mistakes, not a substitute for review.
 */
export function isMeasurableScale(scale: RubricScale): boolean {
  if (scale.meaning.trim().length === 0) return false;
  if (scale.observable.trim().length === 0) return false;
  if (scale.max <= scale.min) return false;
  if (scale.kind === "ordinal" && scale.labels.length < 2) return false;

  const text = `${scale.meaning} ${scale.observable}`.toLowerCase();
  return !PROHIBITED_SCORE_SUBJECTS.some((subject) => text.includes(subject));
}

/** An observation is usable only if something in the attempt supports it. */
export function hasEvidence(observation: Observation): boolean {
  return observation.evidence.length > 0;
}

/**
 * Rejects an evaluation that scores a criterion it has no rubric entry for, or
 * that scores one with no scale. Scores must be traceable to a definition.
 */
export function scoresAreGrounded(
  evaluation: Evaluation,
  rubric: Rubric,
): boolean {
  return evaluation.scores.every((score) => {
    const criterion = rubric.criteria.find((entry) => entry.id === score.criterionId);
    if (!criterion || !criterion.scale) return false;
    if (!isMeasurableScale(criterion.scale)) return false;
    return score.value >= criterion.scale.min && score.value <= criterion.scale.max;
  });
}
