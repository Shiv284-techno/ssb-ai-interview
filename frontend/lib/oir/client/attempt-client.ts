/**
 * The browser's view of the OIR API.
 *
 * Client-safe: wire types and fetch wrappers, nothing server-only. It exists so
 * the components never handle a raw Response — every call comes back as a
 * discriminated result, and a component that forgets to check `ok` will not
 * compile.
 *
 * The wire types are declared here rather than imported from the delivery layer
 * on purpose. Importing them would pull a `server-only` module into the client
 * graph and break the build, which is exactly the guard doing its job. They are
 * a deliberate restatement of the fields the server promises, and the Step 5B
 * tests assert the two agree.
 */

export interface OirFigure {
  readonly mediaId: string;
  readonly order: number;
  readonly url: string;
  readonly mimeType: string;
  readonly altText: string;
  readonly needsAltText: boolean;
}

export type OirResponseFormat =
  | { readonly kind: "single-option" }
  | { readonly kind: "multiple-options"; readonly count: number }
  | { readonly kind: "boolean" }
  | { readonly kind: "short-text"; readonly maxLength: number }
  | { readonly kind: "multi-token"; readonly count: number }
  | { readonly kind: "ordered-sequence"; readonly count: number };

export interface OirQuestion {
  readonly id: string;
  readonly type: "oir-question";
  readonly stem: string;
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly optionSource: "text" | "figure" | "none";
  readonly pictorialOptionIds: readonly string[];
  readonly responseFormat: OirResponseFormat;
  readonly modality: "verbal" | "non-verbal";
  readonly figures: readonly OirFigure[];
}

/**
 * The candidate-facing bank, spanning every ingested set.
 *
 * No `setNumber`: the endpoint returns all sets combined, question ids are
 * global, and which set a question came from is not something the browser is
 * told or needs. The field was here while one set existed and would now be a
 * number that answered a question nobody asked.
 */
export interface OirQuestionBank {
  readonly questionCount: number;
  readonly questions: readonly OirQuestion[];
}

export type OirAnswer =
  | { readonly kind: "single-option"; readonly optionId: string }
  | { readonly kind: "multiple-options"; readonly optionIds: readonly string[] }
  | { readonly kind: "ordered-sequence"; readonly values: readonly string[] }
  | { readonly kind: "multi-token"; readonly values: readonly string[] }
  | { readonly kind: "short-text"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean };

export type OirAttemptStatus = "in-progress" | "submitted" | "timed-out";

export interface OirAttemptView {
  readonly attemptId: string;
  readonly activity: "oir";
  readonly mode: "production" | "development";
  readonly status: OirAttemptStatus;
  readonly questionCount: number;
  readonly questionIds: readonly string[];
  readonly answers: readonly {
    readonly questionId: string;
    readonly answer: OirAnswer;
    readonly recordedAt: string;
  }[];
  readonly startedAt: string;
  readonly expiresAt: string;
  /** The server's number at the moment it replied. The countdown re-derives it. */
  readonly remainingSeconds: number;
  readonly submittedAt: string | null;
  readonly submissionReason: "candidate" | "expired" | null;
}

/**
 * Why a call failed, in terms a component can branch on.
 *
 * `conflict` and `unavailable` are kept apart because they need opposite
 * responses: the first means the server knows something the client does not and
 * a re-fetch will fix it, the second means nothing is known and the candidate
 * must be told their answer is not confirmed saved.
 */
export type OirFailureKind =
  | "unauthenticated"
  | "not-found"
  | "conflict"
  | "rejected"
  | "unavailable"
  | "network";

export interface OirFailure {
  readonly kind: OirFailureKind;
  readonly status: number | null;
  readonly message: string;
}

/**
 * What the candidate is told once the paper is marked.
 *
 * Counts and a score. No question-level breakdown, no correct answers, no
 * explanations — those are a different product decision and this is not it.
 */
export interface OirAttemptResult {
  readonly status: "submitted" | "timed-out";
  readonly questionCount: number;
  readonly answeredCount: number;
  readonly unansweredCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly score: number;
  readonly maxScore: number;
  readonly accuracyPercent: number;
  readonly settledAt: string;
}

export type OirResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: OirFailure };

const GENERIC = "Something went wrong. Please try again.";
const OFFLINE = "We could not reach the server. Check your connection and try again.";

/** Reads the API's safe `{ error }` message without trusting the shape. */
function messageFrom(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const { error } = payload as { error?: unknown };
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

function kindFor(status: number): OirFailureKind {
  if (status === 401) return "unauthenticated";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status >= 500) return "unavailable";
  return "rejected";
}

async function request<T>(
  url: string,
  init: RequestInit,
  expected: readonly number[],
): Promise<OirResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    // Offline, DNS, aborted — nothing is known about whether the server acted.
    return { ok: false, failure: { kind: "network", status: null, message: OFFLINE } };
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!expected.includes(response.status)) {
    // A 5xx never surfaces the server's own wording.
    const message =
      response.status >= 500 ? GENERIC : messageFrom(payload, GENERIC);
    return {
      ok: false,
      failure: { kind: kindFor(response.status), status: response.status, message },
    };
  }
  return { ok: true, value: payload as T };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export const fetchQuestions = (): Promise<OirResult<OirQuestionBank>> =>
  request<OirQuestionBank>("/api/assessment/oir/questions", { method: "GET" }, [200]);

/** Starts an attempt, or returns the one already running. */
export const startAttempt = (): Promise<OirResult<OirAttemptView>> =>
  request<OirAttemptView>("/api/assessment/oir/attempt", { method: "POST" }, [200, 201]);

export const fetchAttempt = (): Promise<OirResult<OirAttemptView>> =>
  request<OirAttemptView>("/api/assessment/oir/attempt", { method: "GET" }, [200]);

export const saveAnswer = (
  attemptId: string,
  questionId: string,
  answer: OirAnswer,
): Promise<OirResult<OirAttemptView>> =>
  request<OirAttemptView>(
    "/api/assessment/oir/attempt/response",
    {
      method: "PUT",
      headers: JSON_HEADERS,
      // Only these three fields. Timing, status and revision are the server's,
      // and sending them would be inviting it to trust the browser.
      body: JSON.stringify({ attemptId, questionId, answer }),
    },
    [200],
  );

export const submitAttempt = (attemptId: string): Promise<OirResult<OirAttemptView>> =>
  request<OirAttemptView>(
    "/api/assessment/oir/attempt/submit",
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ attemptId }) },
    [200],
  );

/** The candidate's own marked result. Nothing is sent; the session identifies them. */
export const fetchResult = (): Promise<OirResult<OirAttemptResult>> =>
  request<OirAttemptResult>("/api/assessment/oir/attempt/result", { method: "GET" }, [200]);

/** True when two answers are the same, so an unchanged selection is not re-saved. */
export function sameAnswer(a: OirAnswer | null, b: OirAnswer | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
