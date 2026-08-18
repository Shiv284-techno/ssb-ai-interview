import "server-only";

import { NextResponse } from "next/server";

import { failWith, NO_STORE, requireCandidate } from "@/lib/oir/attempt-http";
import { attemptResult } from "@/lib/oir/attempt-service";
import { toCandidateFacingResult } from "@/lib/oir/result";

/**
 * How the candidate did.
 *
 *   GET /api/assessment/oir/attempt/result
 *     -> counts and a score, for the candidate's own settled attempt
 *
 * There is no request body and no attempt id in the URL, deliberately. The only
 * attempt this can mark is the caller's own, found from their session, so there
 * is nothing to tamper with: no score, no counts, no question total and no
 * duration is read from the request, because none of them appear in it.
 *
 * A GET rather than a POST because marking changes nothing. The attempt is
 * immutable once settled and the result is recomputed from it, so asking twice
 * is the same as asking once — including after a reload.
 *
 * An attempt still in progress is refused rather than marked. Returning a
 * running total mid-paper would tell a candidate which answers were landing.
 */
export async function GET() {
  const caller = await requireCandidate("result");
  if (!caller.ok) return caller.response;

  const result = await attemptResult(caller.candidateRef);
  if (!result.ok) return failWith(result.failure);

  return NextResponse.json(toCandidateFacingResult(result.value), { headers: NO_STORE });
}
