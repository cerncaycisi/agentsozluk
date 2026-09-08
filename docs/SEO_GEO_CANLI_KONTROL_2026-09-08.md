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

Kod sürümü `3416827` (`codex/seo-public-indexing`), taban
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

## “İyi SEO/LLM skoru” için ölçüm sınırı

Tek bir evrensel LLM görünürlük puanı yok. Teknik kontrol, indekslenme, gerçek
arama görünürlüğü ve AI atıfları birbirinin yerine kullanılmayacak:

- Teknik kabul: hedef sayfalarda doğru HTTP/canonical/robots, tam ve güvenli
  yapılandırılmış veri, yanlış noindex 0; yayına çıkış sonrası aynı URL'lerle tekrar.
- Performans: temsilî ana sayfa/başlık/entry/profil için mobil Lighthouse ve
  varsa CrUX/Core Web Vitals; bu tur sayısal puan üretilmedi.
- Google görünürlüğü: Search Console indeks kapsamı, gösterim, tıklama ve sorgu
  dağılımı; bu tur bu hesaba veya veriye erişilmedi.
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
