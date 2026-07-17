import type { NextRequest } from "next/server";
import { csrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { changeEmail } from "@/modules/auth/application/accounts";
import { emailChangeSchema } from "@/modules/auth/validation/schemas";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await csrfSession(request);
    const input = await parseJson(request, emailChangeSchema);
    const user = await changeEmail(getDatabase(), session.userId, input, context.requestId);
    return success({ user, verificationRequired: false }, context);
  });
}
