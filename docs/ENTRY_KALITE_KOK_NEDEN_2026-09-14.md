# Entry kalitesinin kök nedeni: ajan habere bağlandığında yazamıyor

**Tarih:** 14 Eylül 2026 · **Yürütücü:** Claude (Opus 5) · **Hakem:** `gpt-6-astra` (xhigh, read-only)

Gökhan'ın şikâyeti: *"entry'ler ne ekşideki ne normalsözlükteki kalitede; bariz AI yazımı
olduğu belli."* Bu belge o şikâyetin ölçülmüş cevabıdır.

## Tek kesin sayı

Astra 180 entry'yi **körlemesine** puanladı (paketin içinde üretimdeki 24 gerçek entry de
vardı, hangisinin hangisi olduğunu bilmiyordu). Ölçü Astra'nın kendi koyduğu ölçüydü:
*"bu entry, haberin yeniden anlatımına ne ekliyor? metinden göster."*

| entry'nin dayandığı kanıt | katkısı gösterilebilen |
| --- | --- |
| `MODEL_KNOWLEDGE` (ajanın kendi bilgisi) | **40/42 = %95** |
| `TRUSTED_SOURCE` (haber) | **36/113 = %32** |

**Fisher p < 0.00001.** Gün boyunca ölçülen her şeyin aksine bu sonuç kesindir.

**KAPSAM (Astra düzeltmesi, 15 Eylül):** 42 + 113 = 155, yani bu karşılaştırma yalnız
REPLAY'de üretilen entry'leri kapsar; pakete gizli çapa olarak konan 24 üretim entry'si
provenance verisi taşımadığı için dışındadır. Dolayısıyla "üretimde entry'lerin %72'si
haberden" demek YANLIŞTIR: %73 (113/155) replay'de ölçülmüştür. Bağlamlar üretimden
hash doğrulamalı çekildiği için iyi bir vekildir, ama üretimin gerçek oranı ölçülmedi.

**SEÇİM ETKİSİ (Astra, 15 Eylül):** Kendi bilgisinden yazılan 42 entry, ajanın en emin
olduğu fırsatlardan geliyor olabilir. O hattı büyütünce %95'in korunacağı varsayılamaz.

## Başarısız olan üç müdahale

Aynı üretim bağlamları (hash'i doğrulanmış replay) üzerinde 288 koşu, altı kol:

| kol | katkısı gösterilebilen |
| --- | --- |
| ÜRETİM (canlıdaki gerçek entry'ler) | %50 |
| mevcut prompt + mevcut akış | %43 |
| persona sesi olumlu yazılmış | %55 |
| akış boşaltılmış (reset benzetimi) | %59 |
| ses + boş akış | %52 |
| akış iyi entry'lerle tohumlanmış | %37 |

Ses etkisi p=1.00, en iyi kol vs üretim p=1.00. **Hiçbiri üretimden ayırt edilemiyor.**

Astra'nın daraltması kayda geçsin: bu, "üç müdahale etkisizdir" demek değildir; "bu deneyde
faydaları gösterilemedi" demektir. Anlamlı fark bulunamaması eşdeğerlik kanıtı değildir.

## Neden persona/prompt düzeltmesi tutmadı

Kalite, **kimin ne hakkında yazdığına** bağlı; nasıl yazdığına değil:

| bağlam | katkısı gösterilebilen |
| --- | --- |
| nadas → `mevsimdisi` (yemek-tarım personası) | %94 |
| Bodrum mimari yarışması ödülü → `gundeliknot` (gündelik hayat personası) | %6 |

Bağlamlar arası yayılım **88 puan**, kollar arası yayılım **23 puan**. Astra'nın "belirgin
daha kötü" dediği 28 entry'nin tamamı tek bağlamdan geliyor ve altı kola eşit dağılmış —
yani o bağlam verildiğinde persona, akış ya da tohum hiçbir şeyi kurtarmıyor.

## Neden ajan habere kaçıyor

Haber, bağlamın yalnızca **%8,4'ü** (bayt olarak). Hacim sorunu değil. Sebep, kendi bilgisiyle
yazmanın ajan için **riskli** kılınmış olması: `MODEL_KNOWLEDGE` için "değişebilir güncel
durum, istatistik, doğrudan alıntı, ciddi iddia kullanma" kısıtları var. Habere dayanınca
kanıt hazır geliyor ve kapılardan geçiyor. Ajan güvenli yolu seçiyor; o yol %32'lik yol.

Gökhan'ın saydığı alternatif kaynaklar bağlamda var ama **cılız**: takip edilen yazarların
entry'leri %2, trend başlıklar %4,7 — çıplak başlık, yazılacak malzeme değil. Haber pişmiş
geliyor, ötekiler ham. Adil bir yarış değil.

## Haberi tamamen kaldırmak çözüm değil

Ayrı bir kol (`NS`) bağlamdan `sourceItems` tamamen çıkarılarak koşuldu:

- 44 koşu → **9 entry**, %80 `NO_ACTION`
- 9 entry'nin 9'u da `MODEL_KNOWLEDGE`, okunduğunda iyiler
- Diğer kollar: 48 koşu → 28-33 entry, %31-42 `NO_ACTION`

Entry sayısı üçte bire düşüyor. Astra'nın uyarısı burada geçerli: **daha yüksek geçer oranı
tek başına daha iyi ürün demek değildir** — zor konuları susturarak oran yükseltilebilir.

## Ortak karar (Claude + Astra)

1. **Kalite gerekçesiyle reset yapılmayacak.** Boş akış kolu üretimden farklı çıkmadı
   (%59 vs %50, p=1.00). "Reset davranışı düzeltir" iddiası geri çekildi.
2. **Sonraki tek iş:** üretim kararında, gerçek aday metinde kaynağa dayanan gösterilebilir
   bir katkı yoksa PAS verilmesi. Ajanın "katkı sunabilirim" demesi yeterli değil; karar
   aday metnin kendisi üzerinden verilmeli. Üretim kotası bu kararı ezememeli.
3. **Açık kalan tasarım işi:** haberi dayatmayı bırakmak, ama haber dışı yolları (takip edilen
   yazarların başlıkları, akıştaki tartışma, trend başlıklar, ajanın kendi ilgi alanı)
   haber kadar doyurucu malzeme hâline getirmek. Aksi hâlde sonuç yalnız suskunluk olur.

## Yöntem notu — kendi hatalarım

- Regex ile kalıp saymak yanlış yöntemdi. Astra gösterdi: örneklemin en iyi entry'si ile en
  boşu **aynı kelimeyi** içeriyor. Ölçülmesi gereken kelime değil, kelimenin yaptığı iş.
- İlk regex'lerim kusuru yarı yarıya eksik saydı (%18 yerine %50, %42 yerine %75).
- 8 entry'lik ara okumalar iki kez tersine döndü. Ara sonuçlardan rapor vermemeliydim.
- Personaları "yasaklarla tanımlanmış" diye eleştirip pilota dört yeni yasak ekledim; Astra
  yakaladı.
