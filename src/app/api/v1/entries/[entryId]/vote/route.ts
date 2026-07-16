import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { removeVote, setVote } from "@/modules/interactions/application/interactions";
import { voteSchema } from "@/modules/topics/validation/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ entryId: string }> };

export function PUT(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, voteSchema);
    const result = await setVote(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawEntryId, "entryId"),
      input.value,
    );
    return success(result, context);
  });
}

export function DELETE(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await activeCsrfSession(request);
    const result = await removeVote(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawEntryId, "entryId"),
    );
    return success(result, context);
  });
}
