import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { GREAT_RESET_INTENT_SCOPE } from "../../src/modules/maintenance/repository/great-reset-namespace";
import { runIntegrationTestGreatReset } from "../../src/modules/maintenance/repository/great-reset";
import {
  createIntent as createOperationIntent,
  invalidateIntent,
  recordTrafficOpen,
  restoreEligibility,
} from "../../src/modules/maintenance/repository/great-reset-operation";
import { computeReceipt } from "../../src/modules/maintenance/repository/great-reset-receipt";

/*
  Gerçek reset yürütücüsünün uçtan uca kanıtı (tasarım v20 madde 6, Astra PR #237 P2): hedef DB'nin
  sahibi olan rol (CI'da süper kullanıcı olmayan `agent_sozluk`) önizleme → bağlantı kapısıyla
  EXECUTE → COMMIT yolunu ve kapının kendiliğinden yeniden açılmasını yürütür. Her senaryo kendi
  scratch DB'sinde koşar; DB'yi yalnız fixture yöneticisi açar, işaretler ve düşürür.
*/
const ownerUrl = new URL(
  process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/agent_sozluk_test",
);
const adminUrl = new URL(process.env.TEST_ADMIN_DATABASE_URL ?? ownerUrl.toString());
const owner = decodeURIComponent(ownerUrl.username);
const marker = "agentsozluk:great-reset:integration-test:v1";
const releaseSha = "c".repeat(40);
const receiptSha256 = "d".repeat(64);

function urlFor(base: URL, database: string): string {
  const url = new URL(base.toString());
  url.pathname = `/${database}`;
  url.search = "";
  return url.toString();
}

const admin = new PrismaClient({
  datasourceUrl: `${urlFor(adminUrl, "postgres")}?connection_limit=2`,
  log: [],
});
const created: string[] = [];

afterAll(async () => {
  for (const name of created) {
    await admin
      .$executeRawUnsafe(`ALTER DATABASE "${name}" WITH ALLOW_CONNECTIONS true`)
      .catch(() => undefined);
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await admin.$disconnect();
}, 120_000);

async function scratchDatabase(): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/u.test(owner)) throw new Error("TEST_OWNER_INVALID");
  const name = `great_reset_e2e_${randomBytes(4).toString("hex")}_test`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" OWNER "${owner}"`);
  created.push(name);
  await admin.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
  execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: urlFor(ownerUrl, name) },
    stdio: "ignore",
    timeout: 240_000,
  });
  const database = new PrismaClient({ datasourceUrl: urlFor(ownerUrl, name), log: [] });
  try {
    if (process.env.GREAT_RESET_REQUIRE_NON_SUPERUSER === "1") {
      const [role] = await database.$queryRaw<{ superuser: boolean }[]>`
        SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`;
      expect(role?.superuser).toBe(false);
    }
    await database.agentGlobalSettings.update({
      where: { id: "global" },
      data: {
        runtimeEnabled: false,
        schedulerEnabled: false,
        publicWriteEnabled: false,
        publishEnabled: false,
      },
    });
    const user = await database.user.create({
      data: {
        email: "reset-e2e@example.test",
        emailNormalized: "reset-e2e@example.test",
        username: "resete2eyazari",
        usernameNormalized: "resete2eyazari",
        displayName: "Reset E2E Yazarı",
        passwordHash: "test-hash",
        termsVersion: "test",
        termsAcceptedAt: new Date(),
      },
    });
    const topic = await database.topic.create({
      data: {
        title: "Eski Başlık",
        normalizedTitle: "eski başlık",
        slug: "eski-baslik",
        createdById: user.id,
      },
    });
    await database.entry.create({
      data: {
        topicId: topic.id,
        authorId: user.id,
        origin: "WEB",
        body: "Reset tarafından silinecek eski entry metni.",
        normalizedBody: "reset tarafından silinecek eski entry metni.",
      },
    });
  } finally {
    await database.$disconnect();
  }
  return name;
}

async function createIntent(name: string, operationId: string) {
  const database = new PrismaClient({ datasourceUrl: urlFor(ownerUrl, name), log: [] });
  try {
    const createdAt = new Date();
    await database.greatResetIntent.create({
      data: {
        operationId,
        scope: GREAT_RESET_INTENT_SCOPE,
        releaseSha,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 3_600_000),
      },
    });
  } finally {
    await database.$disconnect();
  }
}

