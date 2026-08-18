import "server-only";

import { NextResponse } from "next/server";

import { toCandidateFacingAttempt } from "@/lib/oir/attempt";
import { failWith, NO_STORE, requireCandidate } from "@/lib/oir/attempt-http";
import { currentAttempt, startAttempt } from "@/lib/oir/attempt-service";

/**
 * Starting and reading an OIR attempt.
 *
 *   POST /api/assessment/oir/attempt   -> start, or hand back the one running
 *   GET  /api/assessment/oir/attempt   -> the attempt in progress
 *
 * Transport only. Which questions are served, when the clock runs out and
 * whether the candidate may still act are decided in `attempt-service.ts`.
 *
 * POST takes no body. How many questions and how long they get are server
 * decisions; accepting either from the client would be handing over the
 * difficulty of the test. There is deliberately no query parameter for mode,
 * duration or count.
 *
 * A GET after a refresh returns the same attempt with the same question order
 * and a freshly derived remaining time, which is what makes a browser reload
 * harmless.
 */

export async function POST() {
  const caller = await requireCandidate("start");
  if (!caller.ok) return caller.response;

  const result = await startAttempt(caller.candidateRef);
  if (!result.ok) {
    if (result.failure === "insufficient-bank") {
      // The operator needs to know the bank is short; the candidate does not.
      console.error("[assessment/oir/attempt] the question bank is too small to start an attempt");
    }
    return failWith(result.failure);
  }

  return NextResponse.json(toCandidateFacingAttempt(result.value, new Date()), {
    status: 201,
    headers: NO_STORE,
  });
}

export async function GET() {
  const caller = await requireCandidate("read");
  if (!caller.ok) return caller.response;

  const result = await currentAttempt(caller.candidateRef);
  if (!result.ok) return failWith(result.failure);

  return NextResponse.json(toCandidateFacingAttempt(result.value, new Date()), {
    headers: NO_STORE,
  });
}
