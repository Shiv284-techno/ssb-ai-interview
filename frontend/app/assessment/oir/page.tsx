import { redirect } from "next/navigation";

import { OirFlow } from "@/components/assessment/oir/oir-flow";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Server-side gate for the OIR assessment, matching the interview room and the
 * PIQ upload: the signed session cookie is verified here and the profile
 * resolved from it, so the browser never supplies an identity.
 *
 * Only the display name crosses to the client — `user_id` and `email` stay on
 * the server rather than being serialised into the RSC payload. The attempt
 * itself is not fetched here either: the client asks for it, and the API
 * derives the candidate from the same session, so there is exactly one place
 * that decides whose attempt this is.
 */
export default async function OirAssessmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <OirFlow candidateName={user.name} />;
}
