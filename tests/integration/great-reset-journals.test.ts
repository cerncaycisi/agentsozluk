import { findResetGoneDecision } from "@/modules/maintenance/repository/reset-gone";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);
const scope = "ALL_DICTIONARY_AND_AGENT_STATE_KEEP_IDENTITIES_V1";

async function expectSqlRejection(
  tx: Prisma.TransactionClient,
  work: () => Promise<unknown>,
  error: RegExp,
) {
  await tx.$executeRaw`SAVEPOINT journal_negative`;
  await expect(work()).rejects.toThrow(error);
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT journal_negative`;
  await tx.$executeRaw`RELEASE SAVEPOINT journal_negative`;
}

async function createIntent(tx: Prisma.TransactionClient, operationId: string) {
  await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation', ${operationId}, true)`;
  const now = new Date();
  return tx.greatResetIntent.create({
    data: {
      operationId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      releaseSha: "a".repeat(40),
      scope,
      sourceDatabaseOid: 1n,
      sourceClusterId: "1",
    },
  });
}

// Kanıt tablolarında test için UPDATE/DELETE/TRUNCATE istisnası yok.
// Her fixture tek gerçek transaction'da geri alınır; önceki test temizliği bunlara dokunmaz.
describe("great reset journal immutability and one-use state", () => {
  it("consumes an intent once, seals tombstones and keeps commit/exposure append-only", async () => {
    const rollback = new Error("JOURNAL_FIXTURE_ROLLBACK");
    await expect(
      integrationDatabase.$transaction(
        async (tx) => {
          const operationId = randomUUID();
          await createIntent(tx, operationId);
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetIntent.update({
                where: { operationId },
                data: { releaseSha: "b".repeat(40) },
              }),
            /GREAT_RESET_INTENT_TRANSITION_INVALID/u,
          );
          await tx.greatResetIntent.update({
            where: { operationId },
            data: { consumedAt: new Date() },
          });
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetIntent.update({ where: { operationId }, data: { consumedAt: null } }),
            /GREAT_RESET_INTENT_TRANSITION_INVALID/u,
          );
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetIntent.update({
                where: { operationId },
                data: { invalidatedAt: new Date() },
              }),
            /GREAT_RESET_INTENT_TRANSITION_INVALID/u,
          );
          const uuid = randomUUID();
          await tx.greatResetTombstone.create({
            data: { kind: "ENTRY", uuid, publicId: 123n, operationId },
          });
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetTombstone.create({
                data: { kind: "ENTRY", uuid: randomUUID(), publicId: 123n, operationId },
              }),
            /Unique constraint/u,
          );
          const commit = {
            operationId,
            releaseSha: "a".repeat(40),
            manifestSha256: "1".repeat(64),
            planSha256: "2".repeat(64),
            protectedSha256: "3".repeat(64),
            clearedCounts: { topics: 1, entries: 1 },
          };
          await tx.greatResetCommit.create({ data: commit });
          expect(
            await findResetGoneDecision(tx, {
              kind: "ENTRY",
              reference: "PUBLIC_ID",
              publicId: 123,
            }),
          ).toBe("GONE");
          expect(await findResetGoneDecision(tx, { kind: "ENTRY", reference: "UUID", uuid })).toBe(
            "GONE",
          );
          expect(
            await findResetGoneDecision(tx, {
              kind: "TOPIC",
              reference: "PUBLIC_ID",
              publicId: 123,
            }),
          ).toBe("PASS");
          expect(
            await findResetGoneDecision(tx, {
              kind: "ENTRY",
              reference: "PUBLIC_ID",
              publicId: 999,
            }),
          ).toBe("PASS");
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetTombstone.create({
                data: { kind: "TOPIC", uuid: randomUUID(), publicId: 124n, operationId },
              }),
            /GREAT_RESET_TOMBSTONES_SEALED/u,
          );
          await tx.greatResetExposureEvent.create({
            data: { operationId, journalSha256: "4".repeat(64) },
          });
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetExposureEvent.create({
                data: { operationId, journalSha256: "4".repeat(64) },
              }),
            /Unique constraint/u,
          );
          for (const mutation of [
            () =>
              tx.greatResetCommit.update({
                where: { operationId },
                data: { releaseSha: "b".repeat(40) },
              }),
            () => tx.greatResetCommit.delete({ where: { operationId } }),
            () =>
              tx.$executeRaw`TRUNCATE ONLY public.great_reset_commits, ONLY public.great_reset_exposure_events`,
            () =>
              tx.greatResetTombstone.update({
                where: { kind_uuid: { kind: "ENTRY", uuid } },
                data: { publicId: 125n },
              }),
            () => tx.greatResetTombstone.delete({ where: { kind_uuid: { kind: "ENTRY", uuid } } }),
            () => tx.$executeRaw`TRUNCATE ONLY public.great_reset_tombstones`,
            () =>
              tx.greatResetExposureEvent.update({
                where: { operationId },
                data: { journalSha256: "5".repeat(64) },
              }),
            () => tx.greatResetExposureEvent.delete({ where: { operationId } }),
            () => tx.$executeRaw`TRUNCATE ONLY public.great_reset_exposure_events`,
            () => tx.greatResetIntent.delete({ where: { operationId } }),
            () =>
              tx.$executeRaw`TRUNCATE ONLY public.great_reset_exposure_events, ONLY public.great_reset_commits, ONLY public.great_reset_tombstones, ONLY public.great_reset_intents`,
          ])
            await expectSqlRejection(tx, mutation, /GREAT_RESET_JOURNAL_IMMUTABLE/u);
          const second = randomUUID();
          await createIntent(tx, second);
          await tx.greatResetIntent.update({
            where: { operationId: second },
            data: { consumedAt: new Date() },
          });
          await expectSqlRejection(
            tx,
            () => tx.greatResetCommit.create({ data: { ...commit, operationId: second } }),
            /Unique constraint/u,
          );
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
    expect(await integrationDatabase.greatResetIntent.count()).toBe(0);
    expect(await integrationDatabase.greatResetCommit.count()).toBe(0);
    expect(await integrationDatabase.greatResetTombstone.count()).toBe(0);
    expect(await integrationDatabase.greatResetExposureEvent.count()).toBe(0);
  });

  it("rejects missing operation, invalid expiry, unconsumed and terminal intents", async () => {
    const rollback = new Error("JOURNAL_INVALID_FIXTURE_ROLLBACK");
    await expect(
      integrationDatabase.$transaction(
        async (tx) => {
          const operationId = randomUUID();
          await createIntent(tx, operationId);
          await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation', '', true)`;
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetIntent.update({
                where: { operationId },
                data: { consumedAt: new Date() },
              }),
            /GREAT_RESET_OPERATION_REQUIRED/u,
          );
          await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation', ${operationId}, true)`;
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetTombstone.create({
                data: { kind: "ENTRY", uuid: randomUUID(), publicId: 1n, operationId },
              }),
            /GREAT_RESET_INTENT_NOT_CONSUMED/u,
          );
          await tx.greatResetIntent.update({
            where: { operationId },
            data: { invalidatedAt: new Date() },
          });
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetIntent.update({
                where: { operationId },
                data: { consumedAt: new Date(), invalidatedAt: null },
              }),
            /GREAT_RESET_INTENT_TRANSITION_INVALID/u,
          );
          const invalid = randomUUID();
          await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation', ${invalid}, true)`;
          const now = new Date();
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetIntent.create({
                data: {
                  operationId: invalid,
                  createdAt: now,
                  expiresAt: new Date(now.getTime() + 3 * 60 * 60_000),
                  releaseSha: "a".repeat(40),
                  scope,
                  sourceDatabaseOid: 1n,
                  sourceClusterId: "1",
                },
              }),
            /great_reset_intents_expiry/u,
          );
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
    expect(await integrationDatabase.greatResetIntent.count()).toBe(0);
  });
});
