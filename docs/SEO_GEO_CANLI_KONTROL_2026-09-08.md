# SEO/GEO canlı kontrolü — 8 Eylül 2026

Bu belge ölçüm ve düzeltme kaydıdır; tek aktif sıra [PLAN.md](PLAN.md).
Gökhan canlıdaki SEO/GEO sorunlarının telemetri penceresi sürerken öne alınmasını
ve SEO/AI görünürlüğünün iyileştirilmesini istedi. İlk paket public metadata ile
sınırlı; runtime, prompt, zamanlayıcı, içerik üretimi ve DB şeması değişmiyor.

## Anonim canlı ölçüm

**12:49–12:51 TSİ** aralığında 11 anonim GET, **11/11 HTTP 200**. DNS
`46.225.20.177` ve yerel pinned ED25519 fingerprint
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` doğrulandı. SSH,
hesapla giriş, içerik yazma, ayar değişikliği, restart veya dağıtım yapılmadı.
Tamamlanmış HTML yanıtındaki metadata ve JSON-LD ayrıştırıldı; bu bir Search
Console URL Inspection, Rich Results Test veya Lighthouse sonucu değildir.

| Yüzey                                | Doğrudan gözlem                                                            | Sonuç                                             |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------- |
| `/yazar/maraz`                       | 200, kendi canonical'ı, içerik var; `noindex, nofollow`                    | F03 hâlâ canlıda açık                             |
| `/yazar/kirikcetvel`                 | 200, kendi canonical'ı; `index, follow`                                    | Doğrudan ad yolu çalışıyor                        |
| `/entry/16383`                       | `DiscussionForumPosting`, 432 karakter `articleBody`, `text` yok           | F07 alan eksikliği canlıda açık                   |
| `/baslik/erisilebilir-tasarim--4990` | 20 forum öğesinin 20'sinde `text` yok                                      | Aynı kurucu sorunu başlıkta da var                |
| `/ara?q=depozito`                    | Açık robots/noindex ve canonical yok                                       | Arama sonuçlarının indeks niyeti belirsiz         |
| `/robots.txt`                        | Doğru HTTPS sitemap adresi; arama/AI retrieval botları public yollara açık | Eski loopback sitemap sorunu kapalı               |
| `/sitemap.xml`                       | Static/topic/entry alt sitemap adresleri doğru origin'de                   | Index erişilebilir; alt dosyalar bu tur taranmadı |
| `/feed.xml`, `/atom.xml`             | 200; RSS 50 öğe, Atom erişilebilir                                         | S2 için “deploy bekliyor” kaydı bayat             |
| `/llms.txt`                          | 200; platform, politika ve keşif bağlantıları var                          | Dosya zaten canlıda                               |
| `/`                                  | 200; canonical ve WebSite JSON-LD var                                      | Genel erişim engeli gözlenmedi                    |

Bu örnekler bütün sitenin sağlıklı olduğunu veya Google/AI ürünlerinde gerçekten
indekslendiğini kanıtlamaz. Canlıdaki uzun entry kesmesini bu tur ayrıca
örneklemedik; **500 karakter sınırı kaynak kodunda**, tam metin regresyonu ise
500 karakterden uzun yerel fixture ile doğrulandı. Oy sonrası tarih değişmesi
(F08) kaynak kodunda açık borçtur; canlıda oy vererek denenmedi.

## İlk düzeltme paketi

PR #121, tam head `6d4a127712b4e7b9b40d14e567763a780c390de1` için CI
`34215037418` 7/7 SUCCESS sonrası **13:40 TSİ**'de main'e birleşti:
`e310b77f38074c1cf1ac9137d274deafdd305004`. Merge sonrası kaynak ve testler
PR head'iyle aynı, uzak/yerel main eşit ve çalışma ağacı temiz. Dağıtım yok.

İlk kod sürümü `3416827` (`codex/seo-public-indexing`), taban
`7134a04c5699b5ac59a585fff120b9ce93868eb1`. Park edilmiş DECISION adayının
runtime/test kodu alınmadı. Önceki çalışma dalındaki tarihli ölçüm belgeleri
ve PLAN güncellemeleri, kanonik durum kaybolmasın diye belge olarak taşındı.

1. `getProfileIndexingRecord`, profil içeriğiyle aynı
   `resolvePublicProfileUsername` çözümleyicisini kullanır. Gerçek DB'de mevcut
   **22 alias'ın tamamı** aynı kullanıcıya çözülür. Genel `NOINDEX_ALL_DYNAMIC`,
   `SUSPENDED`, `DEACTIVATED` ve bulunamayan kullanıcı kapıları korunur.
2. Tek entry ve başlık JSON-LD'si `articleBody`/500 karakter özeti yerine
   tam `text` üretir. Serializer'ın script sınırı kaçışı korunur. Başlık için
   `isPartOf` türü, sayfanın gerçek türü olan `CollectionPage` olur; eksik ikinci
   bir forum gönderisi tarif edilmez.
3. Arama sayfası bütün sorgu türlerinde `noindex, follow` ve kendine ait açıklama
   üretir. Farklı sorguları içerikçe aynı sayfa sayan zorunlu bir canonical
   eklenmez; burada açık karar arama sonuçlarını indeks dışında tutmaktır.

Google'ın forum dokümanı gönderi için `text`, `image` veya `video` alanlarından
en az birini ve sayfada bulunan gönderinin tam metnini ister. Bu düzeltme ilgili
alanları tamamlar; zengin sonuç görünümü garantisi vermez.
[Resmî sözleşme](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum).

`digitalSourceType` konusu açık: Google bu alanı öneriyor ve yokluğunda insan
üretimi varsayıyor. Depodaki mevcut public kimlik/açıklama sınırını bu teknik
paketle değiştirmedik. Ajan içeriğini nasıl tanımlayacağımız ayrı ürün kararı
olmadan F07 veya bütün SEO/GEO işi tamamen kapandı denmeyecek.

## Doğrulama

- Odaklı birim testleri **8 dosya / 42 test PASS**: public SEO, robots/sitemap,
  discovery, syndication, URL ve profil sekmeleri.
- Yalnız bu iş için loopback PostgreSQL 16.14 üzerinde oluşturulan
  `agentsz_seo_20260908_test`: migrations PASS; indexing entegrasyonu **3/3 PASS**.
  22 alias ile aynı kullanıcı, doğrudan ad, durum ve indeksleme kapıları ölçüldü.
- Format, lint, typecheck ve requirements **3/3 PASS**.
- Chromium arama testleri **2/2 PASS**; gerçek render'da `noindex, follow` var.
- Ek Chromium DOM/text karşılaştırması **1/1 PASS**: başlık listesindeki
  gönderiler ve tek entry sayfasında JSON-LD metni, render edilmiş gövdeyle aynı.
- Yerel HTTP kontrolü **5/5 PASS**: alias profil `index, follow`, profil sekmesi
  `noindex, follow`, arama `noindex, follow`. Entry ve başlık JSON-LD'sinin
  ikisi de fixture'ın **954 karakterini eksiksiz** `text` içinde taşıyor.
- Bağımsız `claude-opus-5/high`: kod SHA
  `341682715cc11e84725e9f4c2c6b164a4818d0c7`, exit 0, `is_error=false`,
  21 tur, izin reddi 0. CLI ayrıca Haiku 4.5 yardımcı kullanımı bildirdi.
  Salt okunur, “beni doğrulama, ÇÜRÜT” çerçevesi; **repo merge için GO**,
  üretim izni değil. Kodda doğrulanmış bloklayıcı bulgu yok.

İlk tarayıcı başlangıcı, ürün koduna ulaşmadan `Prisma Migrate has detected
that the environment is non-interactive` ile durdu. `pnpm exec` altında kalan
`npm_execpath`, global setup'ın reset komutunu npm ile başlatmasına yol açtı;
`--force` npm tarafından tüketildi. `npm_execpath` doğrudan ölçümde npm-cli.js
çıktı. Projenin `test:e2e` script girişiyle reset/seed ve iki test geçti;
bu ortam hatası SEO regresyonu sayılmadı.

Hakemin ek kanıt istediği noktaların yürütücü uzlaştırması:

- Başlık çağıranı ilk pakette yanlış dizin adı nedeniyle eksikti. Gerçek
  `src/app/baslik/[topic]/page.tsx:316`, JSON-LD'ye yalnız ACTIVE entry'leri
  geçiriyor. Entry repository'nin public görünürlük filtresi suppressed seed'i
  eliyor. `entries/application/entries.ts:266` ve `:269`, anonim kullanıcıya
  gizli başlık/entry'yi vermiyor; silinmiş entry gövdesi placeholder oluyor.
- `EntryPreview` katlaması metin kesmiyor; `:183` CSS yüksekliği sınırlandırıyor,
  `:186` tam gövdeyi render ediyor. Engellenen yazar per-viewer gösterim tercihi;
  `BlockedEntryBody` zaten aynı gövdeyi açık “bir kez göster” eylemiyle sunuyor.
  Bu durum anonim crawler için yeni bir gizli içerik erişimi açmıyor.
- Canlı robots çıktısında `/ara` disallow değil; noindex taranabilir.
- 22 kayıtlı kimlikte slug↔username çapraz çakışması **0**, iki kolun kendi
  tekillik kontrolleri zaten var. Hakemin ek invariant önerisi yeni bir hata
  kanıtı sayılmadı. Kayıtta public alias rezervasyonu F04 olarak açık kalıyor;
  bu metadata paketine kullanıcı kayıt politikası değişikliği eklenmedi.
- Hakem isteğiyle gerçek topic ve tek entry DOM metni ↔ JSON-LD `text`
  karşılaştırması E2E'ye eklendi. İlk tur `Received: undefined` verdi; hata
  snapshot'ı hâlâ Gündem sayfasındaydı. Geçişi bekleyen ikinci tur da URL
  beklentisinde kaldı; test süreci sınırlandırılarak durduruldu. Metadata testi
  keşfedilen gerçek bağlantıyı doğrudan `page.goto` ile açacak şekilde
  sınırlandı; istemci gezinmesi bu testin amacı değil. Metin eşitliği beklentisi
  gevşetilmedi. Sonraki turdaki `Expected: 1, Received: 0`, `hasText` seçicisinin
  script metnini eşleştirmemesiydi; script textContent'ini JSON olarak ayrıştıran
  kontrolle **1/1 PASS**. İlk başarısız ve son başarılı log'lar ayrı korunuyor.

Yerel fixture betiği iş bittikten sonra `.mjs.txt` kanıt dosyası olarak
arşivlendi. Geçici `.mjs` içindeki `console.log`, son lint turunda `no-console`
vermişti; ürün kodu veya lint kuralı değiştirilmedi. Arşivleme sonrası lint geçti.

## Search Console başlangıç ölçümü — 13:44 TSİ

Gökhan'ın kişisel hesabındaki `sc-domain:agentsozluk.com` mülkü Chrome
üzerinden salt okunur incelendi. Açık iş hesabında erişim yoktu; mevcut
kişisel oturuma geçince mülk ve raporlar açıldı. Google ayarı değiştirilmedi;
sitemap gönderimi, düzeltme doğrulaması veya indeksleme isteği yapılmadı.

| Rapor                  | Görünen ölçüm                                          | Veri tarihi/kapsamı                     |
| ---------------------- | ------------------------------------------------------ | --------------------------------------- |
| Web performansı        | 70 tıklama, 7.262 gösterim, TO %1, ortalama konum 24,2 | 3 ay filtresi; grafik 16 Temmuz–6 Eylül |
| Google üretken AI Beta | 195 gösterim; sayfa tablosu 157 satır                  | Aynı filtre ve grafik aralığı           |
| Dizin                  | 18.498 dizinde, 9.869 dışında                          | Son güncelleme 4 Eylül                  |
| Forum                  | 84 geçerli, 27 geçersiz öğe                            | Son güncelleme 7 Eylül                  |
| Sitemap                | Başarılı, 21.303 keşfedilen sayfa                      | Son okuma 4 Eylül                       |
| Core Web Vitals        | Mobil ve masaüstünde veri yok                          | Genel bakış raporu                      |

Dizin dışlamaları: noindex **2.929**, robots engeli **499**, yönlendirme **4**,
404 **2**, taranmış ama dizine alınmamış **4.405**, keşfedilmiş ama dizine
alınmamış **2.030**; toplam **9.869**. Ayrıca robots engeline rağmen dizine
alınmış **2** URL uyarısı var. Noindex listesinin ilk 10 örneği `sort`/`window`
parametreli başlıklar; bu kontrollü örnek tüm dışlamaları sınıflandırmaz.
9.869 URL'nin tamamına hata veya içerik kalitesi sorunu etiketi konulmadı.

Forum raporunda `datePublished` ve `author` eksikliği **27'şer** öğede,
`headline` eksikliği uyarısı yine **27** öğede görünüyor; bunlar 81 ayrı
geçersiz öğe olarak toplanmaz. Tarih hatasının ilk tespiti 20 Ağustos.
İlk örnek `/entry/15828`, öğe adı `kaldırım`, son tarama 6 Eylül; görünen ilk
10 örneğin tamamı entry adresi. Daha önce arşivlenen canlı `/entry/16383`
JSON-LD'sinde kök gönderinin author/datePublished/headline alanları var;
bu üç alan **`$.isPartOf` içindeki ikinci DiscussionForumPosting'de yok**.
PR #121 bu nesneyi CollectionPage olarak düzeltiyor. Bu, GSC hata örüntüsüyle
uyumlu kaynak ve canlı HTML kanıtıdır; 27 örneğin tümünü tek tek denetlediğimiz
veya Google hatayı kapattı anlamına gelmez. Kapanış için dağıtım ve yeniden
tarama sonucu gerekir.

Google AI raporundaki 195 gösterim ayrı bir gerçek başlangıç ölçümüdür;
ChatGPT, Claude veya Perplexity görünürlüğü/atıf doğruluğu ölçümü değildir.
Web gösterimleriyle toplanmadı. Performans raporlarının gösterdiği 3 ay
filtresi, grafikteki daha kısa veri aralığıyla birlikte kaydedildi.

## GA4 başlangıç ölçümü — yerel trafik kirliliği

Kişisel hesapta `340080825` hesabının **Agent Sözlük / `546054872`** mülkü
okundu. Trafik edinme raporu **11 Ağustos–7 Eylül 2026**, kaynak/aracı +
ana bilgisayar adı kırılımı. UI toplamı 6.207 oturum, 934 etkileşimli oturum,
görünen ortalama etkileşim süresi 0 saniye. Tam tablo 5 satır:

| Kaynak/aracı     | Hostname        | Oturum         | Etkileşimli oturum | Ortalama etkileşim |
| ---------------- | --------------- | -------------- | ------------------ | ------------------ |
| direct / none    | 127.0.0.1       | 6.136 (%98,86) | 894                | 0 sn               |
| google / organic | agentsozluk.com | 42             | 21                 | 20 sn              |
| direct / none    | agentsozluk.com | 28             | 9                  | 1 dk 16 sn         |
| direct / none    | localhost       | 16             | 10                 | 29 sn              |
| not set          | localhost       | 1              | 0                  | 3 dk 12 sn         |

Bu sayılar UI'daki oturum metrikleri olarak korunur; boyut satırları toplanıp
yeni bir tekil toplam çıkarılmaz. Gerçek alan adıyla sınırlanmamış toplam
kullanıcı/oturum büyümesi ürün başarısı sayılmaz. Tabloda açık ChatGPT,
Claude veya Perplexity yönlendirmesi yok; referrer kaybolabildiği için bu,
AI etkisinin kesin sıfır olduğunu göstermez. GSC ile GA4 zaman aralıkları ve
metrikleri farklı; 70 tıklama ile 42 oturum doğrudan kıyaslanmadı.

Kök neden için kod kanıtı: `src/components/analytics/product-analytics.tsx`
gerçek GTM/Hotjar kimlikleri taşır; mevcut `shouldLoadProductAnalytics`
yalnız oturum/public yüzey kontrolü yapıyordu. Layout ortam/origin kontrolü
göndermiyordu. `playwright.config.ts` loopback uygulama açar; yalnız
`agent-society.spec.ts` kendi analytics isteklerini keser, tüm testlerde
ortak engel yoktur. **Yerel hostname'den veri gelişi doğrudan ölçüldü**;
6.136 oturumun her birini belirli bir CI job'una bağlayan kayıt okunmadı.

Düzeltme kapsamı: production çalışma modu **ve** `https://agentsozluk.com`
origin'i birlikte gerekli; development/test, loopback, staging, eksik/bozuk
ayar kapalı kalır. Mevcut oturum, hassas sayfa, DNT/GPC ve synthetic opt-out
kapıları korunur. Üretim verisi silinmez; GA4/GTM ayarı veya hesap bağlantısı
bu repo değişikliğiyle değiştirilmez. GA4'ün Search Console bağlantısı önerisi
ayrıca görüldü; bağlantı kurulmadı.

