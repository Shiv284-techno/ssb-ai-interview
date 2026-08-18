/**
 * The OIR attempt: configuration, lifecycle, timing and answer validation.
 *
 * Client-safe by design — types and pure functions, no data, no answer keys, no
 * I/O. Step 5B needs these types to render a countdown and a question grid, and
 * nothing here helps a candidate answer anything.
 *
 * Every rule that decides whether the candidate may still act lives in this
 * module, expressed as a function of an attempt and a timestamp. The service
 * layer supplies the server's clock and the store; it never re-implements a
 * rule. That is what makes the timing testable without a network, and what
 * stops "is this expired?" from being answered two different ways in two
 * different routes.
 */
import type { ContentItemId, IsoTimestamp } from "@/lib/assessment/types";
import type { AttemptStatus } from "@/lib/assessment/session";
import type {
  OirAnswer,
  OirOptionSource,
  OirResponseFormat,
} from "@/lib/assessment/oir/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * How many questions a real OIR runs, and for how long.
 *
 * Set 01 currently yields 46 verified questions, four short of production. That
 * shortfall is deliberately NOT papered over: a production attempt against an
 * insufficient bank refuses to start. Development mode exists so the rest of
 * the system can be built and tested meanwhile, and it is named `development`
 * everywhere it appears so that nobody mistakes a 46-question run for the real
 * thing.
 */
export type OirMode = "production" | "development";

export interface OirAttemptConfig {
  readonly mode: OirMode;
  readonly questionCount: number;
  readonly durationSeconds: number;
}

export const OIR_PRODUCTION_CONFIG: OirAttemptConfig = {
  mode: "production",
  questionCount: 50,
  durationSeconds: 25 * 60,
};

/**
 * The whole of verified Set 01, over the production clock.
 *
 * The duration is deliberately the same 1500 seconds: shortening it would make
 * development timings meaningless, and the point of this mode is the question
 * count, not the pace.
 */
export const OIR_DEVELOPMENT_CONFIG: OirAttemptConfig = {
  mode: "development",
  questionCount: 46,
  durationSeconds: 25 * 60,
};

export const OIR_CONFIGS: Readonly<Record<OirMode, OirAttemptConfig>> = {
  production: OIR_PRODUCTION_CONFIG,
  development: OIR_DEVELOPMENT_CONFIG,
};

// ---------------------------------------------------------------------------
// The attempt
// ---------------------------------------------------------------------------

/** Why an attempt stopped accepting answers. Recorded, never inferred later. */
export type OirSubmissionReason =
  /** The candidate pressed submit. */
  | "candidate"
  /** The clock ran out; whatever had been answered was kept. */
  | "expired";

/**
 * One answer, as stored.
 *
 * References its question by id and carries no copy of the prompt, the options
 * or the key — the bank remains the only place a question is defined.
 */
export interface OirStoredAnswer {
  readonly questionId: ContentItemId;
  readonly answer: OirAnswer;
  /** Server time, rewritten each time the candidate changes their mind. */
  readonly recordedAt: IsoTimestamp;
}

/**
 * The attempt as the server holds it.
 *
 * `questionIds` is fixed when the attempt is created and never reordered: it is
 * what makes the run reproducible, and it is also the allowlist that decides
 * which questions this candidate may answer at all.
 */
export interface OirAttempt {
  readonly id: string;
  readonly candidateRef: string;
  readonly mode: OirMode;
  readonly status: AttemptStatus;
  readonly questionIds: readonly ContentItemId[];
  readonly answers: readonly OirStoredAnswer[];
  readonly startedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly submittedAt: IsoTimestamp | null;
  readonly submissionReason: OirSubmissionReason | null;
  /** Bumped on every write, so a lost update can be detected rather than won. */
  readonly revision: number;
}

/** The statuses an OIR attempt may hold, drawn from the 4A lifecycle. */
export const OIR_ACTIVE: AttemptStatus = "in-progress";
export const OIR_SUBMITTED: AttemptStatus = "submitted";
export const OIR_EXPIRED: AttemptStatus = "timed-out";

const SETTLED: readonly AttemptStatus[] = [OIR_SUBMITTED, OIR_EXPIRED];

export function isSettled(attempt: OirAttempt): boolean {
  return SETTLED.includes(attempt.status);
}

/**
 * Whether a transition is allowed.
 *
 * Only two ways out of an active attempt, and no way back in. A settled attempt
 * is immutable; refreshing the browser must not restart anything.
 */
