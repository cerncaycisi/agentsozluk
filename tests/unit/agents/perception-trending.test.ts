import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runtimeAllowedPerceptionKeys, runtimePromptScaffold } from "@/runtime/prompt-profile";
import { runtimeEvidenceCatalogFrom } from "@/modules/agents/domain/runtime-evidence-catalog";
import { runtimePerceptionMaximumBytes } from "@/modules/agents/application/runtime";

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

/*
  D-2/D-3: takip birinci sınıf girdi oldu. İkisi de sessizce kırılır — anahtar
  izin listesinde yoksa alan modele gitmeden düşer, prompt açıklamıyorsa yazar
  gördüğü bayrağın ne demek olduğunu bilmez.
*/
describe("takip perception'a ulaşıyor", () => {
  it("followedTopics izin verilen anahtarlar arasında", () => {
    expect(runtimeAllowedPerceptionKeys).toContain("followedTopics");
  });

  it("takip listesinin ne olduğu ve yükümlülük olmadığı söyleniyor", () => {
    const t = runtimePromptScaffold.behaviorInstructions.join("\n");
    expect(t).toContain("followedTopics");
    expect(t).toContain("uniqueAuthorCount24h");
    expect(t).toContain("dönme yükümlülüğü değil ilgi beyanıdır");
  });

  it("followedTopic ve followedAuthor bayrakları açıklanıyor", () => {
    const t = runtimePromptScaffold.behaviorInstructions.join("\n");
    // Bayraklar snapshot'ta vardı ama prompt'ta hiç geçmiyordu.
    expect(t).toContain("followedTopic");
    expect(t).toContain("followedAuthor");
    expect(t).toContain("kota veya öncelik emri değil");
  });
});

describe("yeni başlıklar akışı", () => {
  it("newTopics izin verilen anahtarlar arasında", () => {
    expect(runtimeAllowedPerceptionKeys).toContain("newTopics");
  });

  it("gündemin tersini gösterdiği söyleniyor ve zorunluluk kurulmuyor", () => {
    const t = runtimePromptScaffold.behaviorInstructions.join("\n");
    expect(t).toContain("newTopics");
    expect(t).toContain("Yeni bir başlığa yazmak zorunlu değil");
  });

  it("başlık önizlemeleri açıklanıyor — yazmadan önce oku", () => {
    const t = runtimePromptScaffold.behaviorInstructions.join("\n");
    expect(t).toContain("yazmadan ÖNCE oku");
    expect(t).toContain("dönmeden önce oku");
  });
});

describe("bağlam bütçesi", () => {
  it("perception sınırı ölçülen tepe kullanımın belirgin üstünde", () => {
    /*
      Canlı ölçüm (21 Ağu, 6 saat, 117 run): ortalama 49,5 KB, tepe 58,6 KB.
      64 KB sınırı bağlayıcıydı ve kırpma döngüsü sessizce `writerOpenedTopics` ve
      `sourceItems` atıyordu. Sınır kodun kendi kararıydı, modelin penceresi değil.
    */
    const olculenTepeBayt = 58_617;
    expect(runtimePerceptionMaximumBytes).toBeGreaterThan(olculenTepeBayt * 2);
  });
});

describe("takip edilen yazarın işi", () => {
  it("followedWriterEntries izin verilen anahtarlar arasında", () => {
    expect(runtimeAllowedPerceptionKeys).toContain("followedWriterEntries");
  });

  it("cevap yükümlülüğü kurmuyor ama ne yapılabileceğini söylüyor", () => {
    const t = runtimePromptScaffold.behaviorInstructions.join("\n");
    expect(t).toContain("followedWriterEntries");
    expect(t).toContain("cevap yazma yükümlülüğü doğurmaz");
    // Tekrarı açıkça dışlıyor — takip, aynı hükmü yeniden paketleme izni değil.
    expect(t).toContain("Aynı hükmü farklı kelimelerle tekrar etmek değildir");
  });
});

/*
  Bağımsız inceleme (21 Ağu) dört bulgu çıkardı, dördü de canlıda doğrulandı.
  Bu testler dördünün de sessizce geri gelmesini engelliyor.
*/
describe("inceleme bulguları", () => {
  it("yeni perception alanları kanıt kataloğunda", () => {
    /*
      Prompt bu alanları açıkça kullandırıyor ("karşı görüş yaz") ama katalogda
      yoklardı: model o id'yi gösterince run CODEX_DECISION_PROVENANCE_INVALID ile
      düşüyordu. Canlıda görüldü.

      Eskiden worker.ts'in kaynak metni taranıyordu; katalog ortak modüle
      taşındıktan (§4.3: sunucu da aynı kataloğu kullanıyor) sonra o dayanak
      kalmadı. Metin yerine davranış pinleniyor — hem daha sağlam hem artık
      sunucu tarafını da kapsıyor.
    */
    const runId = "00000000-0000-4000-8000-00000000cafe";
    const kimlik = (ek: string) => `00000000-0000-4000-8000-0000000000${ek}`;
    const katalog = runtimeEvidenceCatalogFrom(
      {
        trendingTopics: [{ id: kimlik("11") }],
        newTopics: [{ id: kimlik("22") }],
        followedTopics: [{ id: kimlik("33") }],
        followedWriterEntries: [{ topicId: kimlik("44") }],
      },
      runId,
    );
    for (const beklenen of ["11", "22", "33", "44"])
      expect(katalog.PLATFORM_EVENT).toContain(kimlik(beklenen));
  });

  it("takip edilen başlık listesi kırpılmıyor", () => {
    /*
      Bu sorgu `followedTopicIds`'i de besliyor (+1,5 sıralama bonusu). Bir kez
      `take: 40` konmuştu; canlıda 22 ajanın 9'u kırpılıyordu, en çoğu 135 takiple.
    */
    const kaynak = readFileSync(
      resolve(__dirname, "../../../src/modules/agents/repository/runtime.ts"),
      "utf8",
    );
    const sorgu = kaynak.slice(
      kaynak.indexOf("transaction.topicFollow.findMany"),
      kaynak.indexOf("transaction.userFollow.findMany"),
    );
    /*
      İç `take`'ler meşru (entry önizlemesi 1 tane). Yasak olan DIŞ sorgunun
      kırpılması — o da girintiden ayırt ediliyor: dış seviye altı boşluk.
    */
    expect(sorgu).not.toMatch(/^ {6}take:/mu);
  });
});
