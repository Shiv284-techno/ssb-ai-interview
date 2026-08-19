import "server-only";

import { NextResponse } from "next/server";

import { verifySession } from "@/lib/auth/dal";
import {
  deliverOirBank,
  deliverOirSet,
  OIR_SETS,
  type DeliveredOirBank,
  type DeliveredOirSet,
} from "@/lib/assessment/oir/delivery";

/**
 * OIR question delivery.
 *
 *   GET /api/assessment/oir/questions
 *     -> { questionCount, questions: DeliveredOirQuestion[] }   (every set)
 *   GET /api/assessment/oir/questions?set=1
 *     -> { setNumber, questionCount, questions: DeliveredOirQuestion[] }
 *
 * Transport only. It authenticates the caller, checks the query, and hands back
 * whatever `deliverOirSet` built. It contains no projection logic of its own:
 * if the shape a candidate receives is ever wrong, there is exactly one file to
 * look in, and it is not this one.
 *
 * The answer keys, explanations, provenance, curations and source pages all
 * live in the bank and stop there. Nothing on this path can reach them, because
 * the only thing this route can call is the delivery mapping.
 *
 * The attempt service owns pacing, timing and which fifty questions a
 * candidate actually sits. This route deliberately returns the whole verified
 * bank in source order and does no selection: the served questions are pinned
 * in the attempt, the client resolves them by id, and a delivery boundary that
 * also chose questions would be a second place selection could disagree with
 * itself.
 *
 * Omitting `set` returns every ingested set combined, which is what a paper
 * drawn from the whole bank needs. Naming a set still returns that set alone —
 * kept because it is how a set is inspected on its own, and it costs nothing.
 */

/** Ingested sets. A request for any other is a 404, not an error. */
const AVAILABLE_SETS: readonly number[] = OIR_SETS;

/** The only ordering on offer. Named so a future one has to be added on purpose. */
const ORDERINGS: readonly string[] = ["source"];

function fail(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function GET(request: Request) {
  // 1. Authenticate first. The user id is never bound to a variable: this route
  //    has no use for it, and what is not held cannot be logged or returned.
  let isAuthenticated: boolean;
  try {
    isAuthenticated = (await verifySession()) !== null;
  } catch {
    // A misconfigured signing secret is a server fault, not a failed login.
    console.error("[assessment/oir/questions] session verification failed");
    return fail("Could not verify your session. Please try again.", 500);
  }
  if (!isAuthenticated) return fail("Not authenticated.", 401);

  // 2. Validate the query. Anything unrecognised is refused rather than
  //    ignored, so a typo cannot silently return something else.
  const url = new URL(request.url);
  for (const name of url.searchParams.keys()) {
    if (name !== "set" && name !== "order") {
      return fail("Unsupported query parameter.", 400);
    }
  }

  const rawSet = url.searchParams.get("set");
  let setNumber: number | null = null;
  if (rawSet !== null) {
    if (!/^[0-9]{1,2}$/.test(rawSet)) return fail("Invalid set.", 400);
    setNumber = Number(rawSet);
    if (!AVAILABLE_SETS.includes(setNumber)) return fail("No such set.", 404);
  }

  const order = url.searchParams.get("order");
  if (order !== null && !ORDERINGS.includes(order)) {
    return fail("Unsupported ordering.", 400);
  }

  // 3. Build the response. `deliverOirSet` reads the bank, which revalidates
  //    the content and refuses to serve a question whose answer cannot be
  //    resolved — so a corrupt bank fails here rather than reaching a candidate.
  let body: DeliveredOirSet | DeliveredOirBank;
  try {
    body = setNumber === null ? deliverOirBank() : deliverOirSet(setNumber);
  } catch {
    // The underlying message can name internal paths, so it is not forwarded.
    console.error("[assessment/oir/questions] the content bank could not be served");
    return fail("The question bank is unavailable.", 503);
  }

  return NextResponse.json(body, {
    // Tied to a session, so never storable by a shared cache.
    headers: { "Cache-Control": "private, no-store" },
  });
}
