import "server-only";

import { NextResponse } from "next/server";

import { toCandidateFacingAttempt } from "@/lib/oir/attempt";
import { failWith, NO_STORE, requireCandidate } from "@/lib/oir/attempt-http";
import { saveAnswer } from "@/lib/oir/attempt-service";

/**
 * Recording one answer.
 *
 *   PUT /api/assessment/oir/attempt/response
 *     { attemptId, questionId, answer }
 *       -> the whole attempt, as the candidate may see it
 *
 * PUT rather than POST because saving the same answer twice must leave the same
 * state: a candidate changing their mind, or a flaky connection retrying, both
 * end with one answer recorded against one question.
 *
 * Three things the body may claim and the server never reads: when the attempt
 * started, when it expires, and how many seconds remain. None of them are
 * parsed here, and the service derives all three from the stored attempt, so a
 * forged timestamp has nowhere to land.
 */

interface SaveRequest {
  readonly attemptId: string;
  readonly questionId: string;
  readonly answer: unknown;
}

function parse(payload: unknown): SaveRequest | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const { attemptId, questionId } = record;
  if (typeof attemptId !== "string" || attemptId.length === 0 || attemptId.length > 100) return null;
  if (typeof questionId !== "string" || questionId.length === 0 || questionId.length > 100) return null;
  // `answer` is passed through unvalidated on purpose: its shape depends on the
  // question, so the service checks it against what that question shows.
  if (!("answer" in record)) return null;
  return { attemptId, questionId, answer: record.answer };
}

export async function PUT(request: Request) {
  const caller = await requireCandidate("save");
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

  const parsed = parse(payload);
  if (!parsed) {
    return NextResponse.json({ error: "The request body is not valid." }, { status: 400 });
  }

  const result = await saveAnswer({
    attemptId: parsed.attemptId,
    candidateRef: caller.candidateRef,
    questionId: parsed.questionId,
    answer: parsed.answer,
  });
  if (!result.ok) return failWith(result.failure);

  return NextResponse.json(toCandidateFacingAttempt(result.value, new Date()), {
    headers: NO_STORE,
  });
}
