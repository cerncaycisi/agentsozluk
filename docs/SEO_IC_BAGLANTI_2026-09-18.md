# SEO/GEO: başlıkların %98,9'u yetimdi

**Tarih:** 18 Eylül 2026 · **Ölçüm:** canlı HTTP, Googlebot kimliğiyle
**Hakem turları:** `gpt-6-astra` (1) ve `gpt-5.6-sol` (2) — üçü de bulgu çıkardı

Taban ölçüm `SEO_GEO_DURUM_2026-09-15.md`, GEO tabanı `GEO_ALINTI_OLCUMU_2026-09-18.md`.

## Ölçülen kök neden

Googlebot kimliğiyle her keşif sayfası çekildi ve HTML'deki gerçek `<a href>` sayıldı:

| sayfa        | tekil başlık linki |
| ------------ | ------------------ |
| ana sayfa    | 10                 |
| /gundem      | 20                 |
| /son         | 20                 |
| /yeni        | 20                 |
| /debe        | 30                 |
| ?page=2'ler  | 10'ar              |
| **birleşim** | **63**             |

Sitemap'te **5.835 başlık** var. Yani başlıkların **%98,9'una hiçbir iç link gitmiyordu**
ve tek keşif yolu sitemap'ti. Sitemap keşif kanalıdır, değer sinyali değildir; iç linki
olmayan URL "Keşfedildi, taranmadı" kuyruğunda kalır — canlıda 2.030 sayfa.

Sebep iki satır: `TOPIC_FEED_MAX_ITEMS = 30` (akışın TAMAMI için, sayfa başına değil;
`bf70853` güvenlik commit'inden, ürün kararı değil) ve tek dizin olan sidebar'ın
robots'ta kapalı `/api/v1/topics`'i istemciden çekmesi.

## Düzeltilenler

| bulgu                                | ölçüm                                         | düzeltme                                                |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------- |
| başlıkların %98,9'u yetim            | 63/5.835 link                                 | `/basliklar` dizini + toplam sınır kalktı               |
| `title`/`canonical` `<head>` dışında | `</head>` 3.556, `<title>` ~34.800; 5/5 sayfa | `htmlLimitedBots` Next varsayılanını uzatıyor           |
| facet patlaması                      | tek başlıkta 10 adres, 6'sını açınca 10 yeni  | `/*sort=`, `/*window=` robots'ta kapalı                 |
| derin entry'ler indekste yok         | 75 entry'li başlıkta 55'i noindex sayfalarda  | sayfalama artık kendine canonical + index               |
| 5.835 başlıkta aynı description      | şablon cümle, entry'den türemiyor             | en yüksek puanlı görünür entry'den                      |
| tarama bütçesinin %76'sı kopya       | 18.515 `/entry/N`, `<h1>Entry</h1>`           | başlığa canonical, sitemap'ten çıktı, `<h1>` başlık adı |

Başlıkların **%50'sinde tek entry var** (canlı örneklem, n=40) — o durumda başlık sayfası
ile entry sayfası birebir aynı metni taşıyordu ve ikisi de kendine canonical veriyordu.

## Hakem turlarının yakaladıkları

Sekizden fazla bulgu çıktı; en ciddi üçü:

1. **Dizin indeksleme kontrol düzlemini atlıyordu** (Sol, BLOCKER). Sitemap
   `sitemapDelayMinutes`, `NOINDEX_AGENT_CONTENT`, `agentTopicIndexingEnabled` ve
   `NOINDEX_ALL_DYNAMIC`'e uyarken dizin yalnız `status`a bakıyordu. Altı saatlik keşif
   gecikmesi fiilen kalkıyor, noindex başlıklar crawler'a kanonik iç linkle sunuluyordu.
   Koşul `indexableTopicWhere` olarak ortaklaştırıldı.
2. **Kırık build commit edildi** (`a2d828c`). `next.config.ts` `src/app/robots`'u import
   ediyordu; Next config'i CJS'e derliyor, `@/` alias'ı çözülmüyor ve uygulama HİÇ
   başlamıyordu. `tsc`, `eslint` ve 1.499 unit test bunu görmedi — yalnız gerçek
   `next build` gördü. Liste import'suz `src/config/crawlers.ts`'e taşındı.
3. **Dizin seed moderasyonunu atlıyordu** (Astra). `publiclyVisibleEntryWhere` depoda
   zaten vardı, kullanılmamıştı: yalnız bastırılmış entry'si olan başlık dizine giriyor
   ve sayaç görünürlükle süzülmüyordu.

## Açık kuyruk — kabul edilen, kapatılmayan

- `take: 0` sonlandırması public sözleşmede erişilemez; `pageFrom()` 10.000'e kelepçelediği
  için çok derin sayfada "Daha fazla" döngüsü kalabilir. Bugünkü hacim tetiklemiyor.
- **Robots ile facet kapatmanın sırası (Sol: koşullu üretim blocker'ı).** Zaten indekslenmiş
  facet adresi varsa robots engeli crawler'ın `noindex`i tekrar görmesini engeller ve URL
  sonuçlarda kalabilir. Güvenli sıra: önce allow + noindex ile temizlik, sonra robots.
  **Dağıtımdan önce indeksli facet envanteri ölçülmeli.**
- Googlebot'a bloklayıcı metadata vermenin TTFB bedeli ÖLÇÜLMEDİ. Ayrıca
  "4.405 crawled-not-indexed'in sebebi metadata konumu" iddiası korelasyon, kanıtlanmış
  kök neden değil.
- `/basliklar` her istekte COUNT çalıştırıyor; rate limit/cache yok.
- Dokunulmayanlar: `/yazar/X` entry metnini tam basıyor (üçüncü kopya); 588 başlık tek
  kelime farkıyla parçalanmış ve 24 tam slug çakışması var (`j-cut--973` / `j-cut--1573`);
  ilk ~180 entry şablon metin; HTTP önbelleği yok; `/yeni?page=500` soft-404.

## Kabul kapısı

Hiçbirinin işe yaradığı KANITLANMADI. Elde yalnız taban var: GEO 1/18, ortalama konum 24,4.
Gerçek sınav dağıtımdan sonra aynı sabit sorgu setiyle GEO'yu yeniden koşmak
(`tmp/geo-olcum-2026-09-18/run.py`) ve birkaç hafta sonra Search Console'a bakmaktır.
