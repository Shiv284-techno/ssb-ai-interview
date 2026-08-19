import "server-only";

/**
 * Starting, reading, answering and submitting an OIR attempt.
 *
 * The single place the bank, the store and the server's clock meet. Routes are
 * transport only; every rule about what a candidate may do, and when, is
 * decided here or in `attempt.ts`.
 *
 * The clock is injected. `now()` defaults to the real one, and every caller in
 * production uses the default — but a timed assessment whose expiry can only be
 * tested by waiting twenty-five minutes is a timed assessment nobody tests, so
 * the seam exists.
 */
import { randomUUID } from "node:crypto";

import {
  acceptsAnswers,
  expiryFor,
  hasExpired,
  isSettled,
  OIR_ACTIVE,
  OIR_CONFIGS,
  OIR_PRODUCTION_CONFIG,
  OIR_EXPIRED,
  OIR_SUBMITTED,
  settle,
  validateAnswer,
  type OirAttempt,
  type OirAttemptConfig,
  type OirMode,
} from "@/lib/oir/attempt";
import { appsScriptAttemptStore } from "@/lib/oir/attempt-store-apps-script";
import { OirStoreConflict, type OirAttemptStore } from "@/lib/oir/attempt-store";
import { getOirBank, getOirQuestionById } from "@/lib/assessment/oir/bank";
import { evaluateAttempt, type OirResult } from "@/lib/oir/result";
import type { ContentItemId } from "@/lib/assessment/types";
import { isServable } from "@/lib/assessment/types";

export type AttemptFailure =
  /** Fewer verified questions exist than the configuration demands. */
  | "insufficient-bank"
  /** The candidate already holds an unsettled attempt. */
  | "already-active"
  /** The candidate has already sat this paper. One attempt each, and it is spent. */
  | "already-taken"
  /** A result was asked for while the candidate is still sitting the paper. */
  | "not-settled"
  /** The bank no longer holds a question this attempt served, so it cannot be marked. */
  | "unmarkable"
  | "not-found"
  | "not-active"
  | "expired"
  | "unknown-question"
  | "invalid-answer"
  | "conflict"
  | "store-unavailable";

export type AttemptResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: AttemptFailure; readonly detail?: string };

export interface AttemptDeps {
  readonly store: OirAttemptStore;
  readonly now: () => Date;
  /**
   * Uniform in [0, 1). Injected for the same reason the clock is: a shuffle
   * that can only be observed by running it a few thousand times and squinting
   * is a shuffle nobody tests. Production uses the default.
   */
  readonly random: () => number;
}

const defaultDeps: AttemptDeps = {
  store: appsScriptAttemptStore,
  now: () => new Date(),
  random: Math.random,
};

/**
 * The configured mode.
 *
 * Defaults to production, so an unconfigured deployment refuses to run a short
 * paper rather than quietly serving one. Development has to be asked for, in
 * the environment, by someone with server access — never by the client.
 */
export function configuredMode(): OirMode {
  return process.env.OIR_MODE === "development" ? "development" : "production";
}

/**
 * The shortest a development clock may be set to, and the longest.
 *
 * Bounded at the production duration on purpose: the override exists to make a
 * twenty-five minute expiry testable in seconds, never to hand anyone a longer
 * paper than the real one.
 */
const MIN_DEV_DURATION_SECONDS = 1;
const MAX_DEV_DURATION_SECONDS = OIR_PRODUCTION_CONFIG.durationSeconds;

/**
 * The configuration this server will run.
 *
 * `OIR_DEV_DURATION_SECONDS` shortens the clock so that expiry can be verified
 * against real persistence without waiting twenty-five minutes for each
 * assertion. It is read from the environment, so only someone with server
 * access can set it, and it is consulted ONLY in development mode — production
 * returns the frozen 50-question, 1500-second configuration whatever the
 * environment says. A value that is not a whole number of seconds in range is
 * ignored rather than obeyed.
 */
