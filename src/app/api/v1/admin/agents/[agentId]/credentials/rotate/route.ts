import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { parseUuid } from "@/lib/http/request";
import { rotateAgentCredential, runtimeCredentialRotationSchema } from "@/modules/agents";
import { redactCreationCredential } from "@/modules/agents/domain/credential";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const agentId = parseUuid((await params).agentId, "agentId");
  return runAgentAdminAction(
    request,
    runtimeCredentialRotationSchema,
    (client, actor, input) => rotateAgentCredential(client, actor, agentId, input),
    { storedBodyTransform: redactCreationCredential },
  );
}
