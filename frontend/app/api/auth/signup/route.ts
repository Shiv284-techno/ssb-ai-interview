import "server-only";

import { randomBytes, scrypt } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Signup. The plaintext password never leaves this handler: it is hashed here
 * and only the hash is sent to Apps Script. Nothing in this file logs the
 * password or the hash, and the success response is built field by field so a
 * `password_hash` column can never be echoed back to the browser.
 */

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const APPS_SCRIPT_TIMEOUT_MS = 15_000;

/**
 * scrypt parameters. They are stored inside every hash, so raising the cost
 * later does not invalidate existing passwords — verification reads the
 * parameters back out of the stored string.
 */
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SALT_BYTES = 16;

interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

interface SafeUser {
  user_id: string;
  email: string;
  name: string;
  created_at: string;
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        // Default maxmem is 32 MiB; 128 * N * r is ~16 MiB, so leave headroom.
        maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

/**
 * Encodes as `scrypt$N$r$p$salt$hash` with base64 salt and key. Login verifies
 * by splitting on `$`, re-deriving with the stored parameters and salt, and
 * comparing with `crypto.timingSafeEqual` on the decoded buffers — never with
 * `===`, which leaks timing.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join("$");
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

type ParseResult =
  | { ok: true; data: SignupRequest }
  | { ok: false; error: string };

function parseRequest(payload: unknown): ParseResult {
  const record = asRecord(payload);
  if (!record) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { name, email, password } = record;

  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, error: "Name is required." };
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    return { ok: false, error: "Name is too long." };
  }

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

  if (typeof password !== "string") {
    return { ok: false, error: "Password is required." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: "Password is too long." };
  }

  return {
    ok: true,
    data: { name: name.trim(), email: normalisedEmail, password },
  };
}

/** Apps Script wording varies; match the shapes a duplicate row can report as. */
const DUPLICATE_PATTERN =
  /duplicate|already[\s_-]*(exists|registered|taken|in[\s_-]*use)|email[\s_-]*exists|user[\s_-]*exists/i;

type CreateUserResult =
  | { ok: true; user: SafeUser }
  | { ok: false; status: 409 | 502; error: string };

/**
 * Tolerates both `{ success, user: {...} }` and a flat `{ user_id, ... }`
 * response, since the Apps Script contract is owned elsewhere.
 */
function extractUser(
  record: Record<string, unknown>,
  fallback: { email: string; name: string },
): SafeUser | null {
  for (const candidate of [record.user, record.data, record]) {
    const source = asRecord(candidate);
    if (!source) continue;

    const userId = readString(source, "user_id", "userId", "id");
    if (!userId) continue;

    return {
      user_id: userId,
      email: readString(source, "email") ?? fallback.email,
      name: readString(source, "name") ?? fallback.name,
      // Apps Script writes created_at; fall back only if it does not return it.
      created_at:
        readString(source, "created_at", "createdAt") ??
        new Date().toISOString(),
    };
  }

  return null;
}

async function createUser(
  endpoint: string,
  body: { action: "createUser"; email: string; password_hash: string; name: string },
  fallback: { email: string; name: string },
): Promise<CreateUserResult> {
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
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(APPS_SCRIPT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[signup] account service HTTP status", response.status);
      return upstreamError;
    }

    raw = await response.text();
  } catch {
    console.error("[signup] account service request failed");
    return upstreamError;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Apps Script returns an HTML error page when the script itself throws.
    console.error("[signup] account service returned a non-JSON response");
    return upstreamError;
  }

  const record = asRecord(parsed);
  if (!record) return upstreamError;

  if (record.success !== false) {
    const user = extractUser(record, fallback);
    if (user) return { ok: true, user };
  }

  const message = readString(record, "error", "message", "reason", "code");
  if (message && DUPLICATE_PATTERN.test(message)) {
    return {
      ok: false,
      status: 409,
      error: "An account with that email already exists.",
    };
  }

  console.error("[signup] account service rejected the request");
  return upstreamError;
}

export async function POST(request: Request) {
  const endpoint = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!endpoint) {
    // Never name the variable or the URL in the response body.
    console.error("[signup] GOOGLE_APPS_SCRIPT_URL is not set");
    return NextResponse.json(
      { error: "Account creation is not available right now." },
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

  const { name, email, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);

    const result = await createUser(
      endpoint,
      {
        action: "createUser",
        email,
        password_hash: passwordHash,
        name,
      },
      { email, name },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    // Built field by field — never spread the upstream row, which holds the hash.
    return NextResponse.json(
      {
        success: true,
        user: {
          user_id: result.user.user_id,
          email: result.user.email,
          name: result.user.name,
          created_at: result.user.created_at,
        },
      },
      { status: 201 },
    );
  } catch {
    console.error("[signup] unexpected failure while creating the account");
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
