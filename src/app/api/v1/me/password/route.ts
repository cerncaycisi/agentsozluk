import type { NextRequest } from "next/server";
import { csrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { changePassword } from "@/modules/auth/application/accounts";
import { passwordChangeSchema } from "@/modules/auth/validation/schemas";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await csrfSession(request);
    const input = await parseJson(request, passwordChangeSchema);
    await changePassword(getDatabase(), session.userId, session.id, input, context.requestId);
    return success({ changed: true, otherSessionsRevoked: true }, context);
  });
}
