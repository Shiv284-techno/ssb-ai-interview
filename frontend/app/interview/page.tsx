import { redirect } from "next/navigation";

import { InterviewRoom } from "@/components/interview/interview-room";
import { verifySession } from "@/lib/auth/dal";

/**
 * Server-side gate. The session is read from the signed HttpOnly cookie and
 * verified before anything renders — the browser never supplies a user id, and
 * the interview components stay unaware of authentication entirely.
 */
export default async function InterviewPage() {
  const session = await verifySession();
  if (!session) redirect("/login");

  return <InterviewRoom />;
}
