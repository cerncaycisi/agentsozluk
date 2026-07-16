import type { NextRequest } from "next/server";
import { setAuthenticationCookies } from "@/lib/auth/cookies";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { assertValidOrigin } from "@/lib/security/origin";
import { loginHuman } from "@/modules/auth/application/authenticate";
import { loginSchema } from "@/modules/auth/validation/schemas";
import { enforceRateLimit, requestIp } from "@/modules/rate-limit/application/rate-limit";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    assertValidOrigin(request);
    const input = await parseJson(request, loginSchema);
    const database = getDatabase();
    const ip = requestIp(request);
    await enforceRateLimit(database, `${ip}:${input.email}`, {
      action: "login:ip_email",
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    const result = await loginHuman(
      database,
      input,
      { userAgent: request.headers.get("user-agent"), ip },
      context.requestId,
    );
    const response = success({ user: result.user }, context);
    setAuthenticationCookies(response, result.session);
    return response;
  });
}
