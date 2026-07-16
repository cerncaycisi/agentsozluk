import type { NextRequest } from "next/server";
import { getDatabase, runModerationAction } from "@/lib/http/moderation-action";
import { setEntryVisibility } from "@/modules/moderation/application/actions";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  return runModerationAction(request, moderationReasonSchema, (actor, input) =>
    setEntryVisibility(getDatabase(), actor, entryId, true, input),
  );
}
