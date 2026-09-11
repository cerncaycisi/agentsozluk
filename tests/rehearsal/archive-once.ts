import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { localResetTarget } from "../../src/modules/maintenance/domain/great-reset-local-guard";
import {
  archivePendingOutboxEvents,
  pendingOutboxSnapshot,
} from "../../src/modules/maintenance/repository/outbox-reset-archive";

/** Yalnız eşzamanlılık provası için: guard'lı sentetik DB'de tek arşiv turu koşar. */
async function main(): Promise<void> {
  const target = localResetTarget(process.env.AGENT_GREAT_RESET_DATABASE_URL, hostname());
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  try {
    const result = await database.$transaction(async (tx) => {
      const expected = await pendingOutboxSnapshot(tx);
      const archiveId = await archivePendingOutboxEvents(
        tx,
        randomUUID(),
        "a".repeat(64),
        expected,
      );
      return { archiveId, rows: expected.rows };
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "ARCHIVE_ONCE_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
