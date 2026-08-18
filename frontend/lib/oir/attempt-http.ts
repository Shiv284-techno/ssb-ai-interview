import "server-only";

/**
 * The pieces the three attempt routes share: who is calling, and how a service
 * failure becomes a status code and a sentence.
 *
 * Kept out of the route files because a Next route module is expected to export
 * request handlers and nothing else, and because three routes agreeing on what
 * "409" means is easier to guarantee in one file than in three.
 */
import { NextResponse } from "next/server";

import type { AttemptFailure } from "@/lib/oir/attempt-service";
import { candidateRefFor } from "@/lib/oir/candidate-ref";
import { verifySession } from "@/lib/auth/dal";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export function failureStatus(failure: AttemptFailure): number {
  switch (failure) {
    // The request was valid; the deployment cannot honour it yet.
    case "insufficient-bank":
    case "store-unavailable":
      return 503;
    // The attempt is not in a state that permits this.
    case "already-active":
    case "not-active":
    case "expired":
    case "conflict":
      return 409;
    case "not-found":
      return 404;
    case "unknown-question":
    case "invalid-answer":
      return 400;
  }
}

/**
 * What a candidate is told.
 *
 * Deliberately incurious. "insufficient-bank" carries an internal detail naming
 * exact question counts, which belongs in a server log for an operator rather
 * than in a reply to whoever asked.
 */
const MESSAGES: Readonly<Record<AttemptFailure, string>> = {
  "insufficient-bank": "The assessment is not available yet.",
  "already-active": "You already have an attempt in progress.",
  "not-found": "No attempt in progress.",
  "not-active": "That attempt is already finished.",
  expired: "Your time has run out.",
  "unknown-question": "That question is not part of your attempt.",
  "invalid-answer": "That answer could not be read.",
  conflict: "Your attempt changed elsewhere. Reload and try again.",
  "store-unavailable": "The assessment service is unavailable.",
};

export function failWith(failure: AttemptFailure): NextResponse {
  return NextResponse.json({ error: MESSAGES[failure] }, { status: failureStatus(failure) });
}

export type Caller =
  | { readonly ok: true; readonly candidateRef: string }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * Resolves the caller to an opaque reference.
 *
 * Identity comes from the signed session and nowhere else — not a body, not a
 * query parameter, not a header. The account id stops here: what continues into
 * the service and the store is a keyed hash of it.
 */
export async function requireCandidate(route: string): Promise<Caller> {
  let session: Awaited<ReturnType<typeof verifySession>>;
  try {
    session = await verifySession();
  } catch {
    console.error("[assessment/oir/attempt] session verification failed");
    return { ok: false, response: serverFault() };
  }
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    };
  }

  try {
    return { ok: true, candidateRef: candidateRefFor(session.userId) };
  } catch {
    console.error("[assessment/oir/attempt] the candidate reference could not be derived");
    void route;
    return { ok: false, response: serverFault() };
  }
}

function serverFault(): NextResponse {
  return NextResponse.json(
    { error: "Could not verify your session. Please try again." },
    { status: 500 },
  );
}
