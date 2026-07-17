import type { NextRequest } from "next/server";
import { clearAuthenticationCookies } from "@/lib/auth/cookies";
import { csrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { deactivateAccount } from "@/modules/auth/application/accounts";
import { deactivationSchema } from "@/modules/auth/validation/schemas";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await csrfSession(request);
    const input = await parseJson(request, deactivationSchema);
    await deactivateAccount(getDatabase(), session.userId, input, context.requestId);
    const response = success({ deactivated: true }, context);
    clearAuthenticationCookies(response);
    return response;
  });
}
