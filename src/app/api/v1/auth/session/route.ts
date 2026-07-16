import type { NextRequest } from "next/server";
import { sessionToken } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { authenticateSession } from "@/modules/auth/application/sessions";
import { serializeSafeUser } from "@/modules/users/domain/serialization";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await authenticateSession(getDatabase(), sessionToken(request));
    return success(
      session
        ? { authenticated: true, user: serializeSafeUser(session.user), sessionId: session.id }
        : { authenticated: false },
      context,
    );
  });
}
