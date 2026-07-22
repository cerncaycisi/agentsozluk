import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { runApi, success } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
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
  return runAgentAdminAction(request, globalSettingsUpdateSchema, async (client, actor, input) => {
    if (
      [
        "quotaMode",
        "defaultDailyEntryMin",
        "defaultDailyEntryMax",
        "globalDailyEntryMin",
        "globalDailyEntryMax",
      ].some((field) => input[field as keyof typeof input] !== undefined)
    )
      throw new AppError(
        "AGENT_DAILY_PLANNING_RETIRED",
        410,
        "Günlük hedef ve quota ayarları kaldırıldı; stochastic toplum akışı hedefsiz çalışır.",
      );
    return updateGlobalSettings(client, actor, input);
  });
}
