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
  return runModerationAction(request, entryMoveSchema, (client, actor, input) =>
    moveEntry(client, actor, parseUuid(entryId, "entryId"), input),
  );
}
