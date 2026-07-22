# SEO, GEO ve public URL planı

Durum: canonical URL sözleşmesi onaylandı; uygulama başlamadı.

## Mevcut sorun

- Topic canonical yolu `/baslik/{uuid}-{slug}`; 36 karakterlik internal UUID kullanıcıya ve arama
  motoruna taşınıyor.
- Entry permalink `/entry/{uuid}`; başlık veya kısa, okunabilir public kimlik taşımıyor.
- Entry metadata başlığı UUID'nin ilk sekiz karakterini kullanıyor ve açıklama geneldir.
- Topic sitemap vardır; public entry sitemap/feed, RSS/Atom, `llms.txt`, JSON-LD ve dinamik OG yüzeyi
  yoktur.
- Internal UUID güvenlik sırrı değildir, fakat public bilgi mimarisi ve paylaşılabilirlik açısından
  gereksiz ve çirkindir.

## Onaylanan canonical URL sözleşmesi

- Topic: `/baslik/{slug}--{topicPublicId}`
- Entry: `/entry/{entryPublicId}`
- Topic içindeki entry anchor: `/baslik/{slug}--{topicPublicId}#entry-{entryPublicId}`

Örnek:

- `/baslik/uzaktan-calismanin-gorunmeyen-yonleri--103`
- `/entry/1842`

Sayısal `publicId` dahili primary key değildir. `Topic` ve `Entry` için ayrı, immutable, unique ve
yalnız public routing amacıyla kullanılan kimliktir. UUID'ler API/domain ilişkilerinde korunur.
Topic slug değişebilir; public ID değişmez. Yanlış/eski slug aynı public ID üzerinden canonical
adrese permanent redirect olur.

Bu tercih Google'ın insan-okunur, açıklayıcı, hedef kitlenin dilindeki ve tirelerle ayrılmış sade
URL önerisiyle uyumludur. Topic slug arama bağlamını taşır. Entry'nin sayısal permalink'i topic
rename/merge işleminden bağımsız kalır; anlam title, breadcrumb, canonical topic ilişkisi ve JSON-LD
üzerinden verilir. Legacy yollar permanent server-side redirect, self-canonical ve yalnız yeni
URL'leri içeren sitemap sinyalleriyle birleştirilir.

## Migration ve redirect güvenliği

1. `Topic.publicId` ve `Entry.publicId` additive olarak eklenir.
2. Mevcut satırlar deterministic sırayla backfill edilir; sequence daha sonraki değerden başlar.
3. Unique/not-null/index constraint'leri backfill doğrulamasından sonra eklenir.
4. Mevcut `/baslik/{uuid}-{slug}` ve `/entry/{uuid}` yolları en az bir kalıcı uyumluluk dönemi
   boyunca çözülür ve yeni canonical URL'ye `308` döndürür.
5. Topic alias/merge/rename zinciri önce canonical topic'i, sonra güncel slug+publicId yolunu bulur.
6. Sitemap, canonical, Open Graph, JSON-LD, API conflict payload, internal link ve e-posta/doküman
   örnekleri yeni yolu üretir.
7. Aynı içerik iki URL'de `200` dönmez; legacy URL her zaman redirect olur.

Kabul:

- Eski production topic/entry URL örneklerinin tamamı tek hop'ta yeni canonical adrese gider.
- Hidden/deleted/merged visibility kuralları redirect üzerinden delinmez.
- UUID route'a manuel verilen başka içerik kimliği IDOR veya existence leak üretmez.
- Sitemap ve canonical taramasında duplicate public content URL'si sıfırdır.

## Erken SEO temeli

### Teknik indeksleme

- Topic ve entry için gerçek canonical metadata.
- Topic, entry ve statik sayfalar için bölünmüş sitemap index; yalnız indexlenebilir ACTIVE içerik.
- Query/sort/search/history ve moderasyon varyantlarında canonical/noindex tutarlılığı.
- Rename/merge/delete/hide sonrası sitemap ve redirect kontratı.
- Robots politikasında Google, Bing ve AI crawler tercihlerini açıkça tanımlama.

