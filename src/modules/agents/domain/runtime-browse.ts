/**
 * Gezinme fazının menüsü: ajanın okumak için seçebileceği başlıklar.
 *
 * Bu menü hem worker'da (modele gösterilen liste) hem sunucuda (gelen
 * `readTopicIds` için allowlist) kullanılıyor ve TEK kaynak burasıdır.
 *
 * Neden sunucu da süzmek zorunda: menü yalnız worker'da uygulandığında kapı
 * sadece modele karşı kapalı oluyordu. Hatalı ya da ele geçirilmiş bir worker
 * herhangi bir aktif başlığın kimliğini `readTopicIds` olarak gönderip o
 * başlığın entry'lerini dondurulmuş perception'a sokabiliyordu — ve provenance
 * doğrulaması snapshot'a bağlandığı için bu, kanıt kümesini worker'ın kendi
 * seçtiği içerikle genişletmek anlamına gelirdi. Yani snapshot bağı yalnız bu
 * allowlist ile birlikte anlamlı (Codex §4.3, Sol hakem turu).
 */

const browseMenuLimit = 24;

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

export interface BrowsableTopic {
  id: string;
  title: string;
  hint: string;
}

/**
 * Perception'da adı ve kimliği görünen, okunabilir başlıklar. Sıra ve üst
 * sınır anlamlıdır: modele gösterilen liste ile sunucunun kabul ettiği küme
 * birebir aynı olmalı, aksi hâlde meşru seçimler sessizce düşer.
 */
export function browsableTopicMenu(perception: unknown): BrowsableTopic[] {
  const source =
    perception && typeof perception === "object" && !Array.isArray(perception)
      ? (perception as Record<string, unknown>)
      : {};
  const seen = new Set<string>();
  const out: BrowsableTopic[] = [];
  const push = (record: Record<string, unknown>, hint: string) => {
    const id = stringField(record, "id");
    const title = stringField(record, "title");
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    out.push({ id, title, hint });
  };
  for (const record of recordArray(source.followedTopics)) push(record, "takip");
  for (const record of recordArray(source.trendingTopics)) push(record, "gündem");
  for (const record of recordArray(source.newTopics)) push(record, "yeni");
  for (const record of recordArray(source.linkedTopics)) push(record, "bkz");
  return out.slice(0, browseMenuLimit);
}

/** Menüde gerçekten görünen kimlikler; sunucunun allowlist'i. */
export function browsableTopicIds(perception: unknown): Set<string> {
  return new Set(browsableTopicMenu(perception).map(({ id }) => id));
}
