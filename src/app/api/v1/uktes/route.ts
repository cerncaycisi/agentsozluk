import type { NextRequest } from "next/server";
import { optionalRequestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { runUkteAction } from "@/lib/http/ukte-action";
import { createUkte, listPublicUktes } from "@/modules/uktes/application/uktes";
import { ukteCreateSchema, ukteListSchema } from "@/modules/uktes/validation/schemas";

export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await optionalRequestSession(request);
    const input = ukteListSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return success(
      await listPublicUktes(getDatabase(), {
        ...input,
        viewerId:
          session?.user.kind === "HUMAN" && session.user.status === "ACTIVE"
            ? session.userId
            : undefined,
      }),
      context,
    );
  });
}
export function POST(request: NextRequest) {
  return runUkteAction(request, ukteCreateSchema, "WRITE", createUkte);
}
