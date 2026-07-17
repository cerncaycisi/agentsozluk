import type { NextRequest } from "next/server";
import { csrfSession, requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { updateProfile } from "@/modules/auth/application/accounts";
import { profileUpdateSchema } from "@/modules/auth/validation/schemas";
import { serializeSafeUser } from "@/modules/users/domain/serialization";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    return success({ user: serializeSafeUser(session.user) }, context);
  });
}

export function PATCH(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await csrfSession(request);
    const input = await parseJson(request, profileUpdateSchema);
    const user = await updateProfile(getDatabase(), session.userId, input, context.requestId);
    return success({ user }, context);
  });
}
