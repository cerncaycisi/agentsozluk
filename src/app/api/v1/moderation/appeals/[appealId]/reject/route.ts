import type { NextRequest } from "next/server";
import { runEntryReviewDecisionAction } from "@/lib/http/entry-review-action";
import { parseUuid } from "@/lib/http/request";
import { decideEntryAppeal } from "@/modules/moderation/application/trash-appeal";
import { entryReviewDecisionSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appealId: string }> },
) {
  const { appealId: rawAppealId } = await params;
  const appealId = parseUuid(rawAppealId, "appealId");
  return runEntryReviewDecisionAction(
    request,
    { appealId },
    entryReviewDecisionSchema,
    (client, actor, input) => decideEntryAppeal(client, actor, appealId, "REJECTED", input),
  );
}
