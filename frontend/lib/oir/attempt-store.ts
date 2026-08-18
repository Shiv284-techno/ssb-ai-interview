import "server-only";

/**
 * Where OIR attempts are kept.
 *
 * An interface rather than an implementation, because a timed assessment needs
 * state that outlives a request and this repository had none: the auth session
 * is a stateless signed cookie, and the only existing backend is the Google
 * Apps Script account service. The adapter that satisfies this interface talks
 * to that same script.
 *
 * Two properties the store must provide, and the reasons they are not optional:
 *
 *   - A candidate has at most ONE attempt, ever. Not one unsettled attempt —
 *     one. Without that, a candidate sits the paper, hands it in or lets the
 *     clock run out, and starts a fresh twenty-five minutes, and the time
 *     limit means nothing across attempts.
 *
 *   - Updates are conditional on a revision. Two tabs answering at once must
 *     not silently overwrite one another; the loser is told to re-read.
 */
import type { OirAttempt } from "@/lib/oir/attempt";

export class OirStoreError extends Error {}

/** Returned when an update lost a race and the caller should re-read. */
export class OirStoreConflict extends Error {}

export interface OirAttemptStore {
  /**
   * Persists a new attempt. Must reject if the candidate already holds one at
   * all — the check belongs in the store because only the store can make it
   * atomic.
   */
  create(attempt: OirAttempt): Promise<void>;
  findById(attemptId: string): Promise<OirAttempt | null>;
  /** The candidate's unsettled attempt, if any. What answering and expiry read. */
  findUnsettledFor(candidateRef: string): Promise<OirAttempt | null>;
  /**
   * The candidate's most recent attempt, settled or not. What a browser refresh
   * finds.
   *
   * Distinct from `findUnsettledFor` because that one filters settled rows
   * away, which is correct while a paper is being sat and wrong the moment it
   * is handed in: a submitted attempt that cannot be found reads as no attempt
   * at all, and the candidate is issued another paper.
   */
  findLatestFor(candidateRef: string): Promise<OirAttempt | null>;
  /**
   * Writes an attempt back, but only if the stored revision still matches
   * `expectedRevision`. Throws `OirStoreConflict` otherwise.
   */
  update(attempt: OirAttempt, expectedRevision: number): Promise<void>;
}
