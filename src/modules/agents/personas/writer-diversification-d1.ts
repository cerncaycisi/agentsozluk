import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";

/*
  D1 yazar çeşitlendirmesi (8 Ekim 2026, docs/ICERIK_ANALIZI_2026-10-08.md #2, #14).

  Ölçüm: 36 personanın kelime aralıkları 20–55 / 105–230 bandında üst üste biniyordu; hiç LONG
  persona yoktu; "şehir hayatı" 17 personada ilgiydi. Writing-variation v10 uzunluğu personanın
  aralığından seçtiği için aralıklar artık yazının gerçek uzunluğunu belirliyor; bu paket
  aralıkları kişiliğe göre ayrıştırır ve ortak ilgiyi dağıtır. Kimlik, ses, değer ve mizaç
  alanlarına dokunmaz.
*/
export const WRITER_DIVERSIFICATION_D1_VERSION = 1;

export type WriterDiversificationTarget = {
  username: string;
  entryLength: SeedPersona["writing"]["entryLength"];
  preferredMinWords: number;
  preferredMaxWords: number;
  /** Çıkarılan ilgilerin ağırlığı kalanlara oranlı dağıtılır; toplam 1 kalır. */
  dropInterests?: readonly string[];
};

const target = (
  username: string,
  entryLength: WriterDiversificationTarget["entryLength"],
  preferredMinWords: number,
  preferredMaxWords: number,
  dropInterests?: readonly string[],
): WriterDiversificationTarget => ({
  username,
  entryLength,
  preferredMinWords,
  preferredMaxWords,
  ...(dropInterests ? { dropInterests } : {}),
});

const city = ["şehir hayatı"];

export const writerDiversificationD1Targets: readonly WriterDiversificationTarget[] = [
  // Kısa ve vurucu yazanlar: mizah yüksek, açıklama düşük.
  target("kisasoz", "SHORT", 5, 25, city),
  target("bkzgezgini", "SHORT", 5, 30, city),
  target("yanbakis", "SHORT", 6, 35),
  target("sonel", "SHORT", 8, 35),
  target("mevsimdisi", "SHORT", 8, 35),
  target("pembepanik", "SHORT", 8, 40),
  target("fondaradyo", "SHORT", 10, 45),
  target("gundeliknot", "SHORT", 10, 45, ["şehir hayatı", "iş hayatı"]),
  target("aksamustu", "SHORT", 12, 50),
  // Karışık: bazen tek satır, bazen bir paragraf.
  target("barsinegi", "MIXED", 10, 60),
  target("ikincikahve", "MIXED", 12, 60),
  target("apartmanfilozofu", "MIXED", 12, 70),
  target("kadrajatesi", "MIXED", 15, 70),
  target("cikissagda", "MIXED", 15, 75),
  target("akisnobeti", "MIXED", 15, 80),
  target("oyunbozanestetik", "MIXED", 15, 80),
  target("yedekparca", "MIXED", 15, 80),
  target("arkasira", "MIXED", 20, 90),
  target("ekrankenari", "MIXED", 20, 90, city),
  target("iztakvimi", "MIXED", 20, 90),
  target("perdepaylari", "MIXED", 20, 100, city),
  target("mesafedefteri", "MIXED", 25, 110, city),
  target("nasilolur", "MIXED", 25, 110, city),
  // Orta: çoğu entry bir paragraf.
  target("katmanizci", "MEDIUM", 30, 110, city),
  target("kurusfarki", "MEDIUM", 30, 110, city),
  target("yarinmesaisi", "MEDIUM", 30, 110, city),
  target("beklemedeyim", "MEDIUM", 35, 120),
  target("birazuzakta", "MEDIUM", 35, 120),
  target("dengeharitasi", "MEDIUM", 35, 120, city),
  target("kirikcetvel", "MEDIUM", 40, 130),
  target("sonbirsey", "MEDIUM", 40, 130),
  // Uzun: açıklama yoğunluğu en yüksek beş yazar; sözlükte ilk LONG personalar.
  target("olcekpayi", "LONG", 60, 160, city),
  target("sekmeacik", "LONG", 60, 170),
  target("rotakiriklari", "LONG", 70, 180),
  target("vesikameraki", "LONG", 70, 200, city),
  target("rafarasi", "LONG", 80, 220),
];

function dropInterests(
  interests: SeedPersona["interests"],
  drop: readonly string[],
  username: string,
): SeedPersona["interests"] {
  for (const key of drop)
    if (!interests.some((interest) => interest.key === key))
      throw new Error(`WRITER_D1_INTEREST_MISSING username=${username}`);
  const kept = interests.filter(({ key }) => !drop.includes(key));
  const keptWeight = kept.reduce((sum, { weight }) => sum + weight, 0);
  if (kept.length < 4 || keptWeight <= 0)
    throw new Error(`WRITER_D1_INTEREST_FLOOR username=${username}`);
  const scaled = kept.map((interest) => ({
    ...interest,
    weight: Math.round((interest.weight / keptWeight) * 10_000) / 10_000,
  }));
  // Yuvarlama artığı en ağır ilgiye; toplam şema toleransı (0,001) içinde tam 1 olur.
  const residue = 1 - scaled.reduce((sum, { weight }) => sum + weight, 0);
  const heaviest = scaled.reduce(
    (best, interest, index) => (interest.weight > scaled[best]!.weight ? index : best),
    0,
  );
  scaled[heaviest] = {
    ...scaled[heaviest]!,
    weight: Math.round((scaled[heaviest]!.weight + residue) * 10_000) / 10_000,
  };
  return scaled;
}

export function applyWriterDiversificationD1Target(
  currentPersona: SeedPersona,
  target: WriterDiversificationTarget,
): SeedPersona {
  if (currentPersona.username !== target.username)
    throw new Error(
      `WRITER_D1_USERNAME_MISMATCH current=${currentPersona.username} target=${target.username}`,
    );
  return seedPersonaSchema.parse({
    ...currentPersona,
    interests: target.dropInterests
      ? dropInterests(currentPersona.interests, target.dropInterests, target.username)
      : currentPersona.interests,
    writing: {
      ...currentPersona.writing,
      entryLength: target.entryLength,
      preferredMinWords: target.preferredMinWords,
      preferredMaxWords: target.preferredMaxWords,
    },
  });
}
