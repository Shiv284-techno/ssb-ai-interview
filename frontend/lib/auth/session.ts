import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

/**
 * Signed session cookie. The token carries only a user id and its own validity
 * window — no email, name, or password material — and is authenticated with
 * HMAC-SHA256 before its payload is ever parsed. Nothing here logs the token,
 * the secret, or any user data.
 *
 * `createSession` and `destroySession` write a cookie, so they may only be
 * called from a Route Handler or a Server Action. `getSession` only reads, so
 * it is safe anywhere on the server, including during a page render.
 */

/** Deliberately non-obvious; it does not name the framework or the purpose. */
export const SESSION_COOKIE_NAME = "ssb_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MIN_SECRET_LENGTH = 32;
/** Tolerance for a slightly fast clock on the issuing machine. */
const CLOCK_SKEW_SECONDS = 60;

export interface Session {
  userId: string;
}

interface SessionPayload {
  userId: string;
  /** Issued at, seconds since the epoch. */
  iat: number;
  /** Expires at, seconds since the epoch. */
  exp: number;
}

/**
 * Throws rather than returning null, so a misconfigured server fails loudly
 * instead of quietly behaving as though every visitor is signed out. The secret
 * value never appears in the message.
 */
function requireSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters.`,
    );
  }

  return secret;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sign(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function readPayload(payloadPart: string): SessionPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { userId, iat, exp } = parsed as Record<string, unknown>;

  if (typeof userId !== "string" || userId.trim().length === 0) return null;
  if (!isPositiveInteger(iat) || !isPositiveInteger(exp)) return null;
  if (exp <= iat) return null;

  const now = nowInSeconds();
  if (iat > now + CLOCK_SKEW_SECONDS) return null; // issued in the future
  if (exp <= now) return null; // expired

  return { userId, iat, exp };
}

/**
 * Verifies `base64url(payload).base64url(signature)`. The signature is checked
 * with `timingSafeEqual` **before** the payload is parsed, so untrusted JSON is
 * never decoded on an unauthenticated token.
 */
function verifyToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadPart, signaturePart] = parts;
  if (payloadPart.length === 0 || signaturePart.length === 0) return null;

  const expected = Buffer.from(sign(payloadPart, requireSecret()), "base64url");
  const provided = Buffer.from(signaturePart, "base64url");

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return readPayload(payloadPart);
}

/** Issues a signed token and stores it in an httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const trimmedUserId = userId.trim();
  if (trimmedUserId.length === 0) {
    throw new Error("createSession requires a non-empty userId.");
  }

  const issuedAt = nowInSeconds();
  const payload: SessionPayload = {
    userId: trimmedUserId,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
  };

  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const token = `${payloadPart}.${sign(payloadPart, requireSecret())}`;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Returns the signed-in user, or null when the cookie is absent or invalid. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  return payload ? { userId: payload.userId } : null;
}

/** Expires the cookie by overwriting it with the same attributes and maxAge 0. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
