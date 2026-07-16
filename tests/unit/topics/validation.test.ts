import { describe, expect, it } from "vitest";
import { topicCreateSchema } from "@/modules/topics/validation/schemas";

describe("topic validation", () => {
  it("preserves a cleaned display title while validating its normalized form", () => {
    expect(
      topicCreateSchema.parse({
        title: "  İyi   Bir\nBaşlık  ",
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
      }),
    ).toMatchObject({ title: "İyi Bir Başlık" });
  });

  it("rejects normalized titles outside the 2–100 character range", () => {
    expect(() =>
      topicCreateSchema.parse({
        title: "a",
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
      }),
    ).toThrow("Başlık en az 2 karakter olmalıdır.");
    expect(() =>
      topicCreateSchema.parse({
        title: "a".repeat(101),
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
      }),
    ).toThrow("Başlık en fazla 100 karakter olabilir.");
  });
});
