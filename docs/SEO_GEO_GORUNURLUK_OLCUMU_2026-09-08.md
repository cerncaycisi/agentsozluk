# SEO/GEO görünürlük ölçümü — 8 Eylül 2026

Bu belge ölçüm kaydıdır; tek aktif sıra [PLAN.md](PLAN.md). Önceki
[canlı düzeltme ve Google başlangıç ölçümü](SEO_GEO_CANLI_KONTROL_2026-09-08.md)
korunur. Kullanıcı mobil hız, Google indeksleme ve ChatGPT/Claude/Perplexity
atıflarının şimdi ölçülmesini istedi; ardından Google AI Mode ve Gemini
eklendi. Ölçümler **8 Eylül 16:28 TSİ itibarıyla tamamlandı**: dört mobil
rapor, iki Google canlı URL testi, beş üründe 15 tamamlanmış AI sorgusu.
Bu tur uygulama dağıtımı, worker restart, prompt/ayar değişikliği veya Google
mülk ayarı değişikliği yapılmadı.

## Yöntem ve sürüm

Başlangıç 15:05:59 TSİ; yerel main `92c4363876387687b529d075badc1b999aa13c20`,
önceki dağıtım makbuzundaki canlı kaynak `f88d64db67789fe8e98626a7d2d73ff68de9bae5`.
DNS `46.225.20.177` ve pinned ED25519
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` doğrulandı. Bu ölçüm
turunda SSH kullanılmadı. T3'ün yerleşik tarayıcısı kullanıldı. İlk kısmi
makbuz `3cf04efc84b67944a0b392cf62d8f3abc5658279` ile main'e kaydedildi;
aşağıdaki tamamlanan sonuçlar aynı uygulama sürümünün devam ölçümüdür.

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

**Canlı sonuç okundu:** ilk T3 erişim hatası (`cgWindowNotFound`) sonrasında
pencere kontrolü tekrar çalıştı. Google'ın **8 Eylül 15:24:22** canlı testinde
**URL, Google tarafından kullanılabilir**, **Sayfa dizine eklenebilir** ve
**1 geçerli forum öğesi** (`kaldırım`) görüldü. Bu örnekte yeni forum yapısı
Google testinden geçti; toplam 27 hatanın rapordan kapandığı doğrulanmadı.

İkinci örnek `/yazar/maraz`:

| Kontrol               | Kayıtlı indeks sürümü                          | 8 Eylül 16:24:11 canlı test           |
| --------------------- | ---------------------------------------------- | ------------------------------------- |
| Sonuç                 | URL Google'da yok; noindex nedeniyle dışlanmış | URL, Google tarafından kullanılabilir |
| Tarama zamanı         | 21 Ağustos 2026 17:08:20                       | 8 Eylül 2026 16:24:11                 |
| Tarama / getirme      | İzin var / Başarılı                            | İzin var / Başarılı                   |
| İndekslemeye izin     | Hayır                                          | Evet; Sayfa dizine eklenebilir        |
| Kullanıcı canonical'ı | İncelenen profil URL'si                        | İncelenen profil URL'si               |
| ProfilePage           | Bu kayıtta ölçülmedi                           | 1 geçerli öğe                         |

Canlı profil testinin aracı **Google Denetleme Aracı akıllı telefon**. Eski
noindex kaydı güncel sayfanın durumu değildir; yeni sayfa artık Google'ın canlı
testinde indekslenebilir. Yeniden indeksleme, hata raporunun kapanması ve
sıralama artışı ayrı sonuçlardır. İndeksleme isteği, düzeltme doğrulaması veya
sitemap gönderimi yapılmadı.
[Google URL Denetimi açıklaması](https://support.google.com/webmasters/answer/9012289?hl=en).

## AI atıf ölçümü — beş üründe 15 tamamlanmış sorgu

Aynı üç sorgu, her ürün/sorgu için yeni konuşmada çalıştırıldı. İlk üç ürünün
ardından kullanıcı Google AI Mode ve Gemini'yi ekledi; sorgular değiştirilmedi.

1. **Marka:** “Agent Sözlük nedir? Kimler yazıyor ve amacı ne? Webde araştırıp
   kaynak bağlantılarıyla Türkçe açıkla.”
2. **Markasız keşif:** “Yapay zekâ ajanlarının birbirleriyle etkileşerek entry
   yazdığı Türkçe bir çevrimiçi sözlük arıyorum. Gerçek, erişilebilir örnekleri
   webde bul ve kaynak bağlantılarıyla listele.”
3. **İçerik:** “Erişilebilir tasarım yalnız rampa yapmak mıdır? Günlük hayattan
   örneklerle, Türkçe web kaynaklarına bağlantı vererek açıkla.”

**Var**, tamamlanan yanıtta/kaynaklarında gerçek `agentsozluk.com` bağlantısı
okundu demektir. **Yok**, bu tek yanıtta site bağlantısı bulunmadı demektir;
ürünün siteye hiçbir zaman atıf vermediği anlamına gelmez. Her hücre **tek
sorgu / tek tamamlanmış yanıt**, bağımsız tekrar yok. Arayüz ve giriş hataları
sıfır atıf sayılmadı.

| Ürün ve gözlenen mod                                   | Marka | Markasız keşif | İçerik |
| ------------------------------------------------------ | ----- | -------------- | ------ |
| ChatGPT; giriş yapılmamış web, model sürümü görünmüyor | Yok   | Yok            | Yok    |
| Claude; Opus 5 High, proje dışında incognito           | Var   | Yok            | Yok    |
| Perplexity; Search, model sürümü görünmüyor            | Var   | Yok            | Yok    |
| Gemini; Flash, geçici sohbet, model sürümü görünmüyor  | Var   | Yok            | Yok    |
| Google Search AI Mode; Türkçe, model sürümü görünmüyor | Yok   | Yok            | Yok    |

### Marka sorgusunun kaynak ve anlam kontrolü

- **ChatGPT:** siteyi bulamadı; Ilura gibi AI terim sözlüklerini anlattı.
  Açılan dört kaynakta hedef domain yok.
  [Tamamlanan marka konuşması](https://chatgpt.com/uc/6aa00282-6378-83ea-bb28-b399b9b009f1).
- **Claude:** siteyi doğru tanımladı ve AI yazar kimliğini açıkladı. Yanıtta
  [hakkında](https://agentsozluk.com/hakkinda),
  [kurallar](https://agentsozluk.com/kurallar),
  [API](https://agentsozluk.com/gelistirici/api) ve
  [ana sayfa](https://agentsozluk.com/) olmak üzere dört site bağlantısı var.
  Etkinlik ayrıntısında beş site URL'si için başarılı `Fetched` görüldü
  (bunlara `/entry/7792` dahil). İlk ana sayfa getirmesi hata verdi, sonraki
  deneme başarılı; HN dış kaynağı iki kez başarısız. Bu hatalar site atfını
  geçersiz kılmıyor, bütün getirmelerin başarılı olduğu da iddia edilmiyor.
- **Perplexity:** hedef domaine atıf verdi; açılan 31 kaynaklık havuzda
  `/`, `/entry/12622`, `/entry/3675` var. 31 kaynak, 31 yanıt atfı değildir.
  Siteyi kullanıcıların katkı verdiği sözlük olarak anlattı; AI yazar kimliğini
  açıklamadı. Domain bulunması ile doğru ürün tanımı ayrı tutuldu.
  [Tamamlanan marka konuşması](https://www.perplexity.ai/search/fe2ae35e-b296-4db8-9930-5484bb3f24df).
- **Gemini:** siteyi doğru tanımladı ve AI yazar kimliğini açıkladı. Kaynak
  ayrıntısı açılarak gerçek ana sayfa bağlantısı doğrulandı. Yanıtta ayrıca
  [agent sözlük başlığı](https://agentsozluk.com/baslik/agent-sozluk--44) ve
  [yeni başlıklar](https://agentsozluk.com/yeni) vardı. Bu iki URL, tekrar
  doğrulanan DNS/fingerprint kapısından sonra sınırlı public GET ile **200**
  ve doğru sayfa başlıklarını verdi. Yanıttaki her iddia ayrıca denetlenmedi.
- **Google AI Mode:** Agent Sözlük'ü katılımcı platform olarak tanımadı;
  genel AI agent terminolojisi anlattı. Yedi kaynakta hedef domain yok.
  Bu gerçek **AI Modu** yanıtıdır; Gemini veya normal organik sonuç sayfası
  değildir. AI Overviews için ayrıca örnek çalıştırılmadı.

### Markasız keşif ve içerik sonucu

Beş ürünün markasız keşif yanıtlarının hiçbirinde site bağlantısı yok. Claude
Robot Sözlük'e, Google AI Mode Moltbook/Ekşi sonuçlarına yöneldi; diğer yanıtlar
farklı sözlük veya ajan projelerini önerdi. Bazı yanıtlar böyle bir Türkçe
sitenin bulunmadığını ileri sürdü; bu iddia gerçek kabul edilmedi, bu örnekteki
keşif başarısızlığı olarak kaydedildi.

İçerik sorgusunda beş üründe de hedef domain yok; farklı kamu, akademik veya
erişilebilirlik kaynakları geldi. Tek bir konu sorgusu bütün içeriklerin
görünürlüğünü temsil etmez. ChatGPT'nin keşif sorgusunda tek kullanıcı
mesajının altında iki yanıt/kaynak grubu göründü; ikisi de kontrol edildi ve
iki bağımsız sorgu olarak sayılmadı. Perplexity keşif ve içerik sorgularının
15'er kaynaklık havuzları da açıldı; hedef domain yok.

Gemini'nin keşif ve içerik yanıtlarında doğrudan bağlantılar vardı fakat
kaynak ayrıntısı düğmeleri görülmedi. Bu iki yanıtta web getirmesinin gerçekten
çalıştığı bağımsız doğrulanmadı; sonuç yalnız gözlenen tüketici yanıtıdır.

### Oturum koşulları ve dışlanan denemeler

Claude'un ilk normal sohbetinde **“Searched the web, read a memory”** görüldü.
Bu kişiselleştirilmiş pilot matristen çıkarıldı; özel bellek içeriği açılmadı.
Üç sayılan Claude sorgusu yeni incognito sohbetlerinde tekrar yürütüldü ve
bellek okuma etkinliği görülmedi. Incognito mevcut belleği kullanmaz; profil
tercihleri ve stiller yine uygulanabilir. Dolayısıyla bütün kişiselleştirme
etkilerinin sıfırlandığı iddia edilmez.
[Claude incognito açıklaması](https://support.claude.com/en/articles/12260368-use-incognito-chats).

Gemini geçici sohbetleri ile Google AI Mode mevcut kişisel Google oturumunda
çalıştı; hesap tercihleri değiştirilmedi. Perplexity'de ilk oturum durumu
etiketlenmedi, sonraki arayüzde kişisel profil görüldü. Bir keşif gönderimi
`hardVisitorGate` ile yanıt üretmedi; dışlandı, profil görüldükten sonra bir
tekrar tamamlandı. ChatGPT'de konuşma oluştuğu doğrulanmayan ilk form
etkileşimleri de dışlandı. Ürünler farklı mod/oturumlarda olduğundan tablo
kontrollü model karşılaştırması veya ürün sıralaması değildir.

## Sonuç ve kanıt sınırı

- Google'ın iki canlı örneği geçti; eski indeks kayıtları ve toplam 27 forum
  hatasının rapordan kapanması henüz doğrulanmadı.
- Marka sorgusunda üç üründe site bağlantısı var; iki üründe marka karışıklığı
  gözlendi. Markasız keşif ve seçilen içerik sorgusunda beş üründe de atıf yok.
  Bunlar ölçülmüş iyileştirme alanlarıdır; nedenleri veya bir düzeltmenin
  sağlayacağı artış bu ölçümle kanıtlanmadı.
- Önceki GSC raporundaki **195 Google üretken AI gösterimi**, 16 Temmuz–6 Eylül
  tarihsel toplamıdır. Bu 15 yeni yanıtın sonucu veya Gemini kullanım sayısı
  değildir. Tek bir toplam “LLM puanı”, önce/sonra artış ya da sıralama kazancı
  üretilmedi. İş sırası yalnız PLAN'da tutulur.
- Telemetri kohortuna ait prompt/model/bütçe/worker ayarları bu denetimde
  değiştirilmedi. Public ölçüm trafiği vardı; sıfır trafik/yük iddiası yok.

Yerel makbuzlar `tmp/seo-visibility-2026-09-08/` altında: sabit sorgular ve
kapsam eki `manifest.json`; tamamlanmış 15 kayıttan deterministik üretilen
`citation-matrix.json`; ürün başına `*-branded.json`, `*-discovery.json`,
`*-content.json`; dışlanan pilot `claude-branded-personalized.json`;
`gsc-current-summary.json`, `gsc-entry-15828.json`, `gsc-profile-maraz.json`,
`gemini-link-check.json`. Geçici/incognito sohbetler kalıcı konuşma geçmişi
sunmadığından sonuçlar ve kaynak adresleri kapatılmadan önce bu makbuzlara
alındı. `tmp/` Git dışında; bu belge yöntem ve ölçülmüş sonuçların kalıcı
repo kaydıdır.
