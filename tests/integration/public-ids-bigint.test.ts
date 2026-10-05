import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTopicWithFirstEntryRecord,
  findTopicByPublicId,
} from "@/modules/topics/repository/topics";
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
  const username = `bigint_${randomUUID().replaceAll("-", "")}`;
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
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

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("BIGINT public id migration and PostgreSQL DTOs", () => {
  it("blocks upper namespace values before reset and keeps the legacy sequence ceiling", async () => {
    const user = await createUser();
    await expect(
      integrationDatabase.topic.create({
        data: {
          publicId: 2147483648n,
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
    await expect(
      integrationDatabase.entry.create({
        data: {
          publicId: 2147483648n,
          topicId: topic.id,
          authorId: user.id,
          origin: "WEB",
          body: "Blocked upper namespace",
          normalizedBody: "blocked upper namespace",
        },
      }),
    ).rejects.toThrow(/entries_public_id_legacy_range/u);
    const definitions = await integrationDatabase.$queryRaw<Array<{ name: string; max: bigint }>>`
      SELECT sequencename AS name, max_value AS max FROM pg_sequences
      WHERE schemaname='public' AND sequencename IN ('topics_public_id_seq','entries_public_id_seq') ORDER BY sequencename`;
    expect(definitions).toEqual([
      { name: "entries_public_id_seq", max: 2147483647n },
      { name: "topics_public_id_seq", max: 2147483647n },
    ]);
  });

  it("reads and serializes real upper namespace rows through ORM and raw SQL, then rolls back the test DDL", async () => {
    const user = await createUser();
    const rollback = new Error("BIGINT_FIXTURE_ROLLBACK");
    await expect(
      integrationDatabase.$transaction(
        async (tx) => {
          // Yalnız allowlisted integration DB; bu bir üretim reset yürütücüsü değildir.
          await tx.$executeRaw`ALTER TABLE topics DROP CONSTRAINT topics_public_id_legacy_range`;
          await tx.$executeRaw`ALTER TABLE entries DROP CONSTRAINT entries_public_id_legacy_range`;
          await tx.$executeRaw`ALTER TABLE topics ADD CONSTRAINT topics_public_id_reset_range CHECK ("publicId" BETWEEN 2147483648 AND 9007199254740991)`;
          await tx.$executeRaw`ALTER TABLE entries ADD CONSTRAINT entries_public_id_reset_range CHECK ("publicId" BETWEEN 2147483648 AND 9007199254740991)`;
          await tx.$executeRaw`ALTER SEQUENCE topics_public_id_seq MAXVALUE 9007199254740991 RESTART WITH 2147483648`;
          await tx.$executeRaw`ALTER SEQUENCE entries_public_id_seq MAXVALUE 9007199254740991 RESTART WITH 2147483648`;
          const now = new Date();
          const created = await createTopicWithFirstEntryRecord(tx, {
            title: "Yeni kimlik",
            normalizedTitle: "yeni kimlik",
            slug: "yeni-kimlik",
            createdById: user.id,
            entryBody: "Yeni namespace içeriği.",
            origin: "WEB",
            now,
          });
          expect(created.publicId).toBe(2147483648);
          expect(created.entries[0]!.publicId).toBe(2147483648);
          const native = await tx.topic.findUniqueOrThrow({ where: { id: created.id } });
          expect(native.publicId).toBe(2147483648n);
          const settings = {
            indexingMode: "INDEX_ALL" as const,
            sitemapDelayMinutes: 0,
            agentTopicIndexingEnabled: true,
          };
          const later = new Date(now.getTime() + 1000);
          const results = await Promise.all([
            findTopicByPublicId(tx, created.publicId),
            findEntryByPublicId(tx, created.entries[0]!.publicId),
            listScoredTopics(tx, { windowStart: new Date(0), now: later, skip: 0, take: 10 }),
            listTopEntryPerTopic(tx, { topicIds: [created.id] }),
            listIndexableEntries(tx, settings, { skip: 0, take: 10, now: later }),
            listSyndicationEntries(tx, settings, { take: 10, now: later }),
          ]);
          expect(results[0]?.publicId).toBe(2147483648);
          expect(results[1]?.topic.publicId).toBe(2147483648);
          expect(results[2].topics[0]?.publicId).toBe(2147483648);
          for (const rows of results.slice(3) as Array<Array<{ publicId: number }>>)
            expect(rows[0]?.publicId).toBe(2147483648);
          expect(() => JSON.stringify(results)).not.toThrow();
          throw rollback;
        },
        { timeout: 20000 },
      ),
    ).rejects.toBe(rollback);
    // ALTER SEQUENCE RESTART, MAXVALUE ve CHECK geçişi transaction rollback'ine bağlıdır.
    const sequenceAfter = await integrationDatabase.$queryRaw<
      Array<{ max: bigint }>
    >`SELECT max_value AS max FROM pg_sequences WHERE schemaname='public' AND sequencename='topics_public_id_seq'`;
    expect(sequenceAfter[0]?.max).toBe(2147483647n);
    expect(await integrationDatabase.topic.count()).toBe(0);
  });
});
