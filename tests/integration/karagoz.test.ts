import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  duplicateReportPlan,
  fileDuplicateTopicReports,
  scanDuplicateTopics,
} from "@/modules/moderation/application/duplicate-topics";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import { getPublicProfile } from "@/modules/users/application/profiles";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  Karagöz (12 Ekim 2026): yeni başlık eski bir başlığa çok benziyorsa "kopya başlık" gammazı
  karagöz hesabıyla açılır; hiçbir şey birleştirilmez. Aynı çift ikinci taramada yeniden
  önerilmez. Hesap yazamaz ve profilinde otomatik bakım hesabı diye görünür.
*/

async function createUser(username: string, kind: "HUMAN" | "AGENT", role: "ADMIN" | "USER") {
  return integrationDatabase.user.create({
    data: {
      kind,
      role,
      status: "ACTIVE",
      email: `${username}@kopya.test`,
      emailNormalized: `${username}@kopya.test`,
      username,
      usernameNormalized: username,
      displayName: `Test ${username}`,
      passwordHash: "not-used",
      loginDisabled: kind === "AGENT",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

async function createTopic(title: string, createdById: string, createdAt: Date, entryCount = 1) {
  return integrationDatabase.topic.create({
    data: {
      title,
      normalizedTitle: normalizeTopicTitle(title),
      slug: createTopicSlug(title),
      createdById,
      createdAt,
      entryCount,
    },
  });
}

function actor(adminId: string): ActorContext {
  return {
    actorId: adminId,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("karagöz", () => {
  it("yeni ve çok benzer başlığa kopya gammazı açar; ikinci taramada aynı çifti önermez", async () => {
    const admin = await createUser("kopya_admin", "HUMAN", "ADMIN");
    const agent = await createUser("kopya_ajan", "AGENT", "USER");
    const now = new Date("2026-10-12T12:00:00.000Z");
    const eski = await createTopic(
      "toplantı notu tutmak",
      agent.id,
      new Date("2026-09-01T00:00:00.000Z"),
      5,
    );
    const yeni = await createTopic(
      "toplantı notunu tutmak",
      agent.id,
      new Date("2026-10-10T00:00:00.000Z"),
    );
    // Pencere dışında açılmış benzer çift önerilmez.
    await createTopic("asansör kapısını tutmak", agent.id, new Date("2026-08-01T00:00:00.000Z"));
    await createTopic("asansörün kapısını tutmak", agent.id, new Date("2026-08-02T00:00:00.000Z"));
    // Benzemeyen yeni başlık önerilmez.
    await createTopic("kuantum teknolojisi", agent.id, new Date("2026-10-11T00:00:00.000Z"));

    const pairs = await scanDuplicateTopics(integrationDatabase, { now, threshold: 0.6 });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ newerId: yeni.id, olderId: eski.id });
    // Kanonik: daha çok entry'si olan eski başlık; gammaz yeni başlığa açılır.
    expect(duplicateReportPlan(pairs[0]!)).toEqual({
      sourceId: yeni.id,
      sourceTitle: "toplantı notunu tutmak",
      canonicalTitle: "toplantı notu tutmak",
    });

    const result = await fileDuplicateTopicReports(integrationDatabase, actor(admin.id), pairs);
    expect(result.failed).toEqual([]);
    expect(result.filed).toHaveLength(1);
    const report = await integrationDatabase.report.findUniqueOrThrow({
      where: { id: result.filed[0]!.reportId },
    });
    expect(report).toMatchObject({
      targetType: "TOPIC",
      targetId: yeni.id,
      reason: "TOPIC_CANONICALIZATION_REQUEST",
      status: "OPEN",
      evidence: { suggestedTitle: "toplantı notu tutmak" },
    });
    // Gammazı karagöz açtı: agent profili yok, giriş kapalı, yalnız GAMMAZ yeteneği var.
    const karagoz = await integrationDatabase.user.findUniqueOrThrow({
      where: { usernameNormalized: "karagoz" },
      include: { agentProfile: true, moderationCapabilities: true },
    });
    expect(report.reporterId).toBe(karagoz.id);
    expect(karagoz).toMatchObject({
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      loginDisabled: true,
      writerApproved: false,
      displayName: "karagöz",
      agentProfile: null,
    });
    expect(karagoz.moderationCapabilities.map((c) => c.capability)).toEqual(["GAMMAZ"]);
    const profile = await getPublicProfile(integrationDatabase, {
      username: "karagoz",
      skip: 0,
      take: 10,
    });
    expect(profile.automatedAccount).toBe(true);
    // Hiçbir başlık birleştirilmedi.
    expect(await integrationDatabase.topic.count({ where: { status: { not: "ACTIVE" } } })).toBe(0);

    // Rapor reddedilse de çift bir daha önerilmez.
    await integrationDatabase.report.update({
      where: { id: report.id },
      data: { status: "REJECTED" },
    });
    expect(await scanDuplicateTopics(integrationDatabase, { now, threshold: 0.6 })).toEqual([]);
    // İkinci kurulum hesabı ya da yeteneği çoğaltmaz.
    await fileDuplicateTopicReports(integrationDatabase, actor(admin.id), []);
    expect(await integrationDatabase.user.count({ where: { usernameNormalized: "karagoz" } })).toBe(
      1,
    );
    expect(
      await integrationDatabase.userModerationCapability.count({ where: { userId: karagoz.id } }),
    ).toBe(1);
  });

  it("kanonik başlık daha çok entry'si olan yeni başlıksa gammaz eski başlığa açılır", () => {
    expect(
      duplicateReportPlan({
        newerId: "yeni",
        newerTitle: "Samsung Galaxy Buds",
        newerEntryCount: 4,
        newerCreatedAt: new Date(),
        olderId: "eski",
        olderTitle: "Galaxy Buds",
        olderEntryCount: 1,
        olderCreatedAt: new Date(),
        similarity: 0.8,
      }),
    ).toEqual({
      sourceId: "eski",
      sourceTitle: "Galaxy Buds",
      canonicalTitle: "Samsung Galaxy Buds",
    });
  });

  it("geçersiz tarama ayarını reddeder", async () => {
    await expect(
      scanDuplicateTopics(integrationDatabase, { now: new Date(), threshold: 0.2 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("karagöz kurulumu", () => {
  it("yalnız yönetici kurabilir", async () => {
    const user = await createUser("sade_kullanici", "HUMAN", "USER");
    await expect(
      fileDuplicateTopicReports(integrationDatabase, { ...actor(user.id), actorRole: "USER" }, []),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
