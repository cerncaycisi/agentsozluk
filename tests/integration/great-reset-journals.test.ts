import { getResetGoneDecision } from "@/modules/maintenance/application/reset-gone";
import type { DatabaseClient } from "@/lib/db/types";
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
          const marker = await tx.greatResetCommit.create({
            data: { ...commit, committedAt: new Date("2000-01-01T00:00:00Z") },
          });
          const consumed = await tx.greatResetIntent.findUniqueOrThrow({ where: { operationId } });
          expect(marker.committedAt.getTime()).toBeGreaterThanOrEqual(
            consumed.consumedAt!.getTime(),
          );
          expect(
            await getResetGoneDecision(tx as unknown as DatabaseClient, {
              kind: "ENTRY",
              reference: "PUBLIC_ID",
              publicId: 123,
            }),
          ).toBe("GONE");
          expect(
            await getResetGoneDecision(tx as unknown as DatabaseClient, {
              kind: "ENTRY",
              reference: "UUID",
              uuid,
            }),
          ).toBe("GONE");
          expect(
            await getResetGoneDecision(tx as unknown as DatabaseClient, {
              kind: "TOPIC",
              reference: "PUBLIC_ID",
              publicId: 123,
            }),
          ).toBe("PASS");
          expect(
            await getResetGoneDecision(tx as unknown as DatabaseClient, {
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
          const exposure = await tx.greatResetExposureEvent.create({
            data: {
              operationId,
              journalSha256: "4".repeat(64),
              occurredAt: new Date("2000-01-01T00:00:00Z"),
            },
          });
          expect(exposure.occurredAt.getTime()).toBeGreaterThanOrEqual(
            marker.committedAt.getTime(),
          );
          await expectSqlRejection(
            tx,
            () =>
              tx.greatResetExposureEvent.create({
                data: { operationId, journalSha256: "4".repeat(64) },
              }),
            /Unique constraint/u,
          );
          // Geçerli atomic marker var: deferred olayları doğrula, TRUNCATE testinde asıl immutable trigger çalışsın.
          await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
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
          await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
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
  it("requires intent consumption and tombstones to commit together with the reset marker", async () => {
    await expect(
      integrationDatabase.$transaction(async (tx) => {
        const operationId = randomUUID();
        await createIntent(tx, operationId);
        await tx.greatResetIntent.update({
          where: { operationId },
          data: { consumedAt: new Date() },
        });
      }),
    ).rejects.toThrow(/GREAT_RESET_ATOMIC_COMMIT_REQUIRED/u);
    expect(await integrationDatabase.greatResetIntent.count()).toBe(0);
    await expect(
      integrationDatabase.$transaction(async (tx) => {
        const operationId = randomUUID();
        await createIntent(tx, operationId);
        await tx.greatResetIntent.update({
          where: { operationId },
          data: { consumedAt: new Date() },
        });
        await tx.greatResetTombstone.create({
          data: { kind: "ENTRY", uuid: randomUUID(), publicId: 1n, operationId },
        });
      }),
    ).rejects.toThrow(/GREAT_RESET_ATOMIC_COMMIT_REQUIRED/u);
    expect(await integrationDatabase.greatResetIntent.count()).toBe(0);
    expect(await integrationDatabase.greatResetTombstone.count()).toBe(0);
  });
  it("anchors intent creation to the database clock and keeps the two-hour ceiling real", async () => {
    const rollback = new Error("JOURNAL_CLOCK_FIXTURE_ROLLBACK");
    await expect(
      integrationDatabase.$transaction(async (tx) => {
        const operationId = randomUUID();
        await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation', ${operationId}, true)`;
        const future = new Date(Date.now() + 10 * 365 * 24 * 3600_000);
        await expectSqlRejection(
          tx,
          () =>
            tx.greatResetIntent.create({
              data: {
                operationId,
                createdAt: future,
                expiresAt: new Date(future.getTime() + 3600_000),
                releaseSha: "a".repeat(40),
                scope,
                sourceDatabaseOid: 1n,
                sourceClusterId: "1",
              },
            }),
          /great_reset_intents_expiry/u,
        );
        const old = new Date("2000-01-01T00:00:00Z");
        const intent = await tx.greatResetIntent.create({
          data: {
            operationId,
            createdAt: old,
            expiresAt: new Date(Date.now() + 3600_000),
            releaseSha: "a".repeat(40),
            scope,
            sourceDatabaseOid: 1n,
            sourceClusterId: "1",
          },
        });
        const [clock] = await tx.$queryRaw<{ valid: boolean }[]>`SELECT
        "createdAt" > clock_timestamp() - INTERVAL '5 seconds' AND "expiresAt" <= "createdAt" + INTERVAL '2 hours' AS valid
        FROM public.great_reset_intents WHERE "operationId"=${operationId}::uuid`;
        expect(clock?.valid).toBe(true);
        expect(intent.createdAt).not.toEqual(old);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
  it("loads only the committed operation through the actual cached application path", async () => {
    const rollback = new Error("JOURNAL_INDEX_FIXTURE_ROLLBACK");
    await expect(
      integrationDatabase.$transaction(
        async (tx) => {
          const first = randomUUID();
          await createIntent(tx, first);
          await tx.greatResetIntent.update({
            where: { operationId: first },
            data: { consumedAt: new Date() },
          });
          await tx.greatResetTombstone.create({
            data: { kind: "ENTRY", uuid: randomUUID(), publicId: 1001n, operationId: first },
          });
          const second = randomUUID();
          await createIntent(tx, second);
          await tx.greatResetIntent.update({
            where: { operationId: second },
            data: { consumedAt: new Date() },
          });
          await tx.greatResetTombstone.create({
            data: { kind: "ENTRY", uuid: randomUUID(), publicId: 1002n, operationId: second },
          });
          await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation',${first},true)`;
          await tx.greatResetCommit.create({
            data: {
              operationId: first,
              releaseSha: "a".repeat(40),
              manifestSha256: "1".repeat(64),
              planSha256: "2".repeat(64),
              protectedSha256: "3".repeat(64),
              clearedCounts: { topics: 0, entries: 1 },
            },
          });
          const client = tx as unknown as DatabaseClient;
          expect(
            await getResetGoneDecision(client, {
              kind: "ENTRY",
              reference: "PUBLIC_ID",
              publicId: 1001,
            }),
          ).toBe("GONE");
          expect(
            await getResetGoneDecision(client, {
              kind: "ENTRY",
              reference: "PUBLIC_ID",
              publicId: 1002,
            }),
          ).toBe("PASS");
          // İkinci niyet commitlenemez. Hiçbir trigger/constraint bypass olmadan fixture tamamı geri alınır.
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
    expect(await integrationDatabase.greatResetIntent.count()).toBe(0);
  });
});
