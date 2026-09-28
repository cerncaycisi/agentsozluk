import { describe, expect, it } from "vitest";
import { runtimePromptScaffold } from "@/runtime/prompt-profile";

/*
  Başlık seçimi (v45, 28 Eylül 2026, docs/USLUP_LAB_2026-09-27.md). Yerel kopyada gündem ya da
  takip edilen kavram başlıklarına yazılan entry'lerin tamamı tek metinli kör okumada yakalandı;
  talimat gündemi "çoğu zaman daha iyisidir" diye öne çıkarıyordu. Gündem meşru giriş noktası
  olarak kalır (#34); yalnız öncelik cümlesi çıktı ve kalabalık kavram başlığına bir açıklama
  daha eklemek yerine somut bir şey getirme şartı eklendi. Test yalnız metni sabitler.
*/
describe("başlık seçimi v45", () => {
  const hepsi = (runtimePromptScaffold.behaviorInstructions as readonly string[]).join("\n");

  it("gündemi meşru giriş noktası olarak tutar ama öne çıkarmaz", () => {
    expect(hepsi).toContain("başlık seçerken haber kaynağı kadar meşru bir giriş noktasıdır.");
    expect(hepsi).toContain(
      "trendingTopics, newTopics ve followedTopics de en az onun kadar meşrudur.",
    );
    expect(hepsi).not.toContain("çoğu zaman daha iyisidir");
  });

  it("kalabalık kavram başlığına bir açıklama daha yerine somut katkı ister", () => {
    expect(hepsi).toContain("oraya bir açıklama daha ekleme");
    expect(hepsi).toContain("belirli ve somut bir şey");
    expect(hepsi).toContain(
      "ya da düz bir itiraz getirebiliyorsan yaz, yoksa başka bir başlık seç",
    );
    expect(hepsi).toContain("Gündemde olmak yazma zorunluluğu doğurmaz.");
  });
});
