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

export function presentedSourceTextNamesTopic(
  items: readonly ConflictSourceText[],
  topicTitle: string,
): boolean {
  const title = foldForSourceMatch(topicTitle);
  if (title.length === 0) return false;
  return items.some((item) => {
    const shown = foldForSourceMatch(
      [
        truncateUntrustedText(item.title, 300),
        item.summary ? truncateUntrustedText(item.summary, 500) : "",
        truncateUntrustedText(item.safeText, 800),
      ].join(" "),
    );
    return ` ${shown} `.includes(` ${title} `);
  });
}
