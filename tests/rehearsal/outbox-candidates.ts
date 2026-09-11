import { hostname } from "node:os";
import { PrismaClient } from "@prisma/client";
import { localResetTarget } from "../../scripts/great-reset-local-guard";
import { findPendingOutboxEvents } from "../../src/modules/outbox/repository/pending";

const target = localResetTarget(process.env.AGENT_GREAT_RESET_DATABASE_URL, hostname());
const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
void findPendingOutboxEvents(database, 1000)
  .then((events) => process.stdout.write(`${JSON.stringify(events.map((event) => event.id))}\n`))
  .catch(() => {
    process.stderr.write("OUTBOX_CANDIDATE_CHECK_FAILED\n");
    process.exitCode = 1;
  })
  .finally(() => database.$disconnect());
