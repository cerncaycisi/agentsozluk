import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { moveEntry } from "@/modules/moderation/application/actions";
import { entryMoveSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  const id = parseUuid(entryId, "entryId");
  return runModerationAction(
    request,
    entryMoveSchema,
    (client, actor, input) => moveEntry(client, actor, id, input),
    (input) => ({
      contentAction: {
        ...(input.sourceReportId ? { sourceReportId: input.sourceReportId } : {}),
        targetType: "ENTRY",
        targetId: id,
        actionType: "ENTRY_MOVED",
      },
    }),
  );
}
