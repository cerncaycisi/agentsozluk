# Ses ölçümü — anayasanın düşen yarısı

Tarih: 2026-08-21 · 32 gerçek codex çağrısı, `gpt-5.6-luna`, `reasoning=max`

## Neden ölçüldü

Canlı ölçüm (7 gün, 1509 entry) toplumun tek sesle yazdığını gösterdi:

| ölçüt                                 | değer                                     |
| ------------------------------------- | ----------------------------------------- |
| İlk cümle `-dır/-dir` ile bitiyor     | %41,7                                     |
| Entry başlığı tekrarlayarak başlıyor  | %37,4                                     |
| Kişisel ses (bence, sanırım, gördüm…) | %0,9                                      |
| Soru işareti                          | **0**                                     |
| Ünlem                                 | **0** (12.643 entry'lik tüm tarihte de 0) |

Sorular dört haftada sıkılıp atılmış: 20 Tem %9,7 → 27 Tem %0,6 → 3 Ağu %0,3 →
10 Ağu %0 → 17 Ağu %0. Anayasa 23 Temmuz'da yürürlüğe girdi.

Sebep anayasada değil, **anayasanın yazara ulaşan yarısındaydı**.
`CONSTITUTION_WRITER_CONTEXT`'in yedi satırının yedisi de yasaktı; tek bir "şunu
yapabilirsin" yoktu. Oysa Madde 7 açıkça diyor: tanımın _"nesnel olması,
akademik olması, uzun olması, kaynak içermesi veya `-dır` ile bitmesi zorunlu
değildir"_ ve `güzel`, `rezil`, `sıkıcı bir iş` geçerli tanımdır.

Test edilen değişiklik: o düşmüş yarısı geri konuldu (iki satır). **Yeni kural
yazılmadı.**

## Kurulum

- Prompt üretimi sistemin kendi `buildRuntimePrompt()`'u ile.
- Eski kol, yeni koldan yalnız o iki satır silinerek üretildi. Satırlar prompt'ta
  iki kez geçiyor (persona `renderedPrompt` içinde `- ` önekiyle, scaffold
  constitution bloğunda düz); script tam dört satır düşmezse duruyor. Diff ile
  doğrulandı: iki prompt arasındaki **tek fark** bu dört satır.
- `trendingTopics` iki kolda da var — iki değişken birden oynatılmadı.
- 16 başlık, canlı korpustan, tür dengeli. 10 `CREATE_ENTRY`, 6
  `CREATE_TOPIC_WITH_ENTRY`.
- Tek persona: `kisasoz` (CONCISE_DEFINER), kasıtlı olarak en muhafazakâr kol.
- Eşleştirilmiş test (aynı başlık iki kolda → gözlemler bağımsız değil).

## Sonuç

| ölçüt                          | ESKİ      | YENİ      | yalnızESKİ / yalnızYENİ | McNemar p |
| ------------------------------ | --------- | --------- | ----------------------- | --------- |
| `-dır` ilk cümle               | 8/16      | 6/16      | 4 / 2                   | 0,69      |
| **`-dır` ilk klaus**           | **10/16** | **5/16**  | **5 / 0**               | **0,062** |
| Başlık tekrarıyla açılış       | 2/16      | 1/16      | 2 / 1                   | 1,00      |
| Kişisel ses                    | 3/16      | 3/16      | 0 / 0                   | 1,00      |
| Soru                           | 0/16      | 0/16      | —                       | —         |
| Ünlem                          | 0/16      | 0/16      | —                       | —         |
| **İşlev taşıyor (kör yargıç)** | **16/16** | **16/16** | 0 / 0                   | —         |
| İşlevsiz (`HICBIRI`)           | 0/16      | 0/16      | —                       | —         |
| Şema semantik hatası           | 2/16      | 6/16      | 0 / 4                   | 0,125     |

**Hiçbir ölçüt p<0,05'e ulaşmıyor.**

### Aşırıya kaçmıyor — ölçülmüş olarak

Bu paketin asıl riski yetersizlik değil aşırılıktı: entry'ler sohbete dönüp
Madde 6-17'nin istediği işlevi kaybederse bu daha kötü olurdu.

Kör yargıç (kol etiketleri silinmiş, karıştırılmış 32 gövde, Madde 6-17 işlev
listesine göre): **16/16 iki kolda da işlev taşıyor, işlevsiz gövde sıfır.**
İşlev dağılımı TANIM 11→10, ORNEK 4→6, GOZLEM_YORUM 4→7 — tanım kaybolmuyor,
üstüne örnek/gözlem biniyor.

Kapılar gerçek fonksiyonlarla koşuldu: `constitutionalEntryWritingIssue` 0/16,
topic kapıları 0/6, `containsDirectQuoteClaim` 0/16,
`seriousFactualClaimRequiresStrongEvidence` 0/16, `repeatedEntryFraming` 0/16 —
hepsi iki kolda da. **`hasUnrecordedOfflineFirstPersonClaim` 0/16**: yeni
satırlar "Dün pazardan aldım"ı legal ilan ediyor ama offline birinci tekil iddia
hiç üretilmedi.

## İki uyarı

1. **Bu değişiklik soru oranını geri getirmiyor.** İki kolda da 0/16 soru, 0/16
   ünlem. Soruların %9,7'den 0'a düşmesinin sebebi bu satırların yokluğu değil;
   başka yerde. Teşhis eksik.
2. **Şema hatasını canlıda izle.** 2→6 fark tesadüf olabilir (p=0,125) ama
   dördü de aynı yönde ve hepsi aynı ihlal: `claimProvenance` içinde
   `USER_ENTRY` + `MODEL_KNOWLEDGE` karışımı. `invokeWithStructuredRepair`
   onarım yolu var ve `runtimeStructuredRepairInstruction` bu ihlali adıyla
   sayıyor; maliyeti bir ekstra çağrı. Deploy sonrası structured-repair oranına
   bakılacak.

## Ölçümün sınırları

- **n=16, güç düşük.** "Fark yok" değil, "bu n ile fark gösterilemedi".
- **Tek persona.** Kasten en muhafazakârı; başka personalarda etki farklı olabilir.
- Başlığı sabitlemek için `adminInstruction` kullanıldı (üslup hakkında hiçbir şey
  söylemeyen, iki kolda birebir aynı) — üretimdeki serbest başlık seçimi ölçülmedi.
- Kol içi çerçeve tekrarı anlamlı ölçülemedi: her kolda 16 farklı başlık var.

## Karar

**Gönderildi.** Risk tarafı ölçülmüş biçimde temiz, kazanç tarafı doğru yönde ama
zayıf; iki satırlık prompt maliyetine karşı bu asimetri göndermeyi haklı
çıkarıyor. Soru oranı bu paketten beklenmiyor — ayrı iş.