export function configuredAttempt(): OirAttemptConfig {
  const config = OIR_CONFIGS[configuredMode()];
  if (config.mode !== "development") return config;

  const raw = process.env.OIR_DEV_DURATION_SECONDS;
  if (raw === undefined || raw === "") return config;

  const seconds = Number(raw);
  if (
    !Number.isInteger(seconds) ||
    seconds < MIN_DEV_DURATION_SECONDS ||
    seconds > MAX_DEV_DURATION_SECONDS
  ) {
    console.error("[oir/attempt] the development duration override is not a usable value");
    return config;
  }
  return { ...config, durationSeconds: seconds };
}

/**
 * Every question that may be put in front of a candidate, across every set.
 *
 * Omitted questions never appear because they are not in the bank at all — the
 * ingest tool records them in a separate `omitted` list and ships neither their
 * text nor their figures. The `isServable` filter is therefore a second line
 * rather than the only one, and no omission number is written down here: a
 * selector that hardcoded "not 5, 24, 31, 36" would silently serve the wrong
 * questions the moment a set was re-ingested.
 */
export function eligibleQuestionIds(): readonly ContentItemId[] {
  const available: ContentItemId[] = [];
  const seen = new Set<string>();
  for (const question of getOirBank().questions) {
    if (!isServable(question)) continue;
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    available.push(question.id);
  }
  return available;
}

/**
 * The questions this attempt will serve, in the order they will be served.
 *
 * A random sample of the whole verified bank, not the first `questionCount` of
 * it. Taking a prefix would have been simpler and is what this did while one
 * set existed, but over a combined bank it means every candidate sits Set 01
 * plus the same four questions of Set 02, and the other forty-one are ingested
 * and never seen. Sampling is what makes a second set worth having.
 *
 * The consequence is deliberate and bounded: two candidates may sit different
 * papers. Neither paper changes after it is dealt — the ids are written into
 * the attempt at creation and every later read serves that stored list — so a
 * refresh, a reconnect and a reload all return the same fifty in the same
 * order. Randomness happens once, when the paper is created, and never again.
 *
 * Shuffled by Fisher-Yates over a copy, which is uniform and, unlike
 * `sort(() => random() - 0.5)`, actually is.
 */
