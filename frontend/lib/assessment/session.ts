import type { AssessmentActivityKind } from "@/lib/assessment/activities";
import type { ResponseEnvelope } from "@/lib/assessment/response";
import type {
  ActivityDefinitionId,
  AttemptId,
  CandidateRef,
  ContentItemId,
  EvaluationId,
  IsoTimestamp,
  SessionId,
} from "@/lib/assessment/types";

/**
 * One candidate's run through the simulator.
 *
 * A session is a record of what happened, held in memory for now: Step 4A adds
 * no database, no files, and no browser storage. The shape is chosen so that
 * persisting it later is a matter of writing it somewhere, not of redesigning
 * it — every field is plain JSON and every reference is an id.
 *
 * The candidate appears only as an opaque `CandidateRef`. No name, no email, no
 * account id. Whatever maps a reference back to a person stays server-side and
 * outside this model, so a session can be handed to an evaluator, counted in an
 * aggregate, or kept for comparison without carrying an identity along with it.
 */

export type SessionStatus =
  | "not-started"
  | "in-progress"
  | "paused"
  | "complete"
  | "abandoned";

export type AttemptStatus =
  | "not-started"
  | "in-progress"
  /** Finished within the rules. */
  | "submitted"
  /** The clock closed it; whatever existed was kept. */
  | "timed-out"
  /** The candidate left it; recorded rather than deleted. */
  | "abandoned"
  /** Deliberately not run in this session. */
  | "skipped";

/**
 * One run at one activity.
 *
 * `servedItemIds` records exactly what was put in front of the candidate, in
 * order. That is what makes an attempt reproducible after the fact — without
 * it, a later change to the bank or to selection would make it impossible to
 * say what the candidate actually saw.
 */
export interface ActivityAttempt {
  readonly id: AttemptId;
  readonly activityKind: AssessmentActivityKind;
  readonly definitionId: ActivityDefinitionId;
  readonly status: AttemptStatus;
  readonly servedItemIds: readonly ContentItemId[];
  readonly responses: readonly ResponseEnvelope[];
  /** Evaluations reference the attempt; the attempt only points back at them. */
  readonly evaluationIds: readonly EvaluationId[];
  readonly startedAt: IsoTimestamp | null;
  readonly completedAt: IsoTimestamp | null;
}

export interface AssessmentSession {
  readonly id: SessionId;
  readonly candidateRef: CandidateRef;
  /** Which schedule this session followed — sessions may differ. */
  readonly scheduleId: string;
  readonly status: SessionStatus;
  /** Null before the session starts and after it ends. */
  readonly currentDay: number | null;
  readonly currentActivity: AssessmentActivityKind | null;
  readonly attempts: readonly ActivityAttempt[];
  readonly startedAt: IsoTimestamp | null;
  readonly updatedAt: IsoTimestamp;
  readonly completedAt: IsoTimestamp | null;
}

export function attemptFor(
  session: AssessmentSession,
  kind: AssessmentActivityKind,
): ActivityAttempt | null {
  return session.attempts.find((attempt) => attempt.activityKind === kind) ?? null;
}

/** Activities of a schedule that this session has not finished. */
export function remainingActivities(
  session: AssessmentSession,
  order: readonly AssessmentActivityKind[],
): readonly AssessmentActivityKind[] {
  const settled = new Set(
    session.attempts
      .filter((attempt) =>
        attempt.status === "submitted" ||
        attempt.status === "timed-out" ||
        attempt.status === "skipped",
      )
      .map((attempt) => attempt.activityKind),
  );
  return order.filter((kind) => !settled.has(kind));
}

/** Every response in the session, across activities, in attempt order. */
export function allResponses(
  session: AssessmentSession,
): readonly ResponseEnvelope[] {
  return session.attempts.flatMap((attempt) => attempt.responses);
}

/**
 * Items already served to this candidate.
 *
 * Feeds the "avoid immediate repetition" rule in selection: a candidate should
 * not be shown the same word twice in one sitting, and on a later sitting the
 * caller decides how far back to look.
 */
export function servedItemIds(
  session: AssessmentSession,
): readonly ContentItemId[] {
  return session.attempts.flatMap((attempt) => attempt.servedItemIds);
}

export function isComplete(
  session: AssessmentSession,
  order: readonly AssessmentActivityKind[],
): boolean {
  return remainingActivities(session, order).length === 0;
}
