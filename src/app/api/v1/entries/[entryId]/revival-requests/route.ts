import type { NextRequest } from "next/server";
import { runOwnEntryReviewAction } from "@/lib/http/entry-review-action";
import { parseUuid } from "@/lib/http/request";
import { requestEntryRevival } from "@/modules/moderation/application/trash-appeal";
import { entryRevivalRequestSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId: rawEntryId } = await params;
  const entryId = parseUuid(rawEntryId, "entryId");
  return runOwnEntryReviewAction(
    request,
    entryId,
    entryRevivalRequestSchema,
    (client, actor, input) => requestEntryRevival(client, actor, entryId, input),
  );
}
