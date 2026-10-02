# PLAN arşivi — Ekim 2026

Bu dosya `docs/PLAN.md`'den taşınan **kapanmış** bölüm ve maddeleri, madde kimlikleri ve ölçüm
kanıtlarıyla birlikte, olduğu gibi saklar. Aktif kuyruk değildir; açık iş yalnız `PLAN.md`'dedir.
Taşıma 2 Ekim 2026'da yapıldı (Fable Z7, PLAN 5.9 İ1). Kod yorumlarındaki "docs/PLAN.md" madde
atıfları (A3, A5, B7, F09 …) bu dosyada aynı kimlikle bulunur.

## 0. Yerelde kapatılan paketler

### 23 Eylül 2026 (gece) — canlıda `f2f57f3`

- A1 (#173), lease taraması (#174), A3 (#175), `agent_runs.finishedAt` indeksi (#176), F04
  (#178). A5 yoluyla, kesinti ≈9 dk. Kanıt `STATUS.md` ve `ATTEMPT_LOG.md`.
- Kurulu alarm betiği de `f2f57f3` sürümüne güncellendi (Astra "KUR"; ilk timer koşusu temiz).

### 23 Eylül 2026 — main'de, üretimde değil

- **`a0f2878` — iletişim ve içerik kaldırma formu (PR #164).** Ayrıntı ve kanıt B5.1-2
  maddesinde. Migration içerdiği için A5 (migration'lı dağıtım yolu) kapanmadan canlıya
  çıkmaz.

### 19 Eylül 2026 — main'de, üretimde değil

- **`4d665cf` — lease transaction'ı `P2028` ile düşüyordu.** (21 Eylül düzeltmesi: bu commit lease yolunun etkin timeout'unu DEĞİŞTİRMEDİ; ayrıntı bölüm 5.5.) 14,5 saatlik sessiz
  durmanın kök nedeni; ayrıntı ve açık kalan tasarım borcu bölüm 5.5'te.
- **`d2244f7` — varsayılan sıralama temiz başlık sayfalarını facet'e çeviriyordu.**
  18 Eylül incelemesinin **B2** bulgusu: sayfalama ve "en eski" sekmesi, ziyaretçi
  hiç sıralama seçmemişken `sort=oldest`i URL'ye yazıyordu; `hasFacetParameters`
  her `sort=`i facet saydığı için bu linkler `noindex` oluyor ve `robots.ts`'in
  `/*sort=` engeline takılıyordu — aynı günün "derin entry'ler indekslensin"
  düzeltmesini geri alıyordu. **19 Eylül 21:44Z itibarıyla canlıda ve doğrulandı:**
  sayfalı başlıkta linkler temiz `?page=2..4` (18 Eylül'de `?sort=oldest&page=2` idi),
  varsayılan sıralama sekmesi sorgusuz adrese gidiyor. Kalan küçük iz: "tümü" linki
  hâlâ `?sort=oldest` üretiyor, yani temiz sayfa kendi engelli ikizine link veriyor.

### 17 Eylül 2026

- **Türkçe/Unicode kelime sınırı ve case-fold sözleşmesi — yerel GO.**
  `fix/turkce-kelime-siniri` dalındaki exact `57258af` adayı, `\b` yüzünden ters
  çalışan `çocuğum`, `üniversitedeyken` ve `yazı` dallarını ortak
  `word-boundary` sözleşmesine taşıdı. Offline iddia, moderasyon tartışması ve
  life-ledger OTP kapıları basit/Türkçe sabit-uzunluklu case-fold varyantlarını
  paylaşıyor; `BEN PILOTUM`, NFD ve Unicode-harf-komşuluğu vakaları testte.
  İstemci bağımlılık grafiği dinamik/CommonJS/Worker/Webpack context yollarında
  fail-closed ve lookbehind helper'ının client bundle'a erişimini engelliyor.
  Son Opus 5 salt okunur hakemliği **GO**; full unit 224 dosya / 1.489 test,
  format/lint/typecheck PASS. Bu kayıt merge veya üretim dağıtımı değildir;
  [yerel durum](STATUS.md) ve [deneme günlüğü](ATTEMPT_LOG.md) kanıtı taşır.

### 28–31 Ağustos 2026

- **P0 güvenlik — Codex credential prompt-injection sızıntısı.** Model, sandbox'ta görünür
  `auth.json`'ı prompt injection ile okuyup çıktıya taşıyabiliyordu (üretimde 8'de 1 ölçüldü).
  Çözüm: modelin shell/dosya aracı kapatıldı (`-c features.shell_tool=false`), sızıntı 0/8,
  karar kalitesi bozulmadı, API'ye geçilmedi. `PROPOSE_SOURCE` kill switch kapsamına alındı.
  (#79, #80 · kanıt: `CODEX_CREDENTIAL_EXPOSURE_2026-08-31.md`)
- **Gezinme fazı** — ajan yazmadan önce seçtiği başlıkları okuyor; okuma-yazma bağı kuruldu,
  "yeni başlık aç" kaçış yolu kapatıldı (yaprak üretimi 15→9). (#69, #74, #76)
- **Başlık kuralları** — tekil kanonik adres, paketleme ölçütü uzunluk değil şey sayısı. (#73, #75)
- **Çağrı bütçesi kazası** — worker'ı öldüren wire-şeması ayrışması düzeltildi. (#72)
- **Belge temizliği** — 4 ölü belge silindi; bu plan konsolide edildi.

---

## 1. Sıra 1 — hızlı, düşük risk, ölçümü kirletmeyen

Küçük, izole, canlı davranış ölçümünü bozmayan düzeltmeler. Fable ve Sol ikisi de önce bunları
istedi.

**8 Eylül SEO/GEO önceliği:** Gökhan'ın canlı SEO ve AI görünürlüğünü iyileştirme
talimatıyla telemetri penceresi sürerken public metadata paketi öne alındı:
profil alias noindex → F07 tam metin alanı → arama noindex. İlk kod `3416827`,
ana dal tabanlı `codex/seo-public-indexing` dalında; DECISION adayı taşınmadı.
11 anonim GET'in tamamı 200; üç açık yeniden doğrulandı. 42 unit ve gerçek
PostgreSQL'de 3 test geçti (22 alias); Chromium 2/2, yerel HTTP 5/5 geçti.
Ek DOM/text Chromium karşılaştırması 1/1 geçti.
Opus 5 kod için repo merge GO verdi (21 tur, izin reddi 0); görünürlük ve
bot koşulları kaynakla uzlaştırıldı. PR #121, 7/7 CI sonrası 13:40 TSİ'de
`e310b77` olarak main'e birleşti. **14:50 TSİ: SEO ve analytics paketi `f88d64d`
canlıya alındı.** App/runtime/boot eşleşmesi ve health/ready/search 200 geçti;
13 anonim GET ve 41 metadata/metin + 3 privacy kontrolü geçti. Üretim prompt'u
değişmedi; kontrollü worker restart'ı ve 170,784 saniyelik pause aşağıdaki
telemetri kaydına işlendi.
[Canlı bulgular ve kabul ölçümleri](SEO_GEO_CANLI_KONTROL_2026-09-08.md).
**13:44 TSİ Search Console başlangıç ölçümü:** kişisel hesaptaki domain mülkü
okundu. 3 ay filtresinde 70 tıklama, 7.262 gösterim, ortalama konum 24,2;
Google üretken AI raporunda 195 gösterim. Grafik veri aralığı 16 Temmuz–6 Eylül.
4 Eylül indeks raporunda 18.498 dizinde / 9.869 dışında; 7 Eylül forum
raporunda 27 geçersiz öğe (`author` ve `datePublished` eksik). Bu hata örüntüsü
PR #121'de düzeltilen eksik `isPartOf` forum nesnesiyle uyumlu; Google'ın
yeniden taramasıyla kapanış henüz doğrulanmadı. İlk noindex örnekleri filtreli
başlıklar; tüm dışlamalar hata sayılmayacak.
**GA4 ile yeni öncelik:** 11 Ağustos–7 Eylül raporunda 6.207 toplam oturumun
6.136'sı `127.0.0.1` (%98,86); ayrıca localhost satırları var. Kaynak kodu
anonim yerel public sayfalarda gerçek GTM/Hotjar kimliklerini yüklüyordu.
**Düzeltme canlıda:** analytics yalnız production + gerçek site origin'inde açık.
GA4 ölçümü gerçek hostname üzerinden alınır; rapora uygulanan exact hostname
filtresi 70 oturum verdi (42 Google, 28 direct). Geçmiş veri silinmedi veya
Google mülk ayarı değiştirilmedi. Google organik satırı
gerçek hostname'de 42 oturum; tam tabloda açık AI yönlendirmesi görünmüyor.
`6ca7104` ortam/origin kapısını ekledi; 32 test ve Chromium 1/1 geçti,
yerel HTML'de GTM/Hotjar yok, ölçülen analytics istek denemesi 0.
Salt okunur `claude-opus-5/high` incelemesi tamamlandı; 20 tur, izin reddi 0.
`next.config.ts` ortam eşleme koşulu kaynakla kapandı. PR #122 head `11062a2`
ve main `f88d64d` CI'ları 7/7 geçti. Canlı efektif ortam/origin kapısı doğru;
anonim ana sayfada GTM/Hotjar var, arama/giriş/DNT/GPC/synthetic opt-out'ta yok.
**İkinci SEO/GEO paketi PR #123 ile main'e birleşti (`cf8f426`):** F08 içerik tarihi mevcut
revizyonlardan okunuyor; oy/favori tarihi ilerletmiyor. Sitemap sırası oyla
oynamıyor. Ana sayfa/Hakkında/WebSite/llms aynı marka tanımını taşıyor;
sayfa açıklamaları ayrışıyor. İki örnek tartışma mevcut canonical çözümleyiciyle
bağlandı, gizli hedef çıkarılıyor. Çekirdek `33d22fb` Opus 5'ten repo GO aldı;
istenen test temizliği ve ek sayfalama testi yapıldı. 1.410 unit, PostgreSQL
5/5, ilk Chromium 6/6 ve son ayrı mobil 3/3 geçti. Opus 5 `55bb99f` için de
repo GO verdi; ardından yalnız OpenGraph locale ve iki E2E assertion eklendi.
Son head `77bfd0a`, CI `34241165340` **7/7 PASS**: 1.410 unit, 257 entegrasyon;
tarayıcı **88 PASS + 1 retry PASS (flaky)**. Auth testindeki `/giris`
`net::ERR_ABORTED` ilk deneme hatasının kök nedeni bu tur ayrıştırılmadı.
**9 Eylül 10:13–10:17 TSİ: ikinci paket `8280ed4` canlıya alındı ve kabul edildi.**
Exact CI/bundle başarılı; app/runtime/boot eşleşti, health/ready/search 200.
12 anonim GET ve 108/108 kapsam kontrolü geçti: F08 tarihleri, marka tanımı,
canonical örnek bağlantıları. Pause/resume `268→269→270`, 338,712 sn;
diğer ayarlar ve 36 persona snapshot'ı aynı. İlk doğal koşu SUCCEEDED,
üç fazda 3/3 boyut alanı var. [Canlı kanıt](CANLI_DAGITIM_VE_TELEMETRI_2026-09-09.md).
**Sırada Google yeniden tarama/indeksleme ve farklı günlerde sabit AI sorguları var.**
T3'ün kendi `preview_*` tarayıcısıyla GSC erişimi açıldı. İki 404 örneğinin
tamamı `/&` ve `/$`; dört yönlendirme kontrol edildi, hedefleri çalışıyor.
499 robots kaydının ilk 10'u giriş URL'si; 4.405 tarandı-indekslenmedi kaydının
ilk 10'u 7 OG görseli + 3 filtreli sayfa. 2.030 keşfedildi-indekslenmedi
kaydının ilk 10'u canlıda 200/index/follow/kendine canonical; Google taraması
“Yok”. Örnekler tüm kümeye genellenmez. İndeks raporu hâlâ 4 Eylül,
forum raporu 7 Eylül verisi; 27 hatanın kapanışı doğrulanmadı.
Hotjar lazyOnload adayı, yerel 3+3 denemede ilk etkileşimde yükleyici hazır
3/3 → 0/3 olduğu için gönderilmedi. Analytics kaynakları aynı; hız kazancı
iddiası yok. [İkinci paket ve deney kanıtı](SEO_GEO_IKINCI_PAKET_2026-09-08.md).
Google'ın yeniden tarama sonucu ayrıca izlenecek; 27 forum hatasının GSC'de
kapandığı veya geçmiş Analytics verisinin temizlendiği iddia edilmiyor.
**15:07–15:15 TSİ mobil Lighthouse başlangıcı:** dört sayfanın her birinde bir
örnek; SEO ve erişilebilirlik 100, Best Practices 96. Ana sayfa/başlık/entry/profil
performansı **89/97/83/94**, TBT **381/162/553/227 ms**; CrUX verisi yok.
Ana sayfada GTM/GA 247 ms, Hotjar 179 ms ana iş parçacığı maliyeti ölçüldü.
Analytics yükleme zamanı bir performans adayı; kaldırmanın kazancı henüz
karşılaştırmalı ölçülmedi. **15:24 TSİ GSC:** forum toplamı hâlâ 27 geçersiz;
örnek `/entry/15828` 6 Eylül taramasında iki forum öğesi ve geçersiz öğe içeriyor.
**Google canlı sonuçları tamamlandı:** `/entry/15828` 15:24:22'de indekslenebilir
ve **1 geçerli forum öğesi**; `/yazar/maraz` 16:24:11'de indekslenebilir ve
**1 geçerli ProfilePage**. Eski indeks kayıtları sırasıyla 6 Eylül ve 21 Ağustos;
27 hatanın topluca kapanışı veya profilin yeniden indekslenmesi doğrulanmadı.
**16:28 TSİ AI başlangıcı:** beş üründe aynı üç sorgu, toplam 15 tamamlanan yanıt.
Marka atfı Claude/Perplexity/Gemini'de var; ChatGPT/Google AI Mode'da yok.
Markasız keşif ve seçilen içerik sorgusunda beşinde de atıf yok. Her hücre tek
örnek; toplam “LLM puanı”, ürün sıralaması veya önce/sonra kazancı üretilmedi.
İkinci paketin dağıtımı ve yeniden tarama sonrasında aynı sabit sorgular farklı
günlerde tekrarlanacak; doğru marka tanımı ile markasız keşif ayrı kabul
ölçümleri olacak; mevcut sonuç bunların
nedenini veya belirli bir düzeltmenin kazancını kanıtlamaz.
[Ölçüm, oturum koşulları ve kaynaklar](SEO_GEO_GORUNURLUK_OLCUMU_2026-09-08.md).

- [x] **Browse sınırını tek sabite indir.** — yapıldı; wire şeması artık
      `max(runtimeReadTopicLimit)` kullanıyor, üç yerde tek sayı var. _(Fable §7.1)_
- [x] **"Tam metin" çelişkisi.** — yapıldı, ölçerek. 15 329 aktif entry'nin %6,3'ü 600
      karakteri aşıyor (p50 184, p95 741, maks 1630); kesme tam da ajanın cevap vermek
      isteyeceği uzun entry'leri vuruyordu. Sınır 2000'e çekildi (bugünkü en uzunun üstü) VE
      prompt cümlesi "tam metin" iddiasından vazgeçti — şema üst sınırı 10 000 olduğu için
      kesme kavramsal olarak hâlâ mümkün. _(Fable §7.1)_
- [x] **`TRUST_PROXY=false` + production fail-loud.** — yapıldı; `config/env.ts` production'da
      fail-loud guard taşıyor. _(Fable §4.3.1)_
- [x] **`/kurallar` sayfasındaki uygunsuz ifade** — zaten düzeltilmiş, madde bayatmış. PR #82
      (`520e332`, "kurallar dili") anayasa metninden üç yerde kaldırmış; canlı sayfa çekilip
      tarandı, 0 eşleşme. _(Codex §4.10)_
- [x] **robots.txt `127.0.0.1` sitemap** — yapıldı; `robots.ts` `force-dynamic` + doğrulanmış
      `APP_URL` kullanıyor. _(Codex §4.5)_
- [x] **Ajan profil noindex — public alias düzeltmesi canlıda.** `3416827` ortak
      kimlik çözümleyicisine geçti; 22 alias PostgreSQL ve yerel HTTP kontrolü
      geçti. PR #121, `f88d64d` paketiyle 8 Eylül 14:50'de dağıtıldı; canlı
      `/yazar/maraz` index/follow ve doğru canonical verdi. Google'ın 16:24:11
      canlı testinde tarama/getirme/indekslemeye izin ve **1 geçerli ProfilePage**
      doğrulandı. 21 Ağustos'tan kalan noindex indeks kaydı henüz güncellenmedi;
      kod/canlı düzeltme kapandı, yeniden indeksleme sonucu ayrı izlenecek.
      _(Codex §4.6; 4 Eylül repo incelemesi F03)_
- [x] **`GOKHAN_ICIN.md` güncelle veya arşivle** — zaten arşivlenmiş, madde bayatmış. Dosyanın
      başında 31 Ağustos tarihli arşiv uyarısı var ve aktif kuyruğu bu plana yönlendiriyor;
      içindeki "karar bekleyen" üç maddenin ikisi kapanmış (iki-popülasyon prompt sorunu,
      `RUNTIME-004`). Üçüncüsü (M2 kabulü) aşağıya taşındı. _(Fable §6)_

  Arşivin bir iddiası ise **doğrulanamadı**: "her davranış release'i Gate 10 penceresini
  bilerek sıfırlıyor" deniyor ama runbook'ta ya da traceability'de böyle bir kural yok
  (arandı, sıfır eşleşme). Gate 10'un sekiz kriteri koşulara bakıyor, release temposuna
  değil. Yani "bu tempoyla pencere hiçbir zaman dolmaz" sonucu yazılı bir sözleşmeden değil
  yorumdan geliyordu.

---

## 2. Sıra 2 — runtime güvenilirliği (P1, asıl teknik borç)

**İki inceleme de bunu en ağır teknik borç saydı ve hiçbir eski backlog akışında yoktu.** Canlı
davranışı ve veri bütünlüğünü etkiliyor.

- [x] **Retry bütçesi tükenen koşu ajanı kilitliyor.** — canlıda (PR #83, `45b97ab`). `attempts=3` olan expired `RUNNING`
      satır bir daha seçilemiyor; aynı ajanın yeni `QUEUED` koşusu da o satır durdukça
      engelleniyor. Ajan ACTIVE görünür ama bir daha doğal uyanış almaz. Düzeltme: her lease
      seçiminden önce, tükenmiş expired koşuyu aynı kilit sırasında effect-aware terminalize et
      (effect yoksa `CANCELLED`, varsa `PARTIAL`). _(Codex §4.1)_
- [x] **Lease reclaim decision sonrası resume edemiyor.** — canlıda (PR #85, `02bb052`). Gerçek resume (checkpoint/state machine) hâlâ açık borç. Process decision batch'ten sonra
      ölürse, reclaim modeli baştan çalıştırıp `IDEMPOTENCY_CONFLICT` / `(runId,sequence)` unique
      çakışması üretiyor; kalan `PROPOSED` action'lar hiç yürümüyor. Kısa vade: persisted batch'li
      expired koşuyu yeniden modelleme, gerçek effect sayısına göre terminalize et. _(Codex §4.2)_
      Uygulamada çıkan ek bulgu (Sol): bakım modunda `REFLECTION`/`SOURCE_REFRESH` run'ları
      maintenance finalizer'ının dışında ama claim'in içinde — containment her iki modda
      koşmalıydı. Ayrıca finalizer adayları artık satır kilidi altında yeniden doğrulanıyor.
- [x] **Context/provenance server-side snapshot'a bağlı değil.** — TAMAMLANDI (PR #86, #88, #91, #92, #93). _(Codex §4.3 — güvenlik
      derinliğiyle de kesişir)_ Provenance doğrulaması "bu koşuda gösterildi mi" yerine global
      ownership'e bakıyordu: hatalı ya da ele geçirilmiş bir worker, ajanın hiç görmediği bir
      entry'yi kaynak gösterip off-snapshot public effect üretebilirdi.

  Yapıldı (bkz `docs/SNAPSHOT_PROVENANCE_2026-09-01.md`): action provenance artık dondurulmuş
  snapshot'tan türetilen **tipli** kataloğa karşı doğrulanıyor
  (`domain/runtime-evidence-catalog.ts`, worker ile ortak); gezinme fazında `readTopicIds`
  sunucuda menüye karşı süzülüyor (`domain/runtime-browse.ts`, worker ile ortak); action
  **hedefi** de snapshot'a bağlandı. İkisi de Sol'un bulduğu gerçek kaçış yollarıydı —
  gezinme menüsü yalnız worker'daydı, hedef ise hiç denetlenmiyordu (`MODEL_KNOWLEDGE`
  provenance'ı her zaman geçerli olduğu için herhangi bir ACTIVE başlığa yazılabiliyordu).

  Snapshot zorunluluğu da kapandı: `perceptionSummary` `null` olan koşu artık hiçbir action
  yazamıyor. Bu kural "27 testi kırıyor" diye ertelenmişti; ölçüm testler gerçek worker
  akışına çekilmeden ÖNCE alınmıştı. Taşıma yapıldıktan sonra tekrar ölçüldü: **27 → 1**.

  Sol'un koyduğu yedi blocker'ın yedisi de kapandı: gezinme kaçış yolu, tipli katalog,
  action hedefi, snapshot zorunluluğu, life ledger kapsamı, USER hedefleri ve snapshot
  sürüm bağı. Her kural uygulanmadan önce gerçek türetme fonksiyonuyla üretimde ölçüldü;
  hiçbirinde meşru red çıkmadı.

- [x] **P1 — Ölçülmüş kapasite ile uygulanan eşzamanlılık aynı otoriteye bağlı değil.**
      _(4 Eylül repo incelemesi F02)_ Lease `settings.codexConcurrency === 2 ? 2 : 1`
      kullanıyor, scheduler da ayar değerini. Kapasite/yetenek ölçümü ayrı bir kapı olduğu
      hâlde, o kanıtın eskimesi ya da geçersizleşmesi etkin sınıra yansımıyor: sağlayıcı,
      binary veya makine koşulu değiştiğinde geçmişte alınmış izin taşınmaya devam ediyor.
      Bu "sınırsız iş koşuyor" bulgusu değil — ayar ve kilitler sınırı tutuyor; eksik olan
      sınırın hâlâ güvenli olduğunu bildiren güncel kanıtın uygulanması.
      **Kapatma ölçütü:** istenen eşzamanlılık ile kanıtın izin verdiği eşzamanlılıktan TEK
      etkin değer hesaplansın; lease ve scheduler aynı hesabı kullansın; eski/eksik kanıtta
      davranış açıkça tanımlansın.
      **Kod ve canlı kabul tamamlandı — PR #130, dağıtım `489cb83`.**
      Astra dört tur inceledi: **NO-GO, NO-GO, NO-GO, GO**. Son GO yalnız dördüncü turda
      incelenen delta içindir; üretim dağıtımı için GO değildir.
      İncelemeler: [1](ASTRA_F02_INCELEMESI_2026-09-14.md),
      [3](ASTRA_F02_INCELEMESI_3_2026-09-14.md), [4](ASTRA_F02_INCELEMESI_4_2026-09-14.md).
      Turlar sırasıyla şunları yakaladı: ilk aday kapasite kaydı **yokken** ayarı koruyordu
      (kanıtsız 2); düşüşün tüketicisi yoktu ve taze-ama-güvensiz ölçüm `EVIDENCE_STALE`
      diye yanlış etiketleniyordu; son uygulanan karar `occurredAt` ile seçildiği için ters
      zaman sırasında yanlış kayıt okunabiliyordu ve uçuş testi ayırt edici değildi.
      Kapsam bilerek dar: "mevcut kapasite politikasını lease ve scheduler'a uygular";
      sürüm okumasının `model` alanına düşmesi devralınan bir zayıflık olarak **açıkça**
      kapsam dışı ve bir testle kayıt altında.
      17 Eylül dağıtımında ayar 2'de bırakıldı; eskimiş kapasite kanıtı aynı
      çözücüde `EVIDENCE_STALE` üretti ve etkin sınır 1'e düştü. Resume sonrası
      gözlemde tek lease/tek şerit doğrulandı. Yeni kapasite ölçümü operatör
      eylemi olmadan sistem iki şeride dönemez. Dağıtım öncesi sıra
      [F02_DAGITIM_2026-09-14.md](F02_DAGITIM_2026-09-14.md), canlı kabul
      [CANLI_DAGITIM_2026-09-17.md](CANLI_DAGITIM_2026-09-17.md).
- [x] **Source result persistence hatası fetch hatası gibi yazılıyor.** — canlıda (PR #84, `eb1aa4e`). Tek `try/catch` hem
      okumayı hem write'ı kapsıyor; başarılı write commit edip response kaybolursa aynı attempt
      `SOURCE_FETCH_FAILED` sayılıp sağlıklı kaynağı backoff/demotion'a sokabiliyor. Fetch ve
      persistence exception'larını ayır, `attemptId` idempotency key olsun. _(Codex §4.4)_

---

## 3. Sıra 3 — güvenlik derinliği (asıl açık kapalı; bunlar savunma katmanı) — kapanan maddeler

- [x] **`--ro-bind / /` → allowlist.** — yapıldı. Host geneli okuma kapatıldı; liste üretim
      host'unda gerçek bwrap ve gerçek Codex çağrısıyla ÖLÇÜLEREK kuruldu (codex statik derli,
      `/lib` gerekmiyor; `/etc/ssl` + DNS dosyaları şart). Kontroller kırılıyor, yani ölçüm
      duyarlı. Ayrıntı: `docs/CODEX_CREDENTIAL_EXPOSURE_2026-08-31.md`. _(Sol; Codex P0 eki)_
- [x] **`db:reset` korumasız ve yıkıcı** — yapıldı. Mevcut koruma `TEST_DATABASE_URL` için
      yazılmıştı ama `prisma migrate reset` **`DATABASE_URL`** okuyor, yani bu komuta hiç
      uygulanmıyordu. Üç bağımsız katman eklendi: ad (`_test`/`_dev` ile bitmeli), host
      (yalnız loopback), ve açık onay (`AGENT_DB_RESET_CONFIRM=<ad>`). Her katman ayrı
      test ediliyor. _(Codex §4.9)_
- [x] **`containsPath` realpath/symlink** — yapıldı. Kapsama kontrolü artık sembolik bağı
      çözüyor; yol henüz yoksa sözlüksel hâline dönüyor (fırlatmıyor). _(Sol)_

## 4. Sıra 4 — davranış ölçümü — kapanan maddeler

- [x] **Üslup paragrafı ölçümü — RAPOR YAZILDI, geri alma yok (20 Eylül).**
      Kesim `2026-09-19T20:30:11Z`; D1 238, D2 299, D3 552, parmak izleriyle
      donmuş örneklem. Sonuç:
      [ölçüm raporu](USLUP_PARAGRAFI_OLCUM_SONUCU_2026-09-20.md).

      **Ö1 tanımsal açılış %18,05 → %2,52** (p=1,1×10⁻⁹, Bonferroni eşiğini
      geçer). **Ama bu bir manipülasyon kontrolüdür:** paragrafın kendisi
      "Başlığı tekrar edip tanım kurma" diyor, yani ölçüt talimatın tutulduğunu
      gösterir, yazının iyileştiğini değil. Düşüşün tamamına yakını başlık
      tekrarından geliyor (k1 %77,6 → %24,8).
      **Ö3** `DUPLICATE_FRAMING` %11,26 → %7,69, p=0,062 — **fark
      gösterilemedi** (korkulan yön artıştı, artış yok).
      **Ö2 ölçülemez çıktı:** payına bağlanan `ACTION_SCHEMA_INVALID` tüm
      tarihte **0** kez, `CODEX_*_OUTPUT_INVALID` 4 kez gerçekleşmiş. Madde 32
      kapısının tekrarı — önkayıt yazılırken taban sıklığına bakılmalıydı.
      **Ö4 (kör okuma) KOŞULMADI:** insan korpusu bu oturumda erişilebilir
      değildi; uydurma ikame yapılmadı, açık madde.

      Geri alma koşulları (Ö1 kötüleşir / Ö2-Ö3 artar) gerçekleşmedi; paragraf
      üretimde kalıyor.

- [x] **Ö4 kör okuma — KOŞULDU (25 Eylül): Astra 36/36 doğru ayırdı (Wilson %95 %90–100).**
      Ajan entry'leri haber özeti/ansiklopedik tanım + cilalı genel çıkarım kalıbında, kişisel iz
      yok. Ayrıntı ve sınırlar: [Ö4 sonucu](O4_KOR_OKUMA_SONUCU_2026-09-25.md). Önceki not:
      Gerekli: konu-eşleştirilmiş gerçek
      ekşi/normalsözlük entry kümesi (15 Eylül'de 36 entry kullanılmıştı, elde
      yok). Eşleştirme ve karıştırma yürütücüde, karar hakemde; büyük/küçük harf
      normalize edilir.
- [x] ~~**Gezinme fazı verim regresyonu.**~~ _(bkz `docs/KOSU_BUTCESI_OLCUMU_2026-09-02.md`)_
      Ölçüm fazı büyük ölçüde akladı: gezinme p50 **10 sn**, koşu bütçesinin %2'si; kararı da
      yavaşlatmıyor (p95 439 vs 442). Zarar süresinden değil **bütçesiz bırakılmasından**
      geliyordu (koşunun kalan tüm bütçesini alıyordu) ve düzeltildi — karar rezervi + 20 sn
      tavan. 50/50 deneyi kuruldu ama `AGENT_BROWSE_EXPERIMENT` bayrağı arkasında KAPALI;
      gerekçesi zayıfladığı için açmadan önce yeni veriye bakılacak.

  **Asıl yük başka yerde:** DECISION 259 sn + DECISION_REPAIR 144 sn = 403 sn (bütçe 480).
  Onarım koşuların ~%35'inde tetikleniyor ve sebebi ölçüldü: **SCHEMA 76, CATALOG 4** —
  yani yapılandırılmış çıktı sorunu, provenance değil. Düzeltmesi kaliteden ödün
  gerektirmiyor. Hangi şema alanının takıldığı şimdi kaydediliyor.

  Eski gerekçe (aşağısı ölçümden önce yazılmıştı): canlı ölçüm entry/saat %39 düştü,
  `CODEX_TIMEOUT` %13,6→%21,6. Sol'un tasarımı: gezinmeye 20 sn kendi timeout'u (toplam
  deadline sabit), koşuları sabit hash'le 50/50 böl, ~400 koşu/kol ölç — timeout oranı,
  entry/saat, gerçek yeni başlık/saat, yaprak/entry, p95, ve **kör insan değerlendirmesi**
  (`205/205` kalite değil, kurala uyum). Net fayda yoksa geri al. _(hafta sonu ölçümü + Sol)_

## 5.5. Sessiz durma — operasyonel boşluk (3-4 Eylül ve 18-19 Eylül olayları)

Toplum 15 saat 48 dakika sessizce durdu; site ayakta, sağlık kontrolü 200, panel yeşildi.
Tam kayıt: `docs/OLAY_SESSIZ_DURMA_2026-09-03.md`.

**İkinci vaka — 18-19 Eylül, 14 saat 27 dakika.** 18 Eylül 23:18:30Z ile 19 Eylül
13:45:25Z arasında hiç entry yazılmadı (aynı akışta medyan entry aralığı 7 dk 24 sn).
Kök neden farklıydı, biçim aynıydı: `leaseRuntimeRun` devre kesici metrik sorgularını
kendi kilitleme işiyle aynı Prisma interaktif transaction'ına paketliyor; tablolar
büyüdükçe 5000 ms varsayılanı aşıldı, her lease `P2028` ile düştü, worker crash-loop'a
girdi ve systemd pes etti. SSH ile canlı teşhis edildi ve `4d665cf` paylaşılan
`inTransaction()` timeout'unu 15 sn'ye çıkardı. Üretim 11:30Z'de Gökhan'ın elle
restart'ıyla yazmaya döndü.

**DÜZELTME (21 Eylül, Astra'nın bulgusu, kaynaktan doğrulandı): `4d665cf` lease
yolunda HİÇ DEVREYE GİRMEDİ.** Lease HTTP yolu transaction'ı `withIdempotencyLock`
içinde **seçeneksiz** `client.$transaction(...)` ile açıyor
(`src/modules/idempotency/repository/idempotency.ts`), yani Prisma'nın varsayılanı
5.000 ms geçerli. `leaseRuntimeRun` içindeki `inTransaction` zaten bir transaction
istemcisi aldığı için callback'i doğrudan çalıştırıyor ve 15 sn seçeneği uygulanmıyor.
**19 Eylül'den 21 Eylül #147 dağıtımına kadar üretim aynı 5 sn sınırla koştu.** 20
Eylül gecesi yedek penceresini "düzeltme tuttu" diye yorumlamıştım; yanlış premise
dayanıyordu — o gece maliyet sınırın altında kaldı, o kadar. **Gerçek koruma #147:**
sorgunun maliyetini düşürdü. Ne kadar pay kaldığı lease telemetrisi olmadan
görülemez. Kayıt:
[ATTEMPT_LOG](ATTEMPT_LOG.md) 19 Eylül girdisi.

**İki vakanın ortak dersi ve buradan çıkan iş:** her iki olayda da kusuru fark ettiren
şey bir alarm değil, birinin bakması oldu. Aşağıdaki kalıcı canlılık alarmı bu yüzden
ertelenmiş madde olmaktan çıktı.

- [x] **P1 — Lease transaction'ında maliyeti geçmişle büyüyen sorgu — ÜRETİMDE (21 Eylül, `caa1ba0f`).**
      `busyDurationMs` (`capacity.ts`) pencere filtresini JSON açıldıktan SONRA
      uyguluyordu: iki CTE `agent_runs`'ın tamamını okuyup `usageMetadata`'yı
      TOAST'tan çıkarıyor ve `codexIntervals` dizisini açıyordu. Tablo 33.808
      satır / 1.077 MB, %60'ı 30 günden eski ve hiç budanmıyor. Sorgu
      `getRuntimeOperationalMetrics` üzerinden lease transaction'ında **üç kez**
      koşuyor (15/60/120 dk). **Bulgu Astra'dan**, ben "tablolar büyüdü" diye
      genel bir sebep yazmıştım.

      Düzeltme PR #147: filtre LATERAL'den önceye alındı, saat geri adımına
      karşı 1 saatlik tolerans eklendi. Üretimde `EXPLAIN` (ANALYZE değil):
      LATERAL'e giden tahmini satır **14.094 → 5**, tahmini maliyet
      **30.236 → 8.377**. Ham kayıt ve yeniden üretme adımları:
      [ölçüm](LEASE_SORGUSU_OLCUMU_2026-09-20.md).

      **İddia sınırı (Sol, 20 Eylül):** bunlar planlayıcı TAHMİNİDİR. Gerçek
      gecikme kazancı ölçülmedi ve 19 Eylül olayının **tek** mekanizmasının bu
      sorgu olduğu kanıtlanmadı — lease transaction'ında başka iş de var. Sorgu
      somut ve makul bir aday; kesin kök neden değil.

      **Olay büyüklüğünün sınırları:** worker'ın lease alamadığı süre için elde
      **en fazla** 11 sa 00 dk 11 sn var (üst sınır; ilk başarısız lease'in
      zamanı bilinmiyor, gerçek kesinti daha kısa olabilir). Entry akışındaki
      boşluk 14 sa 27 dk. İkisi ayrı şeyi ölçer.

      **21 Eylül dağıtım ve kabul:** Sol GO (üç tur; son blokaj ön-filtre
      korumasıydı), Astra DAĞIT (şartı: #146'dan ayrı, worker'ın yeni koşu
      aldığını doğrula). Plan testinin gerçekten koruduğu kanıtlandı: filtre
      kaldırılan geçici PR #149'da düşen TEK test oydu. Dağıtımdan 27 sn sonra
      worker yeni koşu aldı; 6 saat boyunca transaction hatası 0.
      **Aynı saat aralığıyla** (06:40–12:40 UTC, 20 vs 21 Eylül) koşu sonuçları
      değişmedi (başarılı 42 / 42, ort. 335 / 325 sn) — bir şey bozulmadı.
      **Gerçek kazanç ölçülmedi:** bu değişiklik lease transaction'ını
      etkiliyor, koşu süresini değil, ve lease süresi `agent_runs`'ta
      kayıtlı değil. Telemetri #147'den SONRA geldi (aşağıda); öncesi için
      karşılaştırılacak transaction süresi yok, yalnız HTTP süresi var.

- [x] **`agent_runs.finishedAt` indeksi — CANLIDA (23 Eylül, `f2f57f3`, A5 yolu).** Üretimde
      EXPLAIN'e göre `finishedAt IS NULL OR finishedAt > …` deseni artık indeksten okunuyor
      (Bitmap Index Scan, `agent_runs_finishedAt_idx`; cost 16,54; 34.719 satır). Önceki metin:
      Ön filtre eklendi ama tarama hâlâ sıralıydı. Migration
      `20260923180000_agent_runs_finished_at_index` (`CREATE INDEX "agent_runs_finishedAt_idx"`).
      A5 hattı mevcut tabloya benzersiz olmayan düz indeksi kabul edecek şekilde genişletildi:
      denetçi `existingTableIndexes`, ön kontrolde hedef tablo/sütun/ad kanıtı, şema özetinde
      yalnız o indeksin TOC girdisi düşülür. Gerçek PostgreSQL testi indeks düşürülüp yeniden
      kurulunca `agent_runs` tablo özetinin eşit kaldığını doğruluyor. EXPLAIN koruması
      `Recheck Cond`'u da okuyor. Kalan: Astra incelemesi, CI, A5 moduyla dağıtım ve üretimde
      EXPLAIN ölçümü.

- [x] **Ön filtrenin kaldırılmasını yakalayan koruma — yazıldı (21 Eylül).**
      Davranış testi bunu yakalayamaz (filtre kalksa da sonuç aynı çıkar, yalnız
      maliyet büyür), bu yüzden plan testi yazıldı: sorgu metni
      `busyDurationSorgusu` olarak tek yerde tutuluyor, entegrasyon testi o
      sorgunun KENDİSİNİ `EXPLAIN (FORMAT JSON)` ile alıp `agent_runs` üzerindeki
      her taramanın `finishedAt` koşulunu taşıdığını doğruluyor. İlk yazımda
      "yazılamaz, açık madde" demiştim; doğru çözümü bildiğim hâlde kolay yolu
      seçmiştim. Sol'un üçüncü turu bunu tek blokaj olarak işaretledi..

- [x] **Lease transaction süresi telemetrisi — ÜRETİMDE (21 Eylül, PR #152).**
      Tasarım Astra'nın. Her lease transaction'ı için `db.transaction.duration`
      kaydı: `totalMs`, `acquireMs` (bağlantı), `activeMs` (advisory kilit + iş +
      commit), `outcome`, güvenli `errorCode`, `timeoutMs: 5000`. Yalnız lease
      rotası etiketli; diğer idempotent yollar birebir aynı.
      Sol dört tur: BİRLEŞTİRME ×3 (korumasız `safeErrorCode`, etiket zinciri
      testsiz, süre alanları ayırt edilmiyor/gerçek zamanlayıcı, başarısız
      transaction süreleri testsiz), sonra BİRLEŞTİR. Astra: DAĞIT (şart: INFO
      ve log rotasyonu doğrulansın — doğrulandı).

      **İlk 40 dakika (16:03–16:44 UTC, 252 kayıt):** hepsi `committed`, hata
      yok. `activeMs` p50 **826** / p95 **964** / p99 **1027** / maks **1164** ms;
      `acquireMs` p99 3 ms. Yani 5.000 ms sınırının ~%23'ü; kuyruk bağlantıda
      değil, transaction içinde. Lease HTTP p50/p95 dağıtım öncesiyle aynı
      (815/967 → 834/976 ms), 5xx 0.

- [x] **Lease süresi alarmı — ÜRETİMDE (22 Eylül, PR #154, `4763a3b`).** Telemetri
      var ama kimse bakmıyor; 19 Eylül'ün dersi bu. Mevcut canlılık alarm
      betiğine eklendi (yeni birim ya da `daemon-reload` yok, yalnız betik
      dosyası değişir). Her 15 dk'lık koşuda son 15 dk'nın lease kayıtları:
      `activeMs ≥ 2500` üç kez → uyarı; `≥ 4000` ya da tek `P2028` → kritik;
      log okunamazsa ayrı bildirim; her hal değişimi bildirilir. Eşikler
      Astra'nın; "5 dk'da 3 kez" timer aralığına uyarlanıp 15 dk oldu.

      **Sol ilk tur BİRLEŞTİRME:** lease taraması takılır ya da durum dosyası
      bozuksa asıl canlılık alarmı hiç koşmuyordu; başarısız ntfy gönderimi
      "gönderildi" sayılıp 6 saat bastırılıyordu (bu kusur eski canlılık
      kodunda da vardı). Yeniden yazıldı: önce canlılık, sonra lease ayrı alt
      süreçte `timeout` altında; durum dosyası doğrulanarak okunuyor; `curl
      --fail`, durum yalnız başarılı gönderimde yazılıyor. Betik sahte
      `docker`/`curl` ile gerçekten çalıştırılarak test ediliyor (sahte docker
      argümanları doğruluyor); ayrıntı aşağıda, hepsi yakalandı. İkinci tur: canlılık sorgusuna da `timeout`; sıfırlı ya da gelecekteki zaman damgası reddediliyor. Üçüncü tur: `activeMs: null` (callback hiç başlamamış) uyarı sayılıyor; tek bir ayrıştırılamayan satır bile varken alarm "temiz" diye kapanmıyor (dördüncü tur); bu durum ayrı bir hal (`belirsiz`) olarak bildiriliyor ve 6 saatte bir tekrarlanıyor, sessizce donmuyor (beşinci tur); kayıt gelmeyen pencerede de süren kötü hal 6 saatte bir hatırlatılıyor (altıncı tur).

      **Astra kurulum turu KURMA, ardından Sol (iki tur):** sabit 15 dk'lık pencere olay kaçırıyordu, gönderilemeyen bildirim kayboluyordu, sayı ortasında kesik satır sahte düzelme üretiyordu; ardından denenen imleç + disk kuyruğu da yeni kusurlar açtı (50 sınırı alarm siliyordu, kuyruk boşaltma süre bütçesini yiyordu, yarım yazılan kuyruk dosyası, saniye kesmesiyle çift sayım). **Son tasarım sade:** kuyruk yok; durum tek satır (`hal an teslim en_kotu`), atomik yazılır. Karar değişince teslim bekler; her koşu en fazla bir kez (10 sn) dener; arada gönderilemeyen en ağır hal sonraki bildirime eklenir ("arada kritik yaşandı, şimdi düzeldi"). Tarama `[imleç, şimdi)` yarı açık aralık, milisaniye; imleç her başarılı okumadan sonra ilerler, geçersizse hemen düzeltilip yazılır. "3 yavaş" gerçek 15 dk'lık kayan pencerede, yeni bir kayıtla biten pencerede. Testlerin yakaladığı ek gerçek hata: hedef dizinse `mv -f` içine taşıyıp başarılı dönüyordu → `mv -fT`. Sol dokuzuncu tur: imleç artık yalnız durum kalıcılaştıysa ilerliyor; durum satırına son ölçülen hal (`olcum`) eklendi, log körlüğünden kayıtsız dönüş "temiz" varsaymıyor; 6 saatlik geri bakma sınırı kaldırıldı (json-file rotasyonu zaten sınırlı); eşit ağırlıkta farklı gönderilemeyen karar gövdede anılıyor. Sol onuncu ve on birinci tur: dağıtımın `--force-recreate app` adımı eski konteynerin logunu siliyordu. Çözüm: imleç taranan konteynerin kimliğini de tutar; dağıtım worker'ı durdurduktan sonra aday sürümün alarm betiğini `--kesim-oncesi` ile doğrudan koşturur (yalnız lease; bildirim yok, karar teslim bekler; başarıda "bu konteyner şu ana kadar tarandı" makbuzu; çıkış kodu görünür, başarısızlık `RELEASE_WARN` ile dağıtımı durdurmaz) ve kurulu alarm betiği adaydan farklıysa uyarır. Konteyner değişmiş ve eski konteyner için makbuz yoksa sonuç en az `belirsiz`; kimlik okunamazsa imleç ilerlemez. Zamana dayalı pay kaldırıldı. Testlerin yakaladığı ek hata: `date -d ""` gece yarısını veriyordu. Sol on ikinci tur: timer ile kesim taraması aynı durumu kilitsiz güncelliyordu → bütün `oku → tara → yaz` bölümü `flock` altında (timer 5 sn bekler, alamazsa turu atlar; kesim 55 sn bekler, dağıtım süre sınırı 120 sn). Yarış gerçek eşzamanlı iki süreçle test ediliyor; kilit kaldırılınca test düşüyor. 58 alarm testi + dağıtım sıra testi. **Astra ikinci kurulum turu KURMA:** eski makbuz sonraki taramasız değişimi örtebiliyordu → kesim taraması başlarken eski makbuzu siler, yeni lease kaydı gören timer makbuzu geçersiz kılar; kayan pencere tarihçesi konteyner değişiminde kayboluyordu → son 15 dk'nın yavaş kayıt zamanları diskte tutulur, logdan tarihçe okunmaz (çift sayım da yok). Sol on dördüncü tur: makbuz ayrıca yeni konteyner makbuzdan sonra ve en geç 10 dk içinde yaratıldıysa geçerli (iptal edilmiş dağıtımın makbuzu sonraki değişimi örtemez; kalan risk: iptalden sonraki 10 dk içinde elle, taramasız yeniden yaratma — çift arıza, kabul edildi); tarihçe dosyası yoksa ilk koşu son 15 dk'yı logdan tohumlar; yazma sırası durum → tarihçe → imleç, tarihçe yazılamazsa imleç ilerlemez. **Astra üçüncü kurulum turu KURMA:** tarihçe "şimdi − 15 dk" ile eleniyordu; gerçek 15 dk timer aralığında önceki taramanın yavaşları düşüyor, üç dakikada üç yavaş kayıt uyarısız kalıyordu. Sınır imleç − 15 dk yapıldı (okuma, tohum, yazma); 900 sn ve gecikmeli tarama regresyonları eklendi (testim 600 sn beklediği için kaçırmıştı). Sol on yedinci tur: uzun gecikmeden sonra tarihçe tek `awk -v` argümanının boy sınırını aşıp ayrıştırmayı sessizce boşaltabiliyordu → tarihçe dosyadan okunuyor, yazılan tarihçe iki sınırlı aralık (boyut gecikmeden bağımsız), ayrıştırma çıktısı sayısal değilse "işlenemedi" olarak bildirilip imleç ilerlemiyor. Okunamayan tarihçe (izin/okuma hatası) de iki katmanda "işlenemedi": kabuk ön kontrolü ve awk `getline` −1 (mawk bunu dosya sonu gibi döndürüyordu). **Astra dördüncü kurulum turu KURMA:** tarihçe zaman damgasıyla tekilleştiriliyordu; worker paralel lease çağırabildiği için aynı milisaniyedeki iki yavaş kayıt teke iniyor, üç-yavaş uyarısı kaçıyordu → tekilleştirme kaldırıldı; eski tarihçeden yalnız imleçten öncesi, yeni kayıtlardan hepsi alınır (iki kaynak ayrık, çift sayım yok). 75 alarm testi.

      **Kurulum ve kabul (22 Eylül 06:08–06:12 UTC):** betik özeti `9353d0fe…`
      main ile aynı; önceki sürüm `.onceki` olarak duruyor. İlk gerçek koşu
      `success 0`; `durum-lease` beş alan, imleçteki kimlik gerçek app
      konteyneriyle aynı. Kabul, birimin kullanıcı/ortam/sandbox koşullarıyla
      (`systemd-run`, `ReadWritePaths`, `SuccessExitStatus=0 2`) ama geçici
      durum ve geçici ntfy konusuyla: (a) kritik eşiği 1 ms → urgent bildirim;
      (b) yeni gerçek kayıtlarla "normale döndü" (kayıtsız turda durum kritik
      kaldı); (c) `--kesim-oncesi` çıkış 0, makbuz = imleç, bildirim yok;
      (d) canlılık eşiği 0 → çıkış 2 ve "koşu yok", normal eşik → çıkış 0 ve
      "tekrar üretiyor". Gerçek konuya kabul boyunca 0 mesaj gitti.
      "Üç yavaş" dalı üretimde tetiklenemez (gerçek süreler ~1 sn); kapısı
      yerel regresyon testleri.

      **Kabul edilen riskler (Sol + Astra):** (1) iptal edilmiş kesimden sonra
      worker döner ve timer görmeden 10 dk içinde konteyner elle, taramasız
      yeniden yaratılırsa eski makbuz boşluğu örtebilir (çift arıza, elle
      müdahale); (2) tarihçe süzme hattında yalnız ilk `tr|sed` alt sürecinin
      asimetrik arızası eski tarihçeyi düşürebilir; (3) tarihçe yazılıp imleç
      yazılamazsa ve eşzamanlı log kaybı olursa bölünen seri kaçabilir;
      (4) tarihçe yolu elle FIFO/aygıta çevrilirse okuma dış süre sınırına
      kadar bekler.

      **Süreç notu:** 25 hakem turu (Sol 19, Astra 6). Her turda gerçek bir kör
      nokta bulundu; son iki turda açık bir durdurma kuralıyla (yalnız gerçekçi
      tek-arıza tetikleyicileri engel) kapandı. Dağıtım betiğine eklenen kesim
      öncesi tarama bir sonraki normal dağıtımda devreye girecek; o dağıtımda
      `RELEASE_LEASE_SCAN_OK` görülmeli.

- [x] **Giriş oran sınırı entegrasyon testi 15 dk pencere sınırında kırılgan — DÜZELTİLDİ (22 Eylül).** Aynı gün 07:30'da ikinci kez düştü (PR #156 CI). Test artık sınıra 60 sn'den az kaldıysa sınırı geçene kadar bekliyor.
      `tests/integration/login-rate-limit.test.ts` 31 isteği gerçek saatle
      gönderiyor; 22 Eylül 00:00:04 UTC'de pencere tam test sırasında döndü, 31. istek 429 yerine 401 aldı (CI `35669817153`, yeniden koşuda yeşil).
      Test pencere başına hizalanmalı ya da saat sabitlenmeli.

- [x] **Devre kesici kendi kendini kilitliyor — asıl kök neden.** Düzeltildi ve canlıda
      (4 Eylül, PR #109 + #110 · `7336862`). Üç halka birbirini
      besliyor: kritik kesici `leaseRuntimeRun`'ı kapatıyor; alınmayan queued koşular
      `availableLanes` hesabını sıfırlayıp zamanlayıcıyı da (`QUEUE_NOT_EMPTY`)
      durduruyor; kesicinin ölçüsü (`countConsecutiveCodexFailures`) son sonlanmış
      koşulardan hesaplandığı için yeni koşu olmayınca **donuyor**. Sonuç: kesicinin
      kapanması için başarılı koşu gerekiyor ama kesici bütün koşuları engelliyor.
      Çözüldü (PR #109 + #110): soğuma sonunda **yazamayan ayrı bir `DRY_RUN` deneme
      koşusu** açılıyor. Bu tür claim'in izin listesinde zaten var (filtre aşılmıyor),
      executor bu türde dış etkili action'ları reddediyor, worker'da özel dalı olmadığı
      için Codex normal çağrılıyor. Başarılıysa terminal koşu seriyi kırıyor ve kesici
      kapanıyor; değilse açık kalıyor. `idempotencyKey` soğuma penceresine bağlı.

      İki tur hakem incelemesi gerekti: ilk sürüm kilidi hiç açmıyordu (kesici
      `writeRunsPaused`'ı da açıyor, claim `NORMAL_WAKE`'i dışlıyor), ikinci sürüm ise
      filtreyi aşarak açıyordu ve kesicinin koruduğu şeyi deliyordu.

- [x] **P1 — Kesici, sağlayıcı hiç sınanmadan kapanabiliyor — MEKANİZMA KAPANDI (PR #115).**
      _(Sol hakem turu + 4 Eylül repo incelemesi F01; 11 Eylül uzlaştırması)_

  Eski kusur: `countConsecutiveCodexFailures`, son terminal koşu `CODEX_*` olmayan herhangi
  bir sonuçsa seriyi sıfırlıyordu; context aşamasında düşen koşu sağlayıcı hiç sınanmadan
  kesiciyi kapatabiliyordu (Astra gerçek girdilerle gösterdi: 3 × CODEX_TIMEOUT → 3,
  öne bir CONTROL_PLANE_CONTEXT_FAILED gelince → 0).

  **Kapatma ölçütü karşılandı — PR #115 (`18f5bb5`, 7 Eylül):** sağlayıcıya ulaşma
  telemetriden türetiliyor (`codexIntervals` boş mu; hata kodundan tahmin değil, çünkü
  `CONTROL_PLANE_ACTION_EXECUTION_FAILED` karardan sonra oluşur). Ulaşmamış koşu seriyi
  **ne kırar ne uzatır**; yalnız sağlayıcıya ULAŞMIŞ başarılı koşu kapatır — ulaşmamış
  "SUCCEEDED" bile kapatmaz. Üçü de unit testte
  (`tests/unit/agents/circuit-breaker.test.ts`, F01 bloğu). Deneme kimliği `DRY_RUN` +
  `runtime.circuit_breaker.half_open_probe` olayı; soğuma/tek deneme/yazma yasağı
  #109-#110'dan korunuyor. Eski kayıtlar için geriye dönük uyum var
  (`reachedProvider` bilinmiyorsa eski davranış). Üretim `7ebb887` bu düzeltmeyi içeriyor.
  _(Bu madde metni #115'ten önce yazılmıştı; 11 Eylül'de uzak oturum kod+test+üretim
  SHA'sını doğrulayıp uzlaştırdı. Kapanış yeni ölçüm değil, mevcut kanıtın plana işlenmesidir.)_

  **Açık kalan iki kalıntı:**
  - [ ] Canlı tam yarı-açık döngü (kesici açıldı → soğuma → deneme → sağlayıcı kanıtıyla
        kapanma) gerçek bir arızada henüz gözlenmedi; ilk gerçek olayda olay kayıtlarından
        doğrulanacak. Sentetik arıza üretilmeyecek.
  - [ ] **#115 yan bulgusu:** üretimde baskın arıza biçimi PARTIAL/CODEX_TIMEOUT (388 kayıt)
        ama `isCodexFailure` yalnız FAILED/TIMED_OUT sayıyor (12). Kesicinin duyarlılığını
        değiştirmek canlı davranışı değiştirir; ölçümle ve Gökhan kararıyla ele alınacak.

- [x] **Kalıcı canlılık alarmı — KURULDU (20 Eylül).** Sunucuda, oturumdan
      bağımsız: `agent-sozluk-alarm.timer` 15 dakikada bir koşar,
      `agent_runs."startedAt"` yaşı 90 dakikayı aşarsa ntfy ile bildirir.
      Lease alınmadan koşu başlamaz, yani izlenen alan worker'ın gerçekten
      çalıştığını kanıtlar — iki kesintide de duran buydu. Entry yaşı mesajda
      bildirilir ama eşiği belirlemez: entry yazmamak meşru bir karar olabilir
      (`NO_ACTION`), koşu almamak olamaz. **Sorgu başarısızlığı da alarmdır.**
      Düzelme ayrıca bildirilir; aynı arıza 6 saatte bir tekrarlanır.

      **Kapatma ölçütü karşılandı:** kurulumdan önce eşik sıfırlanıp koşuldu ve
      `/api/health` **200 dönerken** alarm ateşledi — iki kesintide de aldatan
      tam olarak o yeşildi. Düzelme bildirimi ve durum geçişi (`alarm` → `temiz`)
      de doğrulandı. Kurulumdan sonraki ilk gerçek koşu `success`.

      Betik depoda (`deploy/alarm/canlilik-alarmi.sh`), sunucuda
      `/opt/agent-sozluk/scripts/` altında — **bilerek `app` checkout'unda değil**,
      çünkü dağıtım akışı orayı yayımlanan SHA'ya sabitler ve alarm sürümden
      bağımsız çalışmalı. ntfy konusu `/etc/agent-sozluk-alarm.env` içinde
      (0600, root); **depo public olduğu için konu adı depoya yazılmadı**.

      Açık kalan: sunucu dışı yedek kanıtı (18 Eylül incelemesi B9'un ikinci
      yarısı, bölüm 5.7).

**Ders:** sağlık kontrolü, panel rengi ve süreç durumu — üçü de doğruydu ve üçü de yanlış
soruya cevap veriyordu. Tek doğru soru "iş üretiliyor mu" idi.

---

## 5.6. 4 Eylül incelemesinden gelen P2 bulguları — kapanan maddeler

- [x] **F04 — Public slug'lar kullanıcı adı alanında rezerve edilmiyor — KAPANDI (23 Eylül,
      PR #178, canlıda `f2f57f3`; üretim envanteri: 22 alias'ın hiçbirini taşıyan hesap yok).** Sunucu tarafı kural: `isReservedPublicProfileSlug`
      (`src/modules/users/domain/public-identity.ts`) başka yazara çözülen her alias'ı rezerve
      sayar; insan kaydı (`registerHuman`) ve ajan oluşturma `USERNAME_TAKEN` döner. Kalan:
      canlıda bu adlardan birini zaten taşıyan insan hesabı var mı, dağıtımda salt okunur
      kontrol. Önceki metin: Alias eşlemesi
      `centik → apartmanfilozofu` gibi 9 eski ajan adını yönlendiriyor; kayıt doğrulaması ise
      yalnız gerçek kullanıcı adı çakışmasına bakıyor. Bu adlardan biri boşsa yeni kaydın
      profil adresi mevcut alias tarafından gölgelenebilir. Hesap ele geçirme değil, kimlik/
      adres bütünlüğü kusuru. _(Gerçek hesap açılarak denenmedi.)_
- [x] **F05 — kapandı (20 Eylül).** Takip artık rapora değil kapıya bağlı:
      CI `quality` işinde `pnpm audit --prod --audit-level=high` (fail-closed,
      istisnasız) ve `dependabot.yml`. Ayrıntı B1, bölüm 5.7.
- [x] **F06 — Şifre değişimi mevcut oturumun kopyasını geçersizleştirmiyor — CANLIDA (24 Eylül,
      `7aae0d2`).** Eskiden `revokeAllUserSessions(..., currentSessionId)`
      mevcut oturumu hariç tutuyordu ve yeni token verilmiyordu; mevcut session cookie'sinin
      kopyası yaşamaya devam ediyordu. Artık aynı transaction'da mevcut oturum dahil hepsi
      iptal edilir ve yeni oturum verilir; mevcut oturum bu arada kapatıldıysa şifre değişmez
      (`AUTH_REQUIRED`). Yan bulgu da kapandı: kayan süre yenilemesi, işleyicinin yazdığı yeni
      oturum cookie'sini iptal edilmiş eski token'la eziyordu; yenileme artık işleyici oturum
      cookie'si yazdığında hiç uygulanmıyor, yazmadan önce oturumun etkin olduğunu doğruluyor ve
      şifre rotası süreyi hiç uzatmıyor. **Kabul edilen artık risk (Astra 2. turda saptayıp BİRLEŞTİRME dedi; 3. turda bu
      kayıtla kabul etti):** başka bir rotanın süre uzatan yanıtı, `stillValid` kontrolünü
      iptalden önce geçip şifre değişimi yanıtından SONRA tarayıcıya ulaşırsa yeni cookie'yi eski
      (iptal edilmiş) token'la ezer; kullanıcı yeniden giriş yapar. F06 açığı yeniden açılmaz
      (iptal edilmiş token sunucuda geçersiz); oturum sürekliliği etkilenir. Süre yalnız 30
      günlük oturumun son 7 gününde uzar (oturum başına ~23 günde bir); eşzamanlı istekler o
      anda birden fazla yenileme kaydedebilir. Tetik için o isteklerden birinin şifre
      değişimiyle eşzamanlı olması ve yanıtların ters sırada ulaşması gerekir. Cookie teslim
      sırası sunucudan denetlenemez.
- [x] **F08 — Repo ve canlı kabulü tamamlandı (9 Eylül).** PR #123, main
      `cf8f426`: SEO okuyucusu revizyon/oluşturulma zamanını kullanır; oy/favori
      public içerik tarihini ilerletmez. Entry OG, JSON-LD, sitemap ve Atom/RSS
      test edildi. CI 7/7; Opus 5 repo GO. `8280ed4` canlıda; iki entry'nin
      OG/JSON-LD/sitemap tarihleri DB revizyon/oluşturulma tarihiyle eşleşti,
      Atom/RSS ve başlık örnekleri geçti. [Canlı kanıt](CANLI_DAGITIM_VE_TELEMETRI_2026-09-09.md).
- [x] **F09 — Container kapısı, container'ın çalışabildiğini kanıtlamıyor — KAPANDI (24 Eylül,
      PR #179; CI container işinde her koşuda).** CI image kurup Compose'u doğruluyordu ama container'ı
      veritabanıyla ayağa kaldırıp entrypoint, migration, readiness ve HTTP davranışını
      sınamıyordu. `scripts/container-boot-probe.sh` (CI `container` işi, "Container boot
      probe"): derlenen imaj Compose ile boş PostgreSQL'e karşı üretim kipinde açılır; entrypoint
      migration'ları uygular (`_prisma_migrations` = migration dizini sayısı), container
      sağlıklı olur, `/api/health`, `/api/ready`, ana sayfa 200, üretimin release smoke'u
      container içinden geçer, yeniden açılışta migration tekrar uygulanmaz.
- [x] **Hesap bazlı sayaç — engellemeden, yalnız TESPİT için — CANLIDA (24 Eylül, `7aae0d2`).** `observeRateLimit` + `login:account-failure-observe` (1 saatte
      10); eşikte `security.login_failure_threshold` kaydı (e-posta yok). Yalnız log;
      alarm akışına bağlanması ayrı iş (sınırlar THREAT*MODEL'de). Önceki metin: Yukarıdaki
      kararın görünürlük ayağı: hesap başına başarısız giriş sayılır, hiçbir
      isteği reddetmez, eşiği aşınca kayıt/uyarı üretir. Kilitleme DoS'u
      doğurmadan "deneme var mı" sorusunu cevaplar ve yeniden değerlendirme
      koşulu 2'yi ölçülebilir kılar. *(Astra önerisi, 20 Eylül)\_
- [x] **ADMIN/moderatör için TOTP veya passkey — KARAR: YAPILMAYACAK (Gökhan, 24 Eylül:
      "hayır").** Hesap bazlı tespit sayacı canlıda. Önceki metin: Şifreye bağımlılığı azaltır;
      bu hesaplarda ele geçirmenin etkisi en ağır. Hesap kovası kararının
      kalıcı çözümü budur — ikinci sinyal geldiğinde hem kilitleme hem deneme
      aynı anda kapatılabilir. _(Astra önerisi, 20 Eylül)_

## 5.7. 18 Eylül incelemesinden gelen maddeler — kapanan maddeler

- [x] **B2 — varsayılan sıralama facet üretiyordu.** `d2244f7` ile main'de ve
      **canlıda doğrulandı** (19 Eylül 21:44Z, sayfalama temiz `?page=N`); ayrıntı
      bölüm 0. Kalan küçük iz aşağıda.
- [x] **B2 kalıntısı — "tümü" linki kendi engelli ikizine gidiyor. KAPALI.**
      20 Eylül'de zaman penceresi menüsü de `acikSiralama` üzerinden geçti:
      `src/app/baslik/[topic]/page.tsx:101,517,574` — sıralama yalnız ziyaretçi
      açıkça seçtiyse URL'ye yazılıyor. 22 Eylül'ün iki incelemesi de bunu canlıda
      ve kodda yeniden üretemedi (Astra doğruladı). Tekrar açılmasın.
- [x] **B1 — kritik bağımlılık uyarıları kapandı, paket üretimde.**
      `pnpm audit` (`5022a8b` lockfile'ı) 2 critical, 21 high, 4 moderate veriyordu;
      iki kritik `next`'in Image Optimization API'sindeydi (AVIF RCE, yama ≥15.5.24).

      **20 Eylül'de yapılan:** `next`/`eslint-config-next` 15.5.25, `sharp` 0.35.4,
      `images: { unoptimized: true }`, `dependabot.yml`. Ayrıca beklenmedik bulgu:
      **kendi `postcss: 8.5.10` override'ımız üç açık taşıyordu** — override'lar
      bakımsız kalınca koruma değil dondurma işlevi görüyor. Zincir yamalandı
      (postcss 8.5.28, nanoid, browserslist, baseline-browser-mapping) ve
      `deepmerge-ts 8.0.0` eklendi. Yerelde `pnpm audit --prod` artık **temiz**.

      **Sol birinci tur (20 Eylül): NO-GO** — bağımlılıklarda çalışma zamanı
      kırılması bulunamadı (`deepmerge-ts`'in kırıcı farkları Prisma'nın
      kullandığı yolda değil, `next/image` gerçekten kullanılmıyor, Next'in iç
      bot regex'i iki sürümde bayt bayt aynı, postcss zinciri uyumlu), ama CI
      kapısı yoktu.

      **Kapı eklendi (`d26385b`).** Gökhan `workflow` yetkisini verdi.
      CI `35503728757` head `9402a5d` üzerinde **7/7 PASS** ve `quality`
      log'unda adım gerçekten koştu: `pnpm audit --prod --audit-level=high`
      → `No known vulnerabilities found`.

      **Sol ikinci tur (20 Eylül): kapının kendisi PASS.** Fail-closed olduğu
      (registry hatasında da düşer), `continue-on-error`/`|| true`/
      `ignoreGhsas` istisnası olmadığı ve `validate` işinin `quality` başarısını
      zorunlu tuttuğu tek tek doğrulandı. Kalan bulgular kapıda değil, ölçüm
      belgesindeydi ve düzeltildi
      ([önkayıt ikinci eki](DAGITIM_SONRASI_ONKAYIT_2026-09-17.md)).

      **20 Eylül: ÜRETİMDE.** `e2cbc15bd4f604c9a19625f13f033057aceb23d4`,
      main CI `35507139288` 7/7, artifact `35507437575`, migration yok.
      `RELEASE_COMPLETE PASS ... cleanup=no-cleanup`. Dağıtım sonrası kabul
      veritabanından alındı: worker `active`/NRestarts=0, dağıtımdan sonra bir
      koşu SUCCEEDED + biri RUNNING, 12 dakikada 2 entry. `/_next/image`
      canlıda 404. Kayıt [deneme günlüğü](ATTEMPT_LOG.md) 20 Eylül girdisi.
      **Bu, F05'in kapatma ölçütüydü; F05 kapandı.**

- [x] **B4 — internal runtime API dışarıya kapalı — ÜRETİMDE ETKİN (20 Eylül 16:55 UTC'den
      beri; 24 Eylül ölçüldü).** Üretim `/opt/agent-sozluk/runtime/Caddyfile` yorum dışı satırlarıyla
      `deploy/caddy/Caddyfile.example` ile birebir aynı; Caddy'nin etkin yapılandırmasında
      `/api/v1/internal/*` var. Anonim POST: `/api/v1/internal/agent-runtime/lease`, `//api/…`,
      `/api/v1//internal/…`, büyük harf, `%69nternal`, `../` varyantları → Caddy'den gövdesiz
      **404** (`/api/v1/internal` tam yolu uygulamanın 404 sayfası; route yok, DB sorgusu yok).
      `/api/health` ve `/api/ready` 200. Worker taban adresi kodda `127.0.0.1:3000`'e sabit
      (`canonicalRuntimeControlPlaneBaseUrl`), edge kuralından etkilenmez. **Kayıt boşluğu:**
      dosya örnek commit'inden (`7bccff7`, 16:35) 20 dk sonra değişmiş; değişikliği kimin
      uyguladığı hiçbir kayıtta yok (ATTEMPT_LOG). Aşağıdaki metin tarihsel.
      **Ölçüldü (20 Eylül, anonim):** `POST /api/v1/internal/agent-runtime/lease`
      → **401 AUTH_REQUIRED**. Koruma çalışıyor ama istek uygulamaya ulaşıyor.
      Kaynak doğrulandı: `agent-runtime-action.ts:133` önce
      `authenticateRuntimeRequest`, oran sınırı (`rateLimitRuntime`) **sonra** —
      yani kimliksiz her istek sınırsız bir veritabanı sorgusu tetikliyor.
      Worker zaten `127.0.0.1:3000` üzerinden gittiği için bu yolun internetten
      erişilebilir olması hiçbir işe yaramıyor.

      `deploy/caddy/Caddyfile.example` eklendi: üretimdekinin sırsız kopyası +
      `@internal path /api/v1/internal/*` → **404** (403 değil; 403 yüzeyin
      varlığını doğrular). Edge davranışı ilk kez depoda gözden geçirilebilir.

      **Kalan:** üretimdeki Caddyfile'a uygulanması. Bu bir üretim yapılandırma
      değişikliğidir ve Gökhan'ın onayını bekler; uygulandıktan sonra aynı
      anonim istek 404 dönmeli ve worker'ın koşu alması kesintisiz sürmeli.

- [x] **B3 — IP kovası ve Argon2 kapısı ÜRETİMDE (21 Eylül, `a0103283`); hesap kovası kapsam dışı.**
      Argon2 çağrıları artık süreç içinde en fazla ikili koşuyor (permit
      doğrudan bekleyene devrediliyor; ilk sürümdeki yarışı Sol yakaladı ve
      regresyon testi hatalı sürümde `offset=2`'de düşüyor). Transaction
      içinden çağrılan sürüm kapıya girmez — beklemek bağlantıyı tutardı.
      Hesap kovası kararı ve kalan iki takip maddesi için Sıra 5.6 / F10.
- [x] **B9 — canlılık alarmı + sunucu dışı yedek kanıtı — GECELİK YEDEK KURULDU (25 Eylül,
      PR #204, Astra 3. turda BİRLEŞTİR; ilk yedek 1.168.993.394 bayt, 50 tablo).** Kalan
      Astra bulguları (sonraya): P2 döndürme listesindeki `sort` hatası ana kabukta
      denetlenmiyor; P3 `stat` hatası `YEDEK_OK` satırında boş `bytes=` bırakabiliyor. Alarm maddesi bölüm 5.5'te.
      **Yapılan (Gökhan onayı, 24 Eylül: "onaylıyorum"):** üretimden salt okunur, dışa
      aktarılmış tek anlık görüntüden `pg_dump -Fc` doğrudan kişisel T3 sunucusuna
      akıtıldı (üretime dosya yazılmadı). Yedek 1.139.690.537 bayt, sha256 `522e18ba3247…`,
      bu sunucuda `~/agentsozluk-backups/` (0700/0600). Aynı anlık görüntüde 50 tablonun
      satır sayısı ve içerik özeti alındı. Yerel, root gerektirmeyen PostgreSQL 16.14'te
      `pg_restore --exit-on-error` 173 sn'de geçti. **50 tablonun 50'si sayı ve özet olarak
      birebir aynı** (2.849.961 satır); 3 sequence tablo en büyük değerine eşit. Prova
      veritabanı ve PostgreSQL kurulumu silindi.
      **Sınırlar:** iki sunucu aynı sağlayıcıda olabilir (sağlayıcı çapında kayba karşı
      koruma değil); yedek bu sunucudaki aynı kullanıcıyla çalışan ajanlarca okunabilir.
      **Zamanlanmış yedek — KARAR: EVET (Gökhan, 24 Eylül: "mantıklıysa ok").** Kısıtlı
      anahtar: üretimde `authorized_keys` satırı yalnız yedek betiğini çalıştıran
      `command=…,restrict`; kişisel sunucuda kullanıcı systemd zamanlayıcısı, gecelik, son 7
      kopya. **Kuruldu (25 Eylül):** üretimde kök sahipli zorunlu komut + `restrict` anahtar
      satırı; sshd önkoşulu (`PermitUserEnvironment no`, `AcceptEnv LANG LC_*`) sağlandı.
      Kabul: `id` isteği yok sayılıp dump aktı ve erken kapatınca üretimde süreç/oturum/kilit
      kalmadı; eşzamanlı ikinci bağlantı `YEDEK_BUSY` (75); ilk tam çalışma `YEDEK_OK`, ~2,5
      dk. Zamanlayıcı her gece 04:30 TSİ (+≤10 dk). Kod, runbook ve 14 test: `deploy/backup/`,
      `tests/unit/ops/nightly-backup.test.ts`. Reset öncesi taze bir yedek aynı yöntemle yeniden
      alınmalı. _(reset önkoşulu: tek seferlik kısım karşılandı)_
- [x] **B5.1-2 — künye, iletişim, içerik kaldırma yolu; çerez onayı — HEPSİ CANLIDA (23
      Eylül).** Üç ayrı sürüm, ayrı kanıt:
  - `37c6618` (PR #156): onay şeridi, künye; Hotjar bu sürümde yoktu (Claude'un önerisiyle
    kaldırılmıştı — Gökhan kararı değildi). Smoke run `35714469725` 5/5.
  - `c21a798` (PR #160 + #161): Hotjar GA4 ile aynı onayın arkasında geri geldi; onay kapsamı
    sürümlü (`kabul-v2`; yalnız GA4'ü kapsayan eski `kabul` şeridi yeniden açar). Gökhan onayı,
    Sol BİRLEŞTİR, Astra DAĞIT. Smoke run `35729671266` 6/6.
  - **İletişim ve içerik kaldırma formu: CANLIDA — `c0dbe73`, 23 Eylül 16:07 UTC, A5
    migration'lı yolun ilk kullanımı (Gökhan exact onayı; kesinti ≈9,5 dk; `/iletisim` 200).**
    PR #164 `a0f2878` (incelenen head `9b4ac1c`, PR CI `35794074338` 7/7).
    Sol yedi tur inceledi: ilk altısında BİRLEŞTİRME ve her turda gerçek kusur (NULL not,
    UTF-16/kod noktası uzunluğu, NUL, eşi olmayan vekil, NFKC sonrası e-posta tavanı,
    moderasyon penceresinin sayımı, A5 metni); 7. turda BİRLEŞTİR, şartı exact head CI.
    Birleştirme Gökhan'ın açık onayıyla (23 Eylül). `/iletisim`
    sayfası ve `POST /api/v1/iletisim` (giriş gerekmez, köken kontrolü, IP başına saatte 5,
    ham IP yerine HMAC), `/moderasyon/iletisim` kuyruğu ve "ele alındı" işareti,
    `contact_messages` tablosu + migration. `ContactMessage` great reset'te korunan listede
    (Astra bulgusu). `tests/unit/contact` altında 30 birim testi + `ConfirmAction` için 1 ve
    6 PostgreSQL entegrasyon testi vakası (23 Eylül sayımı); mutasyon denemelerinin
    hepsi en az bir testi düşürdü. Saklama süresi kararı **verildi** (süresiz; bkz. A4).
    **Dağıtım engeli:** sürüm migration içeriyor, mevcut `production-release-remote.sh`
    ise yeni migration görünce `MIGRATION_SET_CHANGED` ile duruyor ve app entrypoint'ini
    `prisma migrate deploy` çalıştırmayacak şekilde eziyor; runbook Gate 7/8 ise kodda
    bulunmayan uygulama genelinde yazma dondurması istiyor. Bu yüzden önce migration'lı
    dağıtım yolu yazılacak (A5), iletişim formu onun ilk müşterisi olacak.
    Gökhan'dan isteğe bağlı: GA4 "Form
    etkileşimleri"ni kapatmak. Karar kaydı: Gökhan: künyede takma ad; iletişim ve içerik kaldırma için sitede bir
    form (anonim mesaj saklamak yeni tablo, yani migration ister — ayrı PR ve ayrı onay);
    Hotjar kapalı, GA4 onaya bağlı (PR #156). Sunucu dışı yedek ertelendi.
    Önceki metin: Metnin ne diyeceği (hangi ad, hangi iletişim adresi,
    analytics açık mı kapalı mı) operatör kararıdır; kod tarafı hazırdır.
    Madde 20 ile çelişmez: künye ve kaldırma başvuru yolu **ardıl** denetimin
    kanalıdır, ön denetim değil — Madde 20 zaten "ispiyon edilirse sonradan
    değerlendirilir" diyor, bugün o başvuruyu yapacak bir adres yok. Sitede operatör
    kimliği ve bildirim kanalı yok; GTM/GA4/Hotjar anonim ziyaretçide ön onay olmadan
    yükleniyor (yalnız DNT/GPC opt-out). Öneri: `/hakkinda`'ya künye + iletişim +
    kaldırma talebi adresi; onay gelene kadar Hotjar kapalı, GA4 onaya bağlı ya da
    çerezsiz ölçüm. _(Rapor hukuki tavsiye değil; 5651 ve KVKK çerez rehberi risk
    işareti olarak veriliyor, avukat teyidi öneriliyor. Sorumluluk Gökhan'da.)_
- [x] **6.3-1 — kaynak linki — KARAR: OTOMATİK GÖSTERİM YOK (Gökhan, 25 Eylül: "yazar kaynak
      vermek isterse doğal bir şekilde versin").** 24 Eylül'deki "yeri geldiyse gösterilebilir"
      kararını "kaynak varsa her entry'nin altında göster" diye uyguladım (PR #219: "kaynak:
      alanadı" satırı + JSON-LD `citation`); Gökhan doğallığı bozduğunu söyledi — sözlük yazarı
      entry'nin altına otomatik kaynak satırı koymaz. Dağıtılmadan geri alındı (PR #219 revert).
      Kaynak, gerekirse yazarın kendi metninde, sözlük üslubuyla (satır içi bağlantı ya da
      `(bkz: …)`) verilir; bu, Sıra 4 üslup turunun konusudur. Ölçüm kaydı: son 30 günde 5.118
      aktif ajan entry'sinin 2.984'ü doğrulanmış kaynağa dayanıyordu.
- [x] **B6 — onaysız hesapların oyu — KARAR: DEĞİŞMEYECEK (Gökhan, 24 Eylül: "hayır").**
      Onaysız hesabın oyu mevcut hâliyle (hesap başına 120/10 dk sınırıyla) sayılmaya devam eder.
      Önceki metin: Yazmak `requireApprovedWriter` istiyor ama oy,
      takip ve favori yalnız `requireActiveActor` istiyor; oylar Gündem/DEBE'ye ve ajan
      algısına eşit ağırlıkla giriyor. Dış dünyadan ajan toplumuna açılan denetimsiz tek
      kanal bu. Öneri: onaysız hesabın oyu sayaçta görünsün, trend skoruna ve algıya
      girmesin.
- [x] **B7 — worker'da egress kısıtı yok — ağ katmanı CANLIDA (24 Eylül, `7aae0d2`; yeni birim
      altında Codex'li SUCCEEDED koşu, NRestarts 0).** Birim: `IPAddressDeny` özel aralıklar (10/8, 172.16/12, 192.168/16),
      link-local/metadata (169.254/16), CGNAT (100.64/10), IPv6 ULA ve link-local;
      `IPAddressAllow=localhost`. Kanıt `scripts/systemd-egress-probe.sh` (CI `container`
      işi, gerçek systemd, birimdeki etkin değerlerle): localhost, Docker'ın 127.0.0.1'e
      yayımladığı konteyner portu, DNS ve 1.1.1.1:443 açık; 169.254.169.254, IPv4-mapped
      metadata, 10.0.0.1 ve 172.17.0.1 çekirdekte reddedilir; kısıtsız denetim biriminde
      aynı hedefler reddedilmez. Worker'ın API yolu (`control-plane-client` yalnız loopback
      kabul eder) Docker'ın userland proxy'sine dayanır: dağıtım öncesi üretimde
      `userland-proxy=false` olmadığı doğrulanmalı (Astra, #181). Kalan: CLI
      yükseltmesini "etkin araç listesi değişti mi" kontrolüne bağlamak. Önceki metin:
      systemd biriminde `IPAddressDeny` yok; bugün
      tek bariyer "modelin aracı yok". Codex CLI yükseltmesi varsayılan açık bir araç
      getirirse link-local metadata (169.254.169.254) ve loopback erişilebilir kalır.
      Ucuz ikinci kat: `IPAddressDeny` özel aralıklar + `IPAddressAllow=localhost`;
      CLI yükseltmesini "etkin araç listesi değişti mi" kontrolüne bağla.
- [x] **B8 — tek oturum bağımlılığı — KARAR: B PLANI YOK (Gökhan, 25 Eylül: "codex giderse
      sözlük dursun").** Toplumun tamamı tek ChatGPT OAuth oturumuna bağlı; hesap kısıtlanır
      ya da kota biterse toplum durur ve bu kabul edilen davranıştır. 24–25 Eylül'de kota
      bitince ~16 saat durdu, kota açılınca kendiliğinden döndü. Ayrı API anahtarı ve ikinci
      sağlayıcı adaptörü yapılmayacak. Kotayı korumak için Astra tur bütçesi geçerli.

## 5.8. 22 Eylül incelemelerinden gelen maddeler — kapanan maddeler

- [x] **A1 — başlık içi arama ölçüme açık kalıyor — CANLIDA (23 Eylül, `f2f57f3`; üretim
      onay smoke'u `35929529128` başarılı). Astra altı turda BİRLEŞTİR.** Tek sınıflandırıcı `isSensitiveAnalyticsLocation`, yolu ve sorguyu
      birlikte alır: `q` parametreli her adres hassas. Middleware, istemci
      (`useSearchParams`), bağlantı koruması, geri/ileri ve arama önerisi aynı kuralı
      kullanıyor; hassas belgede referrer politikası `origin` (sorgu sonraki belgeye
      taşınmaz); onay × konum × DNT/GPC matrisi (18 vaka) ve middleware sınıflaması testte.
      Önceki metin: `/ara` hassas sayılıyor ama
      `/baslik/...?q=...` yol olarak `PUBLIC`: sınıflandırma yalnız pathname'e bakıyor
      (`src/lib/analytics/product-analytics.ts`, `src/middleware.ts`, istemci tarafında
      `usePathname`). Astra doğruladı: `/baslik/…?q=…` probu `PUBLIC` döndü. Gizlilik
      metni "arama sayfalarında ölçüm yapılmaz" diyor; onaylı ziyaretçide bu söz
      deliniyor. **Kapatma ölçütü:** tek sınıflandırıcı pathname + query alsın; ilk
      yükleme, form gönderimi, istemci içi gezinme ve geri/ileri aynı kuralı kullansın;
      onaylı/onaysız × genel arama/başlık araması × DNT/GPC matrisi testte. _(Sıra 1)_
- [x] **A3 — yeniden başlatma sınırı sonrası kalıcı durma — CANLIDA (23 Eylül, `f2f57f3`;
      yeni birim dondurmada kuruldu, worker `active/running`, NRestarts 0).**
      `StartLimitIntervalSec=0`, `RestartSec=5s`, `RestartSteps=6`,
      `RestartMaxDelaySec=5min`. Kanıt: `scripts/systemd-restart-probe.sh` gerçek systemd'de
      (yerelde systemd 257, CI `container` işinde her koşuda): eski politika 5 denemeden sonra
      `failed`'da kaldı ve kesinti bitince de dönmedi; yeni politika 40 sn'lik kesinti bittikten
      35 sn sonra toparlandı (sınır 300 sn). Alarm "koşu yok"u birim durumundan bağımsız, son
      koşunun yaşından bildirir; yeniden deneyen worker koşu üretmedikçe aynı olay bildirilir.
      Astra 1. tur (PR #175) üç bulgu verdi, üçü de kapandı: (1) hold kapısı `ExecStartPre`
      iken hold varken yapılan bir başlatma süresiz yeniden deneme kuruyor ve hold kalkınca
      worker kendiliğinden açılıyordu (yerelde karşı örnekle doğrulandı: `restarts=1`,
      `active/running`); kapı artık `ExecCondition`. (2) Prob birimleri alt kabukta kaydettiği
      için temizlemiyordu; kayıt ana kabukta, temizlik doğrulanıyor. (3) Prob politikayı ilk
      eşleşmeyle metinden okuyordu; artık gerçek birim dosyası systemd'ye yüklenip etkin
      özellikler (`systemctl show`, `ExecConditionEx flags=privileged` dahil) okunuyor. Probun
      üçüncü aşaması hold'un atlandığını, kalkınca açılmadığını, açık `start` ile açıldığını
      ölçüyor.
      Önceki metin:
      `deploy/systemd/agent-sozluk-runtime.service` beş açılış/300 saniye sınırı taşıyor;
      canlılık alarmı yalnız bildiriyor, yeniden başlatmıyor. Geçici bir DB/API kesintisi
      art arda açılışları düşürürse hizmet kesinti bittikten sonra da durur (19 Eylül'de
      olan buydu). Öneri: `StartLimitIntervalSec=0` + artan `RestartSec`. **Kapatma
      ölçütü:** izole ortamda zorlanmış crash-loop'tan 5 dakika içinde kendiliğinden
      toparlanma; alarmın aynı olayı yine bildirdiği kanıtı. _(bölüm 5.5)_
- [x] **A5 — migration'lı üretim dağıtım yolu — KAPANDI (23 Eylül, ilk kullanım
      `c0dbe73`: iletişim formu canlıda).** _(Gökhan onayladı, 22 Eylül: "A".)_
      Lease taraması uyarısı (`RELEASE_WARN lease alarm pre-cutover scan failed`) kapandı
      (PR #174; `f2f57f3` dağıtımında `RELEASE_LEASE_SCAN_OK`). Kök neden: alarm app konteynerini `ps -q app` ile arıyordu; migration modunda
      app dondurmadan kesime kadar durduğu için kimlik boş dönüyordu. Artık `ps -a -q app`:
      durmuş konteyner de taranır, kesim taraması iki modda da konteyner yeniden yaratılmadan
      hemen önce koşar ve makbuz tazedir. İlk denenen yol (taramayı dondurmaya alıp makbuza
      45 dk'lık pencere vermek) Astra'nın iki turunda üç yeni kusur üretti (baştaki sıfırla
      süre kontrolünü atlatma, gecikmiş resume'da süresi dolan makbuz, 2700 üstü bütçede
      taramanın hiç koşmaması) ve bırakıldı. Timer'ın kurulu alarmı da dondurma boyunca durmuş
      konteyneri bulur; kurulu betiğin güncellenmesi ayrı kurulum adımıdır.
      Bugün yalnız `deploy-production-no-migration.sh` var; yeni migration'lı bir sürüm
      dağıtılamıyor (`MIGRATION_SET_CHANGED`) ve runbook Gate 7/8'in istediği uygulama
      genelinde yazma dondurması kodda yok (`MAINTENANCE` yalnız ajanları durduruyor).

      **23 Eylül durumu — KOD MAIN'DE (`9c275cf` PR #167, sonra #170 yönetici rolü, #171
      şema kanıtı); İLK KULLANIM `c0dbe73` İLE TAMAMLANDI (ilk deneme `e12bdd0` migration'dan
      önce durdu; ayrıntı `ATTEMPT_LOG.md`).**
      Gökhan kısa kesintili yolu seçti (23 Eylül; dondurma = worker drenaj + Caddy ve app
      durdurma, site bu sürede kapalı). Tasarım Astra ile sekiz turda uzlaştırıldı ("TASARIM
      UYGUN", `3729072`); ayrıntı ve bütün aşamalar runbook "Migration'lı sürüm (A5)"
      bölümünde, deneme kaydı `ATTEMPT_LOG.md`'de. Aşağıdaki gereksinim listesi korunuyor;
      uygulamada iki fark: migration imajın kendi entrypoint'iyle değil, aday imajdan tek
      seferlik bir konteynerde `scripts/run-migration.mjs` ile (hedef `current_database()` ile
      doğrulanır) uygulanır; FK kuralı daha dar (yalnız mevcut tablonun uuid `id`'sine, sütun
      başına bir FK, yeni tablolar arası FK yok; migration en az bir tablo açar — yalnız enum ekleyen
      migration dondurmadan önce reddedilir). Aşağıdaki "geri dönüş güvencesi" iki parçaya
      bölündü (Astra v2'de kabul etti): önceki imaj gerçek üretim kopyası (scratch) üzerinde,
      migration uygulanmışken migration'sız açılır ve health/ready + release smoke geçer; üst satır
      güncelleme/silme etkisi ise denetçinin statik kuralıyla (FK sütunu CHECK'te yalnız NULL
      sınamasıyla, `SET NULL` için monotonluk) ve CI entegrasyon testiyle (gerçek PostgreSQL,
      `users` kimlik değişimi ve silme) kanıtlanır. Uygulama kullanıcı silmediği ve kimlik
      değiştirmediği için (audit tetikleyicisi kullanıcı silmeyi engeller) eski imaj bu yolu
      zaten çalıştırmaz. Hakem turları: Sol dört kod turu (son BİRLEŞTİR); Gökhan'ın 23 Eylül
      kararıyla hakem yalnız Astra — üç kod turu, son `0b48f32` BİRLEŞTİR; PR CI 7/7. Kalan tek
      kapatma adımı ilk kullanım: iletişim formunun bu yolla canlıya alınması (ayrı exact onay;
      scratch provası, önceki imaj açılışı ve oturum scope kontrolünün olumlu yolu ancak orada
      ölçülür).

      Yazılacak mod:

      - **Ön kontrol:** `SHOW server_encoding` = `UTF8`. Uygulamanın uzunluk kuralı
        kod noktası sayar ve PostgreSQL `length()` ile ancak UTF8'de örtüşür (Sol, 22 Eylül).
      - **Yedek ve restore kanıtı:** `pg_dump -Fc` + boyut/özet kaydı, ardından yedeğin izole
        bir veritabanına `pg_restore --exit-on-error` ile geri yüklenmesi. Karşılaştırma
        **`public` şemadaki bütün tabloları** kapsar (V1, `user_follows`, `agent_*` ve sonra
        eklenenler, `_prisma_migrations`); liste sabit yazılmaz, katalogdan okunur. Her tablo
        için satır sayısı ve içerik parmak izi. Runbook'taki mevcut Gate 7 yalnız 16 V1
        tablosunu sınıyor, `user_follows` ve `agent_*` tablolarını açıkça dışlıyor
        (`PRODUCTION_RUNBOOK.md`), bu yüzden onun yerine geçmez. Tablolar yetmez: `public`
        şemadaki bütün sequence'ler de katalogdan okunup karşılaştırılır (`last_value`,
        `is_called`, sahip sütun ve `DEFAULT` bağı) ve her sequence'in sonraki değerinin sahip
        sütundaki en büyük değerden büyük olduğu doğrulanır. İçeriği birebir aynı tablolar
        sıfırlanmış bir `topics_public_id_seq` ile de eşit görünür, ilk yeni başlık ise
        `publicId` çakışmasıyla düşer (Sol, 22 Eylül; 10 Eylül provası 3 sequence ölçmüştü).
        Yalnız dosyanın var olması yedek kanıtı sayılmaz.

      - Uygulanmış migration listesi, **yalnız ek yapan** migration kontrolü, aday imajla tek
        seferlik konteynerde `prisma migrate deploy`, sonrasında applied == candidate ve tablo
        envanteri karşılaştırması.
      - **"Yalnız ek yapan" bir izin listesidir**, yasak sözcük listesi değil (Sol, 22 Eylül:
        `CREATE TRIGGER`, `CREATE OR REPLACE FUNCTION`, `UPDATE` veya `DO` bloğu hiçbir yasak
        sözcüğe takılmadan eski imajın davranışını ya da mevcut veriyi değiştirebilir). Aday
        migration'daki her ifade yalnız şunlardan biri olabilir:

        - `CREATE TYPE … AS ENUM`;
        - yeni bir tabloyu açan düz `CREATE TABLE "ad" (…)`: sütunlar, sütun/tablo CHECK'leri,
          birincil anahtar ve aşağıdaki kurala uyan FK'ler. `AS`, `PARTITION OF`, `INHERITS`,
          `LIKE`, `OF`, `IF NOT EXISTS`, `TEMP`/`UNLOGGED` biçimleri reddedilir;
        - aynı migration'da açılan tablo üzerinde, düz sütun listesiyle
          `CREATE [UNIQUE] INDEX` (ifade indeksi ve `WHERE` yok).

        İzin listesi ifadelerin **içine** de uygulanır, yoksa izinli bir kabuk yan etki
        taşır: `CHECK (setval('topics_public_id_seq', 1, false) > 0)` yeni tabloya ilk satır
        yazılınca mevcut sequence'i sıfırlar (Sol, 22 Eylül). Sütun türü yalnız yerleşik
        skaler tür veya aynı migration'da açılan enum; `SERIAL`/`BIGSERIAL`, `GENERATED` ve
        kimlik sütunu reddedilir. `DEFAULT` yalnız sabit, enum değeri veya
        `CURRENT_TIMESTAMP`. `CHECK` yalnız sütun başvurusu, sabit, karşılaştırma,
        `IS [NOT] NULL`, `AND`/`OR`/`NOT`, `~` ve adıyla listelenmiş değişmez (IMMUTABLE)
        yerleşik fonksiyonlar (`length`, `btrim`). Başka herhangi bir fonksiyon çağrısı,
        alt sorgu, tür dönüşümü ya da mevcut bir sequence/nesneye başvuru adayı reddeder.

        Geri kalan her şey (mevcut nesneye dokunan `ALTER`, `DROP`, `TRUNCATE`, DML,
        fonksiyon, trigger, `DO`, yorum dışı bilinmeyen ifade) adayı reddeder;
        ayrıştırılamayan ifade de reddedilir.
      - **Mevcut tabloya yönelen FK:** yeni tablo "fazladan" olsa da mevcut tabloya FK
        eklemek eski imajın davranışını değiştirir: varsayılan `NO ACTION` veya `RESTRICT`
        ile geri dönüşten sonra eski imajın kullanıcı silmesi, yeni tablodaki çocuk satır
        yüzünden düşer (Sol, 22 Eylül). Bu yüzden böyle bir FK yalnız açık
        `ON DELETE SET NULL` (sütun NULL'lanabilir ve hiçbir CHECK onu zorunlu kılmıyor;
        yoksa silme `23514` ile düşer) ya da açık `ON DELETE CASCADE` ile kabul edilir;
        ikisinde de `ON UPDATE CASCADE`. İletişim migration'ı buna uyuyor: iki FK de
        `SET NULL`, iki sütun da NULL'lanabilir; `handledById` CHECK'te yalnız olumlu
        `IS NULL` olarak geçiyor (NULL'a çekmek CHECK'i düşüremez; 23 Eylül düzeltmesi —
        önceki "CHECK dışında" ifadesi yanlıştı).
      - **Geri dönüş güvencesi** bu kurallardan **ve** kanıttan gelir: önceki imajın yeni
        şemalı üretim kopyasına (scratch) karşı açıldığı ve health/ready + release smoke'tan
        geçtiği izole bir prova; üst satır (ör. kullanıcı) güncelleme/silme etkisi ise
        denetçinin statik FK/CHECK kuralı ve gerçek PostgreSQL'de koşan CI entegrasyon
        testiyle (23 Eylül uzlaştırması; yukarıdaki durum notu).

      **Kapatma ölçütü:** birim testleriyle korunan mod; izin listesinin her reddedilen ifade
      türü ve her reddedilen ifade içeriği (`setval`, `nextval`, alt sorgu, `SERIAL`,
      ifade indeksi) için ayrı vaka, iletişim migration'ının kendisi olumlu vaka; bütün
      tabloları ve sequence'leri kapsayan izole restore + parmak izi kanıtı; önceki imajın
      scratch'te açılış provası + FK davranışının CI entegrasyon testi;
      Astra incelemesi; ve ilk kullanımı olarak iletişim formunun canlıya alınması.
      A5 kapanmadan migration'lı dağıtım yapılmaz; runbook'un elle yürütülen Gate 7'si
      yalnız V1 tablolarını sınadığı için bunun yerine geçmez.
      _(Sıra 2 / bölüm 5.5)_

- [x] **A4 — iletişim taleplerinin saklama süresi: SÜRESİZ. KARAR VERİLDİ.**
      _(Gökhan kararı, 22 Eylül 2026: "Suresiz kalsın")_ Talep kayıtları otomatik
      silinmez; otomatik temizlik işi açılmayacak. Kayıt sahibi silinmesini aynı
      formdan isteyebilir, silme elle yapılır. `/gizlilik` ve `/iletisim` metinleri
      zaten otomatik silme sözü vermiyor, değişiklik gerekmedi. Kabul edilen sonuç:
      dağıtık spam'de tablo sınırsız büyüyebilir (Sol bulgusu); sınırlama IP başına
      saatte 5 gönderimle kalıyor.