export function selectQuestionIds(
  config: OirAttemptConfig,
  random: () => number = Math.random,
): AttemptResult<readonly ContentItemId[]> {
  const available = [...eligibleQuestionIds()];

  if (available.length < config.questionCount) {
    return {
      ok: false,
      failure: "insufficient-bank",
      detail:
        `${config.mode} needs ${config.questionCount} verified questions and the bank holds ` +
        `${available.length}. Ingest another verified set rather than lowering the count.`,
    };
  }

  for (let i = available.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return { ok: true, value: available.slice(0, config.questionCount) };
}

function conflictOr(failure: AttemptFailure, error: unknown): AttemptResult<never> {
  if (error instanceof OirStoreConflict) return { ok: false, failure };
  return { ok: false, failure: "store-unavailable" };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function startAttempt(
  candidateRef: string,
  deps: AttemptDeps = defaultDeps,
): Promise<AttemptResult<OirAttempt>> {
  const config = configuredAttempt();

  // Refuse before touching the store: an insufficient bank is a configuration
  // fault, and creating nothing is the correct outcome.
  const selected = selectQuestionIds(config, deps.random);
  if (!selected.ok) return selected;

  // One paper per candidate, spent or not. A candidate still sitting theirs is
  // handed it back rather than a second one, so a double-click cannot consume
  // it; a candidate who has finished is refused, because "submit, reload, sit
  // it again" is not a thing an exam may allow.
  //
  // The lookup is deliberately `findLatestFor` and not `findUnsettledFor`. The
  // latter cannot see a submitted attempt at all, which read as "no attempt"
  // and handed the candidate a fresh twenty-five minutes.
  let existing: OirAttempt | null;
  try {
    existing = await deps.store.findLatestFor(candidateRef);
  } catch {
    return { ok: false, failure: "store-unavailable" };
  }
  if (existing) {
    const current = settle(existing, deps.now());
    if (!isSettled(current)) return { ok: true, value: current };
    // The clock settled it and nothing has written that down yet. THIS is the
    // one place a settlement is persisted: reads never write, so re-reading an
    // expired attempt cannot move its settlement timestamp — and cannot make it
    // vanish either. Writing it here means the sheet agrees with what every
    // reader has already been told.
    if (current.status !== existing.status) {
      try {
        await deps.store.update(current, existing.revision);
      } catch (error) {
        if (!(error instanceof OirStoreConflict)) return { ok: false, failure: "store-unavailable" };
      }
    }
    return { ok: false, failure: "already-taken" };
  }

  const startedAt = deps.now().toISOString();
  const attempt: OirAttempt = {
    id: randomUUID(),
    candidateRef,
    mode: config.mode,
    status: OIR_ACTIVE,
    questionIds: selected.value,
    answers: [],
    startedAt,
    expiresAt: expiryFor(startedAt, config.durationSeconds),
    submittedAt: null,
    submissionReason: null,
    revision: 1,
  };

  try {
    await deps.store.create(attempt);
  } catch (error) {
    return conflictOr("already-active", error);
  }
  return { ok: true, value: attempt };
}

/**
 * The candidate's current attempt.
 *
 * Reading never writes. The clock is applied to whatever the store returned, so
 * an attempt past its deadline comes back settled — `timed-out`, stamped at the
 * deadline — on the first read and identically on the tenth. That is what makes
 * "your time ran out" a stable answer rather than one that changes into "no
 * attempt" as soon as something happens to persist it.
 *
 * `not-found` is reserved for its literal meaning: this candidate has no
 * attempt. An expired attempt is emphatically not that, and neither is a
 * submitted one — both must come back as themselves, or the client that reads
 * "no attempt" will quite reasonably start another.
 */
export async function currentAttempt(
  candidateRef: string,
  deps: AttemptDeps = defaultDeps,
): Promise<AttemptResult<OirAttempt>> {
  let stored: OirAttempt | null;
  try {
    stored = await deps.store.findLatestFor(candidateRef);
  } catch {
    return { ok: false, failure: "store-unavailable" };
  }
  if (!stored) return { ok: false, failure: "not-found" };
  return { ok: true, value: settle(stored, deps.now()) };
}

/**
 * Loads an attempt by id and proves it belongs to this candidate.
 *
 * The comparison is what stops one candidate reading another's paper. A miss
 * and a mismatch return the same `not-found`, so an attempt id cannot be probed
 * for existence.
 */
async function ownedAttempt(
  attemptId: string,
  candidateRef: string,
  deps: AttemptDeps,
): Promise<AttemptResult<OirAttempt>> {
  let stored: OirAttempt | null;
  try {
    stored = await deps.store.findById(attemptId);
  } catch {
    return { ok: false, failure: "store-unavailable" };
  }
  if (!stored || stored.candidateRef !== candidateRef) return { ok: false, failure: "not-found" };
  return { ok: true, value: stored };
}

export async function saveAnswer(
  input: {
    readonly attemptId: string;
    readonly candidateRef: string;
    readonly questionId: string;
    readonly answer: unknown;
  },
  deps: AttemptDeps = defaultDeps,
): Promise<AttemptResult<OirAttempt>> {
  const loaded = await ownedAttempt(input.attemptId, input.candidateRef, deps);
  if (!loaded.ok) return loaded;

  const now = deps.now();
  const stored = loaded.value;

  // Expiry first, and derived from the stored deadline rather than from
  // anything the request said. A client claiming a later `expiresAt`, an
  // earlier `startedAt` or any number of remaining seconds is simply not
  // consulted: none of those values appear in this function's inputs.
  if (hasExpired(stored, now) || stored.status !== OIR_ACTIVE) {
    // Refused, and nothing written. Persisting the settlement here would make a
    // rejected answer mutate the attempt it was rejected from, and would hide
    // the expired attempt from the next read.
    return {
      ok: false,
      failure: settle(stored, now).status === OIR_EXPIRED ? "expired" : "not-active",
    };
  }

  // The attempt's own question list is the allowlist. A question that exists in
  // the bank but was not served to this candidate is rejected exactly like one
  // that does not exist at all.
  if (!stored.questionIds.some((id) => id === input.questionId)) {
    return { ok: false, failure: "unknown-question" };
  }

  // Looked up by global id across the whole bank. Scoping this to one set was
  // correct while a paper came from one set and would now reject every Set 02
  // question on a mixed paper as unknown — the candidate would be unable to
  // answer roughly half of it.
  const question = getOirQuestionById(input.questionId);
  if (!question) return { ok: false, failure: "unknown-question" };

  const validation = validateAnswer(input.answer, question);
  if (!validation.ok) return { ok: false, failure: "invalid-answer", detail: validation.reason };

  const recordedAt = now.toISOString();
  const answers = [
    ...stored.answers.filter((a) => a.questionId !== input.questionId),
    { questionId: question.id, answer: validation.answer, recordedAt },
  ];
  // Kept in served order so the stored attempt reads like the paper.
  answers.sort(
    (a, b) =>
      stored.questionIds.indexOf(a.questionId) - stored.questionIds.indexOf(b.questionId),
  );

  const updated: OirAttempt = { ...stored, answers, revision: stored.revision + 1 };
  try {
    await deps.store.update(updated, stored.revision);
  } catch (error) {
    return conflictOr("conflict", error);
  }
  return { ok: true, value: updated };
}

export async function submitAttempt(
  input: { readonly attemptId: string; readonly candidateRef: string },
  deps: AttemptDeps = defaultDeps,
): Promise<AttemptResult<OirAttempt>> {
  const loaded = await ownedAttempt(input.attemptId, input.candidateRef, deps);
  if (!loaded.ok) return loaded;

  const now = deps.now();
  const stored = loaded.value;

  if (stored.status !== OIR_ACTIVE) {
    // Submitting twice is not an error worth punishing, but it must not rewrite
    // the record: the first settlement is the one that counts.
    return { ok: false, failure: stored.status === OIR_EXPIRED ? "expired" : "not-active" };
  }

  // Refused without writing, for the same reason as saveAnswer: a submission
  // that arrived too late must not be what settles the attempt.
  if (hasExpired(stored, now)) return { ok: false, failure: "expired" };

  const submitted: OirAttempt = {
    ...stored,
    status: OIR_SUBMITTED,
    submittedAt: now.toISOString(),
    submissionReason: "candidate",
    revision: stored.revision + 1,
  };
  try {
    await deps.store.update(submitted, stored.revision);
  } catch (error) {
    return conflictOr("conflict", error);
  }
  return { ok: true, value: submitted };
}

/**
 * The candidate's result.
 *
 * One store read and one bank load, then every question is marked in memory.
 * Nothing is written: the attempt is immutable once settled and pins the exact
 * questions it served, so the same attempt marked twice gives the same numbers
 * and a stored copy would only be a second thing to keep in step.
 *
 * Only the served questions are marked. The nine source questions the two sets
 * could not recover are not in the bank and not in the attempt, so they cannot
 * appear as zeros; there is nothing here that could invent them.
 */
export async function attemptResult(
  candidateRef: string,
  deps: AttemptDeps = defaultDeps,
): Promise<AttemptResult<OirResult>> {
  const current = await currentAttempt(candidateRef, deps);
  if (!current.ok) return current;

  const attempt = current.value;
  if (!isSettled(attempt)) return { ok: false, failure: "not-settled" };

  // The whole bank, for the same reason: a mixed paper marked against one set
  // reports `bank-drift` for every question drawn from the other.
  const outcome = evaluateAttempt(attempt, getOirBank().questions);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return {
    ok: false,
    failure: outcome.failure === "not-settled" ? "not-settled" : "unmarkable",
  };
}

/** Exposed so a route can echo whether answers are still being taken. */
export { acceptsAnswers };
