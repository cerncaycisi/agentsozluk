import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { getEntryRevisions } from "@/modules/entries/application/entries";

export const runtime = "nodejs";

export function GET(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await requestSession(request);
    const revisions = await getEntryRevisions(getDatabase(), parseUuid(rawEntryId, "entryId"), {
      userId: session.userId,
      role: session.user.role,
      status: session.user.status,
    });
    return success(revisions, context);
  });
}
