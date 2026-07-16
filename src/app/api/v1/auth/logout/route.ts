import type { NextRequest } from "next/server";
import { clearAuthenticationCookies } from "@/lib/auth/cookies";
import { csrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { endSession } from "@/modules/auth/application/sessions";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await csrfSession(request);
    await endSession(getDatabase(), session.id);
    const response = success({ loggedOut: true }, context);
    clearAuthenticationCookies(response);
    return response;
  });
}
