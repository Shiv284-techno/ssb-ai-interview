import "server-only";

/**
 * What an OIR candidate is served.
 *
 * The single place a question crosses from the bank to a candidate. It is
 * server-only so nothing can import it into a bundle and then reach through it
 * to `bank.ts`, and it is written as an explicit field-by-field construction
 * rather than a spread with deletions. That matters more here than anywhere
 * else in the codebase: with a spread, adding `hint` or `markScheme` to the
 * bank later would serve it to candidates by default, and the bug would look
 * like nothing at all in review. Building the object by hand means a new field
 * is invisible until someone deliberately adds it.
 */
import { toCandidateFacingItem, type CandidateFacingItem } from "@/lib/assessment/content";
import { toCandidateFacingMedia, type CandidateFacingMedia } from "@/lib/assessment/media";
import { getOirSet } from "@/lib/assessment/oir/bank";
import type { MediaAssetId } from "@/lib/assessment/types";

/** One question and the pictures it needs, with nothing else attached. */
export interface CandidateFacingOirQuestion {
  readonly question: Extract<CandidateFacingItem, { type: "oir-question" }>;
  readonly media: readonly CandidateFacingMedia[];
}

export interface CandidateFacingOirSet {
  readonly setNumber: number;
  readonly questions: readonly CandidateFacingOirQuestion[];
}

function project(setNumber: number, position: number): CandidateFacingOirQuestion {
  const set = getOirSet(setNumber);
  const stored = set.questions.find((q) => q.position === position);
  if (!stored) throw new Error(`OIR set ${setNumber} has no question at position ${position}`);

  const facing = toCandidateFacingItem(stored);
  if (facing.type !== "oir-question") {
    // Unreachable: the bank only ever holds oir-question items. Asserted rather
    // than cast, because a cast here would be a cast around the one boundary
    // that must not be casually widened.
    throw new Error(`OIR set ${setNumber} question ${position} projected as ${facing.type}`);
  }

  const media = facing.figures.map((figure) => {
    const asset = set.media.get(figure.mediaId);
    if (!asset) throw new Error(`OIR set ${setNumber} is missing media ${figure.mediaId}`);
    return toCandidateFacingMedia(asset);
  });

  return { question: facing, media };
}

/** Every servable question in a set, in the order the source prints them. */
export function candidateFacingOirSet(setNumber: number): CandidateFacingOirSet {
  const set = getOirSet(setNumber);
  return {
    setNumber,
    questions: [...set.questions]
      .sort((a, b) => a.position - b.position)
      .map((q) => project(setNumber, q.position)),
  };
}

export function candidateFacingOirQuestion(
  setNumber: number,
  position: number,
): CandidateFacingOirQuestion | null {
  const set = getOirSet(setNumber);
  if (!set.questions.some((q) => q.position === position)) return null;
  return project(setNumber, position);
}

/**
 * Resolves a figure a candidate has been served back to its stored path.
 *
 * Whatever eventually serves the image bytes must go through this rather than
 * taking a path from the request: the id is one the projection handed out, so a
 * request cannot name a file the candidate was never given.
 */
export function resolveOirFigureReference(
  setNumber: number,
  mediaId: MediaAssetId,
): string | null {
  return getOirSet(setNumber).media.get(mediaId)?.reference ?? null;
}
