import type { NextRequest } from "next/server";
import { activeCsrfSession, optionalRequestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { deleteEntry, editEntry, getEntry } from "@/modules/entries/application/entries";
import { serializePublicEntry } from "@/modules/entries/domain/serialization";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";
import { entryUpdateSchema } from "@/modules/entries/validation/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ entryId: string }> };

export function GET(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await optionalRequestSession(request);
    const entry = await getEntry(
      getDatabase(),
      parseUuid(rawEntryId, "entryId"),
      session
        ? { userId: session.userId, role: session.user.role, status: session.user.status }
        : null,
    );
    return success(serializePublicEntry(entry), context);
  });
}

export function PATCH(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, entryUpdateSchema);
    const database = getDatabase();
    await enforceRateLimit(
      database,
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.entryEditDelete,
    );
    const entry = await editEntry(
      database,
      actorFromSession(session, context.requestId, "API"),
      input,
      parseUuid(rawEntryId, "entryId"),
    );
    return success(serializePublicEntry(entry), context);
  });
}

export function DELETE(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await activeCsrfSession(request);
    const database = getDatabase();
    await enforceRateLimit(
      database,
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.entryEditDelete,
    );
    const entry = await deleteEntry(
      database,
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawEntryId, "entryId"),
    );
    return success(serializePublicEntry(entry), context);
  });
}
