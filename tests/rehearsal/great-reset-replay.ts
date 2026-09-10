import { hostname } from "node:os";
import { PrismaClient } from "@prisma/client";
import { localResetTarget } from "../../scripts/great-reset-local-guard";
import { executeIdempotently } from "../../src/modules/idempotency/application/idempotency";

const target = localResetTarget(process.env.AGENT_GREAT_RESET_DATABASE_URL, hostname());
const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
async function main() {
  const record = await database.idempotencyRecord.findFirstOrThrow({
    where: { actorId: { not: null } },
  });
  if (record.expiresAt.getTime() !== 0) throw new Error("RESET_FIXTURE_NOT_EXPIRED");
  let calls = 0;
  const result = await executeIdempotently(
    database,
    {
      actorId: record.actorId!,
      route: record.route,
      key: record.key,
      requestBody: { localRehearsal: true },
    },
    async () => {
      calls++;
      return { status: 200, body: { regeneratedAfterReset: true } };
    },
  );
  if (result.replayed || calls !== 1 || result.status !== 200)
    throw new Error("RESET_REPLAY_DETECTED");
  process.stdout.write("RESET_REPLAY_PREVENTED\n");
}
void main()
  .catch(() => {
    process.stderr.write("RESET_REPLAY_CHECK_FAILED\n");
    process.exitCode = 1;
  })
  .finally(() => database.$disconnect());
