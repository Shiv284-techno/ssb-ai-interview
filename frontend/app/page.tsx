import { redirect } from "next/navigation";

import { verifySession } from "@/lib/auth/dal";

/**
 * Entry point only — it renders nothing itself. Routing the interview room
 * through `/interview` keeps a single protected page rather than leaving a
 * second, unguarded copy of it at the root.
 */
export default async function Home() {
  const session = await verifySession();

  if (!session) {
    redirect("/login");
  }

  redirect("/interview");
}
