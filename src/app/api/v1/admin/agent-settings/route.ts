import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { runApi, success } from "@/lib/http/api";
import {
  getGlobalSettings,
  globalSettingsUpdateSchema,
  updateGlobalSettings,
} from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    return success(
      await getGlobalSettings(getDatabase(), actorFromSession(session, context.requestId, "API")),
      context,
    );
  });
}

export function PATCH(request: NextRequest) {
  return runAgentAdminAction(request, globalSettingsUpdateSchema, updateGlobalSettings);
}
