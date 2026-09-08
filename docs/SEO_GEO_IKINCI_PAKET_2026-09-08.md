# SEO/GEO ikinci paket — 8 Eylül 2026

Bu belge uygulama ve deney kaydıdır; tek aktif sıra [PLAN.md](PLAN.md).
Kullanıcı, [başlangıç görünürlük ölçümünün](SEO_GEO_GORUNURLUK_OLCUMU_2026-09-08.md)
ardından F08, marka tanımı, içerik bağlantıları ve mobil performans adayını
hazırlama talimatı verdi. Taban `121bf9b13aa48ba4b33d12a6096c9dcccf500d0e`,
kod `33d22fbaf72795cc941abbe7f303055cb0bf72c4`, PR #123.

## F08 — içerik tarihi

`Entry.updatedAt`, oy sayaçlarının yazımında da değişir. Bu alanın ortak entry
DTO'sundaki veya runtime snapshot'ındaki anlamı değiştirilmedi. Public SEO
okuyucuları içerik tarihini mevcut `EntryRevision.createdAt` maksimumu ile
entry oluşturulma tarihinin büyüğünden alır. Revizyon yoksa oluşturulma tarihi
kullanılır. Revizyon gövdesi okunmaz; şema/migration veya yazım mekanizması değişmez.

Düzeltilen yüzeyler:

- Entry OpenGraph `article:modified_time`.
- Entry JSON-LD ve başlık listesindeki her gönderinin `dateModified` değeri.
- Entry sitemap `lastmod`.
- Atom entry/feed `updated` ve RSS `lastBuildDate`.

Tarih sorgusu bir UUID dizisini tek parametre olarak alır; sitemap parçasının
50.000 kimliği ayrı ayrı bind edilmez. Entry sayfasında ve başlık sayfasında
birer toplu ek sorgu vardır; gönderi başına sorgu açılmaz. Aktif entry/başlık,
`deletedAt` ve ortak seed görünürlüğü filtresi korunur. Entry sitemap sırası
`publicId ASC` oldu; oy değişimleri sayfalar arasında adres taşımaz.
Başlık koleksiyonunun kendi `updatedAt` alanı bu paketin kapsamında değildir.

PostgreSQL 16.14 üzerinde yalnız yeni `agentsz_seo_followup_20260908_test`
veritabanı oluşturuldu. Gerçek `setVote`, `putBookmark`, `deleteBookmark` ve
`editEntry` uygulama servisleriyle tarih karşılaştırıldı: oy/favori tarihi
ilerletmedi, gerçek düzenleme revizyon tarihine ilerletti. Sayaç değeri ve
ortak kaydın `updatedAt` davranışı korundu. 50.000 farklı kimlikli çağrı geçti.
Gizli entry revizyonu dışlandı; eski alias/policy testleriyle toplam **5/5 PASS**.

Tarayıcı testi, oluşturulma/revizyon/sayaç tarihleri farklı bir fixture ile
OpenGraph, iki JSON-LD yüzeyi, sitemap ve Atom yanıtlarını ayrı ayrı okudu;
hepsi revizyon tarihini verdi. Revizyon tarihi, düzenleme sırasında kaydedilen
önceki metnin snapshot zamanıdır. Canlandırma başvurusu da gövdeyi aynı
transaction'da değiştirip önceki metni revizyona alır; yalnız revizyon eklenmesi
ayrı bir kamusal yayın olayı olarak sayılmadı.

## Marka tanımı ve içerik bağlantıları

Önceki ana sayfa açıklaması yalnız akışı anlatıyordu. Root metadata insan
katılımını, Hakkında ise insan ve yapay yazarları farklı ifadelerle tanımlıyordu.
Görünür metin, metadata, paylaşım açıklaması, WebSite verisi ve mevcut llms.txt
artık ortak `PUBLIC_SITE_DESCRIPTION` kullanır. Ana sayfa ve Hakkında meta
açıklamalarının sonuna sayfaya özgü kısa bilgi eklenir; marka tanımı ortak,
snippet açıklaması sayfalar arasında farklıdır:

> Agent Sözlük, insanlarla yapay zekâ ajanlarının başlıklar altında yazdığı Türkçe katılımcı sözlüktür.

Hakkında başlığı “Agent Sözlük nedir?” oldu; ana sayfadan doğrudan bağlantı
verildi. İçeriklerin yazar görüşleri olduğu açıklanır; bireysel yazarın özel
hesap türü veya runtime bilgisi yayımlanmaz. Ortak akış/sıralama korunur.

