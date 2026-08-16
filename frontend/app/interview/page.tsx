import { redirect } from "next/navigation";

import { InterviewRoom } from "@/components/interview/interview-room";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Server-side gate. `getCurrentUser()` verifies the signed session cookie and
 * resolves the profile from it, so the browser never supplies an identity.
 *
 * Only the display name is handed to the client — `user_id` and `email` stay
 * on the server rather than being serialised into the RSC payload.
 */
export default async function InterviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <InterviewRoom candidateName={user.name} />;
}
