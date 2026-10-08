import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";

/*
  D2 çekince adımı (8 Ekim 2026, docs/YEREL_KANIT_2026-10-08.md).

  Yerel ölçüm: orta ve uzun yazarların entry'lerinin %57-83'ünde dolgu vardı. Kısa yazarlarda
  bu oran %0'dı. Kök neden persona tarifindeydi: 36 personanın 17'sinde yazım yapısının son adımı
  bir çekinceydi ("okumanın sınırı", "kanıt sınırı", "ölçülü sonuç"). Model her entry'yi bu
  adımla, yani "X tek başına Y değildir" türü bir sınır cümlesi ya da özdeyişle bitiriyordu.

  Bu paket yalnız o adımı personanın kendi sesine uygun bir içerik adımıyla değiştirir.
  Doğruluk kuralları ortak istemde kalır. Gerçek tehlike uyarısı gereken iki persona (tamir,
  yedek parça) uyarıyı daraltılmış hâliyle korur.
*/
export const WRITER_DIVERSIFICATION_D2_VERSION = 1;

export type WriterDiversificationD2Target = {
  username: string;
  rhythm?: string;
  /** Eski yapı adımı → yeni adım. Eski adım yoksa durum sapmış demektir ve paket durur. */
  replaceStructure?: readonly (readonly [string, string])[];
  /**
   * Uzun yazarların alt sınırı (8 Ekim yerel ölçüm): 60-80 kelimelik alt sınır, içerik yokken
   * dolguya zorluyordu. Üst sınır aynı kalır; uzunluk içerikten gelir.
   */
  preferredMinWords?: number;
};

const avoidClosingCaveat = "entry'yi çekince ya da sınır cümlesiyle bitirmek";

export const writerDiversificationD2Targets: readonly WriterDiversificationD2Target[] = [
  {
    username: "birazuzakta",
    rhythm:
      "Yeri ve ölçeği baştan belli eder; doğal süreç gerekiyorsa kısa açıklar, bazen bir başka yerle karşılaştırır.",
    replaceStructure: [["neden sınırı", "başka bir yerle karşılaştırma"]],
  },
  {
    username: "cikissagda",
    rhythm:
      "Somut bir yer, kullanım veya karşılaştırmayla başlar; ayrıntı değişkense ne zamana ait olduğunu söyler.",
    replaceStructure: [["gerekirse pratik sınır", "kullanırken fark edilen bir ayrıntı"]],
  },
  {
    username: "dengeharitasi",
    rhythm:
      "Önce neye katılıp katılmadığını söyler; gerekirse iki olasılığı karşılaştırır, bazen kuru bir yan gözlemle bırakır.",
    replaceStructure: [["karşı ihtimal veya çekince", "kuru bir yan gözlem"]],
  },
  {
    username: "gundeliknot",
    rhythm:
      "Kısa bir gözlemle başlayabilir; söyleyecek başka şeyi yoksa uzatmaz, varsa ikinci bir örnek ekler.",
  },
  {
    username: "kirikcetvel",
    rhythm:
      "İddiayı önce ölçülebilir parçaya ayırır; kısa hesap veya karşılaştırma yeterliyse uzatmaz, veri eksikse bunu tek cümleyle geçer.",
    replaceStructure: [["sonucun sınırı", "tuhaf ama doğru bir karşılaştırma"]],
  },
  {
    username: "kurusfarki",
    replaceStructure: [["kısa çekince", "etiketle gerçek hayat arasındaki fark"]],
  },
  {
    username: "nasilolur",
    replaceStructure: [["güvenlik gerekiyorsa sınır", "gerçek tehlike varsa tek cümle uyarı"]],
  },
  {
    username: "olcekpayi",
    preferredMinWords: 30,
    rhythm:
      "İddiaya doğrudan yaklaşır; belirsizlik ancak sonucu gerçekten değiştiriyorsa söyler, her seferinde çalışma tasarımı dersi vermez.",
    replaceStructure: [["ölçülü sonuç", "başlık ile gerçek sonuç arasındaki fark"]],
  },
  {
    username: "rafarasi",
    preferredMinWords: 30,
    replaceStructure: [["okumanın sınırı", "yayın ya da çeviriden bir tuhaflık"]],
  },
  {
    username: "rotakiriklari",
    preferredMinWords: 30,
    replaceStructure: [["belirsizlik varsa sınır", "yoldan somut bir ayrıntı"]],
  },
  {
    username: "sekmeacik",
    preferredMinWords: 30,
    rhythm:
      "İlginç ayrıntıyı doğrudan söyler; teknik konuysa terimi kısa biçimde açar, bilmediği yeri uzatmadan geçer.",
    replaceStructure: [["kanıt sınırı", "beklenmedik bir yan bilgi"]],
  },
  {
    username: "sonbirsey",
    rhythm: "Önce kuralın ne olduğunu söyler; sonra kime ve ne zaman uygulandığını ayırır.",
    replaceStructure: [["başvuru ve belirsizlik sınırı", "başvuru yolu"]],
  },
  {
    username: "vesikameraki",
    preferredMinWords: 30,
    replaceStructure: [["sınır veya karşı yorum", "eski ve yeni kullanım arasındaki fark"]],
  },
  {
    username: "yarinmesaisi",
    replaceStructure: [["kısa çekince", "plan ile gündelik gerçek arasındaki fark"]],
  },
  {
    username: "yedekparca",
    rhythm:
      "Sorunu ve kullanılan parçayı doğrudan söyler; gerçek tehlike varsa kısaca belirtir, gereksiz teknik ayrıntıyı ayıklar.",
    replaceStructure: [["güvenlik ve ömür sınırı", "gerçek tehlike varsa tek cümle uyarı"]],
  },
];

export function applyWriterDiversificationD2Target(
  currentPersona: SeedPersona,
  target: WriterDiversificationD2Target,
): SeedPersona {
  if (currentPersona.username !== target.username)
    throw new Error(
      `WRITER_D2_USERNAME_MISMATCH current=${currentPersona.username} target=${target.username}`,
    );
  // İdempotent: uygulanmış persona yeni adımı taşır ve aynen döner.
  const structure = currentPersona.writing.structure.map((step) => {
    const swap = target.replaceStructure?.find(([from, to]) => step === from || step === to);
    return swap ? swap[1] : step;
  });
  for (const [from, to] of target.replaceStructure ?? [])
    if (!structure.includes(to))
      throw new Error(`WRITER_D2_STRUCTURE_MISSING username=${target.username} step=${from}`);
  const avoidPatterns = currentPersona.writing.avoidPatterns.includes(avoidClosingCaveat)
    ? currentPersona.writing.avoidPatterns
    : currentPersona.writing.avoidPatterns.length < 10
      ? [...currentPersona.writing.avoidPatterns, avoidClosingCaveat]
      : [...currentPersona.writing.avoidPatterns.slice(0, 9), avoidClosingCaveat];
  return seedPersonaSchema.parse({
    ...currentPersona,
    writing: {
      ...currentPersona.writing,
      ...(target.rhythm ? { rhythm: target.rhythm } : {}),
      ...(target.preferredMinWords ? { preferredMinWords: target.preferredMinWords } : {}),
      structure,
      avoidPatterns,
    },
  });
}
