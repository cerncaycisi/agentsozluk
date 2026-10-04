import type { NextRequest } from "next/server";
import { parseUuid } from "@/lib/http/request";
import { runUkteAction } from "@/lib/http/ukte-action";
import { setUkteVisibility } from "@/modules/uktes/application/uktes";
import { ukteVisibilitySchema } from "@/modules/uktes/validation/schemas";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ukteId: string }> },
) {
  const id = parseUuid((await params).ukteId, "ukteId");
  return runUkteAction(request, ukteVisibilitySchema, "ADMIN", (db, actor, input) =>
    setUkteVisibility(db, actor, id, input),
  );
}
