import "server-only";

import { NextResponse } from "next/server";

import { verifySession } from "@/lib/auth/dal";
import { readOirFigure } from "@/lib/assessment/oir/assets";
import { mediaAssetId } from "@/lib/assessment/types";

/**
 * OIR figure delivery.
 *
 *   GET /api/assessment/oir/media/<mediaId>?set=1
 *     -> image/png
 *
 * The figures live in `content/oir/`, outside the Next application root, and
 * are deliberately not in `public/`: a diagram is part of a test, and a test
 * that can be downloaded without signing in is not much of a test.
 *
 * The path the client controls is a media id and nothing else. It is parsed by
 * `mediaAssetId`, whose pattern admits only `<name>.<digits>` — no separators,
 * no dots beyond the one, no scheme, no leading slash — and it is then looked up
 * in the bank's media map. A path is produced from what the bank stores, never
 * from the request, so `..`, an absolute path and a URL are all simply ids that
 * do not exist.
 *
 * This route returns bytes and nothing else. It never touches the question
 * record, so no answer key, explanation or provenance can leave through it.
 */

const AVAILABLE_SETS: readonly number[] = [1];

function fail(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  // 1. Authenticate before anything else is read or resolved.
  let isAuthenticated: boolean;
  try {
    isAuthenticated = (await verifySession()) !== null;
  } catch {
    console.error("[assessment/oir/media] session verification failed");
    return fail("Could not verify your session. Please try again.", 500);
  }
  if (!isAuthenticated) return fail("Not authenticated.", 401);

  // 2. Which set. Same allowlist as the question route.
  const url = new URL(request.url);
  for (const name of url.searchParams.keys()) {
    if (name !== "set") return fail("Unsupported query parameter.", 400);
  }
  const rawSet = url.searchParams.get("set");
  let setNumber = AVAILABLE_SETS[0];
  if (rawSet !== null) {
    if (!/^[0-9]{1,2}$/.test(rawSet)) return fail("Invalid set.", 400);
    setNumber = Number(rawSet);
    if (!AVAILABLE_SETS.includes(setNumber)) return fail("No such media.", 404);
  }

  // 3. Parse the id. A malformed id is a bad request; a well-formed id that
  //    names nothing is a miss. Keeping the two apart means a caller learns
  //    only whether their id was syntactically valid, never what exists.
  const { mediaId: raw } = await context.params;
  let id;
  try {
    id = mediaAssetId(raw);
  } catch {
    return fail("Invalid media id.", 400);
  }

  let asset;
  try {
    asset = readOirFigure(setNumber, id);
  } catch {
    // The bank and the content tree disagree — a deployment fault. The
    // underlying message can name a path, so it is not forwarded.
    console.error("[assessment/oir/media] a registered figure could not be read");
    return fail("That figure is unavailable.", 503);
  }
  if (!asset) return fail("No such media.", 404);

  // 4. Bytes only. No filename, so no internal path is disclosed by the
  //    Content-Disposition header either.
  return new NextResponse(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.bytes.byteLength),
      // Cacheable by the candidate's own browser, never by a shared cache.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
