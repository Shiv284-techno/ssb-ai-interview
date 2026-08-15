import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth/session";

/**
 * Logout. The handler takes no request parameter at all: there is nothing in
 * the body worth reading, and the session being cleared is the one carried by
 * the cookie, never an identity the caller claims. Only POST is exported, so
 * every other method gets a 405 from Next.
 */
export async function POST() {
  try {
    await destroySession();
  } catch {
    // The underlying error never reaches the browser.
    console.error("[logout] could not clear the session cookie");
    return NextResponse.json(
      { error: "Could not log out. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
