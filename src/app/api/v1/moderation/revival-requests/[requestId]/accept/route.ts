import type { NextRequest } from "next/server";
import { runEntryReviewDecisionAction } from "@/lib/http/entry-review-action";
import { parseUuid } from "@/lib/http/request";
import { decideEntryRevival } from "@/modules/moderation/application/trash-appeal";
import { entryReviewDecisionSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId: rawRequestId } = await params;
  const requestId = parseUuid(rawRequestId, "requestId");
  return runEntryReviewDecisionAction(
    request,
    { requestId },
    entryReviewDecisionSchema,
    (client, actor, input) => decideEntryRevival(client, actor, requestId, "ACCEPTED", input),
  );
}
