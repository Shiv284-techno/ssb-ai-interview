import "server-only";

/**
 * Turns a verified session into the opaque reference an attempt is stored under.
 *
 * The account id never reaches the attempt store. 4A's session model is explicit
 * that a candidate appears "only as an opaque CandidateRef — no name, no email,
 * no account id", and that whatever maps a reference back to a person stays
 * server-side. Honouring that here means the attempts sheet cannot be read as a
 * list of who sat what: it holds references, and only this function knows how a
 * reference was made.
 *
 * The mapping is a keyed hash rather than a random id because it has to be
 * derivable on every request from the session alone — there is nowhere to look
 * up "which reference belongs to this user" that would not itself be the
 * account-linking table this design avoids.
 *
 * The auth secret is reused, with a domain separator, so no second secret has
 * to be configured and rotated. The separator is what keeps a candidate
 * reference from ever colliding with a session signature.
 */
import { createHmac } from "node:crypto";

import { candidateRef, type CandidateRef } from "@/lib/assessment/types";

const DOMAIN = "ssb.oir.candidate-ref.v1:";
/** 160 bits of a SHA-256 tag: far beyond collision risk, short enough to store. */
const REF_LENGTH = 27;

export function candidateRefFor(userId: string): CandidateRef {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Never echo the secret or its length in a thrown message.
    console.error("[oir/candidate-ref] the session secret is not configured");
    throw new Error("The server is not configured to identify candidates.");
  }
  const digest = createHmac("sha256", secret).update(`${DOMAIN}${userId}`).digest("base64url");
  return candidateRef(digest.slice(0, REF_LENGTH));
}
