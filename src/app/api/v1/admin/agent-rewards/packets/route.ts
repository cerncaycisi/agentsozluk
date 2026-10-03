import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { issueAssessmentPacketSchema } from "@/modules/agents/validation/reward-schemas";
import { issuePurposeAssessmentPacket } from "@/modules/agents/application/rewards";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, issueAssessmentPacketSchema, issuePurposeAssessmentPacket, {
    storedBodyTransform: (body) => {
      if (!body || typeof body !== "object" || Array.isArray(body)) return body;
      const data = body.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return body;
      return { ...body, data: { ...data, nonce: null } };
    },
  });
}
