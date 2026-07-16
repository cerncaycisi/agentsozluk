import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationDashboard } from "@/modules/moderation/application/queries";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    return success(
      await getModerationDashboard(
        getDatabase(),
        actorFromSession(session, context.requestId, "API"),
      ),
      context,
    );
  });
}