Kod SHA `6ca71049e438f3811065da638ff336c662212fb7`; 4 dosya: politika,
layout, policy testi ve tarayıcı testi. **32 test PASS** (26 policy vakası,
component/auth transition/CSP dahil). Gerçek Chromium **1/1 PASS**: yerel
public HTML 200, GTM/Hotjar etiket/kimlikleri yok, gözlenen analytics istek
denemesi **0**. Format/lint/typecheck PASS; requirements 3/3 PASS.
Test için ayrı loopback PostgreSQL `agentsz_analytics_20260908_test`
oluşturuldu; test sonrası silindi, pg_database sayımı 0. Üretim DB'si yok.
Opus 5 incelemesi salt okunur snapshot'ta bu kesin kod SHA'sına bağlı;
sonuç ve exact-head CI, repo teslim kaydıyla birlikte tutulur.

## “İyi SEO/LLM skoru” için ölçüm sınırı

Tek bir evrensel LLM görünürlük puanı yok. Teknik kontrol, indekslenme, gerçek
arama görünürlüğü ve AI atıfları birbirinin yerine kullanılmayacak:

- Teknik kabul: hedef sayfalarda doğru HTTP/canonical/robots, tam ve güvenli
  yapılandırılmış veri, yanlış noindex 0; yayına çıkış sonrası aynı URL'lerle tekrar.
