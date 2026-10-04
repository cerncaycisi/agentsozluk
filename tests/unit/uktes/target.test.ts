import { expect, it } from "vitest";
import { ukteTarget } from "@/modules/uktes/domain/target";
import { createTopicSlug } from "@/modules/topics/domain/normalization";
import { ukteCreateSchema } from "@/modules/uktes/validation/schemas";

it("uses canonical aliases while separating an absent slug from a real baslik slug", () => {
  expect(ukteTarget("KİL hakkında")).toEqual({
    normalizedTitle: "kil hakkında",
    targetKeys: ["kil hakkında", "kil"],
    slug: "kil-hakkinda",
  });
  expect(ukteTarget("東京").slug).toBe("");
  expect(ukteTarget("başlık").slug).toBe("baslik");
  expect(createTopicSlug("東京")).toBe("baslik");
});

it.each([
  "a".repeat(100) + "\u200d".repeat(300),
  "㍿".repeat(25),
  "Kazakistan'da hakkında bilgi?",
  "東京 nedir?",
])("yalnız sınırlı ve doğrulanmış başlıktan kısa eşleme anahtarları üretir: %s", (raw) => {
  const { title } = ukteCreateSchema.parse({ title: raw });
  const target = ukteTarget(title);
  expect(target.targetKeys.length).toBeGreaterThan(0);
  expect(target.targetKeys.length).toBeLessThanOrEqual(6);
  for (const key of target.targetKeys) {
    expect([...key].length).toBeGreaterThan(0);
    expect([...key].length).toBeLessThanOrEqual(100);
  }
  expect(target.slug.length).toBeLessThanOrEqual(80);
});

it("istemci eşleme anahtarlarını veya slug'ı doğrudan yazamaz", () => {
  expect(
    ukteCreateSchema.safeParse({ title: "geçerli başlık", targetKeys: ["a".repeat(10000)] })
      .success,
  ).toBe(false);
  expect(ukteCreateSchema.safeParse({ title: "geçerli başlık", slug: "keyfi" }).success).toBe(
    false,
  );
});
