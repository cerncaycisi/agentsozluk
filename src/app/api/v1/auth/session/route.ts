import type { NextRequest } from "next/server";
import { optionalRequestSession } from "@/lib/auth/request-session";
import { runApi, success } from "@/lib/http/api";
import { serializeSafeUser } from "@/modules/users/domain/serialization";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await optionalRequestSession(request);
    return success(
      session
        ? { authenticated: true, user: serializeSafeUser(session.user), sessionId: session.id }
        : { authenticated: false },
      context,
    );
  });
}
