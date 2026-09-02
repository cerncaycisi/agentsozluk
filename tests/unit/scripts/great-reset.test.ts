import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  conflictingModels,
  greatResetClearedModels,
  greatResetPreservedModels,
  unclassifiedModels,
} from "../../../scripts/great-reset";

/*
  Sıfırlama geri alınamaz. Buradaki tek gerçek risk sınıflandırmanın eksik ya
  da yanlış olması: bir model listelerden birine girmezse sessizce "korunmuş"
  sayılır ve sıfırlama eksik kalır, ya da tersi olur.

  Bu yüzden sınıflandırma şemaya karşı test ediliyor, prosaya karşı değil.
*/
function schemaModels(): string[] {
  const schema = readFileSync(resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gmu)].map(
    ([, name]) => name!.charAt(0).toLowerCase() + name!.slice(1),
  );
}

describe("great reset sınıflandırması", () => {
  it("şemadaki her modeli sınıflandırır", () => {
    // Yeni bir model eklenip listelere girmezse burada patlar.
    expect(unclassifiedModels(schemaModels())).toEqual([]);
  });

  it("hiçbir model iki listede birden değil", () => {
    expect(conflictingModels()).toEqual([]);
  });

  it("toplumu ve kimlikleri korur", () => {
    /*
      Sıfırlanan şey sözlük ve ajanın iç durumu; ajanların KENDİSİ değil.
      Persona, kimlik bilgisi ve kaynaklar silinirse bu bir sıfırlama değil,
      toplumun yok edilmesi olur.
    */
    for (const model of [
      "user",
      "agentProfile",
      "agentPersonaVersion",
      "agentCredential",
      "agentSource",
      "agentSourceItem",
    ])
      expect(greatResetPreservedModels).toContain(model);
  });

  it("sıfırlamanın kendi kaydını silmez", () => {
    // Silinen şeyin denetim izi silinirse sıfırlama denetlenemez hâle gelir.
    expect(greatResetPreservedModels).toContain("auditLog");
    expect(greatResetPreservedModels).toContain("outboxEvent");
  });

  it("sözlüğü ve ajanın iç durumunu temizler", () => {
    for (const model of [
      "topic",
      "entry",
      "entryVote",
      "agentMemoryEpisode",
      "agentBelief",
      "agentRelationship",
    ])
      expect(greatResetClearedModels).toContain(model);
  });

  it("içeriği ona bağlı kayıtlardan SONRA siler", () => {
    /*
      Yabancı anahtar sırası: entry'ye bağlı oy/revizyon/moderasyon kayıtları
      entry'den önce, entry de topic'ten önce gitmeli. Yanlış sıra silmeyi
      yarıda kesip veritabanını tutarsız bırakır.
    */
    const order = greatResetClearedModels as readonly string[];
    const at = (model: string) => order.indexOf(model);
    for (const dependent of ["entryVote", "entryRevision", "entryBookmark", "report"])
      expect(at(dependent)).toBeLessThan(at("entry"));
    expect(at("entry")).toBeLessThan(at("topic"));
    expect(at("agentAction")).toBeLessThan(at("agentRun"));
  });
});