export function canTransition(from: AttemptStatus, to: AttemptStatus): boolean {
  if (from === OIR_ACTIVE) return to === OIR_SUBMITTED || to === OIR_EXPIRED;
  return false;
}

// ---------------------------------------------------------------------------
// Timing — the server's clock is the only clock
// ---------------------------------------------------------------------------

export function expiryFor(startedAt: IsoTimestamp, durationSeconds: number): IsoTimestamp {
  return new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString();
}

/**
 * Whether the clock has run out, judged against a timestamp the caller supplies
 * from the server. Nothing in this module reads a clock itself, so a test can
 * place `now` exactly on the boundary.
 */
export function hasExpired(attempt: OirAttempt, now: Date): boolean {
  return now.getTime() >= Date.parse(attempt.expiresAt);
}

export function remainingSeconds(attempt: OirAttempt, now: Date): number {
  const remaining = Math.ceil((Date.parse(attempt.expiresAt) - now.getTime()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * The attempt as it truly stands at `now`.
 *
 * An attempt whose clock has run out is expired whether or not anyone has
 * written that down yet. Deriving it on read is what removes the need for a
 * background timer: a candidate who closes the browser, sleeps the machine, or
 * loses the network comes back to an attempt that expired on schedule.
 */
export function settle(attempt: OirAttempt, now: Date): OirAttempt {
  if (attempt.status !== OIR_ACTIVE || !hasExpired(attempt, now)) return attempt;
  return {
    ...attempt,
    status: OIR_EXPIRED,
    submittedAt: attempt.expiresAt,
    submissionReason: "expired",
    revision: attempt.revision + 1,
  };
}

/** Whether the candidate may still change an answer at `now`. */
export function acceptsAnswers(attempt: OirAttempt, now: Date): boolean {
  return attempt.status === OIR_ACTIVE && !hasExpired(attempt, now);
}

// ---------------------------------------------------------------------------
// Answer validation
// ---------------------------------------------------------------------------

/**
 * Bounds. A candidate answering an OIR question needs none of these headroom;
 * they exist so a malformed or hostile payload is rejected by shape rather than
 * stored and dealt with later.
 */
const MAX_SELECTED_OPTIONS = 8;
const MAX_SEQUENCE_VALUES = 8;
const MAX_TEXT_LENGTH = 64;
const OPTION_ID_PATTERN = /^[0-9]{1,2}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9]{1,16}$/;

export type AnswerValidation =
  | { readonly ok: true; readonly answer: OirAnswer }
  | { readonly ok: false; readonly reason: string };

/**
 * Checks an answer against what the question SHOWS, never against its key.
 *
 * That distinction matters. Validating against the key would let a candidate
 * discover the key's shape by submitting rubbish and reading which rejections
 * come back — and would leak nothing useful in exchange, because a structurally
 * valid but wrong answer is simply marked wrong later.
 *
 * Choices numbered inside a diagram are checked just as strictly as printed
 * ones. The labels the figure shows are recorded at ingestion, read from the
 * rendered figure by a person, so "picture 9 of 4" is rejected here rather than
 * stored and quietly marked wrong later.
 */
export function validateAnswer(
  answer: unknown,
  question: {
    readonly optionSource: OirOptionSource;
    readonly options: readonly { readonly id: string }[];
    readonly pictorialOptionIds: readonly string[];
    readonly responseFormat?: OirResponseFormat | null;
  },
): AnswerValidation {
  const format = question.responseFormat ?? null;
  /**
   * A written question declares its shape, so the shape is enforced. The server
   * accepting a free-text answer to a two-blank question would store something
   * grading could only ever mark wrong — a silent trap rather than a rejection
   * the candidate can see and fix.
   */
  const matchesFormat = (kind: string, valueCount: number | null): boolean => {
    if (format === null) return true;
    if (format.kind !== kind) return false;
    if (format.kind === "multi-token" || format.kind === "ordered-sequence") {
      return valueCount === format.count;
    }
    return true;
  };
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
    return { ok: false, reason: "an answer must be an object" };
  }
  const record = answer as Record<string, unknown>;
  const kind = record.kind;

  const knownOption = (id: unknown): boolean => {
    if (typeof id !== "string" || !OPTION_ID_PATTERN.test(id)) return false;
    if (question.optionSource === "text") return question.options.some((o) => o.id === id);
    if (question.optionSource === "figure") return question.pictorialOptionIds.includes(id);
    // The question offers no choices at all; an option id means nothing here.
    return false;
  };

  switch (kind) {
    case "single-option": {
      if (!knownOption(record.optionId)) return { ok: false, reason: "unknown option" };
      return { ok: true, answer: { kind: "single-option", optionId: record.optionId as string } };
    }
    case "multiple-options": {
      const ids = record.optionIds;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SELECTED_OPTIONS) {
        return { ok: false, reason: "an implausible number of options was selected" };
      }
      if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate options" };
      if (!ids.every(knownOption)) return { ok: false, reason: "unknown option" };
      return { ok: true, answer: { kind: "multiple-options", optionIds: ids as string[] } };
    }
    case "boolean": {
      if (question.optionSource === "text") return { ok: false, reason: "this question is answered by choosing" };
      if (!matchesFormat("boolean", null)) return { ok: false, reason: "this question is not answered yes or no" };
      if (typeof record.value !== "boolean") return { ok: false, reason: "not a boolean" };
      return { ok: true, answer: { kind: "boolean", value: record.value } };
    }
    case "short-text": {
      if (question.optionSource === "text") return { ok: false, reason: "this question is answered by choosing" };
      if (!matchesFormat("short-text", null)) return { ok: false, reason: "this question expects a different answer shape" };
      const value = record.value;
      if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
        return { ok: false, reason: "text is empty or too long" };
      }
      return { ok: true, answer: { kind: "short-text", value } };
    }
    case "ordered-sequence":
    case "multi-token": {
      if (question.optionSource === "text") return { ok: false, reason: "this question is answered by choosing" };
      const values = record.values;
      if (!Array.isArray(values) || values.length === 0 || values.length > MAX_SEQUENCE_VALUES) {
        return { ok: false, reason: "an implausible number of values" };
      }
      if (!values.every((v) => typeof v === "string" && TOKEN_PATTERN.test(v))) {
        return { ok: false, reason: "a value is not a short token" };
      }
      if (!matchesFormat(kind, values.length)) {
        return { ok: false, reason: "the wrong number of values, or the wrong answer shape" };
      }
      return { ok: true, answer: { kind, values: values as string[] } };
    }
    default:
      return { ok: false, reason: "unknown answer kind" };
  }
}

