import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { bulkAgentRunPreviewSchema, previewBulkAgentRun } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, bulkAgentRunPreviewSchema, previewBulkAgentRun);
}
