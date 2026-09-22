import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as iletisimPost } from "@/app/api/v1/iletisim/route";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  contactIpKeyHash,
  getContactMessages,
  resolveContactMessage,
  submitContactMessage,
} from "@/modules/contact/application/contact";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createUser(username: string, role: "USER" | "MODERATOR") {
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role,
      status: "ACTIVE",
      email: `${username}@integration.test`,
      emailNormalized: `${username}@integration.test`,
      username,
      usernameNormalized: username,
      displayName: username.replaceAll("_", " "),
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(userId: string, role: "USER" | "MODERATOR" = "MODERATOR"): ActorContext {
  return {
    actorId: userId,
    actorKind: "HUMAN",
    actorRole: role,
    requestId: randomUUID(),
    origin: "API",
  };
}

const GECERLI_HASH = "a".repeat(64);

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("iletişim iletileri (PostgreSQL)", () => {
  it("anonim iletiyi yazar, ham IP'yi saklamaz ve denetim kaydını bırakır", async () => {
    const requestId = randomUUID();
    const { id } = await submitContactMessage(
      integrationDatabase,
      {
        kind: "CONTENT_REMOVAL",
        message: "Bu entry'de adım geçiyor, kaldırın.",
        subjectPath: "/entry/42",
      },
      { ip: "203.0.113.7", submitterId: null, requestId },
    );
    const kayit = await integrationDatabase.contactMessage.findUniqueOrThrow({ where: { id } });
    expect(kayit).toMatchObject({
      kind: "CONTENT_REMOVAL",
      status: "OPEN",
      subjectUrl: "/entry/42",
      submitterId: null,
      replyEmail: null,
      handledById: null,
      handledAt: null,
    });
    expect(kayit.ipKeyHash).toBe(contactIpKeyHash("203.0.113.7"));
    const denetim = await integrationDatabase.auditLog.findFirstOrThrow({ where: { requestId } });
    expect(denetim).toMatchObject({
      action: "contact.message.created",
      entityType: "ContactMessage",
      entityId: id,
      actorId: null,
    });
    expect(JSON.stringify(denetim.metadata)).not.toContain("entry'de adım geçiyor");
  });

  /*
    Hesap silme bu uygulamada desteklenen bir işlem değil: `users` satırını
    silmek denetim kaydına dokunduğu için `audit_logs is append-only`
    tetikleyicisine takılıyor (CI, 22 Eylül). Bu yüzden burada ölçülen şey
    gönderenin doğru kaydedilmesi; FK'deki `ON DELETE SET NULL` savunma amaçlı.
  */
  it("oturumlu gönderimde göndereni kaydeder ve listede gösterir", async () => {
    const yazar = await createUser("iletisim_yazar", "USER");
    const moderator = await createUser("iletisim_okuyan", "MODERATOR");
    const { id } = await submitContactMessage(
      integrationDatabase,
      { kind: "OTHER", message: "Hesabımla ilgili bir sorum var." },
      { ip: "203.0.113.8", submitterId: yazar.id, requestId: randomUUID() },
    );
    await expect(
      integrationDatabase.contactMessage.findUniqueOrThrow({ where: { id } }),
    ).resolves.toMatchObject({ submitterId: yazar.id });
    const [iletiler] = await getContactMessages(integrationDatabase, actor(moderator.id), {
      status: "OPEN",
      skip: 0,
      take: 20,
    });
    expect(iletiler[0]?.submitter?.username).toBe("iletisim_yazar");
  });

  it("veritabanı kısıtları kısa iletiyi, bozuk IP özetini ve tutarsız durumu reddeder", async () => {
    const temel = {
      kind: "OTHER" as const,
      message: "Yeterince uzun bir ileti.",
      ipKeyHash: GECERLI_HASH,
    };
    await expect(
      integrationDatabase.contactMessage.create({ data: { ...temel, message: "kısa" } }),
    ).rejects.toThrow();
    await expect(
      integrationDatabase.contactMessage.create({ data: { ...temel, ipKeyHash: "ZZZZ" } }),
    ).rejects.toThrow();
    await expect(
      integrationDatabase.contactMessage.create({ data: { ...temel, status: "HANDLED" } }),
    ).rejects.toThrow();
    await expect(integrationDatabase.contactMessage.create({ data: temel })).resolves.toMatchObject(
      { status: "OPEN" },
    );
  });

  it("listeyi yalnız moderatöre verir ve yeni iletiyi başa koyar", async () => {
    const okur = await createUser("iletisim_okur", "USER");
    const moderator = await createUser("iletisim_moderator", "MODERATOR");
    for (const metin of ["Birinci ileti gövdesi burada.", "İkinci ileti gövdesi burada."]) {
      await submitContactMessage(
        integrationDatabase,
        { kind: "OTHER", message: metin },
        { ip: "203.0.113.9", submitterId: null, requestId: randomUUID() },
      );
    }
    await expect(
      getContactMessages(integrationDatabase, actor(okur.id, "USER"), {
        status: "OPEN",
        skip: 0,
        take: 20,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [iletiler, toplam] = await getContactMessages(integrationDatabase, actor(moderator.id), {
      status: "OPEN",
      skip: 0,
      take: 20,
    });
    expect(toplam).toBe(2);
    expect(iletiler[0]?.message).toBe("İkinci ileti gövdesi burada.");
  });

  it("iletiyi bir kez ele alınmış işaretler, ikinci denemede çakışma verir", async () => {
    const moderator = await createUser("iletisim_kapatan", "MODERATOR");
    const { id } = await submitContactMessage(
      integrationDatabase,
      { kind: "CONTENT_REMOVAL", message: "Bu içerik kaldırılsın lütfen." },
      { ip: "203.0.113.10", submitterId: null, requestId: randomUUID() },
    );
    await resolveContactMessage(integrationDatabase, actor(moderator.id), id, {
      note: "İçerik gizlendi.",
    });
    const kayit = await integrationDatabase.contactMessage.findUniqueOrThrow({ where: { id } });
    expect(kayit).toMatchObject({
      status: "HANDLED",
      handledById: moderator.id,
      handledNote: "İçerik gizlendi.",
    });
    expect(kayit.handledAt).not.toBeNull();
    await expect(
      resolveContactMessage(integrationDatabase, actor(moderator.id), id, {
        note: "Zaten kapatılmıştı.",
      }),
    ).rejects.toMatchObject({ code: "CONTACT_MESSAGE_NOT_OPEN" });
    const [, acikToplam] = await getContactMessages(integrationDatabase, actor(moderator.id), {
      status: "OPEN",
      skip: 0,
      take: 20,
    });
    expect(acikToplam).toBe(0);
  });
});

describe("iletişim formu oran sınırı (gerçek route + PostgreSQL)", () => {
  /*
    Route testi limiter'ı mock'luyor, entegrasyon testi de route'u çağırmıyordu:
    gerçek sayacın altıncı isteği reddettiğini hiçbir test görmüyordu
    (Sol, 22 Eylül). Burada gerçek uç, gerçek kova ve gerçek tablo var.
  */
  const site = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

  function istek(mesaj: string) {
    return new NextRequest(`${site}/api/v1/iletisim`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: site,
        "x-forwarded-for": "203.0.113.50",
      },
      body: JSON.stringify({ kind: "OTHER", message: mesaj }),
    });
  }

  it("aynı IP'den saatte beş gönderim kabul eder, altıncıyı reddeder", async () => {
    const durumlar: number[] = [];
    for (let sira = 1; sira <= 6; sira += 1) {
      const response = await iletisimPost(istek(`Oran sınırı denemesi ${sira} numaralı ileti.`));
      durumlar.push(response.status);
    }
    expect(durumlar).toEqual([201, 201, 201, 201, 201, 429]);
    expect(await integrationDatabase.contactMessage.count()).toBe(5);
  });
});