async function state(name: string) {
  const [row] = await admin.$queryRaw<{ allowed: boolean }[]>`
    SELECT datallowconn AS allowed FROM pg_database WHERE datname = ${name}`;
  const database = new PrismaClient({ datasourceUrl: urlFor(ownerUrl, name), log: [] });
  try {
    const [counts] = await database.$queryRaw<
      {
        entries: number;
        topics: number;
        commits: number;
        tombstones: number;
        consumed: number;
        sequence: string;
        called: boolean;
      }[]
    >`
      SELECT (SELECT count(*)::int FROM entries) AS entries,
        (SELECT count(*)::int FROM topics) AS topics,
        (SELECT count(*)::int FROM great_reset_commits) AS commits,
        (SELECT count(*)::int FROM great_reset_tombstones) AS tombstones,
        (SELECT count(*)::int FROM great_reset_intents WHERE "consumedAt" IS NOT NULL) AS consumed,
        (SELECT last_value::text FROM entries_public_id_seq) AS sequence,
        (SELECT is_called FROM entries_public_id_seq) AS called`;
    return { allowed: row?.allowed, ...counts! };
  } finally {
    await database.$disconnect();
  }
}

describe("great reset yürütücüsü, hedef DB sahibi rolle ve bağlantı kapısıyla", () => {
  it("önizleme → kapılı EXECUTE → COMMIT; kapı kendiliğinden yeniden açılır", async () => {
    const name = await scratchDatabase();
    const operationId = randomUUID();
    await createIntent(name, operationId);
    const namespace = { operationId, releaseSha, receiptSha256 };
    const preview = await runIntegrationTestGreatReset(urlFor(ownerUrl, name), {
      mode: "DRY_RUN",
      archiveOutbox: true,
      namespace,
      connectionGate: true,
    });
    expect(preview.blockedBy).toEqual([]);
    const result = await runIntegrationTestGreatReset(urlFor(ownerUrl, name), {
      mode: "EXECUTE",
      databaseName: name,
      planSha256: preview.planSha256,
      archiveOutbox: true,
      namespace,
      connectionGate: true,
    });
    expect(result).toMatchObject({ verified: true, topicTombstones: 1, entryTombstones: 1 });
    expect(await state(name)).toMatchObject({
      allowed: true,
      entries: 0,
      topics: 0,
      commits: 1,
      tombstones: 2,
      consumed: 1,
      sequence: "2147483648",
      called: false,
    });
  }, 300_000);

  it("başka rolün backend'i varken EXECUTE fail-closed durur, hiçbir şey değişmez, kapı açılır", async () => {
    const name = await scratchDatabase();
    const operationId = randomUUID();
    await createIntent(name, operationId);
    const namespace = { operationId, releaseSha, receiptSha256 };
    const preview = await runIntegrationTestGreatReset(urlFor(ownerUrl, name), {
      mode: "DRY_RUN",
      archiveOutbox: true,
      namespace,
      connectionGate: true,
    });
    expect(preview.blockedBy).toEqual([]);
    const other = new PrismaClient({ datasourceUrl: urlFor(adminUrl, name), log: [] });
    try {
      await other.$queryRaw`SELECT 1`;
      await expect(
        runIntegrationTestGreatReset(urlFor(ownerUrl, name), {
          mode: "EXECUTE",
          databaseName: name,
          planSha256: preview.planSha256,
          archiveOutbox: true,
          namespace,
          connectionGate: true,
        }),
      ).rejects.toThrow("GREAT_RESET_GATE_OTHER_BACKEND");
    } finally {
      await other.$disconnect();
    }
    expect(await state(name)).toMatchObject({
      allowed: true,
      entries: 1,
      topics: 1,
      commits: 0,
      tombstones: 0,
      consumed: 0,
    });
  }, 300_000);

  it("test profili işaretsiz veya kalıba uymayan DB'yi hiç açmaz", async () => {
    await expect(
      runIntegrationTestGreatReset(urlFor(ownerUrl, "agent_sozluk"), { mode: "DRY_RUN" }),
    ).rejects.toThrow("GREAT_RESET_INVALID_TARGET");
    const name = `great_reset_e2e_${randomBytes(4).toString("hex")}_test`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" OWNER "${owner}"`);
    created.push(name);
    await expect(
      runIntegrationTestGreatReset(urlFor(ownerUrl, name), { mode: "DRY_RUN" }),
    ).rejects.toThrow("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
  }, 120_000);
  it("operasyon adımları: niyet, reset sonrası makbuz, restore uygunluğu, trafik olayı", async () => {
    const name = await scratchDatabase();
    const database = new PrismaClient({
      datasourceUrl: `${urlFor(ownerUrl, name)}?connection_limit=1`,
      log: [],
    });
    try {
      const [cluster] = await database.$queryRaw<{ id: string }[]>`
        SELECT system_identifier::text AS id FROM pg_control_system()`;
      const identity = { databaseName: name, owner, clusterId: cluster!.id };
      // Yanlış kimlik (başka DB adı) hiçbir şey yazmaz.
      await expect(
        createOperationIntent(
          database,
          { ...identity, databaseName: "agent_sozluk" },
          randomUUID(),
          releaseSha,
        ),
      ).rejects.toThrow("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
      // Açık niyet varken ikincisi yazılmaz; geçersizleştirilen niyet yenisini engellemez.
      const first = randomUUID();
      await createOperationIntent(database, identity, first, releaseSha);
      await expect(
        createOperationIntent(database, identity, randomUUID(), releaseSha),
      ).rejects.toThrow("GREAT_RESET_INTENT_BLOCKED");
      await invalidateIntent(database, identity, first);
      await expect(invalidateIntent(database, identity, first)).rejects.toThrow(
        "GREAT_RESET_INTENT_NOT_INVALIDATED",
      );
      const operationId = randomUUID();
      await createOperationIntent(database, identity, operationId, releaseSha);
      // Commit yokken trafik olayı yazılmaz.
      await expect(recordTrafficOpen(database, identity, operationId)).rejects.toThrow(
        "GREAT_RESET_TRAFFIC_OPEN_WITHOUT_COMMIT",
      );
      await database.$disconnect();

      const namespace = { operationId, releaseSha, receiptSha256 };
      const preview = await runIntegrationTestGreatReset(urlFor(ownerUrl, name), {
        mode: "DRY_RUN",
        archiveOutbox: true,
        namespace,
        connectionGate: true,
      });
      await runIntegrationTestGreatReset(urlFor(ownerUrl, name), {
        mode: "EXECUTE",
        databaseName: name,
        planSha256: preview.planSha256,
        archiveOutbox: true,
        namespace,
        connectionGate: true,
      });

      const postReset = await computeReceipt(database, identity);
      expect(await restoreEligibility(database, identity, operationId, postReset)).toEqual([]);
      // Başka operasyonun kimliğiyle uygunluk yok.
      expect(await restoreEligibility(database, identity, randomUUID(), postReset)).toContain(
        "COMMIT_MISMATCH",
      );
      // Reset sonrası herhangi bir korunan yazı (ör. oran sınırı kovası) restore'u reddeder.
      await database.rateLimitBucket.create({
        data: {
          keyHash: "reset-e2e",
          action: "search",
          windowStart: new Date(),
          count: 1,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      expect(await restoreEligibility(database, identity, operationId, postReset)).toEqual([
        "RECEIPT_CHANGED",
      ]);
      await database.rateLimitBucket.deleteMany({ where: { keyHash: "reset-e2e" } });
      expect(await restoreEligibility(database, identity, operationId, postReset)).toEqual([]);

      await recordTrafficOpen(database, identity, operationId);
      // İdempotent yeniden deneme aynı satırı okur.
      await recordTrafficOpen(database, identity, operationId);
      const [events] = await database.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM great_reset_exposure_events`;
      expect(events?.count).toBe(1);
      expect(await restoreEligibility(database, identity, operationId, postReset)).toEqual(
        expect.arrayContaining(["EXPOSURE_PRESENT", "RECEIPT_CHANGED"]),
      );
      // İkinci reset yasağı: commit/trafik olayı varken yeni niyet yazılmaz.
      await expect(
        createOperationIntent(database, identity, randomUUID(), releaseSha),
      ).rejects.toThrow("GREAT_RESET_INTENT_BLOCKED");
    } finally {
      await database.$disconnect();
    }
  }, 300_000);
});
