import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { setEntryVisibility } from "@/modules/moderation/application/actions";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  const id = parseUuid(entryId, "entryId");
  return runModerationAction(
    request,
    moderationReasonSchema,
    (client, actor, input) => setEntryVisibility(client, actor, id, false, input),
    (input) => ({
      contentAction: {
        ...(input.sourceReportId ? { sourceReportId: input.sourceReportId } : {}),
        targetType: "ENTRY",
        targetId: id,
        actionType: "ENTRY_RESTORED",
      },
    }),
  );
}
