import "server-only";

import { NextResponse } from "next/server";

import { verifySession } from "@/lib/auth/dal";
import { parsePIQText } from "@/lib/interview/profile/piq-parser";
import { extractPIQPdf } from "@/lib/interview/profile/pdf/piq-pdf";
import type { CandidateProfile } from "@/lib/interview/profile/profile";

/**
 * PIQ upload. Transport only: it authenticates the caller, validates the
 * upload, hands the bytes to the existing extraction and parsing pipeline, and
 * writes a controlled response. It knows nothing about PDF geometry or about
 * the questionnaire — those live in `lib/interview/profile`.
 *
 *   POST multipart/form-data with one "file" part
 *     -> { profile: CandidateProfile, extraction: { pageCount, tablesReconstructed } }
 *
 * A PIQ is one of the most sensitive documents this application will ever
 * handle: it carries the candidate's name, date of birth, both addresses, their
 * parents' names, occupations, and incomes. So nothing here logs the file, its
 * name, its text, or any field parsed out of it; the bytes are never written to
 * disk; and no error message ever quotes the document. The only things this
 * file writes to the console are fixed strings that name a failure category.
 *
 * The upload is also never trusted for identity. Who the candidate is comes
 * from the signed session cookie and nowhere else — not a form field, not a
 * query parameter, not the PDF.
 */

/**
 * 8 MiB.
 *
 * The blank reference form is four pages and 0.54 MB, most of which is its
 * embedded logo. A filled form adds text, and a form that has been printed,
 * signed, and re-scanned adds page images — so the ceiling has to clear the
 * reference by a wide margin without letting a single request pin an arbitrary
 * amount of server memory, because the whole file is buffered to be parsed.
 * Eight MiB is roughly fifteen times the reference document and still small
 * enough that a handful of concurrent uploads cannot exhaust a small instance.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** The multipart field the browser must use. */
const FILE_FIELD = "file";

/** Every PDF begins with this; a declared MIME type alone proves nothing. */
const PDF_SIGNATURE = "%PDF-";

interface PiqUploadResponse {
  readonly profile: CandidateProfile;
  readonly extraction: {
    readonly pageCount: number;
    readonly tablesReconstructed: number;
  };
}

function fail(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** True when the first bytes are the PDF magic number. */
function hasPdfSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_SIGNATURE.length) return false;
  for (let index = 0; index < PDF_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PDF_SIGNATURE.charCodeAt(index)) return false;
  }
  return true;
}

export async function POST(request: Request) {
  // 1. Authenticate first, so an anonymous caller never reaches the parser.
  //    The user id is deliberately never bound to a variable: this route has no
  //    use for it, and what is not held cannot be logged or returned.
  let isAuthenticated: boolean;
  try {
    isAuthenticated = (await verifySession()) !== null;
  } catch {
    // A misconfigured signing secret is a server fault, not a failed login.
    console.error("[profile/piq] session verification failed");
    return fail("Could not verify your session. Please try again.", 500);
  }

  if (!isAuthenticated) {
    return fail("Not authenticated.", 401);
  }

  // 2. The document must arrive as a file upload. This is also what rejects a
  //    JSON body naming a remote URL, a filesystem path, or a base64 blob:
  //    there is no code path here that fetches or opens anything.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return fail("Content-Type must be multipart/form-data.", 415);
  }

  // 3. Refuse an oversized upload from its declared length before buffering it.
  //    Content-Length may be absent or untrue, so the real bytes are checked
  //    again below; this is only an early exit.
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES * 1.05) {
    return fail("That file is too large. The limit is 8 MB.", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    console.error("[profile/piq] multipart body could not be read");
    return fail("The upload could not be read. Please try again.", 400);
  }

  // 4. Exactly one file, under the expected field name.
  const parts = form.getAll(FILE_FIELD);
  if (parts.length === 0) {
    return fail("No file was uploaded.", 400);
  }
  if (parts.length > 1) {
    return fail("Upload exactly one PDF.", 400);
  }

  // Any other part carrying a file is rejected too, so a second document cannot
  // ride along under a different name.
  for (const [name, value] of form.entries()) {
    if (name !== FILE_FIELD && typeof value !== "string") {
      return fail("Upload exactly one PDF.", 400);
    }
  }

  const file = parts[0];
  // A string here is a URL, a path, or a base64 blob rather than an upload.
  if (typeof file === "string") {
    return fail("The PIQ must be uploaded as a file.", 400);
  }

  if (file.size === 0) {
    return fail("That file is empty.", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail("That file is too large. The limit is 8 MB.", 413);
  }

  // 5. A declared type that is present must be right; but it is only a claim,
  //    so the bytes themselves are checked next.
  if (file.type.length > 0 && file.type !== "application/pdf") {
    return fail("Upload a PDF file.", 415);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    console.error("[profile/piq] upload bytes could not be read");
    return fail("The upload could not be read. Please try again.", 400);
  }

  // Content-Length can lie; this is the size that actually arrived.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return fail("That file is too large. The limit is 8 MB.", 413);
  }
  if (bytes.byteLength === 0) {
    return fail("That file is empty.", 400);
  }
  if (!hasPdfSignature(bytes)) {
    return fail("That file is not a PDF.", 400);
  }

  // 6. The existing pipeline, unchanged: bytes -> positioned words -> normalised
  //    text -> CandidateProfile.
  let extraction: Awaited<ReturnType<typeof extractPIQPdf>>;
  try {
    extraction = await extractPIQPdf(bytes);
  } catch {
    // Damaged, encrypted, or otherwise unreadable. The underlying exception is
    // swallowed here: its message and stack can name internal paths, and on a
    // malformed document they can quote its contents.
    console.error("[profile/piq] the PDF could not be read");
    return fail("That PDF could not be read. Please upload the PIQ again.", 422);
  }

  if (extraction.pageCount === 0) {
    return fail("That PDF could not be read. Please upload the PIQ again.", 422);
  }

  let profile: CandidateProfile;
  try {
    profile = parsePIQText(extraction.text, {
      source: "piq-upload",
      // The parser never reads a clock, so the caller stamps the time.
      parsedAt: new Date().toISOString(),
    });
  } catch {
    console.error("[profile/piq] the extracted form could not be parsed");
    return fail("That PDF could not be read. Please upload the PIQ again.", 422);
  }

  // 7. Assembled field by field. The normalised full text is deliberately left
  //    out — the structured profile already carries everything the review step
  //    needs, and the raw text is the largest copy of the candidate's document.
  const body: PiqUploadResponse = {
    profile,
    extraction: {
      pageCount: extraction.pageCount,
      tablesReconstructed: extraction.tables.length,
    },
  };

  return NextResponse.json(body);
}
