import type { NextRequest } from "next/server";
import { clearAuthenticationCookies } from "@/lib/auth/cookies";
import { csrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { endOwnedSession } from "@/modules/auth/application/sessions";

export const runtime = "nodejs";

export function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  return runApi(request, async (context) => {
    const session = await csrfSession(request);
    const { sessionId } = await params;
    await endOwnedSession(getDatabase(), session.userId, sessionId);
    const currentSession = sessionId === session.id;
    const response = success({ revoked: true, currentSession }, context);
    if (currentSession) clearAuthenticationCookies(response);
    return response;
  });
}
