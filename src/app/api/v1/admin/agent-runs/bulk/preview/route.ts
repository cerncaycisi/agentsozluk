import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { bulkAgentRunPreviewSchema, previewBulkAgentRun } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, bulkAgentRunPreviewSchema, previewBulkAgentRun, {
    refreshOnReplay: true,
    storedBodyTransform: (body) => {
      if (!body || typeof body !== "object" || Array.isArray(body)) return body;
      const data = body.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return body;
      return { ...body, data: { ...data, previewToken: null } };
    },
  });
}
