import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { getRandomTopic } from "@/modules/feeds/application/feeds";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => success(await getRandomTopic(getDatabase()), context));
}
