import type { NextRequest } from "next/server";
import { getDatabase, runModerationAction } from "@/lib/http/moderation-action";
import { decideReport } from "@/modules/moderation/application/reports";
import { reportDecisionSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  return runModerationAction(request, reportDecisionSchema, (actor, input) =>
    decideReport(getDatabase(), actor, reportId, "REJECTED", input),
  );
}
