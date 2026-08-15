import "server-only";

import { getSession } from "@/lib/auth/session";

/**
 * Data Access Layer for authentication.
 *
 * Every authorization decision goes through here rather than through a cookie
 * check in `proxy.ts`: proxy runs on prefetches too and can only see that a
 * cookie exists, while this module works from the HMAC-verified session. A user
 * id supplied by the browser is never trusted — the only id that reaches the
 * account service is the one carried inside the signed session token.
 */

const APPS_SCRIPT_TIMEOUT_MS = 15_000;

export interface VerifiedSession {
  userId: string;
}

export interface CurrentUser {
  user_id: string;
  email: string;
  name: string;
}

/**
 * Raised when the account service cannot answer. Distinct from a null return,
 * so an outage is never mistaken for "this visitor is signed out".
 */
export class UserLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserLookupError";
  }
}

/**
 * The authoritative auth check. Returns the verified user id, or null when the
 * cookie is missing, tampered with, or expired.
 *
 * A misconfigured `AUTH_SESSION_SECRET` throws rather than returning null, so a
 * broken deployment fails loudly instead of silently signing everyone out.
 */
export async function verifySession(): Promise<VerifiedSession | null> {
  const session = await getSession();
  if (!session) return null;

  return { userId: session.userId };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Resolves the signed-in user's profile.
 *
 * Returns null only in the two cases that genuinely mean "no user": there is no
 * valid session, or the account service reports `{ success: true, user: null }`.
 * Every other outcome — unreachable service, non-JSON body, unexpected shape —
 * throws `UserLookupError`, because returning null there would present an
 * outage to the caller as a logged-out visitor.
 *
 * Only `user_id`, `email`, and `name` are returned; the response is built field
 * by field so nothing else upstream sends can leak through.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await verifySession();
  if (!session) return null;

  const endpoint = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!endpoint) {
    // Never name or echo the configured URL.
    console.error("[dal] account service URL is not configured");
    throw new UserLookupError("The account service is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The id comes from the verified session, never from the request.
      body: JSON.stringify({
        action: "findUserById",
        user_id: session.userId,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(APPS_SCRIPT_TIMEOUT_MS),
    });
  } catch {
    console.error("[dal] account service request failed");
    throw new UserLookupError("The account service is unavailable.");
  }

  if (!response.ok) {
    console.error("[dal] account service HTTP status", response.status);
    throw new UserLookupError("The account service is unavailable.");
  }

  let raw: string;
  try {
    raw = await response.text();
  } catch {
    console.error("[dal] account service response could not be read");
    throw new UserLookupError("The account service is unavailable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Apps Script serves an HTML error page when the script itself throws.
    console.error("[dal] account service returned a non-JSON response");
    throw new UserLookupError("The account service returned an invalid response.");
  }

  const record = asRecord(parsed);
  if (!record) {
    console.error("[dal] account service returned an unexpected payload");
    throw new UserLookupError("The account service returned an invalid response.");
  }

  if (record.success !== true) {
    // e.g. MISSING_USER_ID — a real failure, not an absent user.
    console.error("[dal] account service reported a failure");
    throw new UserLookupError("The account service rejected the lookup.");
  }

  // The documented "no such user" answer.
  if (record.user === null) return null;

  const user = asRecord(record.user);
  if (!user) {
    console.error("[dal] account service returned an unexpected user shape");
    throw new UserLookupError("The account service returned an invalid response.");
  }

  const userId = readRequiredString(user, "user_id");
  const email = readRequiredString(user, "email");
  // A blank name is legitimate; a non-string is not.
  const name = typeof user.name === "string" ? user.name : null;

  if (userId === null || email === null || name === null) {
    console.error("[dal] account service returned an incomplete user");
    throw new UserLookupError("The account service returned an invalid response.");
  }

  // Defence in depth: the row returned must be the one we asked for.
  if (userId.trim() !== session.userId.trim()) {
    console.error("[dal] account service returned a mismatched user");
    throw new UserLookupError("The account service returned an invalid response.");
  }

  return { user_id: userId, email, name };
}
