import type { NextRequest } from "next/server";
import { setCsrfCookie } from "@/lib/auth/cookies";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { rotateCsrfToken } from "@/modules/auth/application/sessions";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const csrfToken = await rotateCsrfToken(getDatabase(), session.id);
    const response = success({ csrfToken }, context);
    setCsrfCookie(response, csrfToken, session.expiresAt);
    return response;
  });
}