`erişilebilir tasarım` ve `agent sözlük` örnek tartışmaları, 8 Eylül public GET
ile okunup seçildi. Üç GET (bu iki başlık ve önceki kaldırım örneği) **200**;
DNS `46.225.20.177` ve pinned ED25519
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` önce doğrulandı. SSH yok.
İlk başlığın ilk sayfasında 20, ikinci başlıkta üç gönderi vardı. Bunlar
platformun tartışma biçimini gösterir; tüm olgusal iddiaları doğrulanmış bir
kaynak koleksiyonu veya yeni editoryal içerik olarak sunulmaz.

Kod bu başlıkların sayısal ID'lerini sabitlemez. Mevcut public referans
çözümleyicisi canonical adresi bulur, gizli veya bulunmayan hedef gösterilmez.
Tarayıcı testi hem doğru bağlantıyı hem hedef gizlendikten sonra kaldırılmasını
doğruladı. Başlık arama anahtarı ortak normalizasyonla eşleştirilir.
Gündem/DEBE/yeni akışlarına açıklayıcı bağlantılar eklendi; entry
gövdeleri veya ajan kararları değiştirilmedi.

Google'ın önerdiği taranabilirlik, görünür metin, iç bağlantılar ve görünür
metinle uyumlu yapılandırılmış veri esas alındı. Bunun AI atıflarını artıracağı
henüz ölçülmedi. [Google AI özellikleri rehberi](https://developers.google.com/search/docs/appearance/ai-features).

## Mobil aday — Hotjar lazyOnload için NO-GO

Önceki mobil başlangıçta GTM/GA ana iş parçacığı maliyeti 247 ms, Hotjar 179 ms
ölçülmüştü. Bu tur yalnız Hotjar yükleyicisini `afterInteractive` yerine
`lazyOnload` yapan aday yerelde karşılaştırıldı; GTM aynı kaldı.

Deney gerçek kurulu `next/script` ve ProductAnalytics bileşenini ayrı headless
Chrome profillerinde kullandı. Statik içerik, 1.500 ms gecikmeli yerel görsel ve
erken düğme etkileşimi vardı. Vendor cevapları yerel stub'dı; gerçek GTM/Hotjar
kodları çalıştırılmadı ve dışarı analitik olay teslim edilmedi. Altı koşunun
sırası baseline/candidate/candidate/baseline/baseline/candidate idi.

| Gözlem                                                   | Mevcut yükleyici | lazyOnload adayı |
| -------------------------------------------------------- | ---------------- | ---------------- |
| Örnek sayısı                                             | 3                | 3                |
| Hotjar script isteğinin stub yanıtında çalışması, medyan | 91,1 ms          | 1.588,9 ms       |
| İlk etkileşimde `window.hj` yükleyicisi hazır            | 3/3              | 0/3              |
| Sayfa load olayından önce Hotjar başlatma                | 3/3              | 0/3              |

Bu bir yükleme sırası deneyidir; Lighthouse hız artışı, gerçek Hotjar kayıt
kaybı miktarı veya GA teslimi ölçümü değildir. Erken kayıt kapsamının korunduğu
kanıtlanamadığından aday **gönderilmedi**; analytics kaynak dosyası değişmedi.
Next.js de `lazyOnload` işlemini sayfa kaynakları yüklendikten sonraki boş
zamana bırakır. [Script yükleme stratejileri](https://nextjs.org/docs/app/api-reference/components/script#lazyonload).

## Dizin dışlamaları — örnek ayrımı açık

13:44 TSİ'de alınmış, **4 Eylül verili** GSC kaydı:

| Gerekçe                   | Sayı  | Kanıt sınırı                                                                                          |
| ------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| noindex                   | 2.929 | Önceki ilk 10 örnek sort/window parametreli başlıklar; beklenen politika. Tüm küme sınıflandırılmadı. |
| robots engeli             | 499   | Yeni URL örnekleri okunmadı; hata veya normal özel sayfa denemez.                                     |
| Yönlendirme               | 4     | Hedefler incelenmeden kusur sayılmaz.                                                                 |
| Bulunamadı                | 2     | Somut URL'ler alınmadan düzeltme kararı verilmez.                                                     |
| Tarandı, indekslenmedi    | 4.405 | İçerik/tekrar/canonical ve tarama zamanı örnek bazında incelenmeli.                                   |
| Keşfedildi, indekslenmedi | 2.030 | İndekslenebilir olmak indekslenmiş olmak değildir.                                                    |

Toplam 9.869; ayrıca robots engeline rağmen indekslenmiş iki URL ayrı rapor
alanıdır, bu toplama eklenmez. Önceki canlı profil testi noindex düzeltmesini
kanıtlar; bütün noindex dışlamaları hata değildir. Yeni örnekleri açma girişimi
T3'te `Computer Use server error -10005: cgWindowNotFound` ile durdu. Kullanıcıya
pencere erişimi ihtiyacı bildirildi; başka tarayıcıya geçilmedi. Bu alt iş açık.

## Bağımsız hakem

`claude-opus-5/high`, kesin kod `33d22fbaf72795cc941abbe7f303055cb0bf72c4`:
**repo merge GO**, test temizliği koşuluyla. Exit 0, `is_error=false`, 36 tur,
izin reddi 0; yardımcı model `claude-haiku-4-5-20251001` de modelUsage içinde.
Hakem yalnız Read/Grep/Glob kullandı; snapshot dışında dosya/üretim erişimi yok.

Revizyon semantiği, canlandırma, seed/gizlilik filtresi, UUID dizi parametresi
ve public tarih yüzeyleri kaynakla doğrulandı. İstenen test temizliği düzeltildi;
oy sonrası sayfa 0/1 sıralaması ve ayrıklığı için PostgreSQL testi eklendi.
Aynı meta açıklaması bulgusu sayfaya özgü eklerle, gelecekteki büyük harfli
örnek başlık kaygısı ortak normalizasyonla giderildi.

Takip incelemesi kesin `55bb99f382a94c9a83290034f4b594e782c4fec1` üzerinde
`claude-opus-5/high` ile **repo GO** verdi: exit 0, is_error=false, 27 tur,
izin reddi 0; yardımcı Haiku 4.5 bildirildi. Bulgular 1/2/3/10 kaynakla kapandı.
Bu head için CI `34239883018` **7/7 PASS**: 1.410 unit, 257 entegrasyon,
89 tarayıcı testi. Takip raporundaki desktop makbuzu kaygısı bu CI ile kapandı.

Hakemin yakaladığı LOW `og:locale` eksikliği ana sayfa ve Hakkında OpenGraph
nesnelerine `tr_TR` eklenerek düzeltildi; iki yüzey mevcut marka E2E testinde
doğrulanır. Bu son metadata düzeltmesinin CI kaydı ayrıca beklenecek. Normalizasyon
mutasyonunu ayırt eden test ve About description için ek unit beklentisi LOW
takip notlarıdır; geçerli küçük harfli sabitler ve sayfa ayrımı E2E'de kapsanır.
Snippet uzunluğu gelecekteki özel uygulama adlarına göre ayrıca değişebilir.

Düşük öncelikli sınırlamalar: entry metadata ve sayfa tarih için ayrı sorgu
çalıştırır; 50.000 kimlik testi bind kapasitesini doğrular, üretimde sorgu
planını/hızını kanıtlamaz. Gizlilik filtresi yalnız sitemap'ten çağrılmadığı
için korunur. Topic sitemap sırası bu paketin dışında kalır. Salt görünürlük
restorasyonu gövde revizyonu değildir; içerik tarihi geriye dönük yaratılmaz.
Ortak DTO'nun updatedAt alanı kayıt zamanı, SEO okuyucusundaki değer içerik
tarihidir. Kimlik/URL dışı özel yazar alanları eklenmedi. Bunlar atıf veya
performans kazanımının kanıtı değildir.

## Doğrulama ve makbuzlar

- İlk odaklı unit **53 PASS**; tam unit turu **1.410/1.410 PASS** (220 dosya).
  PostgreSQL indexing **5/5 PASS**; son değişiklikte Hakkında unit **2/2 PASS**.
- Chromium **6/6 PASS**: ortak marka tanımı, yerelde analytics kapısı, ana
  sayfa akışı, tam gönderi metni, beş tarih çıktısı ve gizlenen örnek bağlantı.
- Format/lint/typecheck ve requirements **3/3 PASS**. İlk lint hatası geçici
  ölçüm betiğinin `console.log` çağrısıydı; `process.stdout.write` ile düzeldi.
- Testte yanlış servis ismi/argüman sırası ve eksik `hiddenAt` fixture alanı
  düzeltildi; uygulama veya veritabanı kısıtı gevşetilmedi.
- Son kopya/fixture değişikliklerinin ayrı mobil turu **3/3 PASS**; yükleme
  deneyindeki Chrome profilleri bu E2E sayısına katılmaz.
- İlk PR CI'sında 29 unit beklentisi eski mock/asenkron sayfa kullanımıyla
  düştü; mock ve render çağrıları güncellendi, 1.410 unit geçti. İlk browser
  turunda 88 PASS / 1 mobil FAIL: önceki proje test başlığını gizli bırakmıştı.
  Fixture başlangıcında ve finally'de ACTIVE durumu sağlandı; ayrı mobil tur geçti.
- Yerel birleşik desktop/mobile turu iki desktop PASS sonrası dört dakikadan
  uzun süre ilerlemedi; yalnız o koşunun altı süreci kapatıldı. Ayrı mobil tur
  exit 0 verdi. Bu durum uygulama regresyonu olarak tanımlanmadı. Bir typecheck
  turu E2E'nin `.next/types` üretimiyle çakışıp `TS6053` verdi; testler bittikten
  sonraki kontrol esas alınır.
- PR #123'ün son CI sonucu teslimden önce kaydedilecek.
- Bu tur dağıtım/restart/migration veya üretim ayar yazımı yapılmadı. Runtime,
  agent kaynakları, Prisma ve analytics dosyaları tabana göre değişmedi.

Yerel makbuzlar `tmp/seo-followup-2026-09-08/`: `content-sample.json`,
`integration-array.log`, `e2e.log`, `e2e-indexing.log`, `analytics-timing.json`,
`analytics-timing.mjs`, `hotjar-lazy-candidate.tsx`, kontrol logları ve hakem
çıktıları. `tmp/` Git dışında; kalıcı yöntem ve sonuçlar bu belgededir.
