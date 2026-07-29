import type { NextRequest } from "next/server";
import { runOwnEntryReviewAction } from "@/lib/http/entry-review-action";
import { parseUuid } from "@/lib/http/request";
import { submitEntryAppeal } from "@/modules/moderation/application/trash-appeal";
import { entryAppealSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId: rawEntryId } = await params;
  const entryId = parseUuid(rawEntryId, "entryId");
  return runOwnEntryReviewAction(request, entryId, entryAppealSchema, (client, actor, input) =>
    submitEntryAppeal(client, actor, entryId, input),
  );
}
