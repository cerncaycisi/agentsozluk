import { truncateUntrustedText } from "@/modules/agents/domain/perception";

/*
  "Oku, sonra karar ver" kaynak bağı (Astra #377 2. tur P1). Çarpılan başlık yalnız adı,
  ajana gerçekten GÖSTERİLEN kaynak metninde tam kelime olarak geçiyorsa okunabilir olur.
  Gösterilen kısım perception ile aynı sınırlardır (başlık 300, özet 500, güvenli metin 800).
  Karşılaştırma dil bağımsız katlanmış biçimde yapılır: "OPENAI"/"openai", "gıda-güvenliği"/
  "gıda güvenliği" eşleşir; "su" ise "sunucusunun" içinde eşleşmez.
*/
export type ConflictSourceText = { title: string; summary: string | null; safeText: string };

export function foldForSourceMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll("İ", "i")
    .replaceAll("I", "i")
    .toLowerCase()
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replaceAll(/\p{M}+/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/*
  Kırpılan alanın sonundaki yarım kelime eşleşmeye katılmaz (Sol #377 P2): "sunucusunun"
  800 karakterde "su…" diye kesilirse "su" tam kelime sayılmamalı.
*/
function withoutTruncatedTail(value: string): string {
  if (!value.endsWith("…")) return value;
  const cut = value.slice(0, -1);
  const lastSpace = cut.search(/\s\S*$/u);
  return lastSpace >= 0 ? cut.slice(0, lastSpace) : "";
}

export function presentedSourceTextNamesTopic(
  items: readonly ConflictSourceText[],
  topicTitle: string,
): boolean {
  const title = foldForSourceMatch(topicTitle);
  if (title.length === 0) return false;
  return items.some((item) => {
    const shown = foldForSourceMatch(
      [
        withoutTruncatedTail(truncateUntrustedText(item.title, 300)),
        item.summary ? withoutTruncatedTail(truncateUntrustedText(item.summary, 500)) : "",
        withoutTruncatedTail(truncateUntrustedText(item.safeText, 800)),
      ].join(" "),
    );
    return ` ${shown} `.includes(` ${title} `);
  });
}

/** Dondurulmuş snapshot'taki, atıf yapılan kaynak öğeleri (ajana gerçekten gösterilen metin). */
export function presentedSourceItems(
  perceptionSummary: unknown,
  evidenceIds: readonly string[],
): ConflictSourceText[] {
  const perception =
    perceptionSummary && typeof perceptionSummary === "object" && !Array.isArray(perceptionSummary)
      ? (perceptionSummary as Record<string, unknown>)
      : {};
  const wanted = new Set(evidenceIds);
  return (Array.isArray(perception.sourceItems) ? perception.sourceItems : []).flatMap((value) => {
    const item =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    if (!item || typeof item.itemId !== "string" || !wanted.has(item.itemId)) return [];
    return [
      {
        title: typeof item.title === "string" ? item.title : "",
        summary: typeof item.summary === "string" ? item.summary : null,
        safeText: typeof item.safeText === "string" ? item.safeText : "",
      },
    ];
  });
}
