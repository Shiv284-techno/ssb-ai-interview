import "server-only";

/**
 * Marking a settled OIR attempt.
 *
 * Recomputed from the attempt and the bank on every read rather than stored.
 * The attempt is immutable once settled and pins the exact questions served in
 * the exact order, so the same attempt over the same bank yields the same
 * numbers every time — which is what makes a stored copy unnecessary rather
 * than merely inconvenient. `setNumber` and `servedCount` travel with the
 * result so that a later change to the bank is something a reader could catch
 * rather than something that silently moves a score.
 *
 * The score is a count of questions answered correctly and nothing else. It is
 * not a rating of the candidate, and `PROHIBITED_SCORE_SUBJECTS` in
 * `lib/assessment/evaluation.ts` names what this may never become.
 *
 * The rule, in full, because the source book states only part of it:
 *
 *   - One mark per question, uniform. A question wanting three ordered values
 *     is worth the same as one wanting a single figure.
 *   - No negative marking, per `OIR_DEFINITION.negativeMarking`. A wrong answer
 *     scores nothing; it does not take anything away.
 *   - Therefore unanswered and incorrect both score zero. They are counted
 *     separately anyway, because "ran out of time" and "got it wrong" are
 *     different things to be told.
 */
import { isCorrect } from "@/lib/assessment/oir/grading";
import type { OirAnswerKey } from "@/lib/assessment/oir/types";
import type { IsoTimestamp } from "@/lib/assessment/types";
import { OIR_SUBMITTED, isSettled, type OirAttempt } from "@/lib/oir/attempt";

/** What the server knows about a marked attempt. */
export interface OirResult {
  readonly attemptId: string;
  /**
   * Which sets of the source book the questions came from, ascending.
   *
   * A list rather than a number because a production paper is drawn from the
   * combined bank and genuinely spans sets. Server-side only — it is not in
   * `CandidateFacingResult` and never has been.
   */
  readonly setNumbers: readonly number[];
  readonly status: "submitted" | "timed-out";
  /** Questions actually put in front of this candidate. Never the source's 50. */
  readonly servedCount: number;
  readonly answeredCount: number;
  readonly unansweredCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  /** One mark per correct answer. Equal to `correctCount` under this rule. */
  readonly score: number;
  readonly maxScore: number;
  /** Correct answers as a whole-number percentage of questions served. */
  readonly accuracyPercent: number;
  readonly settledAt: IsoTimestamp;
  readonly submissionReason: "candidate" | "expired";
}

/** Why an attempt could not be marked. */
export type ResultFailure =
  /** The candidate is still sitting it. */
  | "not-settled"
  /**
   * A question the candidate was served is no longer in the bank, so the paper
   * they sat cannot be reconstructed. Refusing is the only honest answer: a
   * score computed over the questions that happen to remain would be a
   * different paper's score wearing this one's name.
   */
  | "bank-drift";

export type ResultOutcome =
  | { readonly ok: true; readonly value: OirResult }
  | { readonly ok: false; readonly failure: ResultFailure };

/** Just enough of a bank question to mark it. */
export interface GradableQuestion {
  readonly id: string;
  readonly answerKey: OirAnswerKey;
  /** Which set holds it, so the result can report what was actually served. */
  readonly setNumber: number;
}

/**
 * Marks an attempt against the questions it served.
 *
 * The caller loads the bank once and passes it in, so marking forty-six
 * questions is forty-six comparisons in memory and no further round trips to
 * anything.
 */
export function evaluateAttempt(
  attempt: OirAttempt,
  questions: readonly GradableQuestion[],
): ResultOutcome {
  const settled = isSettled(attempt);
  if (!settled) return { ok: false, failure: "not-settled" };

  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers = new Map(attempt.answers.map((entry) => [entry.questionId, entry.answer]));

  let correct = 0;
  let answered = 0;
  // Collected from the questions actually served, never asserted by the caller.
  // A caller that named the set was a caller that could be wrong about it.
  const setNumbers = new Set<number>();

  // Iterating the SERVED ids, never the bank and never the answers. A question
  // the candidate was never shown cannot be marked, and an answer against a
  // question not on this paper cannot count — neither can happen if the served
  // list is the thing being walked.
  for (const questionId of attempt.questionIds) {
    const question = byId.get(questionId);
    if (question === undefined) return { ok: false, failure: "bank-drift" };
    setNumbers.add(question.setNumber);

    const answer = answers.get(questionId) ?? null;
    if (answer === null) continue;
    answered += 1;
    if (isCorrect(answer, question.answerKey)) correct += 1;
  }

  const served = attempt.questionIds.length;
  return {
    ok: true,
    value: {
      attemptId: attempt.id,
      setNumbers: [...setNumbers].sort((a, b) => a - b),
      status: attempt.status === OIR_SUBMITTED ? "submitted" : "timed-out",
      servedCount: served,
      answeredCount: answered,
      unansweredCount: served - answered,
      correctCount: correct,
      incorrectCount: answered - correct,
      score: correct,
      maxScore: served,
      accuracyPercent: served === 0 ? 0 : Math.round((correct / served) * 100),
      settledAt: attempt.submittedAt ?? attempt.expiresAt,
      submissionReason: attempt.submissionReason ?? "expired",
    },
  };
}

/**
 * What the candidate may see.
 *
 * Field by field, never a spread. The attempt id, the set number and every
 * internal identifier stop here: a candidate is told how they did, not which
 * row of which sheet holds it.
 */
export interface CandidateFacingResult {
  readonly status: "submitted" | "timed-out";
  readonly questionCount: number;
  readonly answeredCount: number;
  readonly unansweredCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly score: number;
  readonly maxScore: number;
  readonly accuracyPercent: number;
  readonly settledAt: IsoTimestamp;
}

export function toCandidateFacingResult(result: OirResult): CandidateFacingResult {
  return {
    status: result.status,
    questionCount: result.servedCount,
    answeredCount: result.answeredCount,
    unansweredCount: result.unansweredCount,
    correctCount: result.correctCount,
    incorrectCount: result.incorrectCount,
    score: result.score,
    maxScore: result.maxScore,
    accuracyPercent: result.accuracyPercent,
    settledAt: result.settledAt,
  };
}
