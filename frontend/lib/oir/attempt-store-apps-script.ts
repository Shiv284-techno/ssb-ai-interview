import "server-only";

/**
 * The Apps Script attempt store.
 *
 * Speaks the same protocol as the existing account service — POST a JSON body
 * carrying an `action`, receive `{ success: true, ... }` or
 * `{ success: false, error: "CODE" }` — so no new vendor, no new dependency and
 * no new deployment enter the project. The script functions this calls are in
 * `tools/apps-script/oir-attempts.gs.js`, to be added to the same deployment.
 *
 * Latency is the honest cost of this choice: every save is an HTTPS round trip
 * to Google, typically a few hundred milliseconds. That is why the service layer
 * writes one answer at a time and never blocks a read behind a write, and why
 * the expiry rule is derived from the stored `expiresAt` rather than from
 * whether a write happened to land in time.
 *
 * Nothing here logs an attempt, an answer, a candidate reference, or the
 * endpoint. The console strings are fixed.
 */
import {
  OirStoreConflict,
  OirStoreError,
  type OirAttemptStore,
} from "@/lib/oir/attempt-store";
import type { OirAttempt } from "@/lib/oir/attempt";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The attempt store may be pointed somewhere else than the account service —
 * a separate deployment, or a local stub under test — but defaults to the same
 * endpoint, because one script serving both is the intended arrangement.
 */
function endpoint(): string {
  const url = process.env.OIR_ATTEMPT_STORE_URL ?? process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!url) {
    // Never name or echo the configured URL.
    console.error("[oir/store] the attempt store URL is not configured");
    throw new OirStoreError("The attempt store is not configured.");
  }
  return url;
}

async function call(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    console.error("[oir/store] the attempt store request failed");
    throw new OirStoreError("The attempt store is unavailable.");
  }

  if (!response.ok) {
    console.error("[oir/store] the attempt store returned an HTTP error");
    throw new OirStoreError("The attempt store is unavailable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    // Apps Script serves an HTML error page when the script itself throws.
    console.error("[oir/store] the attempt store returned a non-JSON response");
    throw new OirStoreError("The attempt store returned an invalid response.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.error("[oir/store] the attempt store returned an unexpected payload");
    throw new OirStoreError("The attempt store returned an invalid response.");
  }

  const record = parsed as Record<string, unknown>;
  if (record.success !== true) {
    if (record.error === "REVISION_CONFLICT") throw new OirStoreConflict("stale revision");
    if (record.error === "ATTEMPT_ALREADY_ACTIVE") {
      throw new OirStoreConflict("the candidate already holds an unsettled attempt");
    }
    console.error("[oir/store] the attempt store reported a failure");
    throw new OirStoreError("The attempt store rejected the request.");
  }
  return record;
}

/**
 * Rebuilds an attempt from what the sheet returned.
 *
 * Validated rather than cast: the store is a spreadsheet, and a spreadsheet is
 * exactly the sort of place a value quietly becomes a Date or a number. An
 * attempt that does not parse is an error, never a partially-trusted object.
 */
function parseAttempt(value: unknown): OirAttempt {
  if (typeof value !== "string") throw new OirStoreError("The stored attempt is unreadable.");
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new OirStoreError("The stored attempt is unreadable.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new OirStoreError("The stored attempt is unreadable.");
  }
  const record = raw as Record<string, unknown>;

  const str = (key: string): string => {
    const found = record[key];
    if (typeof found !== "string" || found.length === 0) {
      throw new OirStoreError("The stored attempt is incomplete.");
    }
    return found;
  };
  const nullableStr = (key: string): string | null => {
    const found = record[key];
    if (found === null || found === undefined) return null;
    if (typeof found !== "string") throw new OirStoreError("The stored attempt is incomplete.");
    return found;
  };

  if (typeof record.revision !== "number" || !Number.isInteger(record.revision)) {
    throw new OirStoreError("The stored attempt is incomplete.");
  }
  if (!Array.isArray(record.questionIds) || !Array.isArray(record.answers)) {
    throw new OirStoreError("The stored attempt is incomplete.");
  }

  return {
    id: str("id"),
    candidateRef: str("candidateRef"),
    mode: str("mode") as OirAttempt["mode"],
    status: str("status") as OirAttempt["status"],
    questionIds: record.questionIds as OirAttempt["questionIds"],
    answers: record.answers as OirAttempt["answers"],
    startedAt: str("startedAt"),
    expiresAt: str("expiresAt"),
    submittedAt: nullableStr("submittedAt"),
    submissionReason: nullableStr("submissionReason") as OirAttempt["submissionReason"],
    revision: record.revision,
  };
}

export const appsScriptAttemptStore: OirAttemptStore = {
  async create(attempt) {
    await call("createOirAttempt", {
      attempt_id: attempt.id,
      candidate_ref: attempt.candidateRef,
      status: attempt.status,
      revision: attempt.revision,
      attempt: JSON.stringify(attempt),
    });
  },

  async findById(attemptId) {
    const record = await call("getOirAttempt", { attempt_id: attemptId });
    if (record.attempt === null || record.attempt === undefined) return null;
    return parseAttempt(record.attempt);
  },

  async findUnsettledFor(candidateRef) {
    const record = await call("getUnsettledOirAttempt", { candidate_ref: candidateRef });
    if (record.attempt === null || record.attempt === undefined) return null;
    return parseAttempt(record.attempt);
  },

  async update(attempt, expectedRevision) {
    await call("updateOirAttempt", {
      attempt_id: attempt.id,
      candidate_ref: attempt.candidateRef,
      status: attempt.status,
      revision: attempt.revision,
      expected_revision: expectedRevision,
      attempt: JSON.stringify(attempt),
    });
  },
};
