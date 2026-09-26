import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideRemovedContent } from "../../src/modules/maintenance/application/removed-content";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const sha1 = "a".repeat(40);
const sha256 = "b".repeat(64);

async function commit(operationId = randomUUID()) {
  await integrationDatabase.greatResetCommit.create({
    data: {
      operationId,
      releaseSha: sha1,
      planSha256: sha256,
      receiptSha256: sha256,
      topicTombstones: 1,
      entryTombstones: 1,
    },
  });
  return operationId;
}

async function liveTopicAndEntry() {
  const user = await integrationDatabase.user.create({
    data: {
      email: "reset@example.test",
      emailNormalized: "reset@example.test",
      username: "resetyazari",
      usernameNormalized: "resetyazari",
      displayName: "Reset Yazarı",
      passwordHash: "test-hash",
      termsVersion: "test",
      termsAcceptedAt: new Date(),
    },
  });
  const topic = await integrationDatabase.topic.create({
    data: {
      title: "Canlı Başlık",
      normalizedTitle: "canlı başlık",
      slug: "canli-baslik",
      createdById: user.id,
    },
  });
  const entry = await integrationDatabase.entry.create({
    data: {
      topicId: topic.id,
      authorId: user.id,
      origin: "WEB",
      body: "Reset sonrası canlı kalan entry metni.",
      normalizedBody: "reset sonrası canlı kalan entry metni.",
    },
  });
  return { topic, entry };
}

describe("great reset kayıtlarının PostgreSQL sınırı", () => {
  beforeEach(resetIntegrationDatabase);
  afterAll(closeIntegrationDatabase);

  it("commit, mezar taşı ve trafik olayını append-only tutar", async () => {
    const operationId = await commit();
    await integrationDatabase.greatResetTombstone.create({
      data: { kind: "ENTRY", contentId: randomUUID(), publicId: 7, operationId },
    });
    await integrationDatabase.greatResetExposureEvent.create({
      data: { operationId, eventType: "TRAFFIC_OPEN" },
    });
    await expect(
      integrationDatabase.greatResetCommit.update({
        where: { operationId },
        data: { topicTombstones: 2 },
      }),
    ).rejects.toThrow(/GREAT_RESET_RECORD_IMMUTABLE/u);
    await expect(integrationDatabase.greatResetTombstone.deleteMany()).rejects.toThrow(
      /GREAT_RESET_RECORD_IMMUTABLE/u,
    );
    await expect(integrationDatabase.greatResetExposureEvent.deleteMany()).rejects.toThrow(
      /GREAT_RESET_RECORD_IMMUTABLE/u,
    );
    for (const table of [
      "great_reset_commits",
      "great_reset_tombstones",
      "great_reset_exposure_events",
      "great_reset_intents",
    ]) {
      await expect(
        integrationDatabase.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`),
      ).rejects.toThrow(/GREAT_RESET_RECORD_IMMUTABLE/u);
    }
  });

  it("ikinci commit satırını ve eski namespace dışı mezar taşını reddeder", async () => {
    const operationId = await commit();
    await expect(commit()).rejects.toThrow();
    await expect(
      integrationDatabase.greatResetTombstone.create({
        data: { kind: "TOPIC", contentId: randomUUID(), publicId: 2147483648, operationId },
      }),
    ).rejects.toThrow();
    await integrationDatabase.greatResetTombstone.create({
      data: { kind: "TOPIC", contentId: randomUUID(), publicId: 5, operationId },
    });
    await expect(
      integrationDatabase.greatResetTombstone.create({
        data: { kind: "TOPIC", contentId: randomUUID(), publicId: 5, operationId },
      }),
    ).rejects.toThrow();
  });

  it("niyette yalnız tek sonuç geçişine izin verir", async () => {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 60 * 60_000);
    const intent = (operationId: string) =>
      integrationDatabase.greatResetIntent.create({
        data: {
          operationId,
          scope: "GREAT_RESET_PRODUCTION_V1",
          releaseSha: sha1,
          createdAt,
          expiresAt,
        },
      });
    await expect(
      integrationDatabase.greatResetIntent.create({
        data: {
          operationId: randomUUID(),
          scope: "GREAT_RESET_PRODUCTION_V1",
          releaseSha: sha1,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 3 * 60 * 60_000),
        },
      }),
    ).rejects.toThrow();
    const consumed = randomUUID();
    await intent(consumed);
    await integrationDatabase.greatResetIntent.update({
      where: { operationId: consumed },
      data: { consumedAt: new Date() },
    });
    await expect(
      integrationDatabase.greatResetIntent.update({
        where: { operationId: consumed },
        data: { invalidatedAt: new Date() },
      }),
    ).rejects.toThrow(/GREAT_RESET_INTENT_IMMUTABLE/u);
    const other = randomUUID();
    await intent(other);
    await expect(
      integrationDatabase.greatResetIntent.update({
        where: { operationId: other },
        data: { expiresAt: new Date(createdAt.getTime() + 90 * 60_000) },
      }),
    ).rejects.toThrow(/GREAT_RESET_INTENT_IMMUTABLE/u);
    await expect(
      integrationDatabase.greatResetIntent.delete({ where: { operationId: other } }),
    ).rejects.toThrow(/GREAT_RESET_RECORD_IMMUTABLE/u);
  });

  it("410'u yalnız commit sonrası, canlı olmayan ve mezar taşında kayıtlı kimliğe verir", async () => {
    const { topic, entry } = await liveTopicAndEntry();
    const topicPublicId = Number(topic.publicId);
    const entryPublicId = Number(entry.publicId);
    const goneEntryId = randomUUID();

    expect(await decideRemovedContent(integrationDatabase, "ENTRY", { publicId: 999 })).toEqual({
      status: "PASS",
      reason: "NO_RESET",
    });

    const operationId = await commit();
    await integrationDatabase.greatResetTombstone.createMany({
      data: [
        { kind: "ENTRY", contentId: goneEntryId, publicId: 999, operationId },
        // Canlı kayıtla çakışan mezar taşı: canlı kayıt kazanmalı.
        { kind: "TOPIC", contentId: randomUUID(), publicId: topicPublicId, operationId },
      ],
    });

    expect(await decideRemovedContent(integrationDatabase, "ENTRY", { publicId: 999 })).toEqual({
      status: "GONE",
    });
    expect(
      await decideRemovedContent(integrationDatabase, "ENTRY", { contentId: goneEntryId }),
    ).toEqual({ status: "GONE" });
    // Aynı sayı başka türde bilinmiyor.
    expect(await decideRemovedContent(integrationDatabase, "TOPIC", { publicId: 999 })).toEqual({
      status: "PASS",
      reason: "UNKNOWN",
    });
    expect(
      await decideRemovedContent(integrationDatabase, "TOPIC", { publicId: topicPublicId }),
    ).toEqual({ status: "PASS", reason: "LIVE" });
    expect(
      await decideRemovedContent(integrationDatabase, "ENTRY", { publicId: entryPublicId }),
    ).toEqual({ status: "PASS", reason: "LIVE" });
    expect(await decideRemovedContent(integrationDatabase, "ENTRY", { publicId: 12345 })).toEqual({
      status: "PASS",
      reason: "UNKNOWN",
    });
    expect(
      await decideRemovedContent(integrationDatabase, "ENTRY", { publicId: 2147483648 }),
    ).toEqual({ status: "PASS", reason: "NOT_CANDIDATE" });
    expect(
      await decideRemovedContent(integrationDatabase, "ENTRY", { contentId: randomUUID() }),
    ).toEqual({ status: "PASS", reason: "UNKNOWN" });
  });
});
