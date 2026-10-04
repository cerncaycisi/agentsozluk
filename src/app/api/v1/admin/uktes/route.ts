import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { listAdminUktes } from "@/modules/uktes/application/uktes";
import { ukteAdminListSchema } from "@/modules/uktes/validation/schemas";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const input = ukteAdminListSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return success(
      await listAdminUktes(
        getDatabase(),
        actorFromSession(session, context.requestId, "API"),
        input,
      ),
      context,
    );
  });
}
