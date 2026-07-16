import type { NextRequest } from "next/server";
import { csrfSession, requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { activeSessions, endOtherSessions } from "@/modules/auth/application/sessions";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    return success(
      { sessions: await activeSessions(getDatabase(), session.userId, session.id) },
      context,
    );
  });
}

export function DELETE(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await csrfSession(request);
    await endOtherSessions(getDatabase(), session.userId, session.id);
    return success({ otherSessionsRevoked: true }, context);
  });
}
