import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findTopicByPublicId } from "@/modules/topics/repository/topics";
import { createTopicWithFirstEntry } from "@/modules/topics/application/topics";
import { createEntry } from "@/modules/entries/application/entries";
import { findTopicForModeration, findEntryForMove } from "@/modules/moderation/repository/actions";
import { listModerationTopics } from "@/modules/moderation/repository/queries";
import { searchRecords } from "@/modules/search/repository/search";
import {
  createIdempotencyRecord,
  findIdempotencyRecord,
} from "@/modules/idempotency/repository/idempotency";
import { findEntryByPublicId } from "@/modules/entries/repository/entries";
import { listScoredTopics, listTopEntryPerTopic } from "@/modules/feeds/repository/feeds";
import {
  listIndexableEntries,
  listSyndicationEntries,
} from "@/modules/indexing/repository/indexing";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createUser() {
  const username = `bigint_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      writerApproved: true,
      username,
      usernameNormalized: username,
      displayName: "BIGINT test",
      email: `${username}@bigint.test`,
      emailNormalized: `${username}@bigint.test`,
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

async function sequenceState() {
  return integrationDatabase.$queryRaw<
    Array<{
      name: string;
      type: string;
      max: bigint;
      last: bigint;
      called: boolean;
    }>
  >`
    SELECT 'topics_public_id_seq' AS name, s.data_type::text AS type, s.max_value AS max,
           v.last_value AS last, v.is_called AS called
    FROM public.topics_public_id_seq v JOIN pg_sequences s
      ON s.schemaname='public' AND s.sequencename='topics_public_id_seq'
    UNION ALL
    SELECT 'entries_public_id_seq', s.data_type::text, s.max_value, v.last_value, v.is_called
    FROM public.entries_public_id_seq v JOIN pg_sequences s
      ON s.schemaname='public' AND s.sequencename='entries_public_id_seq'
    ORDER BY name`;
}

async function rangeChecks() {
  return integrationDatabase.$queryRaw<Array<{ name: string; definition: string }>>`
    SELECT conname AS name, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid IN ('public.topics'::regclass,'public.entries'::regclass)
      AND conname IN ('topics_public_id_legacy_range','entries_public_id_legacy_range',
                      'topics_public_id_reset_range','entries_public_id_reset_range')
    ORDER BY conname`;
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("BIGINT public id migration and PostgreSQL DTOs", () => {
  it("blocks upper namespace values before reset and keeps the legacy sequence ceiling", async () => {
    const user = await createUser();
    for (const publicId of [0n, -1n, 2147483648n])
      await expect(
        integrationDatabase.topic.create({
          data: {
            publicId,
            title: "Reset öncesi üst aralık",
            normalizedTitle: "reset öncesi üst aralık",
            slug: "reset-oncesi",
            createdById: user.id,
          },
        }),
      ).rejects.toThrow(/topics_public_id_legacy_range/u);
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Legacy test",
        normalizedTitle: "legacy test",
        slug: "legacy-test",
        createdById: user.id,
      },
    });
    for (const publicId of [0n, -1n, 2147483648n])
      await expect(
        integrationDatabase.entry.create({
          data: {
            publicId,
            topicId: topic.id,
            authorId: user.id,
            origin: "WEB",
            body: "Blocked upper namespace",
            normalizedBody: "blocked upper namespace",
          },
        }),
      ).rejects.toThrow(/entries_public_id_legacy_range/u);
    const columns = await integrationDatabase.$queryRaw<
      Array<{ table: string; type: string; sequence: string }>
    >`
      SELECT table_name AS table, data_type AS type,
             pg_get_serial_sequence('public.' || table_name, 'publicId') AS sequence
      FROM information_schema.columns WHERE table_schema='public'
        AND table_name IN ('topics','entries') AND column_name='publicId'
      ORDER BY table_name`;
    expect(columns).toEqual([
      { table: "entries", type: "bigint", sequence: "public.entries_public_id_seq" },
      { table: "topics", type: "bigint", sequence: "public.topics_public_id_seq" },
    ]);
    for (const sequence of await sequenceState()) {
      expect(sequence.type).toBe("bigint");
      expect(sequence.max).toBe(2147483647n);
    }
    const triggers = await integrationDatabase.$queryRaw<
      Array<{ name: string; enabled: string; columns: string }>
    >`
      SELECT tgname AS name, tgenabled::text AS enabled, tgattr::text AS columns
      FROM pg_trigger WHERE tgrelid IN ('public.topics'::regclass,'public.entries'::regclass)
        AND tgname IN ('topics_public_id_immutable','entries_public_id_immutable') ORDER BY tgname`;
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) {
      expect(trigger.enabled).toBe("O");
      expect(trigger.columns).not.toBe("");
    }
    await expect(
      integrationDatabase.topic.update({
        where: { id: topic.id },
        data: { publicId: topic.publicId + 1n },
      }),
    ).rejects.toThrow(/publicId is immutable/u);
  });

  it("reads and serializes real upper namespace rows through ORM and raw SQL, then rolls back the test DDL", async () => {
    const user = await createUser();
    const rollback = new Error("BIGINT_FIXTURE_ROLLBACK");
    const sequencesBefore = await sequenceState();
    const checksBefore = await rangeChecks();
    await expect(
      integrationDatabase.$transaction(
        async (tx) => {
          // Yalnız allowlisted integration DB; bu bir üretim reset yürütücüsü değildir.
          await tx.$executeRaw`ALTER TABLE topics DROP CONSTRAINT topics_public_id_legacy_range`;
          await tx.$executeRaw`ALTER TABLE entries DROP CONSTRAINT entries_public_id_legacy_range`;
          await tx.$executeRaw`ALTER TABLE topics ADD CONSTRAINT topics_public_id_reset_range CHECK ("publicId" BETWEEN 2147483648 AND 9007199254740991)`;
          await tx.$executeRaw`ALTER TABLE entries ADD CONSTRAINT entries_public_id_reset_range CHECK ("publicId" BETWEEN 2147483648 AND 9007199254740991)`;
          await tx.$executeRaw`ALTER SEQUENCE topics_public_id_seq MAXVALUE 9007199254740991 RESTART WITH 2147483648`;
          await tx.$executeRaw`ALTER SEQUENCE entries_public_id_seq MAXVALUE 9007199254740991 RESTART WITH 3000000000`;
          const now = new Date();
          const actor = {
            actorId: user.id,
            actorKind: "HUMAN" as const,
            actorRole: "ADMIN" as const,
            origin: "WEB" as const,
            requestId: randomUUID(),
          };
          const created = await createTopicWithFirstEntry(tx, actor, {
            title: "Yeni kimlik",
            entryBody: "Yeni namespace içeriği.",
          });
          expect(created.topic.publicId).toBe(2147483648);
          expect(created.entry.publicId).toBe(3000000000);
          const added = await createEntry(tx, actor, created.topic.id, {
            body: "İkinci namespace entry içeriği.",
          });
          expect(added.publicId).toBe(3000000001);
          expect(() => JSON.stringify([created, added])).not.toThrow();
          const scope = { actorId: user.id, route: "/api/v1/topics", key: "bigint-json" };
          await createIdempotencyRecord(tx, {
            ...scope,
            requestHash: "fixture",
            responseStatus: 201,
            responseBody: JSON.parse(JSON.stringify(created)),
            expiresAt: new Date(now.getTime() + 1000),
          });
          expect((await findIdempotencyRecord(tx, scope))?.responseBody).toEqual(
            JSON.parse(JSON.stringify(created)),
          );
          expect(await tx.auditLog.count({ where: { requestId: actor.requestId } })).toBe(2);
          expect(await tx.outboxEvent.count({ where: { requestId: actor.requestId } })).toBe(2);
          const moderation = await Promise.all([
            findTopicForModeration(tx, created.topic.id),
            findEntryForMove(tx, created.entry.id),
            listModerationTopics(tx, { skip: 0, take: 10 }),
          ]);
          expect(moderation[0]?.publicId).toBe(2147483648);
          expect(moderation[1]?.publicId).toBe(3000000000);
          expect(moderation[2][0][0]?.publicId).toBe(2147483648);
          expect(() => JSON.stringify(moderation)).not.toThrow();
          const search = await searchRecords(tx, {
            query: "namespace",
            type: "entries",
            skip: 0,
            take: 10,
          });
          expect(search.results.map((row) => row.url).sort()).toEqual([
            "/entry/3000000000",
            "/entry/3000000001",
          ]);
          const native = await tx.topic.findUniqueOrThrow({ where: { id: created.topic.id } });
          expect(native.publicId).toBe(2147483648n);
          const settings = {
            indexingMode: "INDEX_ALL" as const,
            sitemapDelayMinutes: 0,
            agentTopicIndexingEnabled: true,
          };
          const later = new Date(
            Math.max(created.entry.createdAt.getTime(), added.createdAt.getTime()) + 1,
          );
          const results = await Promise.all([
            findTopicByPublicId(tx, created.topic.publicId),
            findEntryByPublicId(tx, created.entry.publicId),
            listScoredTopics(tx, { windowStart: new Date(0), now: later, skip: 0, take: 10 }),
            listTopEntryPerTopic(tx, { topicIds: [created.topic.id] }),
            listIndexableEntries(tx, settings, { skip: 0, take: 10, now: later }),
            listSyndicationEntries(tx, settings, { take: 10, now: later }),
          ]);
          expect(results[0]?.publicId).toBe(2147483648);
          expect(results[1]?.topic.publicId).toBe(2147483648);
          expect(results[2].topics[0]?.publicId).toBe(2147483648);
          expect(results[3]).toHaveLength(1);
          expect([3000000000, 3000000001]).toContain(results[3][0]?.publicId);
          for (const rows of [results[4], results[5]])
            expect(rows.map((row) => row.publicId).sort()).toEqual([3000000000, 3000000001]);
          expect(() => JSON.stringify(results)).not.toThrow();
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
    // ALTER SEQUENCE RESTART, MAXVALUE ve CHECK geçişi transaction rollback'ine bağlıdır.
    expect(await sequenceState()).toEqual(sequencesBefore);
    expect(await rangeChecks()).toEqual(checksBefore);
    expect(checksBefore.map((check) => check.name)).toEqual([
      "entries_public_id_legacy_range",
      "topics_public_id_legacy_range",
    ]);
    expect(await integrationDatabase.topic.count()).toBe(0);
    expect(await integrationDatabase.entry.count()).toBe(0);
    expect(await integrationDatabase.auditLog.count()).toBe(0);
    expect(await integrationDatabase.outboxEvent.count()).toBe(0);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(0);
  });
});
