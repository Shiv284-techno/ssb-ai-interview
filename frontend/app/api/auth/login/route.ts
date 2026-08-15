import "server-only";

import { scrypt, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth/session";

/**
 * Login. Every authentication failure — unknown email, wrong password, or a
 * stored hash we cannot parse — returns the same 401 body, and the same scrypt
 * work is performed either way so response timing does not reveal whether an
 * account exists. Nothing here logs the password, the hash, or the service URL.
 */

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const APPS_SCRIPT_TIMEOUT_MS = 15_000;

/** Same defaults signup writes with; used only for the timing-equalising hash. */
const DEFAULT_N = 16_384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const DEFAULT_KEY_LENGTH = 64;
/** Fixed, non-secret salt — the result is discarded. */
const DUMMY_SALT = Buffer.alloc(16, 7);

/** Bounds on stored parameters, so a corrupt row cannot exhaust memory. */
const MIN_N = 2;
const MAX_N = 1 << 20;
const MAX_R = 32;
const MAX_P = 16;
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 128;
const MAX_SCRYPT_MEMORY = 256 * 1024 * 1024;

const AUTH_FAILURE = "Invalid email or password.";

interface StoredHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  params: { n: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: params.n,
        r: params.r,
        p: params.p,
        maxmem: Math.max(32 * 1024 * 1024, 128 * params.n * params.r * 2),
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Parses `scrypt$N$r$p$salt-base64$hash-base64`, rejecting anything unusable. */
function parseStoredHash(encoded: string): StoredHash | null {
  const parts = encoded.split("$");
  if (parts.length !== 6) return null;

  const [scheme, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  if (scheme !== "scrypt") return null;

  const n = parsePositiveInt(rawN);
  const r = parsePositiveInt(rawR);
  const p = parsePositiveInt(rawP);
  if (n === null || r === null || p === null) return null;

  // N must be a power of two, and the work must stay within a sane budget.
  if (n < MIN_N || n > MAX_N || (n & (n - 1)) !== 0) return null;
  if (r > MAX_R || p > MAX_P) return null;
  if (128 * n * r > MAX_SCRYPT_MEMORY) return null;

  let salt: Buffer;
  let hash: Buffer;
  try {
    salt = Buffer.from(rawSalt, "base64");
    hash = Buffer.from(rawHash, "base64");
  } catch {
    return null;
  }

  if (salt.length < 8 || salt.length > 64) return null;
  if (hash.length < MIN_KEY_LENGTH || hash.length > MAX_KEY_LENGTH) return null;

  return { n, r, p, salt, hash };
}

/**
 * Re-derives with the parameters stored alongside the hash and compares with
 * `timingSafeEqual` — never `===`, which short-circuits and leaks timing.
 */
async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const stored = parseStoredHash(encoded);
  if (!stored) return false;

  const derivedKey = await scryptAsync(password, stored.salt, stored.hash.length, {
    n: stored.n,
    r: stored.r,
    p: stored.p,
  });

  // timingSafeEqual throws on a length mismatch; the key length comes from the
  // stored hash, so they always match here, but guard rather than throw.
  if (derivedKey.length !== stored.hash.length) return false;

  return timingSafeEqual(derivedKey, stored.hash);
}

/** Burns comparable scrypt time when there is no stored hash to check. */
async function equaliseTiming(password: string): Promise<void> {
  try {
    await scryptAsync(password, DUMMY_SALT, DEFAULT_KEY_LENGTH, {
      n: DEFAULT_N,
      r: DEFAULT_R,
      p: DEFAULT_P,
    });
  } catch {
    // The result is discarded either way.
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  source: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

interface LoginRequest {
  email: string;
  password: string;
}

type ParseResult =
  | { ok: true; data: LoginRequest }
  | { ok: false; error: string };

function parseRequest(payload: unknown): ParseResult {
  const record = asRecord(payload);
  if (!record) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { email, password } = record;

  if (typeof email !== "string" || email.trim().length === 0) {
    return { ok: false, error: "Email is required." };
  }

  const normalisedEmail = email.trim().toLowerCase();
  if (normalisedEmail.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: "Email is too long." };
  }
  if (!EMAIL_PATTERN.test(normalisedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "Password is required." };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: "Password is too long." };
  }

  return { ok: true, data: { email: normalisedEmail, password } };
}

interface StoredUser {
  user_id: string;
  email: string | null;
  name: string | null;
  password_hash: string;
}

/** A row is only usable if it carries both an id and a stored hash. */
function extractUser(record: Record<string, unknown>): StoredUser | null {
  for (const candidate of [record.user, record.data, record]) {
    const source = asRecord(candidate);
    if (!source) continue;

    const userId = readString(source, "user_id", "userId", "id");
    const passwordHash = readString(source, "password_hash", "passwordHash");
    if (!userId || !passwordHash) continue;

    return {
      user_id: userId,
      email: readString(source, "email"),
      name: readString(source, "name"),
      password_hash: passwordHash,
    };
  }

  return null;
}

/** Wording for "no such row" varies; anything else is treated as a failure. */
const NOT_FOUND_PATTERN =
  /not[\s_-]*found|no[\s_-]*(such[\s_-]*)?(user|account|row|match)|does[\s_-]*not[\s_-]*exist|unknown[\s_-]*(user|email)/i;

type LookupResult =
  | { ok: true; user: StoredUser | null }
  | { ok: false; status: 502; error: string };

async function findUser(
  endpoint: string,
  email: string,
): Promise<LookupResult> {
  const upstreamError = {
    ok: false as const,
    status: 502 as const,
    error: "The account service is unavailable. Please try again.",
  };

  let raw: string;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "findUser", email }),
      cache: "no-store",
      signal: AbortSignal.timeout(APPS_SCRIPT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[login] account service HTTP status", response.status);
      return upstreamError;
    }

    raw = await response.text();
  } catch {
    console.error("[login] account service request failed");
    return upstreamError;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Apps Script serves an HTML error page when the script itself throws.
    console.error("[login] account service returned a non-JSON response");
    return upstreamError;
  }

  const record = asRecord(parsed);
  if (!record) return upstreamError;

  const user = extractUser(record);
  if (user) return { ok: true, user };

  // No usable row. Distinguish "no such user" from a genuine upstream failure.
  const message = readString(record, "error", "message", "reason", "code");
  if (message && !NOT_FOUND_PATTERN.test(message)) {
    console.error("[login] account service reported a failure");
    return upstreamError;
  }

  return { ok: true, user: null };
}

