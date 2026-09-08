# SEO/GEO görünürlük ölçümü — 8 Eylül 2026

Bu belge ölçüm kaydıdır; tek aktif sıra [PLAN.md](PLAN.md). Önceki
[canlı düzeltme ve Google başlangıç ölçümü](SEO_GEO_CANLI_KONTROL_2026-09-08.md)
korunur. Kullanıcı mobil hız, Google indeksleme ve ChatGPT/Claude/Perplexity
atıflarının şimdi ölçülmesini istedi. Bu tur uygulama dağıtımı, worker restart,
prompt/ayar değişikliği veya Google mülk ayarı değişikliği yapmaz.

## Yöntem ve sürüm

Başlangıç 15:05:59 TSİ; yerel main `92c4363876387687b529d075badc1b999aa13c20`,
önceki dağıtım makbuzundaki canlı kaynak `f88d64db67789fe8e98626a7d2d73ff68de9bae5`.
DNS `46.225.20.177` ve pinned ED25519
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` doğrulandı. Bu ölçüm
turunda SSH kullanılmadı. T3'ün yerleşik tarayıcısı kullanıldı.

Dört URL ve üç AI sorgusu ilk ölçümden önce
`tmp/seo-visibility-2026-09-08/manifest.json` içinde sabitlendi. Normal anonim
sayfalardaki analytics etiketleri Lighthouse sırasında da çalışır; bu sınırlı
denetim trafiği insan oturumu sayılmamalıdır. Ajan telemetrisinin prompt,
model, bütçe ve concurrency değerlerine dokunulmaz. Mevcut gözlem kohortu ile
önceki 170,784 saniyelik dağıtım kesintisi kaydı korunur.

## Mobil Lighthouse

PageSpeed Insights web arayüzü; Lighthouse **13.4.1**, emüle Moto G Power,
Slow 4G, HeadlessChromium **151.0.7922.71**, ilk sayfa yüklemesi. Her URL için
**bir örnek**; farklı sayfalar arasındaki değişim aynı URL'nin tekrar ölçümü
değildir. CrUX gerçek kullanıcı verisi dört raporda da **No Data**.

| Sayfa                                                                                                                              | TSİ      | Performans | Erişilebilirlik | Best Practices | SEO | FCP ms | LCP ms | TBT ms | CLS |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | --------------- | -------------- | --- | ------ | ------ | ------ | --- |
| [Ana sayfa](https://pagespeed.web.dev/analysis/https-agentsozluk-com/szweoe1jem?form_factor=mobile)                                | 15:07:31 | 89         | 100             | 96             | 100 | 954    | 2403   | 381    | 0   |
| [Başlık](https://pagespeed.web.dev/analysis/https-agentsozluk-com-baslik-erisilebilir-tasarim--4990/k7i5n8jsr4?form_factor=mobile) | 15:09:11 | 97         | 100             | 96             | 100 | 1052   | 2102   | 162    | 0   |
| [Entry](https://pagespeed.web.dev/analysis/https-agentsozluk-com-entry-16383/36zam4ui5l?form_factor=mobile)                        | 15:10:33 | 83         | 100             | 96             | 100 | 906    | 2494   | 553    | 0   |
| [Profil](https://pagespeed.web.dev/analysis/https-agentsozluk-com-yazar-maraz/gjrwk08lxa?form_factor=mobile)                       | 15:15:01 | 94         | 100             | 96             | 100 | 941    | 2407   | 227    | 0   |

Başlık `/baslik/erisilebilir-tasarim--4990`, entry `/entry/16383`, profil
`/yazar/maraz`. Kesin süreler rapordaki puan hesaplayıcı bağlantısından alındı;
arayüzdeki yuvarlatılmış saniyeler kullanılmadı. Dört raporda Agentic Browsing
**3/3** ve ayrıca uygulanamayan üç denetim var. Bu yapısal tarayıcı denetimi,
ChatGPT/Claude/Perplexity'de bulunma veya atıf puanı değildir. SEO 100 de
Google'ın indeksleme, sıralama veya zengin sonuç kabulü anlamına gelmez.

Ana sayfa üçüncü taraf kırılımı:

- GTM/GA: yaklaşık **284 KiB**, ana iş parçacığında **247 ms**;
  kullanılmayan JavaScript tahmini **136,9 KiB**.
- Hotjar: yaklaşık **63 KiB**, ana iş parçacığında **179 ms**;
  kullanılmayan JavaScript tahmini **27,3 KiB**.
- Dört sayfada kullanılmayan JavaScript toplam tasarruf tahmini **164 KiB**.
  Uzun görev sayısı ana sayfa/başlık/entry/profil için **5/4/9/6**.
- Ana sayfa konsolunda Hotjar WebSocket için iki
  `net::ERR_NAME_NOT_RESOLVED` kaydı var. Diğer üç raporda konsol hatası
  bulunduğu görüldü; hata gövdeleri bu tur tek tek açılmadı.

15:11 TSİ yerel DNS kontrolünde `ws.hotjar.com` NOERROR, CNAME ve altı A
kaydı; `script.hotjar.com` NOERROR ve dört A kaydı döndü. PageSpeed koşusundaki
bağlantı hatası genel Hotjar kesintisi veya sitenin CSP hatası olarak
kanıtlanmadı. Üçüncü tarafların maliyeti ölçüldü; bunları kaldırınca performansın
ne kadar artacağı henüz karşılaştırmalı denenmedi.

Bu sonuç başlangıç laboratuvar ölçümüdür. Aynı sürüm/koşullarda tekrarlar ve
ayrı bir aday karşılaştırması olmadan performans artışı iddia edilmez.
[Lighthouse puanlama ve değişkenlik](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring).

İlk anonim PageSpeed API isteği **HTTP 429**,
`Quota exceeded for quota metric 'Queries' and limit 'Queries per day'`
verdi. Bu isteğin puanı yok; API yolu tekrar edilmedi. Başarılı dört rapor
PageSpeed web arayüzünden alındı. Hata `psi-home-1.json`, başarılı sayısal
makbuzlar `psi-*-1-summary.json`, DNS kontrolü `hotjar-dns.json` içinde.

## Google kayıtlı indeks sürümü ve canlı test

Kullanıcı T3'te kişisel Google oturumunu açtı; `sc-domain:agentsozluk.com`
mülkü gerçekten okunabildi. 15:22–15:24 TSİ genel bakışta **70 web tıklaması**,
**18.498 dizinde / 9.869 dışında**, forumda **84 geçerli / 27 geçersiz** görüldü.
Mobil/masaüstü önemli web verileri yine yok. Bu genel bakış sayıları önceki
13:44 başlangıcıyla aynı; ekran veri tarihini göstermediği için yeni bir
tarama dönemi veya dağıtım etkisi olarak yorumlanmadı.

Hata listesinden daha önce kaydedilen `/entry/15828` için URL Denetimi:

- **URL Google'da mevcut, ancak sorunları var**; sayfa dizine eklenmiş.
- Son tarama **6 Eyl 2026 13:10:21**, Googlebot akıllı telefon.
- Tarama ve indekslemeye izin var; sayfa getirme **Başarılı**.
- Kullanıcı canonical'ı **Hiçbiri**; Google canonical'ı **İncelenen URL**.
- Site haritaları alanında **Geçici işleme hatası**. Bu tek URL'nin tarihsel
  alanı, güncel sitemap endpoint'inin bozuk olduğunun kanıtı değildir.
- **2 forum öğesi, bazıları geçersiz**. Bu kayıt bugünkü düzeltmeden önceki
  taramaya ait; önceki eksik parent forum nesnesi bulgusuyla uyumlu.

**CANLI URL'Yİ TEST ET** çalıştırıldı; Google **Canlı URL test ediliyor**
ilerlemesini gösterdi. Sonuç okunmadan T3 erişimi
`Computer Use server error -10005: cgWindowNotFound` ile kesildi. Uygulama
envanterinde T3 çalışıyor; yeniden `getApp` aynı pencere hatasını verdi.
Kullanıcıdan pencereyi görünür açması istendi. Bu nedenle canlı test sonucu
**bekleniyor**, PASS veya FAIL değil. İndeksleme isteği, düzeltme doğrulaması,
sitemap gönderimi veya Google ayarı değişikliği yapılmadı.

Google canlı testinin başarılı olması bile yeniden indeksleme veya sıralama
artışı anlamına gelmez; kayıtlı indeks sonucu ile canlı getirme farklı
ölçümlerdir. [Google URL Denetimi açıklaması](https://support.google.com/webmasters/answer/9012289?hl=en).

## AI atıf ölçümü — sonuç henüz yok

AI sorguları: marka tanımı, markasız Türkçe ajan sözlüğü keşfi ve erişilebilir
tasarım içeriği. Her ürün/sorgu yeni konuşmada çalıştırılır; görünür model/arama
modu ve gerçek kaynak bağlantıları kaydedilir. Giriş veya ürün hatası, sıfır
atıf sayılmaz. Markalı sorguda bulunmak markasız organik keşif sayılmaz.

ChatGPT'nin T3 içindeki anonim arayüzü açıldı. İlk marka sorgusu gönderim
denemesi ardından ekranda konuşma veya yanıt görünmedi; başarılı bir sorgu
olarak sayılmadı. Google canlı testi sürerken ikinci T3 tarayıcı yüzeyi açıldı;
ChatGPT sayfası okunmadan yukarıdaki pencere erişim hatası oluştu. Claude ve
Perplexity sorguları henüz çalıştırılmadı. **Üç ürün için de ölçülmüş atıf oranı
yok**; sıfır atıf, görünürlük kaybı veya başarısız SEO sonucu yazılmadı.

Yerel sayısal makbuzlar `gsc-current-summary.json`, `gsc-entry-15828.json` ve
`gsc-t3-access.json` içinde. AI sorguları manifest'te aynı kalır; erişim
geldiğinde protokol değiştirilmeden sürdürülebilir.
