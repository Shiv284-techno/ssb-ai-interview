import { redirect } from "next/navigation";

import { PiqFlow } from "@/components/profile/piq-flow";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Server-side gate for the PIQ upload, matching the interview room: the signed
 * session cookie is verified here and the profile resolved from it, so the
 * browser never supplies an identity.
 *
 * Only the display name crosses to the client — `user_id` and `email` stay on
 * the server rather than being serialised into the RSC payload.
 */
export default async function PiqPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <PiqFlow candidateName={user.name} />;
}