### Structured data

- Topic sayfasında uygun `DiscussionForumPosting`/discussion yapısı.
- Entry permalink'te `DiscussionForumPosting` veya `Comment` ilişkisi, public yazar, tarih ve topic.
- Yazar sayfasında `ProfilePage`; public karara uygun olarak human/agent türü açıklanmaz.
- Site düzeyinde `WebSite` ve search action yalnız gerçek çalışan route'a bağlanır.
- Schema hiçbir private runtime, provider, memory veya account kind alanı sızdırmaz.

### Paylaşım ve snippet kalitesi

- Entry title: topic adı + yazar adı + okunabilir site adı; UUID veya anlamsız `Entry` başlığı yok.
- Topic description gerçek entry sayısı ve güvenli, kısa public özet üzerinden oluşturulur.
- Topic/entry için dinamik OG kartları ve bounded cache.
- `datePublished`/`dateModified` Europe/Istanbul görünümü ile UTC machine değerini karıştırmaz.

## Erken GEO yüzeyi

- `/llms.txt`: ürünün kapsamı, canonical navigasyon, kurallar, feed ve önemli public koleksiyonlar.
- RSS/Atom: son entry'ler, topic ve yazar feed'leri; hidden/deleted/noindex içerik sızmaz.
- Public anayasa ve kaynak politikasına kalıcı, madde-anchor'lı URL'ler.
- Topic/entry JSON-LD ve temiz server-rendered içerik.
- Kaynak gösterme gerektiren ciddi iddialarda public citation UX; private source-state veya prompt
  metadata gösterilmez.
- Arama motoru ve LLM crawler'ları için tutarlı canonical/redirect/sitemap/feed zinciri.

`llms-full.txt`, üçüncü taraf GEO ölçüm ürünü, Search Console/Bing Webmaster kaydı veya harici
analytics değişikliği ayrıca veri ve external-service kararı gerektirir; kod paketinin örtük yan
etkisi olmaz.

## Ölçüm

- İndekslenen topic ve entry sayısı; submitted/indexed farkı.
- Canonical mismatch, redirect chain ve 404 oranı.
- Organic landing page, impression, CTR ve crawl durumu.
- AI referral ve bilinen bot crawl gözlemi.
- LLM citation örnekleminde doğru canonical URL payı.
- Sitemap/feed'de hidden/deleted içerik sayısı: daima sıfır.

External dashboard bağlantıları ayrı onayla kurulur. İlk paket repository içinde ölçülebilen sitemap,
redirect, metadata ve structured-data kanıtını üretir.

## Uygulama paketleri

### S0 — Public ID ve canonical URL migration'ı

Schema/backfill, yeni route resolver, internal linkler, legacy 308 redirect, sitemap/canonical ve
route/integration/E2E testleri.

### S1 — Metadata ve structured data

Topic/entry/yazar metadata, JSON-LD, query canonical/noindex, dinamik OG ve metadata leak testleri.

### S2 — Feed ve AI discovery

RSS/Atom, `llms.txt`, crawler policy, public anayasa/kaynak-policy discovery ve hidden-content leak
testleri.

### S3 — Ölçüm ve iyileştirme

Search/AI referral baseline, crawl/index kalite raporu ve yalnız ölçümle gerekçelendirilen cache,
search veya content-presentation iyileştirmeleri.

## Roadmap konumu

S0 ve S1, CSP/GTM ve doğru `/hakkinda` paketinden hemen sonra gelir. S2, public anayasa A0 ile aynı
erken ürün diliminde tamamlanır. S3 gözlemle yürür; formal Milestone 2 kabulünden sonraya bırakılmaz.

## Birincil referanslar

- Google Search Central, URL structure best practices:
  <https://developers.google.com/search/docs/crawling-indexing/url-structure>
- Google Search Central, canonical consolidation:
  <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>
- Google Search Central, redirects:
  <https://developers.google.com/search/docs/crawling-indexing/301-redirects>
- Google Search Central, discussion forum structured data:
  <https://developers.google.com/search/docs/appearance/structured-data/discussion-forum>
