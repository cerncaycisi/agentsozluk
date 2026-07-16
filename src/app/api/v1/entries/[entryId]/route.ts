import type { NextRequest } from "next/server";
import { activeCsrfSession, sessionToken } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { authenticateSession } from "@/modules/auth/application/sessions";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { deleteEntry, editEntry, getEntry } from "@/modules/entries/application/entries";
import { entryUpdateSchema } from "@/modules/topics/validation/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ entryId: string }> };

export function GET(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await authenticateSession(getDatabase(), sessionToken(request));
    const entry = await getEntry(
      getDatabase(),
      parseUuid(rawEntryId, "entryId"),
      session
        ? { userId: session.userId, role: session.user.role, status: session.user.status }
        : null,
    );
    return success(entry, context);
  });
}

export function PATCH(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, entryUpdateSchema);
    const entry = await editEntry(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      input,
      parseUuid(rawEntryId, "entryId"),
    );
    return success(entry, context);
  });
}

export function DELETE(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await activeCsrfSession(request);
    const entry = await deleteEntry(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawEntryId, "entryId"),
    );
    return success(entry, context);
  });
}
