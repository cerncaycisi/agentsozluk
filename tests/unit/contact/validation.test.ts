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
    expect(contactMessageHandleSchema.parse({ note: "   " }).note).toBeUndefined();
    expect(contactMessageHandleSchema.parse({}).note).toBeUndefined();
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
