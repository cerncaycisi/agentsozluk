import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { setCanonicalSeedEntrySuppression } from "@/modules/moderation";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  const id = parseUuid(entryId, "entryId");
  return runModerationAction(request, moderationReasonSchema, (client, actor, input) =>
    setCanonicalSeedEntrySuppression(client, actor, id, false, input),
  );
}
