import type { NextRequest } from "next/server";
import { CSRF_COOKIE_NAME } from "@/config/app";
import { setCsrfCookie } from "@/lib/auth/cookies";
import { requestSession, sessionToken } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { getOrRecoverCsrfToken } from "@/modules/auth/application/sessions";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const rawSessionToken = sessionToken(request);
    if (!rawSessionToken)
      throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
    const csrfToken = await getOrRecoverCsrfToken(getDatabase(), {
      session,
      rawSessionToken,
      presentedCsrfToken: request.cookies.get(CSRF_COOKIE_NAME)?.value,
    });
    const response = success({ csrfToken }, context);
    setCsrfCookie(response, csrfToken, session.expiresAt);
    return response;
  });
}
