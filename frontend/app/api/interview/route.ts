import "server-only";

import { NextResponse } from "next/server";

import { verifySession } from "@/lib/auth/dal";
import { runTurn } from "@/lib/interview/engine/engine";
import { mockInterviewerProvider } from "@/lib/interview/engine/providers/mock";
import { deriveState, type InterviewTurn } from "@/lib/interview/engine/state";

/**
 * Transport for the interviewing officer. This handler authenticates the
 * caller, validates the request, and writes the response; it decides nothing
 * about the interview itself. The conversation lives in `lib/interview/engine`,
 * and the provider below is the single line that changes when a real model
 * replaces the deterministic mock.
 *
 * The wire contract for an authenticated caller is unchanged:
 *   POST { turns: InterviewTurn[], elapsedSeconds: number }
 *     ->  { question: string, isClosing: boolean }
 */

const provider = mockInterviewerProvider;

interface InterviewRequest {
  turns: InterviewTurn[];
  elapsedSeconds: number;
}

interface InterviewResponse {
  question: string;
  isClosing: boolean;
}

function isTurn(value: unknown): value is InterviewTurn {
  if (typeof value !== "object" || value === null) return false;

  const { role, text } = value as { role?: unknown; text?: unknown };
  return (role === "officer" || role === "candidate") && typeof text === "string";
}

type ParseResult =
  | { ok: true; data: InterviewRequest }
  | { ok: false; error: string };

function parseRequest(payload: unknown): ParseResult {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { turns, elapsedSeconds } = payload as {
    turns?: unknown;
    elapsedSeconds?: unknown;
  };

  if (!Array.isArray(turns)) {
    return { ok: false, error: "`turns` must be an array." };
  }

  if (!turns.every(isTurn)) {
    return {
      ok: false,
      error:
        '`turns` entries must be { role: "officer" | "candidate", text: string }.',
    };
  }

  if (typeof elapsedSeconds !== "number" || !Number.isFinite(elapsedSeconds)) {
    return { ok: false, error: "`elapsedSeconds` must be a finite number." };
  }

  if (elapsedSeconds < 0) {
    return { ok: false, error: "`elapsedSeconds` must not be negative." };
  }

  if (!turns.some((turn) => turn.role === "candidate")) {
    return {
      ok: false,
      error: "`turns` must contain at least one candidate turn to follow up on.",
    };
  }

  return { ok: true, data: { turns, elapsedSeconds } };
}

export async function POST(request: Request) {
  // Authenticate before anything else, so an unauthenticated caller never
  // reaches request parsing or the interviewer. Only the fact that a valid
  // session exists is kept — the user id is deliberately not bound to a
  // variable, so it cannot reach the engine, the provider, or the response.
  let isAuthenticated: boolean;
  try {
    isAuthenticated = (await verifySession()) !== null;
  } catch {
    // A misconfigured signing secret is a server fault, not a failed login;
    // reporting it as 401 would tell every visitor they are signed out. The
    // underlying error never reaches the browser.
    console.error("[interview] session verification failed");
    return NextResponse.json(
      { error: "Could not verify your session. Please try again." },
      { status: 500 },
    );
  }

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseRequest(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const state = deriveState(parsed.data.turns, parsed.data.elapsedSeconds);
  const result = await runTurn(state, provider);

  // Built field by field so nothing internal to the engine can leak out.
  const body: InterviewResponse = {
    question: result.question,
    isClosing: result.isClosing,
  };

  return NextResponse.json(body);
}
