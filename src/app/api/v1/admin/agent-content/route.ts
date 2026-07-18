import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { parseDate, parseUuid } from "@/lib/http/request";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getAgentContentRecords } from "@/modules/moderation";

export const runtime = "nodejs";

const reportStatuses = new Set(["OPEN", "RESOLVED", "REJECTED", "NONE"] as const);
const hiddenStatuses = new Set(["ACTIVE", "HIDDEN"] as const);
const sourceProvenanceValues = new Set(["WITH_SOURCE", "WITHOUT_SOURCE"] as const);
const overrideStatuses = new Set(["WITH_OVERRIDE", "WITHOUT_OVERRIDE"] as const);

function enumValue<T extends string>(value: string | null, allowed: ReadonlySet<T>): T | undefined {
  return value && allowed.has(value as T) ? (value as T) : undefined;
}

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const url = new URL(request.url);
    const pagination = paginationFrom(url);
    const value = (name: string) => url.searchParams.get(name) || undefined;
    const [records, totalItems] = await getAgentContentRecords(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      {
        ...(value("agentProfileId")
          ? { agentProfileId: parseUuid(value("agentProfileId")!, "agentProfileId") }
          : {}),
        ...(value("runId") ? { runId: parseUuid(value("runId")!, "runId") } : {}),
        ...(value("topicId") ? { topicId: parseUuid(value("topicId")!, "topicId") } : {}),
        ...(value("from") ? { createdFrom: parseDate(value("from")!, "from") } : {}),
        ...(value("to") ? { createdTo: parseDate(value("to")!, "to") } : {}),
        ...(enumValue(url.searchParams.get("reportStatus"), reportStatuses)
          ? { reportStatus: enumValue(url.searchParams.get("reportStatus"), reportStatuses)! }
          : {}),
        ...(enumValue(url.searchParams.get("hiddenStatus"), hiddenStatuses)
          ? { hiddenStatus: enumValue(url.searchParams.get("hiddenStatus"), hiddenStatuses)! }
          : {}),
        ...(enumValue(url.searchParams.get("sourceProvenance"), sourceProvenanceValues)
          ? {
              sourceProvenance: enumValue(
                url.searchParams.get("sourceProvenance"),
                sourceProvenanceValues,
              )!,
            }
          : {}),
        ...(enumValue(url.searchParams.get("overrideStatus"), overrideStatuses)
          ? {
              overrideStatus: enumValue(url.searchParams.get("overrideStatus"), overrideStatuses)!,
            }
          : {}),
        skip: pagination.skip,
        take: pagination.pageSize,
      },
    );
    return successList(records, context, { ...pagination, totalItems });
  });
}
