import type { NextRequest } from "next/server";
import { runAgentRuntimeRead } from "@/lib/http/agent-runtime-action";
import { parseUuid } from "@/lib/http/request";
import { getRuntimeRunContext } from "@/modules/agents";

export const runtime = "nodejs";

const runtimeReadTopicIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const runId = parseUuid((await params).runId, "runId");
  /*
    Ajanın okumak için seçtiği başlıklar. Kimlikler burada UUID olarak
    doğrulanır; geçersiz olan sessizce atılır, çünkü bu bir okuma isteği ve
    ajanın uydurduğu bir kimlik koşuyu düşürmemeli. Üst sınır depo katmanında
    (`runtimeReadTopicLimit`), yani sözleşme tek yerde.
  */
  const readTopicIds = (request.nextUrl.searchParams.get("readTopicIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => runtimeReadTopicIdPattern.test(value));
  return runAgentRuntimeRead(request, "runtime:read", (client, principal, workerId, leaseToken) =>
    getRuntimeRunContext(client, principal, runId, workerId, leaseToken, readTopicIds),
  );
}
