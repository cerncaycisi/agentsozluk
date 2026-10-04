import type { NextRequest } from "next/server";
import { parseUuid } from "@/lib/http/request";
import { runUkteAction } from "@/lib/http/ukte-action";
import { withdrawUkte } from "@/modules/uktes/application/uktes";
import { ukteWithdrawSchema } from "@/modules/uktes/validation/schemas";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ukteId: string }> },
) {
  const id = parseUuid((await params).ukteId, "ukteId");
  return runUkteAction(request, ukteWithdrawSchema, "WITHDRAW", (db, actor) =>
    withdrawUkte(db, actor, id),
  );
}
