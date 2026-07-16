import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { setAuthenticationCookies } from "@/lib/auth/cookies";
import { assertValidOrigin } from "@/lib/security/origin";
import { registerHuman } from "@/modules/auth/application/authenticate";
import { registrationSchema } from "@/modules/auth/validation/schemas";
import { enforceRateLimit, requestIp } from "@/modules/rate-limit/application/rate-limit";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    assertValidOrigin(request);
    const input = await parseJson(request, registrationSchema);
    const database = getDatabase();
    const ip = requestIp(request);
    await enforceRateLimit(database, ip, {
      action: "register:ip",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    await enforceRateLimit(database, input.email, {
      action: "register:email",
      limit: 3,
      windowMs: 24 * 60 * 60 * 1000,
    });
    const result = await registerHuman(
      database,
      input,
      { userAgent: request.headers.get("user-agent"), ip },
      context.requestId,
    );
    const response = success({ user: result.user }, context, 201);
    setAuthenticationCookies(response, result.session);
    return response;
  });
}
