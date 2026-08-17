import type { AssessmentActivityKind } from "@/lib/assessment/activities";
import type {
  AttemptId,
  ContentItemId,
  IsoTimestamp,
  MediaAssetId,
  ResponseId,
} from "@/lib/assessment/types";

/**
 * What the candidate produced.
 *
 * One envelope carries the bookkeeping every response needs — which attempt,
 * which item, when, how long — and a payload carries the part that differs by
 * activity. That split is why a new activity does not require a new envelope,
 * and why timing analysis can run across every activity at once.
 *
 * A response **references** its item by id and never copies the prompt. The
 * bank stays the single source of truth, so a corrected typo in a word prompt
 * does not leave a thousand responses quoting the old spelling — and a response
 * can never be mistaken for a place to edit the question.
 */

export interface ResponseTiming {
  /** When the item was put in front of the candidate. */
  readonly presentedAt: IsoTimestamp;
  /** When they submitted, or when the clock closed it. */
  readonly settledAt: IsoTimestamp;
  readonly elapsedMs: number;
  /** True when the activity's hard timer ended the response. */
  readonly timedOut: boolean;
}

/** A choice from a fixed list — OIR. */
export interface ChoiceResponse {
  readonly kind: "choice";
  /** Null when the candidate moved on without answering. */
  readonly selectedOptionId: string | null;
}

/** Written prose — WAT sentences, SRT responses, TAT stories, SD, GPE plans. */
export interface FreeTextResponse {
  readonly kind: "free-text";
  readonly text: string;
}

/**
 * Something said aloud — narration, Lecturette, the interview.
 *
 * The transcript is the response. Audio is kept only as a reference and only if
 * the candidate's consent covers it; `audioRef` is null otherwise, and nothing
 * downstream may assume it exists.
 */
export interface SpokenResponse {
  readonly kind: "spoken";
  readonly transcript: string;
  readonly audioRef: MediaAssetId | null;
  /** How the transcript was produced, so its reliability is knowable. */
  readonly transcriptSource: "browser-speech" | "manual" | "unknown";
}

/**
 * Named parts answered together — the PP&DT perception, where a candidate
 * records the number of characters, their age, sex, mood, and the action.
 *
 * A map rather than a fixed interface because the fields belong to the
 * activity definition, not to this type.
 */
export interface StructuredResponse {
  readonly kind: "structured";
  readonly fields: Readonly<Record<string, string>>;
}

/**
 * A contribution to a group activity — GD, GPE discussion, Command Task, FGT.
 *
 * Only the candidate's own contribution is recorded here. Modelling what other
 * participants did belongs to the group activity itself, once group activities
 * exist at all.
 */
export interface GroupContributionResponse {
  readonly kind: "group-contribution";
  readonly transcript: string;
  /** Seconds the candidate held the floor, when it can be measured. */
  readonly speakingSeconds: number | null;
}

/** Recorded explicitly, so a gap is never mistaken for missing data. */
export interface NotAttemptedResponse {
  readonly kind: "not-attempted";
  readonly reason: "skipped" | "timed-out" | "activity-abandoned";
}

export type ResponsePayload =
  | ChoiceResponse
  | FreeTextResponse
  | SpokenResponse
  | StructuredResponse
  | GroupContributionResponse
  | NotAttemptedResponse;

export type ResponseKind = ResponsePayload["kind"];

export const RESPONSE_KINDS: readonly ResponseKind[] = [
  "choice",
  "free-text",
  "spoken",
  "structured",
  "group-contribution",
  "not-attempted",
];

export interface ResponseEnvelope {
  readonly id: ResponseId;
  readonly attemptId: AttemptId;
  readonly activityKind: AssessmentActivityKind;
  /**
   * The item answered. Null for a response to the activity as a whole, such as
   * a Lecturette, where the topic was chosen rather than served.
   */
  readonly contentItemId: ContentItemId | null;
  readonly timing: ResponseTiming;
  readonly payload: ResponsePayload;
}

export function isResponseOfKind<K extends ResponseKind>(
  response: ResponseEnvelope,
  kind: K,
): response is ResponseEnvelope & { payload: Extract<ResponsePayload, { kind: K }> } {
  return response.payload.kind === kind;
}

/** True when the candidate produced nothing for this item. */
export function isUnanswered(response: ResponseEnvelope): boolean {
  const { payload } = response;
  switch (payload.kind) {
    case "not-attempted":
      return true;
    case "choice":
      return payload.selectedOptionId === null;
    case "free-text":
      return payload.text.trim().length === 0;
    case "spoken":
    case "group-contribution":
      return payload.transcript.trim().length === 0;
    case "structured":
      return Object.values(payload.fields).every((value) => value.trim().length === 0);
  }
}
