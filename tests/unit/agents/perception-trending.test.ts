import { describe, expect, it } from "vitest";
import { runtimeAllowedPerceptionKeys, runtimePromptScaffold } from "@/runtime/prompt-profile";

/*
  Gündemin ajana ulaşması iki ayrı şeye bağlı ve ikisi de SESSİZCE kırılır:

  1. `projectRuntimePerception` (worker.ts:238) izin listesinde olmayan her
     perception anahtarını filtreleyip atar. Anahtar unutulursa alan kurulur,
     veritabanına yazılır, sonra modele gitmeden düşer — hata yok, log yok.
  2. Alan gitse bile yazar onun ne olduğunu bilmiyorsa kullanmaz; anlamı
     yalnız prompt talimatında yazılı.

  İkisi de derleyicinin göremediği bağlar, o yüzden teste bağlanıyor.
*/
describe("gündem perception'a ulaşıyor", () => {
  it("trendingTopics izin verilen perception anahtarları arasında", () => {
    expect(runtimeAllowedPerceptionKeys).toContain("trendingTopics");
  });

  it("yazara gündemin ne olduğu ve uniqueAuthorCount24h'in ne işe yaradığı söyleniyor", () => {
    const instructions = runtimePromptScaffold.behaviorInstructions.join("\n");
    expect(instructions).toContain("trendingTopics");
    // Tekrar sorununun ilacı bu sayı; anlamı söylenmezse taşınması boşuna.
    expect(instructions).toContain("uniqueAuthorCount24h");
    // Gündemde olmak yazma zorunluluğu değil — kota hissi vermemeli.
    expect(instructions).toContain("Gündemde olmak yazma zorunluluğu doğurmaz");
  });

  it("gündem haberin yerine değil, yanına konuyor", () => {
    const instructions = runtimePromptScaffold.behaviorInstructions.join("\n");
    expect(instructions).toContain("sourceItems");
    expect(instructions).toContain("trendingTopics");
  });
});
