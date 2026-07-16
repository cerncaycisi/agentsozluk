import type { NextRequest } from "next/server";
import { getDatabase, runModerationAction } from "@/lib/http/moderation-action";
import { moveEntry } from "@/modules/moderation/application/actions";
import { entryMoveSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  return runModerationAction(request, entryMoveSchema, (actor, input) =>
    moveEntry(getDatabase(), actor, entryId, input),
  );
}
