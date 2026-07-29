import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { decideReport } from "@/modules/moderation/application/reports";
import { reportDecisionSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const id = parseUuid(reportId, "reportId");
  return runModerationAction(
    request,
    reportDecisionSchema,
    (client, actor, input) => decideReport(client, actor, id, "ACCEPTED", input),
    { reportDecisionId: id },
  );
}
