# Koşu bütçesi nereye gidiyor — ölçüm

**2 Eylül 2026.** Gezinme fazının verim regresyonunu (`entry/saat` %39 düşüş,
`CODEX_TIMEOUT` %13,6 → %21,6) araştırırken bütçenin tamamı ölçüldü. Sonuç, fazı büyük
ölçüde akladı ve asıl yükü başka yere koydu.

## Sistem zaten tavanına dayanmış

Üretim, 7 gün, salt okunur:

| ölçüm                                  | değer                        |
| -------------------------------------- | ---------------------------- |
| `NORMAL_WAKE` koşu bütçesi             | 480 sn                       |
| Karar çağrısı (onarım dahil) p50 / p95 | 268 / **440** sn             |
| Başarılı koşu süresi p95               | **453 sn**                   |
| `CODEX_TIMEOUT` koşuları               | tam 480 sn'de ölüyor (n=571) |
| Tek Codex çağrısının medyanı           | **101 sn**                   |
| Koşu başına Codex çağrısı              | çoğunlukla 3-4               |

Pay ~27 saniye. Bu tabloda ikinci bir çağrı eklemek serbest değil.

## Faz etiketleri — asıl yük nerede

`codexIntervals` faz etiketi almadan önce yalnız toplam biliniyordu. Etiketten sonra
(canlı, 3 saat):

| faz                 | p50        |
| ------------------- | ---------- |
| **DECISION**        | **259 sn** |
| **DECISION_REPAIR** | **144 sn** |
| ACTION_WORTHINESS   | 28 sn      |
| **BROWSE**          | **10 sn**  |
| CONTENT_REPAIR      | 2 sn       |

**Gezinme toplamın %2'si.** Sıra 4'ün tüm gerekçesi "gezinme verimi düşürüyor"du; ölçüm
bunu çürüttü. Gezinme kararı yavaşlatmıyor da (readTopics olan koşularda karar p95
439 sn, olmayanda 442 sn) — yani perception büyümesi de sorun değildi.

Zarar gezinmenin süresinden değil, **bütçesiz bırakılmasından** geliyordu: gezinme
`deadline.remainingMs()` alıyor, takıldığında karara süre kalmıyor ve koşu hiçbir şey
üretmeden düşüyordu. Düzeltildi (karar rezervi + 20 sn tavan).

## Onarım turu — ve yanlış çıkan tahminim

Karar onarımı koşuların ~%35'inde tetikleniyor ve tek başına 144 sn yiyor.

Neden tetiklendiğini ölçmeden önce bir tahmin yürüttüm: onarımın **da** başarısız olduğu
koşulara baktım ve `CODEX_DECISION_PROVENANCE_INVALID` 46'ya karşı şema hatası 3 gördüm.
"Demek ki onarım ağırlıkla provenance kaynaklı" dedim.

Telemetri eklenince gerçek çıktı:

| onarım nedeni | koşu   |
| ------------- | ------ |
| **SCHEMA**    | **76** |
| CATALOG       | 4      |

**Tahmin tersine yanlıştı.** Sebep hayatta kalma yanlılığı: şema hataları onarım turunda
düzeliyor, provenance hataları düzelmiyor. "Onarım da düştü" diye filtrelemek provenance'ı
sistematik olarak abartıyor. Koşullu bir örneklemden koşulsuz bir sonuç çıkarmıştım.

Katalog tarafı neredeyse temiz (4 koşu; ıskalanan türler `USER_ENTRY` 2,
`MULTIPLE_SOURCES` 1, `PLATFORM_EVENT` 1) — 21 Ağustos'taki katalog-prompt uyumsuzluğu bu
sefer yok.

## Bunun anlamı

Bütçenin en büyük ikinci kalemi bir **yapılandırılmış-çıktı** sorunu: model ilk karar
çıktısını koşuların üçte birinde şemaya uygun üretemiyor.

Bu iyi haber, çünkü düzeltmesi **kaliteden ödün gerektirmiyor**. Prompt kısaltmak,
reasoning effort düşürmek ya da onarım turunu kaldırmak — üçü de kaliteyi düşürürdü ve
üçü de gereksiz. Modelin ilk seferde geçerli JSON üretmesi saf kazanç.

## Sırada

Telemetri "SCHEMA" diyor ama hangi alanda takıldığını söylemiyor. Zod issue **path**'leri
kaydedilmeye başlandı — yalnız kendi şemamızın alan adları; `message` ve alınan değer
alınmıyor, onlar modelin ürettiği içeriği kaydın içine taşırdı.

Bir gün veri sonrası tek bir alan öne çıkarsa düzeltmesi ucuz olacak.

## Kaydedilen ders

Bir nedeni ölçmeden önce, elindeki veri o nedeni **koşullu** olarak görüyor olabilir.
Buradaki filtre ("onarım da başarısız oldu") sonucu tam tersine çevirdi. Ölçüm eklemek
tahmin yürütmekten ucuzdu — ve tahmin yanlıştı.
