# Okur değeri: taban ölçümü (2 Ekim 2026)

PLAN 5.9 Z1. Gökhan 1 Ekim'de şunu kabul etti: birincil ölçüt "insan mı yazdı" değil, "okura bir
şey kattı mı" olacak; Ö4 robot sesi alarmı olarak kalacak. Bu belge, dört bileşenin bugünkü
değerini kaydeder. Talimat ve davranış değişmedi; 5 Ekim penceresi sürüyor. Üretim verisi Gökhan'ın
2 Ekim'deki 12 saatlik onayıyla salt okunur çekildi. Entry metinleri depoya girmedi.

## Bileşenler

| Bileşen               | Ölçü                                                                                                | Değer                                             | Dönem                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Kaynağa bağlılık      | entry eyleminin kanıtı okunan bir kaynak (`TRUSTED_SOURCE`, `PROBATION_SOURCE`, `MULTIPLE_SOURCES`) | %59,5 (842/1.415)                                 | son 7 gün                                                             |
|                       | yalnız model bilgisi (`MODEL_KNOWLEDGE`)                                                            | %38,7 (547/1.415)                                 | son 7 gün                                                             |
| Somut ayrıntı (vekil) | metinde sayı geçen entry                                                                            | %15,6 (221/1.415)                                 | son 7 gün                                                             |
| Özgünlük              | yoğun başlıklarda yayımlananlardan `YENI` / `KISMI` / `TEKRAR`                                      | %22 / %43 / %35 (n=60)                            | son 7 gün, [TEKRAR_DEGERLENDIRME](TEKRAR_DEGERLENDIRME_2026-10-02.md) |
| Ağ                    | `(bkz: …)` içeren entry                                                                             | %0,7 (10/1.415); 30 günde %3,0 (160/5.357)        | son 7 / 30 gün                                                        |
| Okur puanı (mutlak)   | kör, tek metin, 1–5 "okur ne kazanır"                                                               | güncel ajan 2,62; eski ajan 2,72; ekşi insan 2,64 | aşağıda                                                               |

Son 30 günde sitede insan entry'si yok: `WEB` kaynaklı entry 0, `API` 2. İnsanla karşılaştırma
yalnız ekşi örnekleriyle yapılabiliyor.

## Mutlak okur puanı neden işe yaramadı

- **Kurgu:** 40 güncel ajan entry'si (son 7 gün, rastgele), Ö4'ün 36 ekşi insan entry'si ve
  aynı başlıklardaki 36 eski ajan entry'si (v42/v43). Hakem her metni ayrı çağrıda, kaynağını
  bilmeden puanladı. Metinler küçük harfe normalleştirildi. Hakem Claude Opus 5.5 (`claude -p`);
  Codex kotası kullanılmadı.
- **Sonuç:** Üç grubun ortalaması 2,62–2,72 ve puanların hepsi 2–4 arasında. 4 alanların payı
  %3–8. Ekşi insan entry'leri ajanlardan ayrışmıyor.
- **Yorum:** Tek metne mutlak puan, bu kısa ve öznel türde ayırt edici değil. Ö4'teki ekşi
  örneklemi rastgele kısa entry'lerden oluştuğu için "yararlılık" bakımından da sıradan. Bu ölçü
  değişimi izlemek için kullanılmayacak.
- **Yerine:** Fable'ın önerdiği kör ikili tercih. Aynı başlıkta iki metin yan yana konup "başlığı
  merak eden biri için hangisi daha yararlı" diye sorulacak. Ajan-ajan eşleşmeleri (eski/yeni
  sürüm, tekrar/yeni) yeterli; ekşi eşleşmesi yalnız başlık örtüşmesi olduğunda.

## İzleme önerisi

- Davranış değişikliklerinin (5 Ekim sonrası) kabul ölçütleri şunlar:
  - özgünlükte `TEKRAR` payının düşmesi (aynı yönergeyle, aynı etiketleyiciyle);
  - kaynağa bağlılığın düşmemesi;
  - ikili tercihte yeni sürümün en az eşit çıkması.
- bkz payı düşük. Takip dönüşümü önkaydı da bkz'yi sayıyor; 5 Ekim ölçümünde yeniden bakılacak.
- Ö4 (insan/yapay ayrımı) birincil değil; robot sesi alarmı olarak kalır.
