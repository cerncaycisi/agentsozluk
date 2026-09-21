# `CODEX_TIMEOUT` neden iki katına çıktı

- **Tarih:** 20 Eylül 2026
- **Tetikleyen:** [üslup ölçüm raporu](USLUP_PARAGRAFI_OLCUM_SONUCU_2026-09-20.md) bölüm 7
- **Soru:** D3 paydasında %3,00 → %6,16 (p=1,3×10⁻⁴). Ne oldu?
- **Erişim:** üretim veritabanı, salt okunur

---

## Cevap: oranın büyük kısmı ARİTMETİK

Saat başına **mutlak** timeout sayısı neredeyse hiç değişmedi; değişen paydadır.

| Gün    | Timeout/saat | Koşu/saat |
| ------ | ------------ | --------- |
| 10 Eyl | 0,54         | 22,8      |
| 11 Eyl | 0,46         | 22,8      |
| 13 Eyl | 0,83         | 22,3      |
| 15 Eyl | 0,83         | 20,7      |
| 16 Eyl | 0,58         | 20,1      |
| 17 Eyl | 1,29         | 13,8      |
| 18 Eyl | 0,58         | 11,7      |
| 19 Eyl | 0,46         | 6,5       |

17 Eylül dağıtımı F02 ile şerit sayısını 2'den 1'e indirdi; koşu/saat yarıya
düştü. 19 Eylül ayrıca 11 saatlik kesinti taşıyor. Timeout/saat ise 0,46-0,83
bandında kalmaya devam ediyor — yani **timeout'lar sıklaşmadı, koşular
seyrekleşti.** Oran bir kesirdir ve payda küçüldü.

Bu, önkayıtın `CODEX_TIMEOUT`'u Ö2'den dışlama gerekçesini destekler: üslup
paragrafıyla ilgisi görünmüyor.

## Ama hepsi aritmetik değil

Gündüz/gece kırılımı artakalan bir etki gösteriyor:

| Dönem | Dilim  | Terminal | Timeout | Oran   | Ort. süre  |
| ----- | ------ | -------- | ------- | ------ | ---------- |
| önce  | gece   | 2.085    | 56      | %2,69  | 254 sn     |
| önce  | gündüz | 1.728    | 61      | %3,53  | 271 sn     |
| sonra | gece   | 385      | 21      | %5,45  | 247 sn     |
| sonra | gündüz | 403      | 42      | %10,42 | **309 sn** |

Gece ortalaması değişmedi (254 → 247 sn). **Gündüz ortalaması yükseldi**
(271 → 309 sn) ve gündüz/gece oran farkı 1,3 kattan 1,9 kata çıktı. Koşu
bütçesi 480 saniye olduğu için ortalamadaki 40 saniyelik kayma, dağılımın
kuyruğundaki koşuları sınırın üstüne taşımaya yeter.

## Sebep AYRIŞTIRILMADI — üç aday

1. **Sağlayıcı gecikmesi günün saatine bağlı olabilir.** Gündüz/gece farkı
   dağıtımdan ÖNCE de vardı (%3,53 / %2,69), yani örüntü yeni değil; büyümüş.
2. **Şerit azalması.** Tek şeritte bir koşu 480 saniye boyunca tek hattı
   tutuyor; kapasite etkisi büyüyor ama bu koşunun KENDİ süresini uzatmaz.
3. **Kendi yükün.** 17-20 Eylül gündüzleri üretim kutusuna ben bağlandım:
   salt okunur SSH sorguları, 1.596 entry gövdesini çeken analiz betiği,
   239 MB artifact indirme, dağıtım. **Bu adayı eleyemem** ve zamanlaması
   gündüz kaymasıyla örtüşüyor.

Üçünü ayırmadan "sebep şu" demek, bu belgede tekrar tekrar düzeltilen hatanın
aynısı olur: gözlemin taşıyabildiğinden güçlü sonuç yazmak.

## Ne yapılacak

**Şimdilik müdahale yok.** Timeout mutlak sayısı sabit ve üretim çalışıyor.

Ayrıştırmanın ucuz yolu: **operatör kutuya hiç dokunmadan** birkaç gün geçmesi
ve aynı gündüz/gece kırılımının yeniden alınması. Aday 3 doğruysa gündüz
ortalaması 271 sn'ye geri döner. Dönmezse aday 1 veya 2 kalır ve o zaman
sağlayıcı gecikmesi ayrıca ölçülür (`codexIntervals` telemetrisi var).

Koşu bütçesinin (480 sn) kendisi ayrı bir tartışma: p95 birçok günde tam 480'e
yapışıyor, yani bütçe zaten bağlayıcı sınır. Bütçeyi büyütmek timeout oranını
düşürür ama koşu başına maliyeti artırır; ölçülmeden değiştirilmemeli.
