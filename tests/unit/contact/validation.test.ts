import { describe, expect, it } from "vitest";
import { isSameSitePath } from "@/modules/contact/domain/contact-message";
import {
  contactMessageCreateSchema,
  contactMessageHandleSchema,
} from "@/modules/contact/validation/schemas";

const gecerli = {
  kind: "CONTENT_REMOVAL" as const,
  message: "Bu entry’deki adresim kaldırılsın lütfen.",
};

describe("iletişim formu doğrulaması", () => {
  it("en az on karakterlik ileti ister", () => {
    expect(contactMessageCreateSchema.safeParse({ ...gecerli, message: "kısa" }).success).toBe(
      false,
    );
    expect(contactMessageCreateSchema.safeParse(gecerli).success).toBe(true);
  });

  it("boş bırakılan isteğe bağlı alanları undefined'a çevirir", () => {
    const sonuc = contactMessageCreateSchema.parse({
      ...gecerli,
      subjectPath: "   ",
      replyEmail: "",
    });
    expect(sonuc.subjectPath).toBeUndefined();
    expect(sonuc.replyEmail).toBeUndefined();
  });

  it("yanıt adresini normalleştirir ve geçersizini reddeder", () => {
    expect(
      contactMessageCreateSchema.parse({ ...gecerli, replyEmail: "  Kisi@Site.COM " }),
    ).toEqual(expect.objectContaining({ replyEmail: "kisi@site.com" }));
    expect(contactMessageCreateSchema.safeParse({ ...gecerli, replyEmail: "kisi@" }).success).toBe(
      false,
    );
  });

  it("ilgili sayfa olarak yalnız bu sitenin yolunu kabul eder", () => {
    expect(
      contactMessageCreateSchema.parse({ ...gecerli, subjectPath: "/baslik/agent-sozluk?sayfa=2" })
        .subjectPath,
    ).toBe("/baslik/agent-sozluk?sayfa=2");
    for (const adres of [
      "//baska-site.example",
      "/\\baska-site.example",
      "https://baska-site.example",
      "javascript:alert(1)",
      "/bir sayfa",
      "/baslik#parca",
      "baslik/1",
    ]) {
      expect(
        contactMessageCreateSchema.safeParse({ ...gecerli, subjectPath: adres }).success,
        adres,
      ).toBe(false);
    }
  });

  it("ileti ve not uzunluk tavanlarını uygular", () => {
    expect(
      contactMessageCreateSchema.safeParse({ ...gecerli, message: "a".repeat(4001) }).success,
    ).toBe(false);
    expect(contactMessageHandleSchema.safeParse({ note: "a".repeat(1001) }).success).toBe(false);
    // Kapatma notu zorunlu: arayüz de en az 10 karakter istiyor.
    expect(contactMessageHandleSchema.safeParse({ note: "   " }).success).toBe(false);
    // Boş olmayan ama kısa not da reddedilmeli; yoksa `.min(10)` → `.min(1)` sessiz geçer.
    expect(contactMessageHandleSchema.safeParse({ note: "gizledim" }).success).toBe(false);
    expect(contactMessageHandleSchema.safeParse({}).success).toBe(false);
    expect(contactMessageHandleSchema.parse({ note: "  İçerik gizlendi.  " }).note).toBe(
      "İçerik gizlendi.",
    );
  });

  it("alt sınırı veritabanı gibi karakterle sayar, UTF-16 birimiyle değil", () => {
    // 5 emoji = 10 UTF-16 birimi ama PostgreSQL için 5 karakter; `.min(10)` bunu
    // geçirip CHECK'te 500'e düşürüyordu.
    const bes = "👍".repeat(5);
    const on = "👍".repeat(10);
    expect(contactMessageCreateSchema.safeParse({ ...gecerli, message: bes }).success).toBe(false);
    expect(contactMessageCreateSchema.safeParse({ ...gecerli, message: on }).success).toBe(true);
    expect(contactMessageHandleSchema.safeParse({ note: bes }).success).toBe(false);
    expect(contactMessageHandleSchema.safeParse({ note: on }).success).toBe(true);
    expect(contactMessageHandleSchema.safeParse({ note: "1234567890" }).success).toBe(true);
  });

  it("bilinmeyen konu değerini reddeder", () => {
    expect(contactMessageCreateSchema.safeParse({ ...gecerli, kind: "SPAM" }).success).toBe(false);
  });
});

describe("isSameSitePath", () => {
  it("protokole göreli adresleri dışarıda bırakır", () => {
    expect(isSameSitePath("/")).toBe(true);
    expect(isSameSitePath("//evil.example")).toBe(false);
    expect(isSameSitePath("/\\evil.example")).toBe(false);
  });
});
