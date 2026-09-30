import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import {
  agentSourceAdminUpdateSchema,
  listAgentSources,
  updateAgentSourceAdmin,
} from "@/modules/agents";
import { agentSourceProposalOrigin } from "@/modules/agents/domain/runtime-source-proposal";
import { resolveOperatorAdmin } from "./agent-operator";
import {
  prepareOperatorCliEnvironment,
  writeOperatorCliEnvironmentReport,
} from "./operator-cli-environment";

/*
  Ajan kaynak önerileri kuyruğu (30 Eylül 2026). Gökhan kararı: öneriyi o da, operatör
  olarak Claude da onaylayabilir. Onay/ret panelle aynı servis (`updateAgentSourceAdmin`):
  denetim kaydı, kapasite kilidi altında stok/sahip sınırı. Onaydan önce adres güvenli
  okuyucuyla doğrulanmalıdır (`agent:audit-sources` ile aynı okuyucu).

    tsx scripts/agent-source-proposals.ts list
    AGENT_SOURCE_PROPOSAL_CONFIRMATION=DECIDE_SOURCE_PROPOSAL \
      tsx scripts/agent-source-proposals.ts approve <sourceId> '<gerekçe>'
    AGENT_SOURCE_PROPOSAL_CONFIRMATION=DECIDE_SOURCE_PROPOSAL \
      tsx scripts/agent-source-proposals.ts reject <sourceId> '<gerekçe>'

  Çıktı JSON satırlarıdır; sır basmaz (adres ve ajanın gerekçesi kamusal değildir ama
  hassas da değildir).
*/
const argsSchema = z.union([
  z.tuple([z.literal("list")]),
  z.tuple([z.enum(["approve", "reject"]), z.string().uuid(), z.string().trim().min(10).max(500)]),
]);
const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_SOURCE_PROPOSAL_CONFIRMATION: z.literal("DECIDE_SOURCE_PROPOSAL").optional(),
  })
  .passthrough();

async function main(): Promise<void> {
  const args = argsSchema.parse(process.argv.slice(2));
  writeOperatorCliEnvironmentReport(prepareOperatorCliEnvironment());
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const admin = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
    const actor = { ...admin, requestId: randomUUID() };
    if (args[0] === "list") {
      const [rows] = await listAgentSources(database, actor, {
        status: "DISCOVERED",
        skip: 0,
        take: 100,
      });
      for (const row of rows.filter(
        ({ addedByOrigin }) => addedByOrigin === agentSourceProposalOrigin,
      ))
        process.stdout.write(
          `${JSON.stringify({
            sourceId: row.id,
            agent: row.agentProfile.user.username,
            url: row.url,
            reason: row.discoveredFrom,
            createdAt: row.createdAt,
          })}\n`,
        );
      return;
    }
    if (environment.AGENT_SOURCE_PROPOSAL_CONFIRMATION !== "DECIDE_SOURCE_PROPOSAL")
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "AGENT_SOURCE_PROPOSAL_CONFIRMATION=DECIDE_SOURCE_PROPOSAL gerekli.",
      );
    const [command, sourceId, reason] = args;
    const [pending] = await listAgentSources(database, actor, {
      status: "DISCOVERED",
      skip: 0,
      take: 100,
    });
    if (
      !pending.some(
        ({ id, addedByOrigin }) => id === sourceId && addedByOrigin === agentSourceProposalOrigin,
      )
    )
      throw new AppError("VALIDATION_ERROR", 422, "Onay bekleyen böyle bir ajan önerisi yok.");
    const updated = await updateAgentSourceAdmin(
      database,
      actor,
      sourceId,
      agentSourceAdminUpdateSchema.parse({
        status: command === "approve" ? "SEED" : "REJECTED",
        expectedStatus: "DISCOVERED",
        reason,
      }),
    );
    process.stdout.write(
      `${JSON.stringify({ status: "SOURCE_PROPOSAL_DECIDED", sourceId, result: updated.status })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code =
    error instanceof AppError
      ? error.code
      : error instanceof z.ZodError
        ? "OPERATOR_INPUT_INVALID"
        : "INTERNAL_ERROR";
  process.stderr.write(
    `SOURCE_PROPOSAL_FAILED code=${code}${error instanceof AppError ? ` ${error.message}` : ""}\n`,
  );
  process.exitCode = 1;
});
