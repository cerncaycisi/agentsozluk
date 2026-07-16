import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { createTopicWithFirstEntry } from "@/modules/topics/application/topics";
import { topicCreateSchema } from "@/modules/topics/validation/schemas";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, topicCreateSchema);
    const result = await createTopicWithFirstEntry(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      input,
    );
    return success(result, context, 201);
  });
}