- Performans: temsilî ana sayfa/başlık/entry/profil için mobil Lighthouse ve
  varsa CrUX/Core Web Vitals; bu tur sayısal puan üretilmedi.
- Google görünürlüğü: yukarıdaki Search Console kapsamı, performans ve Google
  AI başlangıç ölçümü alındı; ilk düzeltmenin etkisi henüz ölçülmedi.
- AI görünürlüğü: önceden seçilmiş Türkçe sorgular, ürün/model/tarih kaydı,
  doğru sayfaya atıf ve doğruluk değerlendirmesi; sadece dosya/bot izni PASS'ı
  görünürlük veya atıf kazanımı olarak yazılmaz.

Google'ın güncel rehberi `llms.txt` veya özel AI dosyalarının Search ve onun
generative AI özellikleri için özel bir sıralama katkısı sağlamadığını belirtiyor.
Mevcut dosyayı korumak uygundur; öncelik teknik engeller, özgün ve güvenilir
içerik, açık kaynaklar ve kullanışlı sayfalardır.
[Google AI görünürlük rehberi](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

## Ham kanıt

Git dışındaki `tmp/seo-live-audit-2026-09-08/` dizini: `read-public.py`, her
yüzey için `.body` + `.json` (UTC zaman, SHA-256, HTTP ve ayrıştırılmış metadata),
yerel test log'ları, `review.py` ve bağımsız hakem çıktısı. Public entry gövdeleri
ve prompt'lar attempt ledger'a kopyalanmaz. Bu kayıt canlı deploy makbuzu değildir.
Okunabilir hakem yanıtı `opus-review.md`, SHA-256:
`785a1f3ef118b63a03c7a6b6796451862daf4690d0e4e6cf400276c2cbaa3b3f`.
Merge/CI makbuzu `merge-receipt.json`; GSC'de okunan alanların kaydı
`gsc-baseline.json`, hesap erişimi sonucu `gsc-access-receipt.json`.
GA4 property/tarih/hostname/kaynak alanları `ga4-baseline.json` içinde;
hesap e-postaları ve kimlik bilgileri kanıta kopyalanmadı.
Analytics test log'u `analytics-e2e.log`; hakem çıktıları
`analytics-opus-review.json` ve `analytics-opus-review.md`.
