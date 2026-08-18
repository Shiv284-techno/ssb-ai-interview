import "server-only";

import { NextResponse } from "next/server";

import { toCandidateFacingAttempt } from "@/lib/oir/attempt";
import { failWith, NO_STORE, requireCandidate } from "@/lib/oir/attempt-http";
import { submitAttempt } from "@/lib/oir/attempt-service";

/**
 * Finishing an attempt.
 *
 *   POST /api/assessment/oir/attempt/submit
 *     { attemptId }
 *       -> the settled attempt, as the candidate may see it
 *
 * The submission time and reason are the server's to record. A body claiming
 * either is not read: `submittedAt` comes from the server clock, and the reason
 * is "candidate" here and "expired" only when the clock decided it.
 *
 * Submitting an already-settled attempt is refused rather than repeated, so the
 * first settlement stands and a double-click cannot rewrite when the paper was
 * handed in.
 */

function parse(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const { attemptId } = payload as Record<string, unknown>;
  if (typeof attemptId !== "string" || attemptId.length === 0 || attemptId.length > 100) return null;
  return attemptId;
}

export async function POST(request: Request) {
  const caller = await requireCandidate("submit");
  if (!caller.ok) return caller.response;

  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body could not be read." }, { status: 400 });
  }

  const attemptId = parse(payload);
  if (attemptId === null) {
    return NextResponse.json({ error: "The request body is not valid." }, { status: 400 });
  }

  const result = await submitAttempt({ attemptId, candidateRef: caller.candidateRef });
  if (!result.ok) return failWith(result.failure);

  return NextResponse.json(toCandidateFacingAttempt(result.value, new Date()), {
    headers: NO_STORE,
  });
}
