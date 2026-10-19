import { entryPublicUrl, topicPublicUrl } from "@/lib/routing/public-urls";
import { paginatedCanonical } from "./public-seo";

/*
  ENTRY SİNYAL KOHORTU — 19 Ekim 2026 (Gökhan işi devretti; seçenek (c)).

  Sorun: entry sayfası 18 Eylül'den beri başlık sayfasına canonical veriyor, ama
  sitenin makineye dönük sinyalleri hâlâ `/entry/N`'yi "ayrı, kalıcı adres" diye
  tanıtıyordu: JSON-LD `@id`/`url`, RSS/Atom bağlantısı, DEBE sıra numarası,
  `(bkz: #N)` ve site içi arama. Search Console'da entry adreslerinin tıklama payı
  %75 → %64 → %46 düşüyor ama Google bazı entry'lerde canonical ipucunu reddediyor.

  Karar: noindex ya da 301 YOK. Kohorttaki başlıkların entry'leri için yalnız JSON-LD
  `@id`/`url` entry'nin başlıktaki asıl yerine (`başlık?page=N#entry-N`) döner.
  Okurun tıkladığı her bağlantı (tarih, paylaş, DEBE, bkz, arama), RSS/Atom, canonical,
  sitemap, robots ve noindex DEĞİŞMEZ. İlk sürüm DEBE/bkz/arama/akışı da değiştiriyordu;
  Sol 6.1 1. tur NO-GO (19 Ekim): okur yüzeyiydiler, oturumlu okuru yanlış sayfaya
  gönderiyorlardı ve akışta saklanan `?page=N` moderasyon sonrası 404'e düşebiliyordu.

  Kohort: başlık `publicId` çift = deney, tek = kontrol. Aynı 28 günlük pencerede
  iki grup karşılaştırılabilsin diye.

  Ölçüm: 4. ve 6. hafta, haftalık Search Console çıktısı kohorta göre ayrılır.
  - Başarı: deney kohortunda entry adreslerinin tıklama payı kontrole göre en az
    10 puan daha hızlı düşer.
  - Koruma: deney kohortunun toplam tıklaması (entry + başlık) kontrole göre
    %25'ten fazla düşerse deney kapatılır.
  Kapatma: aşağıdaki sabit `false` yapılır; JSON-LD eski `/entry/N`'ye döner.
*/
export const ENTRY_SIGNAL_COHORT_ENABLED = true;

export type EntrySignalCohort = "treatment" | "control";

export function entrySignalCohort(
  topicPublicId: number,
  enabled: boolean = ENTRY_SIGNAL_COHORT_ENABLED,
): EntrySignalCohort {
  return enabled && topicPublicId % 2 === 0 ? "treatment" : "control";
}

/**
 * Entry'nin başlık sayfasındaki asıl yeri. Sayfa kuralı entry sayfasının canonical'ıyla
 * aynıdır (`paginatedCanonical`); çapa `EntryPreview`'deki `id="entry-N"` öğesidir.
 */
export function topicEntryLocationUrl(input: {
  topic: { slug: string; publicId: number };
  entry: { publicId: number };
  page: number;
}): string {
  return `${paginatedCanonical(topicPublicUrl(input.topic), input.page)}#entry-${input.entry.publicId}`;
}

/**
 * Makineye dönük entry bağlantısı (yalnız JSON-LD `@id`/`url`).
 * Deney kohortunda başlıktaki yer, kontrolde `/entry/N`. Sayfa bilinmiyorsa
 * (`null`) yanlış sayfaya çapa vermek yerine `/entry/N`'ye düşülür.
 */
export function entrySignalUrl(
  input: {
    topic: { slug: string; publicId: number };
    entry: { publicId: number };
    page: number | null | undefined;
  },
  enabled: boolean = ENTRY_SIGNAL_COHORT_ENABLED,
): string {
  if (entrySignalCohort(input.topic.publicId, enabled) === "treatment" && input.page)
    return topicEntryLocationUrl({ topic: input.topic, entry: input.entry, page: input.page });
  return entryPublicUrl(input.entry);
}
