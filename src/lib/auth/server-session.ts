import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import { authenticateSession } from "@/modules/auth/application/sessions";

export async function currentPageSession() {
  const cookieStore = await cookies();
  return authenticateSession(getDatabase(), cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function requirePageSession() {
  const session = await currentPageSession();
  if (!session) redirect("/giris?next=/");
  return session;
}

export async function requireModerationPage() {
  const session = await requirePageSession();
  if (
    session.user.status !== "ACTIVE" ||
    (session.user.role !== "MODERATOR" && session.user.role !== "ADMIN")
  )
    redirect("/yasak");
  return session;
}