// ---------------------------------------------------------------------------
// What the candidate is told about their own attempt
// ---------------------------------------------------------------------------

/**
 * One answered question, as reported back.
 *
 * The answer is echoed so a refreshed browser can restore the candidate's own
 * selections. Nothing is said about whether it is right — correctness does not
 * exist on this side of the boundary until Step 5C evaluates it server-side.
 */
export interface CandidateFacingAnswer {
  readonly questionId: string;
  readonly answer: OirAnswer;
  readonly recordedAt: IsoTimestamp;
}

export interface CandidateFacingAttempt {
  readonly attemptId: string;
  readonly activity: "oir";
  readonly mode: OirMode;
  readonly status: AttemptStatus;
  readonly questionCount: number;
  /** Fixed order, so the client renders the same paper the server recorded. */
  readonly questionIds: readonly string[];
  readonly answers: readonly CandidateFacingAnswer[];
  readonly startedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly remainingSeconds: number;
  readonly submittedAt: IsoTimestamp | null;
  readonly submissionReason: OirSubmissionReason | null;
}

/**
 * Built field by field, never by spreading the stored attempt.
 *
 * `candidateRef` and `revision` are the two fields that must not cross: the
 * first is how the server recognises this candidate, and the second is
 * concurrency bookkeeping that a client could only misuse. Writing the mapping
 * out means a field added to `OirAttempt` later stays server-side until someone
 * deliberately adds it here.
 */
export function toCandidateFacingAttempt(
  attempt: OirAttempt,
  now: Date,
): CandidateFacingAttempt {
  return {
    attemptId: attempt.id,
    activity: "oir",
    mode: attempt.mode,
    status: attempt.status,
    questionCount: attempt.questionIds.length,
    questionIds: attempt.questionIds.map(String),
    answers: attempt.answers.map((stored) => ({
      questionId: String(stored.questionId),
      answer: stored.answer,
      recordedAt: stored.recordedAt,
    })),
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    // Derived from the server's clock every time it is asked, so a client that
    // holds a stale number is simply corrected on the next request.
    remainingSeconds: remainingSeconds(attempt, now),
    submittedAt: attempt.submittedAt,
    submissionReason: attempt.submissionReason,
  };
}