export async function POST(request: Request) {
  const endpoint = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!endpoint) {
    // Never name or echo the configured URL.
    console.error("[login] account service URL is not configured");
    return NextResponse.json(
      { error: "Sign-in is not available right now." },
      { status: 500 },
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

  const { email, password } = parsed.data;

  try {
    const lookup = await findUser(endpoint, email);
    if (!lookup.ok) {
      return NextResponse.json(
        { error: lookup.error },
        { status: lookup.status },
      );
    }

    if (!lookup.user) {
      // Unknown email: do the same work a real check would before answering.
      await equaliseTiming(password);
      return NextResponse.json({ error: AUTH_FAILURE }, { status: 401 });
    }

    const isValid = await verifyPassword(password, lookup.user.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: AUTH_FAILURE }, { status: 401 });
    }

    // Reached only after the password verified — never for an unknown email, a
    // wrong password, or a stored hash we could not parse. createSession owns
    // the cookie entirely; this route never touches Set-Cookie itself.
    try {
      await createSession(lookup.user.user_id);
    } catch {
      // e.g. AUTH_SESSION_SECRET missing. Never report success without a session.
      console.error("[login] could not start a session");
      return NextResponse.json(
        { error: "Could not start your session. Please try again." },
        { status: 500 },
      );
    }

    // Built field by field — never spread the stored row, which holds the hash.
    return NextResponse.json({
      success: true,
      user: {
        user_id: lookup.user.user_id,
        email: lookup.user.email ?? email,
        name: lookup.user.name ?? "",
      },
    });
  } catch {
    console.error("[login] unexpected failure while signing in");
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
