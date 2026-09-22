import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  contactIpKeyHash,
  getContactMessages,
  resolveContactMessage,
  submitContactMessage,
} from "@/modules/contact/application/contact";
import type { DatabaseExecutor } from "@/lib/db/types";
import type { ActorContext } from "@/modules/auth/domain/actor";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";

function moderator(): ActorContext {
  return {
    actorId: ACTOR_ID,
    actorKind: "HUMAN",
    actorRole: "MODERATOR",
    requestId: REQUEST_ID,
    origin: "API",
  };
}

/**
 * `inTransaction` yalnız `$transaction` varsa transaction açıyor; sahte
 * istemcide o alan yok, bu yüzden iş doğrudan bu nesne üzerinde koşuyor.
 */
function sahteIstemci(overrides: Record<string, unknown> = {}) {
  const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
  const istemci = {
    contactMessage: {
      create: vi.fn().mockResolvedValue({ id: MESSAGE_ID, createdAt: new Date("2026-09-22") }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: auditCreate },
    user: { findUnique: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
  return { istemci: istemci as unknown as DatabaseExecutor, ham: istemci, auditCreate };
}

function aktifModerator() {
  return {
    id: ACTOR_ID,
    kind: "HUMAN" as const,
    role: "MODERATOR" as const,
    status: "ACTIVE",
    moderationCapabilities: [],
  };
}

describe("iletişim iletisi gönderimi", () => {
  it("anonim gönderimi yazar ve IP'yi ham hâlde saklamaz", async () => {
    const { istemci, ham, auditCreate } = sahteIstemci();
    await submitContactMessage(
      istemci,
      {
        kind: "CONTENT_REMOVAL",
        message: "Adresim entry'de geçiyor, kaldırın.",
        subjectPath: "/entry/12",
      },
      { ip: "203.0.113.7", submitterId: null, requestId: REQUEST_ID },
    );
    const veri = ham.contactMessage.create.mock.calls[0]![0].data;
    expect(veri).toMatchObject({
      kind: "CONTENT_REMOVAL",
      subjectUrl: "/entry/12",
      submitterId: null,
      replyEmail: null,
    });
    expect(veri.ipKeyHash).toBe(contactIpKeyHash("203.0.113.7"));
    expect(veri.ipKeyHash).not.toContain("203.0.113.7");
    expect(veri.ipKeyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("denetim kaydına ileti gövdesini, adresi ya da e-postayı kopyalamaz", async () => {
    const { istemci, auditCreate } = sahteIstemci();
    await submitContactMessage(
      istemci,
      {
        kind: "OTHER",
        message: "Gizli kalması gereken metin buraya yazıldı.",
        replyEmail: "kisi@site.com",
        subjectPath: "/entry/12",
      },
      { ip: "203.0.113.7", submitterId: null, requestId: REQUEST_ID },
    );
    const kayit = JSON.stringify(auditCreate.mock.calls[0]![0]);
    expect(kayit).not.toContain("kisi@site.com");
    expect(kayit).not.toContain("Gizli kalması gereken metin");
    expect(kayit).not.toContain("/entry/12");
    expect(kayit).not.toContain("203.0.113.7");
    expect(kayit).toContain("contact.message.created");
  });

  it("aynı IP farklı gönderimlerde aynı, farklı IP'de farklı özet üretir", () => {
    expect(contactIpKeyHash("203.0.113.7")).toBe(contactIpKeyHash("203.0.113.7"));
    expect(contactIpKeyHash("203.0.113.7")).not.toBe(contactIpKeyHash("203.0.113.8"));
  });
});

describe("moderasyon tarafı", () => {
  it("moderatör olmayan aktörden listeyi gizler", async () => {
    const { istemci, ham } = sahteIstemci();
    ham.user.findUnique.mockResolvedValue({ ...aktifModerator(), role: "USER" });
    await expect(
      getContactMessages(
        istemci,
        { ...moderator(), actorRole: "USER" },
        {
          status: "OPEN",
          skip: 0,
          take: 20,
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(ham.contactMessage.findMany).not.toHaveBeenCalled();
  });

  it("moderatöre listeyi ve toplamı verir", async () => {
    const { istemci, ham } = sahteIstemci();
    ham.user.findUnique.mockResolvedValue(aktifModerator());
    ham.contactMessage.findMany.mockResolvedValue([{ id: MESSAGE_ID }]);
    ham.contactMessage.count.mockResolvedValue(1);
    const [iletiler, toplam] = await getContactMessages(istemci, moderator(), {
      status: "OPEN",
      skip: 0,
      take: 20,
    });
    expect(iletiler).toHaveLength(1);
    expect(toplam).toBe(1);
  });

  it("ele alındı işaretini yalnız açık iletide uygular", async () => {
    const { istemci, ham, auditCreate } = sahteIstemci();
    ham.user.findUnique.mockResolvedValue(aktifModerator());
    const sonuc = await resolveContactMessage(istemci, moderator(), MESSAGE_ID, {
      note: "Kaldırıldı.",
    });
    expect(sonuc.status).toBe("HANDLED");
    expect(ham.contactMessage.updateMany.mock.calls[0]![0].where).toEqual({
      id: MESSAGE_ID,
      status: "OPEN",
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("zaten ele alınmış iletide çakışma hatası verir", async () => {
    const { istemci, ham, auditCreate } = sahteIstemci();
    ham.user.findUnique.mockResolvedValue(aktifModerator());
    ham.contactMessage.updateMany.mockResolvedValue({ count: 0 });
    const hata = await resolveContactMessage(istemci, moderator(), MESSAGE_ID, {}).catch(
      (error: unknown) => error,
    );
    expect(hata).toBeInstanceOf(AppError);
    expect(hata).toMatchObject({ code: "CONTACT_MESSAGE_NOT_OPEN", status: 409 });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("moderatör olmayan aktör işaretleme de yapamaz", async () => {
    const { istemci, ham } = sahteIstemci();
    ham.user.findUnique.mockResolvedValue({ ...aktifModerator(), status: "SUSPENDED" });
    await expect(resolveContactMessage(istemci, moderator(), MESSAGE_ID, {})).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    expect(ham.contactMessage.updateMany).not.toHaveBeenCalled();
  });
});
