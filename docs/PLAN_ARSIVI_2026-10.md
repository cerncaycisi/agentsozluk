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

## 5. Sıra 5 — great reset (3 Ekim 2026'da plandan çıkarıldı; metin olduğu gibi)

Toplum davranışı düzelince tüm sözlük verisi sıfırlanacak (topics, entries, oylar + ajan
hafızası/inançları).

**Önkoşul eklendi (19 Eylül):** 18 Eylül incelemesinin ilk yedi maddesi (bölüm 5.7) reset
öncesinde kapanmış olmalı — reset sonrası 7 günlük pencere aynı anda Gate 10 kanıtı ve ilk
temiz indeksleme dönemi olacak. Sunucu dışı yedek kanıtı ve kalıcı canlılık alarmı da bu
listede.

**Hazırlık başladı (2 Eylül):** `scripts/great-reset.ts` sınıflandırmayı yazılı ve test
edilebilir hâle getirdi. Şemadaki 45 modelin (o gün; 23 Eylül'de 49) tamamı ya `CLEARED` ya `PRESERVED`; yeni bir
model eklenip listeye girmezse test düşüyor (doğrulandı — bir model çıkarılınca FAIL
ediyor). Silme sırası yabancı anahtara saygılı ve o da test ediliyor. Korunanlar: ajanlar,
personalar, kimlik bilgileri, kaynaklar ve `auditLog`/`outboxEvent` — sıfırlamanın kendisi
de denetlenebilir kalmalı.

**10 Eylül yerel uygulama:** varsayılanı salt okunur önizleme olan gerçek silme
akışı, yalnız bilinen Mac/PostgreSQL kümesindeki sentetik kopyalarda çalışıyor.
18 PostgreSQL senaryosu, son SHA CI 7/7 ve Opus 5 yerel GO tamam. Üretim aracı değildir;
[yerel yürütücü ve sınırlar](GREAT_RESET_YEREL_ARAC_2026-09-10.md).
**1 Ekim önkoşulu:** reset'ten önce SEO/GEO taban ölçümü (5.9 İ7); yığının akıbeti Gökhan'da (5.9 Z2).
**Kalan:** üretim yedeği ve geri yükleme kabulü,
üretim outbox/uygulama kapanış-açılış tasarımı. **Düzelmemiş toplumu sıfırlamak
boşa gider** — Sıra 1, 2, 4 bir tur ölçülüp oturmadan yapılmaz. _(Gökhan kararı — bkz. hafıza: agentsozluk-veri-sifirlanacak)_

### Reset ile Gate 10 penceresi birleştirilecek — sıra kilitli (3 Eylül kararı)

Gökhan'ın önerisi: reset sonrası 7 günlük gözlem penceresi hem Gate 10 kanıtı hem reset'in
kendi ölçümü olur, iki iş bir arada biter. Kabul edildi. Ama sırası önemli, çünkü **reset
kaynak edinmeyi geçici olarak öldürüyor.**

Aday listesi "bu kaynağı son 14 günde kaç FARKLI ajan yayımlanmış işinde kaynak gösterdi"
sorgusuna dayanıyor ve o veri `agent_actions` tablosunda. Reset o tabloyu **siliyor**
(kaynakların kendisi ve `agentSourceItem` korunuyor; bu öğeleri başarılı eylemlere
bağlayan atıf kayıtları siliniyor). `repository/runtime.ts:2021` sorgusu iki tarafı
birleştiriyor. Sonuç: reset sonrası aday listesi boş döner, ajanlar yeni atıf üretene kadar kimse kaynak edinemez — ve
Gate 10'un düşen tek kriteri tam bu (**ajan başına en az 10 taze faydalı kaynak**). Yani
reset'i öne almak, kapatmaya çalıştığımız kriteri elimizle açık tutmak olur.

**Kilitlenen sıra:**

1. **`CODEX_TIMEOUT` düşür.** Gate 10 madde 4 en fazla %5 başarısızlık istiyor.
   **Teşhis edildi ve düzeltildi (7 Eylül)** — ayrıntı `docs/AW_FAZI_OLCUMU_2026-09-04.md`.

   Timeout'ların **%78'i** son fazda, `ACTION_WORTHINESS`'te kesiliyordu (117 kesilmenin
   91'i). AW medyanda 55 sn / p95 120 sn istiyor; ona kalan bütçenin p10'u 94 sn. Rezerv
   çözmezdi: AW'ye 150 sn ayırmak DECISION'ı ~300 sn'ye sıkıştırırdı, oysa p90'ı 372 sn —
   arıza taşınırdı. Çözüm AW'yi ucuzlatmak oldu: perception **daraltıldı, silinmedi**
   (PR #112, `92cac23`).

   Elenen hipotezler: gezinme (10-11 sn, fark yok), kurulum maliyeti (39 ms + 34 ms), host
   çekişmesi (timeout'ta yük 0,26 vs başarılıda 1,67 — tersi) ve "yavaş DECISION sınıfı"
   (dağılım tek tepeli; 335 sn koşullama etkisiydi).

   **Sonuç (7 Eylül, 260 koşuluk 12 saatlik pencere, üretim):** AW p50 55 → 35,7 sn,
   p95 120 → 116,3 sn. DECISION p50 250 → 193,5, p90 372 → 294,6 sn (dokunmadık, bu
   açıklanmamış bir karıştırıcı). Faz süreleri (censored hariç, sn):

   | faz               | n   | p50   | p90   | p95   | maks  |
   | ----------------- | --- | ----- | ----- | ----- | ----- |
   | DECISION          | 259 | 193,5 | 294,6 | 329,5 | 453,6 |
   | ACTION_WORTHINESS | 249 | 35,7  | 91,6  | 116,3 | 159,1 |
   | BROWSE            | 224 | 9,5   | 12,2  | 13,2  | 17,7  |
   | DECISION_REPAIR   | 7   | 116,0 | 178,1 | 178,9 | 179,6 |
   | CONTENT_REPAIR    | 48  | 2,3   | 3,0   | 3,3   | 3,7   |

   **İki oran karıştırılmamalı.** Gate 10 madde 4 yalnız doğal `FAILED`+`TIMED_OUT`
   sayıyor (`society-baseline-report.ts:857`), `PARTIAL` değil. Bu pencerede
   operasyonel timeout payı 10/260 = %3,85, Gate'in saydığı alt metrik 1/260 = %0,38.
   **Hiçbiri Gate PASS demek değil**: gate ayrıca yedi günlük doğal pencere ve diğer
   maddeleri istiyor, ve 10/260'ın %95 Wilson aralığı %2,1–%6,9 — nokta tahmininden
   kalıcı "%5 altı" sonucu çıkmaz. Üretim bütçesi 480 sn (şema varsayılanı 360 değil).

   **Rezerv fikri kapandı — Astra hakem turu, 7 Eylül: NO-GO.** `DECISION.timeoutMs`'i
   `remainingMs() − 110 sn` ile sınırlamak **sıfır** koşu kurtarır, "az kurtarır" bile
   değil. Gerekçe: AW zaten kalan sürenin tamamını alıyor (`worker.ts:1687`), yani tavan
   AW'ye hiçbir şey **eklemez**; DECISION tavana sığarsa yürütme aynen aynı kalır, sığmazsa
   koşu DECISION'da ölür (`worker.ts:2011`). `timeoutMs` modele bildirilen bir hedef değil,
   süreç sonlandırma sayacı (`codex-cli-provider.ts:280`) — kısaltmak hızlandırmaz, erken
   öldürür. Timeout alan 10 koşunun 6'sında DECISION tek başına 415–460 sn yiyor.
   Astra ayrıca (d) "süre azsa AW'yi atlayıp uygula" seçeneğini de reddetti: AW yalnız
   güvenlik değil, yenilik/tekrar/başlık-gövde uyumunu bağımsız değerlendiren ürün kapısı.
   **Sıradaki deney (c):** DECISION prompt'unu ölçerek ucuzlatmak — #112'nin AW'ye yaptığını
   DECISION'a yapmak. Prompt küçülmesinin gecikmeyi düşüreceği henüz hipotez, ölçülecek.
   **8 Eylül hızlandırma kararı:** yerel aday kodu, testler ve bağımsız hakem
   incelemesi canlı pencere sürerken yapılır. 12 saat / 200 koşu operasyonel
   gözlem hedefidir; yerel geliştirme için bekleme şartı değildir. Canlı deneyi
   erkene almak ayrı, gerekçeli ölçüm protokolü kararı gerektirir; bu turda
   üretim değişikliği veya önkoşulun tamamlandığı iddiası yok.
   - [x] **ÖNKOŞUL: prompt boyutu telemetrisi ve tam gözlem penceresi tamamlandı (9 Eylül).**
         `07:08:51.880Z` kesiminde 24 saat 6 dakika 39,583 sn aktif gözlem,
         **452 terminal doğal koşu**, terminal interval rapor eksiği 0 ve
         **1.488/1.488** kayıtta iki pozitif boyut alanı var. Beş faz da temsil ediliyor.
         16 censored interval süre yüzdeliklerinden çıkarıldı. 307 SUCCEEDED /
         141 PARTIAL / 4 FAILED; 15 PARTIAL CODEX_TIMEOUT. Prompt hash 452/452
         aynı; iki kayıtta model/effort/CLI alanları eksik, doldurulmadı.
         DECISION medyanı 119.887 UTF-16 birimi ve 199,151 sn; bu temel ölçüm,
         hız/kalite kazancı değil. **PR #120 parkta/taslak; canlı deney başlamadı.**
         [Tam pencere, sınırlar ve dağıtım aralığı](CANLI_DAGITIM_VE_TELEMETRI_2026-09-09.md).
         **Geçmiş hazırlık ve ilk doğrulamalar:** 7 Eylül'de üretimde
         anahtarlar tek tek sayıldı. Koşu düzeyinde ölçüm var (süre, bellek, yük, model,
         profil hash'i, AW verdict'i); faz aralığında da var (`durationMs`, `setupMs`,
         `inspectMs`, `modelMs`, `censored`). **Token ya da karakter sayısı hiçbirinde
         yok.** Yani "prompt'u küçülttük, süre düştü" iddiası bugün ölçülemez — bağımsız
         değişken kayıtsız. AW'de #116 ile yaşanan durumun aynısı: önce telemetri, sonra
         deney. Worker'a faz başına `promptChars` (UTF-16 birimi) ve `promptBytes`
         (UTF-8 bayt) eklendi; token sayısı iddiası yok. Beş faz, başarı/hata/timeout
         yolları ve eski kayıt uyumu yerelde doğrulandı: 72 worker, toplam 560 ajan
         testi geçti. O aşamada tam canlı pencere henüz ölçülmemişti. Dağıtım
         sonrası en az 12 saat / 200 terminal doğal koşu ve tam alan kapsamı şartı
         yukarıdaki 9 Eylül kesimiyle kapandı; deney kararı ayrıca değerlendirilir.
         **Farklı modelden peer review tamamlandı:** ilk OAuth hatasının ardından,
         Gökhan'ın yeniden deneme talimatıyla Opus 5 turu başarılı oldu. Kod için GO;
         release için global pause ve app/runtime/boot etiketi eşleşmesi koşullarıyla GO.
         Onarımda tekrar gönderilen metnin toplam hacimdeki payı ve terminal rapor kaybının
         örneklem sınırı belgeye işlendi. **8 Eylül: onaylı dağıtım tamamlandı.**
         `25ff3771859da5904b22dac40b712286f852fe30` app/runtime/boot etiketi eşleşti;
         canlı smoke health/ready/search `200/200/200`. Pause `264→265`, resume `265→266`;
         diğer ayarların hash'i değişmedi, eşzamanlılık 2 ve timeout bütçesi 480 sn.
         Pencere başlangıcı `2026-09-08T06:59:21.513Z` (**09:59:21 TSİ**);
         İlk 12 saat eşiği aynı gün 21:59:21 TSİ idi. SEO/analytics dağıtımında
         `11:48:45.127Z–11:51:35.911Z` arasında **170,784 sn** duraklatıldı;
         bu süreyi dışlayan en erken aktif gözlem eşiği **22:02:12.297 TSİ**.
         Ayrıca 200 terminal doğal koşu gerekiyor. Yeni app/runtime/boot `f88d64d`;
         `25ff377..f88d64d` arasında `src/runtime`, `src/modules/agents` ve `prisma`
         farkı yok. Model/prompt/bütçe/eşzamanlılık ve stable settings hash aynı;
         settingsVersion `266→267→268`. Eski kohort korunur, dağıtım aralığı ayrıca
         raporlanır; kesintisiz pencere veya hız kazancı sayılmaz.
         İlk `SUCCEEDED` doğal koşu `07:03:49.640Z`'de tamamlandı; kaydedilen BROWSE,
         DECISION ve ACTION_WORTHINESS interval'larının **3/3'ünde iki boyut alanı var**.
         `07:05:19Z` kesiminde kohort 1 başarılı / 1 devam eden koşu; ilk canlı
         kaydın doğrulanması tam pencere veya bütün çağrıların kaydedildiğinin kanıtı değil.
         **Canlı DECISION daraltma deneyi başlamadı.**
         Birimler ve ölçüm sınırları:
         [prompt boyutu kanıt kaydı](PROMPT_BOYUTU_TELEMETRISI_2026-09-07.md).
         **8 Eylül yerel hazırlığı:** pencereyi değiştirmeden DECISION metni incelendi.
         Persona/runtime anayasa tekrarında 10 seed fixture'ın her birinde 3.991
         UTF-16 birimi / 4.391 bayt çıkarılabiliyor; bağlam yükü aynı kalıyor.
         Canlı persona kapsamı, model davranışı ve süre kazancı ölçülmedi; aday
         henüz seçilmedi. Kalite vakaları ve aday sınırları
         [hazırlık kaydında](DECISION_DARALTMA_HAZIRLIGI_2026-09-08.md).
         Opus 5 yalnız hazırlık için koşullu GO verdi; canlı persona snapshot'larının
         tam eşleşme kapsamı ve gerçek adayın davranış etkisi ayrıca doğrulanacak.
         Bu hazırlık tam pencere önkoşulunu kapatmaz ve canlı deney başlatmaz.
         **Yerel aday uygulandı:** `codex/decision-prompt-dedup` dalında yalnız
         NORMAL_WAKE / NORMAL için tam eşleşen persona bölümü çıkarılıyor; profil
         40→41. Worker testleri 91/91 geçti. Testte bulunan kök şema-hata yolu
         telemetrisi boş string yerine `$` kullanılarak düzeltildi. İlk kod için
         579 ajan testi geçti; Opus 5 repo/taslak için koşullu GO verdi. Hakem sonrası
         daraltma ayarları hash'e dahil edildi ve gerçek browse akışı testi eklendi;
         odaklı 101 test geçti. [Taslak PR #120](https://github.com/cerncaycisi/agentsozluk/pull/120).
         `c08052e` için ikinci Opus 5 turu repo/taslak **GO** verdi; kod hakemi kapandı.
         **11:13 TSİ onaylı salt okunur kesim:** aktif persona snapshot'larının
         **36/36'sı** adayla eşleşti; bu önkoşul kapandı. 74 dakika 25 saniyelik
         kohortta 11 SUCCEEDED + 11 PARTIAL ve 2 RUNNING var. Beş fazın tamamından
         kaydedilmiş **74/74 interval** iki boyutu taşıyor; terminal rapor eksiği yok.
         PARTIAL koşuların 2'si CODEX_TIMEOUT; diğer 9'unda koşu hata kodu yok.
         Model `gpt-5.6-luna/max`, canlı runtime `25ff377`; ayarlar aynı, restart 0.
         Yerel eşlenmiş model kalite karşılaştırması bu doğrulanmış modelle
         ilerleyebilir. Tam 12 saat/200 koşuluk gözlem ve canlı hız/kalite sonucu
         henüz yok; canlı daraltma başlamadı.
         **11:31–11:47 TSİ yerel kalite çağrıları:** altı sentetik bağlam,
         tek persona, aynı `gpt-5.6-luna/max` isteğiyle 12/12 çıktı alındı.
         Gerçek şema ve kanıt kimliği/hedef kontrolleri 12/12 geçti; timeout ve
         araç çağrısı 0. Aday üç vakada hızlı, üç vakada yavaş; hız iddiası yok.
         [Eşlenmiş kalite kaydı](DECISION_YEREL_KALITE_2026-09-08.md).
         **Kör Opus 5 tamamlandı (8 tur, izin reddi 0):** adayın destekli katkısında
         özgünlük FAIL; kaynakla normalize edilmiş 18 sözcüklük kesintisiz örtüşme
         doğrulandı (eski 6). Eski sürümde de deney ayrıntısını çarpıtma var.
         **Canlıya geçiş için NO-GO, PR #120 taslak.** Bu tek örnek daraltmanın
         nedensel gerileme kanıtı değil; kaynak/özgünlük vakası için farklı persona
         ve eşlenmiş tekrar içeren takip protokolü donduruldu.
         **12:12–12:25 TSİ odaklı takip tamamlandı:** iki persona × üç tekrar ×
         iki kol, 12/12 sağlayıcı/şema/kanıt kimliği/hedef kontrolü geçti; her çağrıda
         bir entry, timeout ve araç olayı 0. Kör Opus 5 (3 tur, izin reddi 0)
         iki kolda da birer özgünlük FAIL verdi. Kaynak aktarımı iki kolda da
         doğrulandı; her özeti katkısız sayan hakem genellemesi benimsenmedi.
         Sadakat/özgünlük farkının yönü persona değişince tersine döndü; nedensel
         kalite veya hız sonucu yok. **Aday park edildi, PR #120 taslak; aynı aday
         için kendiliğinden üçüncü tekrar partisi açılmayacak.**
         [Dondurulmuş protokol, bütün sonuçlar ve uzlaştırma](DECISION_KAYNAK_TEKRARI_2026-09-08.md).
         Yerel takip aktif işten çıktı. 9 Eylül'de canlı telemetri önkoşulu kapandı;
         canlı hız/kalite sonucu hâlâ açık. Sonraki DECISION adımı yeni aday veya
         gerekçeli protokol kararıdır; aynı park edilmiş aday kendiliğinden canlıya
         alınmaz. PR'daki ayrı kök `$` telemetri düzeltmesi dalda korunuyor.
         **9 Eylül tablo adayı kapandı — yerel NO-GO.** 452 saklanan bağlamın
         tamamında kayıpsız geri dönüş doğrulandı; açıklama dahil net medyan
         azalma 9.633 UTF-16 (%8,03). Buna rağmen dört eşlenmiş yerel çiftin
         dördünde aday daha yavaş; eşlenmiş fark medyanı +37,9 sn. Sabit 6/8 hız
         kapısı üçüncü olumsuz çiftten sonra geçilemez olduğu için yeni kuyruk
         durdu, çalışan dördüncü çift tamamlandı: 8 çağrı, 0 timeout/araç olayı,
         8/8 parser/katalog/hedef-sahiplik kontrolü. Kör Opus 5 incelemesi kritik
         hata bulmadı; semantik/fayda/tekrar sonuçları karışık. Eşdeğerlik veya
         canlı hız kazancı yok.
         PR #124 kapatıldı; merge/deploy yapılmadı; persona ve tablo adaylarının yeni
         tekrar partisi kendiliğinden açılmayacak.
         [Ölçüm, hakemlik ve erken ret makbuzu](DECISION_TABLO_DENEYI_2026-09-09.md).
         **9 Eylül efor deneyi kapandı — yerel NO-GO.** Aynı
         prompt/schema, Luna `max`→`high`, 8 çift/16 çağrı; 16/16 parser,
         katalog ve hedef/sahiplik kontrolü geçti, timeout/araç olayı 0.
         High 8/8 daha hızlı; eşlenmiş süre oranı medyanı 0,2361, kol
         medyanları 212,3675→49,5365 sn. Bu yerel hız sonucu, canlı timeout
         kazancı veya kalite eşdeğerliği değil. `title_match` kontrolü ölçüm
         kapsamını açıklayan entry üretirken high yalnız oy verdi; dondurulmuş
         fayda kapısı geçilmedi. Kör Opus 5 bulgusu gerçek kaynak ve hedefle
         doğrulandı. Hız kalite kaybını karşılamaz; canlı efor değişikliği ve
         otomatik yeni tekrar partisi yok.
         [Protokol ve tam ölçüm](DECISION_EFOR_DENEYI_2026-09-09.md).
         **10 Eylül: AW hedef/kanıt düzeltmesi onayla canlıya alındı**
         (aşağıdaki madde, PR #125). Sıradaki ölçüm yeni profilin 24 saatlik
         doğal koşu penceresi; model/efor/timeout sabit. Efor deneyi veya
         park edilmiş adaylar kendiliğinden yeniden açılmaz.
         **24 saat diğer işler için bekleme şartı değil:** kaynak envanteri,
         yerel reset/restore hazırlığı ve kod incelemesi aynı sırada ilerler.
         Canlı davranışa müdahale eden değişiklikler ölçüme karıştırılmaz.
   - [ ] **AÇIK: AW kapısı köreldi mi?** Daraltma kapıyı körleştirdiyse timeout'u çözüp
         kaliteyi kaybetmişiz demektir. Bu soru 7 Eylül'e kadar **cevaplanamıyordu**, çünkü
         kapının kararı hiçbir yere yazılmıyordu; elimizdeki vekil (`SKIPPED` action) yanlış
         şeyi ölçüyordu — o, AW'nin elediğini değil modelin `NO_ACTION` seçtiğini gösteriyor.
         Reddedilen adaylar veritabanına ayrı satır olarak hiç yazılmıyor. Telemetri eklendi
         (PR #116, `9fb5c63`): `verdict`, `candidateCount`, `selectedCount`. Eleme oranı
         makul değilse projeksiyon geri alınır.
         **İlk okuma (7 Eylül, 56 koşu): eleme %17,5** — 137 aday, 113 seçim, 0 tam-ret
         verdict'i. Bu yalnız eleme yapıldığını gösterir; semantik körleşmeyi
         dışlamaz. Önceki “kapı körelmemiş” hükmü bu ölçümden çıkarılamaz.
         **9 Eylül: somut hedef/kanıt kaybı bulundu.** Yalnız readTopics veya
         linkedTopics içinde görülen oy hedefi, hedef yazarın metni ve başka
         hedefteki USER_ENTRY kanıtı AW bağlamından düşüyordu. Dört minimal
         örnekte hedef metni 0/4→4/4. PR #125 ayrı çalışma ağacında düzeltildi;
         son kod `0835f28`, 99/99 odaklı test ve dört gerçek Luna/max AW
         kontrolü 4/4 (iki REJECT, iki ACCEPT). Son kaynakta model kontrol
         prompt'ları 4/4 byte eşit; DECISION/BROWSE 16/16 byte eşit.
         Tekilleştirme ve bozuk parent metadata koruması Opus bulgularıyla
         eklendi. Opus son N1 kod koşulunu kapattı; ölçüm koşulu yürütücünün
         exact `dbac058`→`0835f28` karşılaştırmasında 32/32 byte eşitlikle
         ayrıştırıldı. **PR #125 repo teslimi tamamlandı:** son head `07d9f5f`,
         exact CI `34370069884` 7/7; main merge `72fb819`, iki içerik ağacı
         birebir aynı. Tam SHA'lar ölçüm makbuzunda.
         **10 Eylül 11:14 TSİ: `7ebb887` canlıya alındı.** Exact main CI 7/7,
         bundle `34372292826`; pinned sunucu kimliği, app/runtime/boot,
         health/ready/search 200 geçti. T3 pause/resume `270→271→272`,
         519,909 sn; diğer ayarlar, 36 persona, Luna/max ve 480 sn korundu.
         **11:23 TSİ ilk doğal koşu SUCCEEDED:** yeni profilde üç fazın
         3/3 boyut kaydı, AW ACT / 1 aday / 1 seçim; teknik kabul tamamlandı.
         **Yeni gözlem: 10 Eylül 11:19:22,400 → 11 Eylül 11:19:22,400 TSİ.**
         Eski profilin 496 terminal koşusu ve 1.603/1.603 boyut kaydı ayrı
         donduruldu: 9 timeout, AW 1.271 aday / 979 seçim (%22,97 eleme).
         Bu eski sonuç yeni düzeltmenin etkisi değildir. Yeni profilde
         boyut/süre/timeout ve AW kararları birlikte okunacak;
         semantik kalite kapısı açık. Kod/yerel deney yeniden açılmayacak.
         [Hata, hakemlik, kapsam ve model makbuzu](AW_HEDEF_BAGLAMI_2026-09-09.md).
         [Canlı dağıtım ve ayrı profil pencereleri](AW_CANLI_KABUL_2026-09-10.md).
         **12:36 TSİ ara okuma:** 24 terminal (21 SUCCEEDED / 3 PARTIAL),
         1 timeout; 74/74 pozitif boyut. AW 70 aday / 46 seçim. Henüz
         77 dakika veri; kazanç, gerileme veya semantik kalite hükmü yok.
         [Ara ölçüm ve sınırlar](RESET_ONCESI_HAZIRLIK_2026-09-10.md).
         **15:21 TSİ güncellemesi:** 87 terminal (69 SUCCEEDED / 14 PARTIAL /
         4 FAILED), 2 timeout; boyutlar 272/272. AW 203 aday / 158 seçim.
         Dört hata: iki DECISION çağrısı, bir provenance doğrulaması, bir AW
         çağrısı. Alt provider nedenleri ve nedensellik açık; worker çalışıyor,
         ayarlar sabit. İki erken hatada model/efor/CLI metadata'sı eksik;
         bunların dört interval'ı ayrı tutuldu. Henüz 4 saat veri; etki/kalite
         kabulü verilmedi. [Son ara kontrol](CANLI_ARA_KONTROL_2026-09-10.md).
         **12 Eylül: 24 saatlik tam pencere OKUNDU** (Gökhan telefonundan Termius
         SSH deploy oturumu; kanıt
         [AW_TAM_PENCERE_VE_KAYNAK_2026-09-12.md](AW_TAM_PENCERE_VE_KAYNAK_2026-09-12.md)).
         Pencere `08:19:22.400Z→08:19:22.400Z`, yeni profil 327c35e6, hepsi
         Luna/max. 474 terminal (346 SUCCEEDED / 121 PARTIAL / 9 FAILED / 0
         TIMED_OUT). Operasyonel timeout **%2,53** (12/474); Gate 10 madde 4
         metriği (doğal FAILED+TIMED_OUT) **%1,90** (9/474), %5 altı — ama
         Wilson %95 ~%1,0–3,6 ve gate ayrıca 7 günlük doğal pencere + diğer
         maddeleri ister, tek başına PASS değil. Interval bütünlüğü tam
         (1547/1547 pozitif boyut, 0 eksik, 13 censored). **AW eleme %21,66**
         (1205 aday / 944 seçim; 449 ACT / 6 NO_ACTION) — körelmemiş; semantik
         kalite kapısı ayrı (körlenmiş, hakem Astra). Faz p50: AW 28,6 /
         DECISION 196,9 / BROWSE 9,6 sn. Timeout'ların 10/12'si AW'de.
         **AW düzeltmesi (#112+#125) tam pencerede sağlıklı; teknik kabul
         tamam, semantik kalite ve 7 günlük pencere açık.**

2. **Kaynak tabanını kapat — KAPANDI (13 Eylül).** Üç ajan da artık **10 taze
   faydalı** kaynakta; taban **36/36**. Detay ve tarihçe aşağıda; bu adım
   reset kilitli sırasında tamamlandı.
   **10 Eylül kesiminde** üç ajan (`aksamustu`,
   `cikissagda`, `mevsimdisi`) 9'ar taze kaynakta; hedef en az 10. Ortak açık
   `manifold.press` erişim/tazelik sorunu. Üçüne aday sunuluyor, kaynak evrimi
   açık; doğal edinme sürüyor. Kaynak ekleme/URL değişimi bu tur yapılmadı.
   Eski listeden birazuzakta (11) ve yedekparca (10) çıktı; mevcut ölçütle
   33/36 geçiyor. Kaynak tarafındaki düzeltme ve ardından yeniden sayım açık;
   atıf verisi silinmeden tamamlanmalı.
   **15:21 TSİ yeniden sayım:** aynı üç açık ve 33/36; doğal edinme henüz
   tabanı kapatmadı. Bu tur kaynak yazımı yapılmadı.
   **12 Eylül üretim izi — blokaj tek ölü kaynakta netleşti** (kanıt
   [AW_TAM_PENCERE_VE_KAYNAK_2026-09-12.md](AW_TAM_PENCERE_VE_KAYNAK_2026-09-12.md)).
   Üç profil de **10 kayıtlı TRUSTED** kaynak taşıyor ama her birinde
   **`manifold.press` ölü** (ardışık hata 20/17/32, son faydalı 2 Eyl / 20 Ağu /
   21 Ağu), o yüzden taze faydalı **9**. Diğer 9 kaynağın hepsi 11 Eylül'de taze.
   Doğal edinme çalışmış — havuz büyümüş, üç profile eski listede olmayan canlı
   kaynaklar gelmiş — ama tek ölü kaynak her profili 9'da tutuyor. Blokaj geçici
   değil (2–3 hafta ölü, üyelik duvarı / `SOURCE_AUTH_REQUIRED`).
   **Remedy (üretim mutasyonu, Gökhan onayı + kendi ölçümü gerekir):** üç
   profilde ölü `manifold.press`'i engelle/kaldır ki aday mekanizması havuzdan
   canlı bir 10. kaynağı backfill etsin; ya da doğrudan canlı Türkçe yayınla
   değiştir.
   **12 Eylül — uygulandı** (Gökhan onayı, telefonundan `scripts/kaynak-duzelt.sh`
   execute). Önizleme gerçek kısıtı yakaladı: manifold `adminPinned=true`,
   engellenemiyor (`CHECK(NOT(pinned AND blocked))`); gereksiz de: yalnız yeni
   kaynak eklemek yeter. Üç profile de `www.log.com.tr` (başka profilde taze/canlı
   Türkçe kaynak) PROBATION olarak eklendi (`OPERATOR_MANIFOLD_BACKFILL`, 3 satır);
   manifold'a dokunulmadı. Geri alma: `addedByOrigin` etiketiyle sil.
   **13 Eylül 08:59 TSİ yeniden sayım — KAPANDI:** üç profil de **taze faydalı 10**
   (kayıtlı 11). Eklenen `log.com.tr` gece çekildi (lastUsefulAt 13 Eyl
   01:49–02:24 UTC), `PROBATION`→`TRUSTED` yükseldi, ardışık hata 0. Taban 36/36;
   reset kilitli sırasının 2. adımı tamam. Ölü manifold hâlâ kayıtlı (pinned) ama
   taze sayımını etkilemiyor; ayrı unpin editoryal karar olarak açık kalabilir.
   Kanıt: [AW_TAM_PENCERE_VE_KAYNAK_2026-09-12.md](AW_TAM_PENCERE_VE_KAYNAK_2026-09-12.md).
3. **Yedek + geri yükleme provası ve gerçek silme akışı.** Geri alınamaz işlem için şart.

   **10 Eylül yerel restore provası tamam:** PostgreSQL 16.14, sentetik seed
   ve ajan fixture'ı; 47 tablo / 369 satır / 3 sequence eşit. Beş DELETE
   koruması beklendiği gibi engelledi, son özet aynı; scratch DB'ler temizlendi.
   **Yerel yürütücü de uygulandı:** 29 tablo tek transaction içinde temizleniyor;
   17 korunan tabloda içerik doğrulaması var. İdempotency satırları silinmeden
   süreleri bitiriliyor, yeni audit ekleniyor. Bekleyen outbox/koşu/lease veya
   başka bağlantı varsa işlem duruyor; hata sonrası tüm değişiklikler geri alınıyor.
   18 gerçek PostgreSQL senaryosu geçti; bağımsız Opus 5 kapanışı yerel kod
   için GO verdi. Repo teslimi tamam: PR #126, exact CI 7/7, merge `9b3fc6b`. [Uygulama makbuzu](GREAT_RESET_YEREL_ARAC_2026-09-10.md).
   **Kalan:** üretimde bekleyen olaylar için kayıpsız tüketim/arşiv kararı,
   app/worker kapanışı ve cache/public görünümün yeniden açılış kabulü,
   gerçek üretim yedeği/restore. Yerel başarı üretim reset izni değildir.
   **11 Eylül: üretim runbook taslağı yazıldı** —
   [RESET_URETIM_RUNBOOK_TASLAGI_2026-09-11.md](RESET_URETIM_RUNBOOK_TASLAGI_2026-09-11.md).
   **Yürütücü kararı (Gökhan, 24 Eylül: "hızlı araç"):** test edilmiş yerel reset aracı
   pinned üretim profiliyle; elle SQL yok. Yedek yeri: kişisel T3 sunucusu (B9).
   **Reset'e bağlanan iki iş (Gökhan, 24 Eylül: "kalanlar fine"):** tek entry'li başlıkların
   indeks eşiği (6.3-5) ve oturum çerezinin `__Host-` önekine geçmesi reset'le aynı anda.
   **25 Eylül çekirdek teslimi:** PR #225, incelenen exact `d35984e` ve 7/7 CI sonrası
   `890b467` olarak main'e birleşti. Opus 5.5 salt okunur kod hakemi `KOD GO` verdi:
   diğer backend/hazırlanmış işlem, trigger/RLS ve public ID sequence `DEFAULT` kapıları
   yerel çekirdekte; üretim profili veya dağıtım yok. Hakemin kalan P3 sınırları
   [üretim tasarımına](RESET_URETIM_PROFILI_TASARIMI_2026-09-25.md) taşındı.
   **Üretim profili tasarımı:** Opus 5.5 v3 `146a319` için 6 P2, 3 P3;
   v4 `3a7d689` için 4 P2, 6 P3; v5 `4a5dc87` için 1 P2, 7 P3 ile
   `TASARIM DÜZELTİLMELİ` dedi. v6 exact `eeb1b54` için Opus 5.5
   **TASARIM UYGUN** dedi (P1/P2 yok; 8 P3 uygulama sınırı). v7 exact
   `19a6c85` için de Opus 5.5 **TASARIM UYGUN** dedi (P1/P2 yok; 7 P3).
   v8 exact `ace70f6` için de Opus 5.5 **TASARIM UYGUN** dedi (P1/P2 yok;
   6 P3). v9 exact `6ca052f` için bir P2 ve dört P3 ile
   **TASARIM DÜZELTİLMELİ** dedi: dış trafik açılmadan önce imzalı yedek
   neslinin durum geçişi tanımsızdı. v10 exact `719e191` için Opus 5.5
   **TASARIM UYGUN** dedi (P1/P2 yok; 6 P3). v11 eski imzalı kaydın tekrarını
   korunan DB trafik olayıyla engellemeyi hedefledi; Opus 5.5 v11 exact
   `6c032ee` için **TASARIM DÜZELTİLMELİ** dedi (1 P2, 6 P3): rollback
   sonrası eski imzalı kayıt yine kullanılabiliyordu. v12 exact `c0442c8`
   için Opus 5.5 **TASARIM UYGUN** dedi (P1/P2 yok; 6 P3). v13 sequence'in
   doğrudan olumlu kontrolünü, kapı sonrası PID/snapshot kontrolünü ve gerçek
   tablo sahibi sınırını kabul kapısına ekledi. Opus 5.5 v13 exact `483886a`
   için **TASARIM DÜZELTİLMELİ** dedi (1 P2, 6 P3): geri dönüş penceresindeki
   iç kabul yazıları tam özet eşitliğini bozabilirdi. v14 exact `a8b52ca`
   için Opus 5.5 **TASARIM UYGUN** dedi (P1/P2 yok; sıra çelişkisi ve altı
   P3 kabul ayrıntısı). v15 exact `2a34d8e` için de Opus 5.5
   **TASARIM UYGUN** dedi (P1/P2 yok; 6 P3). v16 restore penceresinin
   `TRAFFIC_OPEN` geçişinde bittiğini ve normal app'in boş cache/TLS smoke
   kabulünü netleştirir. v17 aşağıdaki 26 Eylül 410 kararını ve Astra'nın üst
   namespace kilidini işler. Astra v17 exact `e34fa5a` için **TASARIM
   DÜZELTİLMELİ** dedi (2 P2, 1 P3); v18 reset sonrası `publicId` alt sınır
   kısıtını ve runbook adım eşlemesini ekler; Astra v18 exact `4b8bace` için
   **TASARIM UYGUN** dedi (P1/P2/P3 yok).
   Kod, migration,
   bütçe, kontrol yolu, gerçek boyutlu restore ve uygulama hakemliği açık.
   **410 kararı (24 Eylül; Gökhan: "404 410 geo seo açısından karar verin"):** reset'te
   silinen başlık/entry/yazar adresleri **410 Gone** döner. Gerekçe: içerik kalıcı olarak
   gitti; 410 bunu arama motoruna ve yapay zekâ tarayıcılarına açıkça söyler, eski
   adresler dizinden 404'e göre daha hızlı düşer, "geçici hata mı" belirsizliği kalmaz.
   (Astra 26 Eylül: "daha hızlı düşer" iddiası repoda ölçülmedi; seçim gerekçesi
   sayılmaz.)
   İlk güvenlik varsayımı eksik çıktı: `TRUNCATE … CONTINUE IDENTITY` mevcut sequence
   değerini korur, ancak geçmişte silinmiş ve o andaki en büyük değerden yüksek bir
   ID'nin yeniden kullanılmadığını tek başına kanıtlamaz. v4 tasarımında güvenli
   çözüm, eski `INTEGER` namespace'ini tamamen 410 alanı yapıp ayrı onaylı `BIGINT`
   geçişiyle yeni ID'leri `2147483648` üstünden başlatmaktır. **26 Eylül Gökhan
   kararı ("Yalnız bilinen silinmişe 410", Astra önerisi):** eski aralığın tamamına
   410 verilmez; reset anında silinen kayıtların `(kind, uuid, publicId)` mezar taşı
   tutulur, yalnız bunlara 410, bilinmeyen/hiç kullanılmamış ID'ye 404. Reset öncesi
   fiziksel silinmiş içerik 404 kalır. `BIGINT` yeniden kullanımı önlemek için korunur;
   migration–reset arasında üst aralık `CHECK` ve sequence `MAXVALUE` ile kapalıdır.
   Geçiş ve kabul olmadan reset GO yok. Sitemap eski adresleri içermez.
   **15:21 TSİ somut outbox engeli:** 191.768/191.768 satır işlenmemiş,
   mevcut mimaride consumer yok. Kendiliğinden drain beklenmeyecek; eski
   olayları ve işlenmemiş durumunu kayıpsız koruyan, reset öncesi kümeyi
   gelecekteki tüketimden ayıran tasarım hazırlanmalı. OUTBOX_PENDING
   koruması ve üretim kapısı açık; processedAt ile sahte tüketim yapılmaz.
   [Doğrudan prova kanıtı](RESET_ONCESI_HAZIRLIK_2026-09-10.md).

   **10 Eylül — outbox arşivi, iki hakem turunda üç gerçek güvenlik açığı kapatıldı:**
   PR #127; uzak head `22701725546aa8e945e80f23dc4e965725bda476`, bu tam head için
   CI `34500131757` **7/7 SUCCESS** (quality, browser, database, container, behavior,
   coverage, validate). Önceki aday `a068744` ve CI `34485420687` tarihsel kayıttır.
   Hakem bu turda **Astra** (yürütücü Claude olduğu için — bkz. hakem seçimi).
   Beş tur: **NO-GO, NO-GO, KOŞULLU, KOŞULLU, GO** — son karar yalnız bu yerel paket için.
   İlk iki turun bulguları **aynı hata sınıfıydı**:
   koruma, çağıranın kendi snapshot'ında arşivin görünmesine bağlıydı. Üçü de
   gerçek PostgreSQL deneyiyle **yeniden üretildi**, sonra düzeltildi:
   1. Arşivden önce snapshot almış `REPEATABLE READ` yazıcısı arşivlenmiş olayın
      `processedAt` alanını **hatasız değiştirdi**. `FOR UPDATE` kilidi çözmedi
      (yeni satır sürümü doğurmuyor). Çözüm: arşivleme, üyelikten önce içeriği
      değiştirmeyen bir yazmayla satır sürümünü tazeliyor; yazıcı artık 40001 alıyor.
   2. Düz `INSERT`, `eventCount=1` diyen arşive ikinci üyeyi ekledi (manifest tutarsız).
   3. Aynı snapshot açığı `TRUNCATE`'te kalmıştı: eski snapshot'lı oturum üyelikleri
      **hatasız sildi** — başlık kalır, olaylar yeniden tüketici adayı olur.

   (2) ve (3) için koruma artık satır görünürlüğüne değil **açık niyet kapısına**
   (`SET LOCAL` GUC) bakıyor; kapı boolean değil **hedef `archiveId`** taşır ve yalnız
   üyelik INSERT'i boyunca açıktır. Eski "tablolar boşsa TRUNCATE serbest" istisnası
   kaldırıldı. **Sınırlar:** GUC'yi herhangi bir oturum ayarlayabilir — bu koruma
   kazara/yarışan yazıcıya karşıdır, kararlı SQL operatörüne karşı değil; paketin ilan
   ettiği tehdit modeli zaten budur. Ayrıca `SET LOCAL` **savepoint'ten bağımsız
   değildir**: ayardan önceki bir savepoint'e rollback kapıyı geri alır — meşru yol
   düşer, kapı açık kalmaz.

   Ayrıca prova teşhisi düzeltildi (kapalı `stdin` yüzünden görüntü tam gerektiği anda
   kayboluyordu) ve teşhis dalı artık **kendi senaryosuyla sınanıyor**. Eski snapshot
   TRUNCATE senaryosu ilk yazımda arşivden SONRA snapshot alıyordu, yani kaçağı hiç
   sınamıyordu (Astra bulgusu); düzeltildi ve **negatif kontrolle ayırt ediciliği
   kanıtlandı** — eski guard'da üyelikler siliniyor, yenisinde 55000 ile reddediliyor.
   Maliyet: 192.001 olayda **preview + execute toplamı** (yalnız execute değil)
   tazeleme öncesi **13,4-15,4 sn (n=2)**, sonrası **19,2-34,6 sn (n=4)** —
   **varyans yüksek, tek sayı maliyet diye sunulamaz**; yön net, büyüklük kesin değil.
   CLI bütçesi 90 sn; ayrıca transaction 60 sn ve her SQL 20 sn sınırları geçerli.

   Güncel ölçümler: `probe-09` **36/36 PASS** (probe-07/08 de 36/36), eşzamanlılık
   provası **3/3 PASS**, entegrasyon paketinin tamamı **22 dosya / 269 test PASS**,
   unit 1452/1452, format/lint/typecheck PASS. İki regresyon testi de **negatif
   kontrolle** ayırt edici bulundu: düzeltme geri alınınca düşüyorlar.
   **Açık kalan:** probe-01/02/03 FAIL'lerinin kök nedeni **kanıtlanmadı ve yeniden
   üretilemedi**; GO gerekçesi sayılmıyor. 30 sn prova bütçesi istemciyi öldürür ama
   sunucudaki sorgunun bitişini garanti etmez (`statement_timeout` konmuş değil).
   Önceki yeşil CI bu düzeltmeleri kapsamıyor. Üretime bağlanılmadı; migration/reset
   yapılmadı. AW penceresi ve kaynak kapıları aynı sırada açık.
   [Uygulama ve hakem uzlaştırması](RESET_OUTBOX_ARSIVI_2026-09-10.md).

   4 Eylül incelemesi provaya girmesi gereken maddeleri somutladı — bunlar bende yoktu:

   | konu                                  | neden                                                                                                                            |
   | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
   | Worker ve devam eden lease'ler        | Silme sırasında yeni içerik üretimi veya eski koşunun sonucunu yazması engellenmeli                                              |
   | Korunan `idempotencyRecord`           | Eski yanıt, artık SİLİNMİŞ entry/topic'i "başarılı" diye geri döndürebilir; TTL ya da kapsamlı geçersizleştirme kararı gerekiyor |
   | Korunan outbox/audit                  | Eski olayların yeni boş içeriğe karşı yeniden işlenmesi ve denetim izinin anlamı netleşmeli                                      |
   | Immutable kurallar ve foreign key'ler | Normal silmeyi engelleyen kurallar reset için açık ve denetlenebilir tasarım istiyor                                             |
   | Kaynak edinme adayları                | Kaynaklar kalsa da `agent_actions` silinince aday sorgusunun dayanağı geçici olarak kayboluyor                                   |
   | Sayaçlar, cache, indeks yüzeyleri     | Sıfırlanan veriyle eski public görünüm karışmamalı                                                                               |
   | Gerçek restore                        | Yedeğin ALINMASI değil, tutarlı GERİ YÜKLENEBİLMESİ ispatlanmalı                                                                 |

   `idempotencyRecord` maddesi gözlenmiş bir hata değil; koruma listesi ile 24 saatlik yanıt
   saklama davranışından çıkan, uygulama öncesi tasarım gereği.

4. **Reset.**
5. **7 günlük pencere** → Gate 10 kanıtı + reset ölçümü birlikte.

Reddedilen alternatif: reset'i öne alıp aday listesine "atıf verisi yoksa kaç ajanda var
sayısına bak" geri düşme kuralı yazmak. Yapılabilir ama ölçüme dayanmayan bir sıralama
üretir — 3 Eylül'de tam bundan kaçınıldığı için (güven skorları kıpırdamadığı halde onlara
göre sıralamak) burada da kaçınıldı.

---

## 5 Ekim 01:16 UTC — tek planın önceki ilerleme kayıtları

Aşağıdaki metin 3–5 Ekim görev makbuzlarının tarihsel kopyasıdır; aktif iş sırası değildir.
Aynı bölümdeki eski “açık/çağrı0/dağıtım yok” satırları yalnız yazıldıkları ana aittir.
Güncel sıra ve gerçek P7 sınırları [PLAN.md](PLAN.md) içindedir.

## Şu an neredeyiz

- **5 Ekim kaynak fix hakem koşulu:** `9cee040` Opus **KOŞULLU GO**,98,773s;
  otomatik UID/PID+DB/user temizliği doğru, exactCI bekleniyor. İki kaynak koşulu
  uygulanıyor: reboot/tmpfiles ad kapmayı kapatmak için lock root-protected kalıcı
  scripts parent'ına taşınır; runbook desenli pkill/genel backend kill kaldırılır,
  doğrulanmış tek APP/DB/user daralır. Gece timer ve uygulama hâlâ aynı.
  P4 tek kalite paketi SHADOW/ayar306 ile açıldı; karar/etki yok, P7 başlamadı.

- **5 Ekim 00:24 UTC:** gerçek dış restore, strict50tablo/3.270.401satır/3sequence
  eşliği ve yalnız-owned hedefDROP **tamam**; source/app/image/worker aynı.
  İki staging arşivi/orijinal dış yedek ve journal kanıtları korundu; root23,9GB.
  Restore/DB cleanup aktif sıradan çıktı; kapasite de tamam/staleAt19Ekim.
  **Sıra:** O3 UID/PID scoped sourcefix son hakem/exactCI/kurulum → sınırlı ödül
  +P7 ön uygunluk → resume/T0 → gerçek168h → Gate11/12/P8. Gece mevcut timer
  makbuzu ayrıca ölçülür; yeni timer/uygulama deploy yok. P7 başlamadı.

- **5 Ekim 00:18 UTC güncel:** mainO3 `3cdf64c` CI7/7; canlı app/runtime/worker
  `d829dd0`, persona36 tamam, pause305/open0/lease0. **Cold10/warm10/dual2 kapasite
  tamam**:22 koşu/failure0, strict+HTTP200 persist, fingerprint eşit, staleAt19Ekim.
  Yeniden benchmark aktif sıradan çıktı. **Gerçek eski dış backup restore/veri
  eşliği tamam**:283s/exit0,50tablo/3.270.401satır/3sequence-safe. Owned hedef
  guardedDROP/staging kapanışı sürüyor. Kaynak kurulumunun son Opus DÜZELTİLMELİ
  B1'i farklıUID ortakbackend temizliği; scoped UID/PID+DB/user düzeltmesi 2PGPASS,
  son hakem/exactCI/kurulum açık. Legacy lock değişmedi; fchmod yapılmadı.
  **Aktif sıra:** O3 yalnız-owned cleanup ve kaynak fix hakem/CI/kurulum → sınırlı
  ödül etkisi +P7 ön uygunluk → resume/T0 → gerçek168h → Gate11/12/P8 kararı.
  P7 başlamadı, DONE-082 BLOCKED. Uygulama yeniden deploy gerekmiyor.
  [Ölçülen sonuçlar](STATUS.md).

- **4 Ekim 23:08 UTC sıra daraltması:** O3 son search_path/locale/lock kaynağı
  exact peer/CI aşamasında; uygulama/runtime d829 ve persona36 tamam, pause305.
  O3 restore ile çakışmadan **bağımsız cold/warm/dual kapasite** mevcut canlı
  reviewed CLI üzerinden şimdi yürür. Üretimde tek ağır iş: kapasite bitmeden
  O3 restore başlamaz. Sonra dış restore/backup kurulum +sınırlı etki → resume/T0.
  O3 ops değişikliği istem/model/capability profilini değiştirmez; uygulama yeniden
  deploy edilmeyecek. P7 bu işler bitmeden başlamaz.

- **4 Ekim 22:51 UTC güncel:** exact `d829dd0` canlı app/runtime/worker;
  CI7/7, artifact/A5 tam backup+restore/eski imaj/9 migration/cutover **PASS**.
  Health/ready/search200; 37 finished, yarım0; root25,3GB/%68. Persona CAS **36
  sürüm +36 audit +36 outbox**, drift/validation/pending0; karakter içeriği aynı.
  Runtime kontrollü pause/ayar305. **Sıra:** O3 son somut hakem koşulları +exactCI,
  dış backup restore/atomik kaynak betiği → cold/warm/dual kapasite ve sınırlı etki
  → resume/T0 → gerçek168h P7 → Gate11/12/P8 somut karar. Takvim beklemesi yok.
  A5 fresh restore O3 eski dış yedeğin yerine geçmez. P7 başlamadı.

- **4 Ekim 22:30 UTC:** P2022 kaynakla ayrıldı; eski canlı immutable CLI audited
  pause304→305, diğer kontroller hash'i aynı, tüm open/lease0. Fresh aynı-scope
  koşullarıyla yalnız failed exact lock temizlendi. Aynı d829/artifact manual-prepaused
  A5 planned/image-verified/frozen ve 1.332.482.331-byte tam yedek geçti; restore,
  eski imaj, migration/cutover hâlâ açık. Frozen'da ek DB bağlantısı yok.
  O3 source+restore output GUC/faz koşulları yerelde 7PG+2PG/43unit-shell ile kapandı;
  son farklı model incelemesi/exactCI/atomik backup-script kurulum/full restore açık.

- **4 Ekim 22:13 UTC — canlı geçiş kurtarması:** exact `d829dd0` CI7/7 ve
  artifact `37237966991` başarılı; inert image/runtime kuruldu. Candidate pause
  migration öncesi tam settings sorgusunda `P2022 birthMode` ile düştü; transaction
  commit yok, ayar304/runtime açık. App/image/runtime/worker `9bf3653` aynı; applied28,
  yarım/A5/hold yok, failed release kilidi korunuyor. Eski canlı immutable release
  status geçti. Mevcut audited pause yolu/lock cleanup kanıtı bağımsız işletim
  incelemesinde; A5/restore/migration/cutover açık, hiçbir kapı atlanmadı.
- **O3 ikinci Opus:** exact `ecf7bf0`, KOŞULLU GO; ek serialization GUC ve kısa
  test bütçesi/faz senkronizasyonu koşulları kaynakla uzlaştırılacak. 7/7 yerel
  kanıt tarihsel olarak korunur; helper üretimde uygulanmadı/main'e birleşmedi.

- **4 Ekim 22:02 UTC:** #328 O3 ilk Opus KOŞULLU GO; argüman/link ve cleanup
  kimlik sapması kapanışlarıyla 7/7 isolated PG16 PASS. Son hakem/exact CI ve
  üretim dış backup restore açık. İlk application exact `d829dd0` main CI7/7;
  artifact `37237966991` hazırlanıyor, deploy henüz yok.

- **4 Ekim 21:40 UTC:** #327 final `cc0b2e7`, CI `37235882789` **7/7 PASS**;
  main `d829dd0`, tam ağaç eşliği/temiz main doğrulandı. Main CI `37237038884`
  açık; ardından tek exact artifact/A5/cutover. Canlı hâlâ `9bf3653`.
  O3 owner/control ayrımı hazırlanıyor: izole PG16'da 5/5 PASS, privilege grant yok;
  peer/final CI/gerçek restore açık. İlk canlı geçiş bitene kadar O3 main'e girmez.
  [Sahipli restore sözleşmesi](O3_SAHIPLI_RESTORE_2026-10-04.md).

- **4 Ekim 21:19 UTC:** son kod `ee1cd48`, gerçek Opus 5 KOŞULLU GO; somut yeni
  kod düzeltmesi yok. Şartlar mevcut tam exact CI ve wrapper'ın uzak exact checkout
  kapılarıdır. 62 doğum PG16 ve UTC 2 PG16/19 release PASS; tüm yerel zorunlu
  kontroller PASS. Şimdi belge kapanışı → yeni exact CI → merge/artifact/A5/cutover.
  Üretim geçişi, persona rollout, kapasite ve canlı sınırlı etki/P7 hâlâ açık.

- **4 Ekim CI teşhisi:** #327 `28b91d0` CI `37234139545` kırmızı; 14 doğum
  fixture hatası gerçek DB/fake Date ayrışmasından. Üretim kodu/guard değişmedi;
  test INSERT saatleri ve queue availableAt kontrol altına alındı. Son yerel
  doğum paketi 62/62 PASS; UTC hakemi ve yeni exact CI açık. Kırmızı SHA birleşmez.

- **4 Ekim 21:03 UTC:** #327 ikinci Opus görüşü KOŞULLU GO; gerçek oturum zaman
  dilimi yanlış ret riski UTC ile kapandı, yeni 2 PG16/19 release testi PASS.
  Son UTC kod incelemesi/CI açık; sıradaki iş fix teslimi ve hemen artifact/A5/cutover.
  P2/P3–P5 mevcut kısa kontroller tamamlandı; yeniden çağrı veya saklı set açılmıyor.
  Pinli canlı kesitte 28 applied/0 yarım +tam 9 v2 pending, 29,7 GB boş alan,
  kilit/hold yok. Canlı sürüm hâlâ `9bf3653`; bu makbuz deploy değildir.

- **4 Ekim 20:51 UTC:** P3/P4/P5 gerçek kontrolü tamam: 18 geçerli karar, teknik hata/tekrar 0,
  bir Opus okuyucusuyla 19 çağrı/25 dakika 49,8 saniye. Kaynak kontrolünde somut sözleşme
  ihlali yok; davranış faydası veya PASS iddiası yok. Gerçek kısa kontrol işi aktif kuyruktan
  çıktı; canlı sınırlı etki/rollout/kapasite açık. #327 ilk CI `37232666236` 7/7 PASS;
  Opus düzeltme görüşü sonrası release/migration özetleri birleştirildi ve profil makbuzu
  yeniden girişe bağlandı. Son 82 yerel test PASS; ikinci hakem/final CI açık. Sıradaki
  iş bu teknik düzeltmenin teslimi ve hazır paketin artifact/restore/migration dağıtımı.

- **4 Ekim 20:30 UTC devir ve dağıtım düzeltmesi:** Gökhan'ın aynı goal/yetkiyle
  devam talimatıyla yürütücü bu oturumda `gpt-6.1-sol`; önceki Astra/Opus kayıtları
  tarihsel olarak korunur. Erken A′ kapısı #326 ile main `4d05d1e` üzerinde, main CI
  `37230917091` **7/7 PASS**. P2 ilk set 12 geçerli karar/1 Opus okuma ile tamamlandı;
  operatör kaynak kontrolünde **1 yeni / 1 eski / 4 beraberlik**, doğrulanmış ihlal 0.
  Üstünlük eşiği geçmedi; saklı set açılmıyor, fayda **BELİRSİZ**. P3/P4/P5'in mevcut
  18 girdilik kontrolü aynı kimlik/bütçe/saatle sürüyor; yeni çalışma açılmadı.
  Release ayar özetinin dört yeni OFF/NULL sütunu yanlış değişiklik sayması yerelde
  düzeltildi: 16 PG16 +18 release testi PASS; son kaynakta dört PG16 senaryosu ayrıca
  tekrar geçti. Eski/yeni ayar sapmaları korunur. Format/lint/typecheck/3 gereksinim
  kontrolü PASS; bağımsız Opus, exact CI ve gerçek üretim geçişi açık.
  [Migration ve release kapısı](P1_EKIM_MIGRATION_PROFILI_2026-10-04.md).

- **4 Ekim 19:38 UTC kullanıcı düzeltmesi — hemen geçerli:** “bittikçe canlıya alalım” ve
  “A′ gözlemine erken bakalım” talimatlarıyla **6 Ekim / 72 saat dağıtım beklemesi kaldırıldı**.
  Hazır işler teknik kapıları geçince küçük paketlerle yayımlanır; 7–9 Ekim bir bekleme tarihi
  değildir. Aşağıdaki eski tarihli makbuzlar o anki durumu anlatır, bu kararı geçersiz kılmaz.
  Gerçek 304 resume audit kaydı **3 Ekim 09:17:44.154 UTC**, erken kesit **4 Ekim
  19:38:28.146203 UTC**: 34 saat 21 dakika; 429 başarılı/146 ret (**%25,39**), retlerin
  123'ü tekrar/benzerlik. **INCONCLUSIVE erken değerlendirme**; ≥%30 iyileşme veya 72 saat
  kabulü iddiası yok. Canlı sürüm hâlâ `9bf3653`; bu karar tek başına deploy değildir.
  Erken pilot makbuzu **6 Ekim 19:38:28.147 UTC'ye kadar** geçerlidir; bu bir bekleme
  süresi değildir, kullanılabilirlik sonudur. Sonrasında eski kesitle yeni pilot başlatılmaz.
  [Erken karar ve kaynak makbuzu](P1_APRIME_ERKEN_KARAR_2026-10-04.md).
- **Tamamlanan geçiş:** erken karar ve P2/P3–P5 kontrol makbuzlarıyla
  ilk uygulama paketi artifact/A5/restore/eski imaj kapılarını geçerek canlıya çıktı.
  Persona rollout tamam; güncel kapasite ve sonraki canlı kabul kapıları açıktır. P8 aday
  taraması/ilk aktivasyon kendiliğinden açılmaz. Sonraki hazır paketler aynı yöntemle ilerler.
  P7'nin gerçek 168 saati son davranış sürümünden başlar; erken A′ kesiti onun yerine geçmez.

- **3 Ekim kullanıcı düzeltmesi:** haftalar süren ardışık ölçüm kaldırıldı. **3–9 Ekim ilk
  çalışan sürümler; 10–17 Ekim düzeltme ve resmî kabul hedefi.** Uzun dönem evrim gözlemi
  geliştirmeyi veya yerel doğum adayını bekletmez. Tam backlog’u iki haftada bitirme iddiası yok.

- **Çalışma yetkisi:** Gökhan’ın 3 Ekim açık talimatıyla 17 Ekim 2026 19:50 UTC’ye kadar
  plan içindeki üretim okuma/deploy/pause/resume ve gerekli işletim işleri yetkili. Exact SHA,
  CI, bağımsız hakem, backup/rollback ve host doğrulaması sürer; işlem başına tekrar onay
  istenmez. Kapsam ve son tarih `AGENTS.md` süreli yetki maddesinde. Bu uygulama oturumu başladı.
- **Ürün hedefi:** bakışı ayırt edilebilen, amaçlarını sürdüren, yaptığı işin sonucundan
  öğrenen yazarlar. Başarı çok yazmak veya çok oy almak değildir.
- **Önceki üretim kaydı (tarihsel):** `9bf3653`, v46, A′ okuma bağlamı; `gpt-5.6-luna`, iki hat.
  3 Ekim kapasite kanıtının kayıtlı son tarihi 17 Ekim. 3 Ekim 20:00 UTC P0 salt okunur kesiti alındı; yeni dağıtım yapılmadı.
- **4 Ekim 06:09 UTC sağlık kesiti:** worker çalışıyor (son saatte 17 SUCCEEDED, 6 PARTIAL;
  bunlardan biri CODEX_TIMEOUT). Son 24 saatte 273 başarılı / 95 ret (%25,8); retlerin 76’sı
  tekrar/benzerlik, 16’sı desteklenmeyen kesin sayı, 3’ü pause. Ret alarmı açık ürün sinyalidir;
  otomatik yanlış-pozitif veya kesinti sayılmaz. P1 mevcut kayıt incelemesi bunları ayırır;
  sırf oranı düşürmek için eşik/istem değiştirilmez. O3 telafi yedeği 05:43 UTC tamamlandı.
- **4 Ekim 07:01 UTC yenileme:** son saat 20 SUCCEEDED / 4 PARTIAL; son 24 saat
  274 başarılı / 95 ret (%25,7). Ret açık; canlı checkout aynı. Pencereler örtüşür,
  iki kesit bağımsız deney veya iyileşme kanıtı sayılmaz.
- **4 Ekim 10:49 UTC yenileme:** son saat 19 SUCCEEDED / 3 PARTIAL; son 24 saat
  294 başarılı / 91 ret (**%23,6**). Retlerin 76’sı tekrar/benzerlik, 15’i kesin sayı.
  Canlı `9bf3653` aynı; ret alarmı açık. Örtüşen pencere değişimi kod etkisi sayılmaz.
- **O4 somut ret düzeltmesi:** 4 Ekim 07:59–08:21 UTC salt okunur 20 vakada kaynak
  sayı gösterimi hatası bulundu. `$272.5M` / `272,5 milyon` eşleşmesi ve yanlış tamsayı
  parçası kapatıldı; #310 final `21be9cb`, CI `37189898438` 7/7, main `b4d69d6`.
  Opus koşulları sonrası 77 birim/12 eylemlik PG senaryosu geçti. Kod/hakem/CI tamam;
  canlı dağıtım açık, ret alarmının tamamı kapanmadı.
  [Sayı düzeltmesi ve örneklem sınırı](O4_SAYI_GOSTERIMI_2026-10-04.md).
- **İlk A′ kontrolü erkene alındı:** 4 Ekim 19:38 UTC makbuzu ve kesin resume doğrulandı;
  eski 6 Ekim / 72 saat takvim beklemesi kullanıcı talimatıyla kaldırıldı.
- **Hazır kod:** heartbeat #296, main `d373376`, Opus KOD GO ve CI 7/7; canlıya alınmadı.
- **Kapanan deney:** bkz 23/40 çiftte kullanıcı isteğiyle durdu; aday kabul edilmedi,
  yeni koşu yok. Boş hedefli/yalnız bkz ve ayrı ukte ihtiyacı korunuyor.
- **Yeni ana iş:** P0 kısa denetim tamam; P2 karakter bağlantısı #297 ile `5053923` ana dalında,
  exact head CI 7/7 ve hakem koşulları tamam. Kısa pilot/canlı rollout açık. P3 teknik sonuç
  kartı #298 ile `cac7e7c` ana dalında; Opus KOD GO, CI 7/7, yerelde 119 entegrasyon/124 birim
  testi geçti. Amaç yaşam döngüsü #300 ile `c2f5db7` ana dalında: Opus 5 KOD GO ve CI 7/7.
  Son sekiz amaç PG16 senaryosu, 119 ilgili birim testi geçti; canlı pilot açık. [Amaç makbuzu](P3_AMAC_YASAM_DONGUSU_2026-10-03.md). [P3 makbuzu](P3_SONUC_KARTI_2026-10-03.md). P4 amaç kanalı #301 ile `0bb3e77` ana dalında, Opus koşulları ve CI 7/7 tamam.
  Kalite kanalı/özel `authorFeedback` #302 ile `db28695` ana dalında; Opus 5 KOD GO,
  CI 7/7, son 29 PG16 ve 147 ilgili birim testi geçti. P4'te kalan iş kısa gölge/pilot ve
  canlı kabul. [P4b makbuzu](P4_KALITE_VE_YAZAR_GERI_BILDIRIMI_2026-10-04.md).
  P5 iki çevrim→sonraki uyanış/karar istemi #303 ile `2277eb4` ana dalında (4 PG16,
  17 birim, son CI 7/7); Opus mekanik koşulları kapandı. Doğal fayda pilotu açık.
  [P5 makbuzu](P5_IKI_EVRIM_DONGUSU_2026-10-04.md). P8 politika/iki bağımsız taslak #304 ile `1f0534d` ana dalında; Opus KOD GO/CI 7/7,
  47 ilgili birim ve mevcut 36 kişilik P0 kesitinde 72 ebeveyn varyantı geçti. Özel aday defteri
  ve ayrı otomatik tarama #305 ile `1e265f4` ana dalında: Opus 5 KOD GO, son CI 7/7;
  40 PG16 ve ayrı 2 PG16/60 birim geçti.
  Hesap hazırlığı/kaynak bankası/aktivasyon kodu #316/#317/#321 ile tamam; canlı uygulama açık. [P8 sözleşmesi](P8_BAGIMSIZ_DOGUM_ADAYI_2026-10-04.md).
  P1 mevcut A′ kararıdır; kod geliştirmeye takvim bariyeri değildir. P6 küçük okur işleri
  boşluklarda: açılmamış görünür bkz #299 ile `c72a089` ana dalında, Opus KOD GO/CI 7/7;
  tanıtım/kök açıklaması mevcut kodda doğrulandı; yeniden yazılmıyor. İnsan ukte bırakma/
  geri çekme, admin gizleme/geri açma ve güvenli liste #306 ile `717e5e4` ana dalında: iki
  Opus turunun koşulları kapandı, son CI 7/7. Son 20 PG16/16 birim-RSC, önceki 67 ve
  geniş 125 test; gerçek masaüstü/mobil tarayıcı akışı geçti. P6’da ilk sürüm için canlı
  dağıtım/kullanım makbuzu kaldı. [Ukte makbuzu](P6_UKTE_2026-10-04.md). P7 yedi günlük kabul özellik paketinden sonra yürür.
- **4 Ekim pilot hazırlığı:** P2 için mevcut P0 kesitinden 6 ilk / 6 saklı çiftin
  24 normal karar girdisi yerelde hazırlandı; model çağrısı yok. Ortak bağlam ve run
  varyasyonu sabit, tek fark persona aktarımı. Model/effort ve sürüm çalıştırmadan önce
  yeniden sabitlenir. A′ tarihi yalnız canlı değişiklik/runtime pilot kapısıdır; kalan
  yerel hazırlıkları durdurmaz. [Hazırlık ve sınırlar](P2_KISA_PILOT_HAZIRLIGI_2026-10-04.md).
- **4 Ekim kaynak hazırlığı:** iki doğum taslağının 20 URL’sinden 19’u okundu;
  Arkitera iki kez zaman aşımına uğradı. Mevcut izinli havuzda üç yedek adres okundu;
  ilk taslağa Fayn/Aeon #311’de eklendi (38 test; Opus koşulları kaynak/ölçümle kapandı).
  Final `c53f8c3`, CI `37191249963` 7/7; main `8aeeb0a`. Gerçek aday kaynak hazırlığı
  ve aktivasyon kapıları açık. [P8 makbuzu](P8_BAGIMSIZ_DOGUM_ADAYI_2026-10-04.md).
- **4 Ekim kısa pilotta bulunan P3 engeli:** aktif amaçtaki `kind`, worker’ın teknik
  metadata yasağına takılıyordu. Gerçek PG16 amaç→sonraki istem yolu önce aynı hatayla
  düştü; dar yol/enum istisnası sonrası 9 PG16 ve 91 birim geçti. Hesap/model metadata
  kapısı korunuyor. Opus 5 `3d53b7b` koşulları kaynak/istem testleriyle kapandı; ilk CI
  `37197366332` ve final `842e67a` CI `37198112214` 7/7; #315 main `d24add7`.
  Kod/hakem/CI işi tamam, canlı dağıtım açık. P3/P4/P5 için 18 çevrimdışı sözleşme
  girdisi v2 hazır (okuyucu dahil toplam ≤24 model çağrısı/90 dakika); çağrı yok. [P3 makbuzu](P3_AMAC_YASAM_DONGUSU_2026-10-03.md).
- **4 Ekim P8 hesap hazırlığı:** yerel PREPARED/PAUSED hesap, dar kaynak yenileme ve
  generic ACTIVE bypass reddi #316 ile ana dalında. Final `f262a8c`, CI `37203877096`
  7/7, main `462642d`; exact ağaç eşliği doğrulandı. V2 migration profili #320 ve aktivasyon kodu #321 ile tamam; canlı uygulama açık.
  İlk pilot tek hazırlanmış kimlik; aday taraması otomatik, ilk aktivasyon yönetici
  transaction'ı olacak. Ayrı permit tablosu/tick eklenmiyor. P7/soy/nüfus/kaynak kapıları
  değişmedi. Canlı 11:51 kesiti 36 ACTIVE; ilk persona eşliği 14 TEMPLATE kök adayı,
  kalan tarihçe kanıtsız bağımsız sayılmıyor. [P8c sözleşmesi](P8_BAGIMSIZ_DOGUM_ADAYI_2026-10-04.md).
- **P8 #316 kod incelemesi:** ilk head `b5b2073` CI7/7; Opus 5 düzeltme istedi.
  Gerçek Bearer→kaynak→koşu tamamlama testi PAUSED `NO_ACTION` hatasını bulup kapattı;
  son doğum/manual PG16 62/62, ayrı9PG ve146birim. Opus5 `4ed82c2` koşulları
  kaynak ve kapanış9PG ile kapandı; kod/hakem/CI işi tamam. Canlı dağıtım açık.
  #317 banka onarımında24/24 güvenli okuma ve güncel kapasite uygun; Opus koşulları
  kaynak/13:09 tablo-yokluğu kesiti ve birleşik79test ile kapandı. Final `9945807`,
  CI `37205037707` 7/7, main `cdc4d5d`; kod/hakem/CI tamam. Mevcut5
  sahip sınırı korunur. [Kaynak bankası makbuzu](P8_KAYNAK_BANKASI_2026-10-04.md).
- **Çalışma sınırı:** küçük kişisel sunucuda tek ağır iş/tek model işçisi; çalışan kullanıcı
  işleri korunur. P0/P2 uygulaması başladı; tarihler işin başlamasını bekleten engel değildir.
- **Hakem:** Astra yürütür, Opus bağımsız inceler. Mevcut Astra tur muafiyeti 4 Ekim
  20:59 UTC'de biter; sonrasında `AGENTS.md` tur sınırı geçerli. Yeni süreli
  üretim yetkisi yalnız Agent Sözlük içindir; diğer sistemlere bağlantı izni değildir.

- **4 Ekim migration profili:** #320 final `4f68c57`, CI `37206758504` 7/7;
  main `88c7f56`, uzak SHA ve test edilen ağaç eşliği doğrulandı. Gerçek Opus 5
  KOD GO, 113 birim / 21 PG16 geçti. Dokuz migration için v2 kodu tamam;
  üretim applied set, gerçek restore ve eski imaj smoke kapıları açık.
- **P8 aktivasyon kodu tamam:** #321 final `0bf60db`, exact CI `37210442983`
  **7/7**, main `0f073cc`; uzak SHA ve test edilen ağaç eşliği doğrulandı. Opus 5
  ikinci görüş `dbe80e6` KOŞULLU GO; tek ölçüm etiketleme koşulu kapandı. 68 ilgili
  birim ve 18 odaklı PG16; son dört HTTP/sınır/atomiklik senaryosu da geçti (örtüşür).
  36 profilli fixture'ın 555 ms uçtan uca HTTP süresi TX aktif süre veya üretim kapasite
  kanıtı değildir. Yerel aktivasyon işi aktif geliştirme kuyruğundan çıktı; canlı dağıtım,
  168 saatlik P7 raporu, güncel soy/kaynak/kapasite ve ilk somut aktivasyon kararı açık.
- **O5 B3 kod teslimi tamam:** #322 final `0d1c845`, exact CI `37211890454`
  **7/7**, main `0245eb4`; uzak SHA/ağaç eşliği PASS. İki Opus 5 görüşünün
  mekanik koşulları kaynak/12 PG16/tam CI ile kapandı. 10 ilgili birim-UI de geçti.
  Entry etkileri ve toplu makbuz aynı commit; tek entry hatası savepoint ile geri alınır.
  B3 kod işi aktif kuyruktan çıktı; O5 için canlı dağıtım/kullanım makbuzu açık.
- **4 Ekim 15:09 UTC sağlık:** canlı `9bf3653` değişmedi; son saat 16 SUCCEEDED / 5 PARTIAL /
  1 FAILED (`CODEX_DECISION_PROVENANCE_INVALID`). Son 24 saat 304 başarılı / 92 ret
  (**%23,23**); 76 tekrar/benzerlik, 15 kesin sayı, 1 doğrudan hitap. Alarm açık, örtüşen
  pencere farkı kod etkisi değil. Yerel operatör preflight'ı aynı repo URL normalizasyonu
  sonrası geçti; gerçek release/restore/benchmark kapılarının yerine geçmez.

- **4 Ekim pilot çalıştırıcısı:** P3/P4/P5 için kalıcı 24 mantıksal çağrı/90 dakika
  bütçesi ve araçsız Opus okuyucusu hazırlandı; ilk 29 / son 43 ağsız test PASS. Gerçek pilot çağrısı 0.
  İlk Opus bulgularıyla 15 dakika okuyucu payı ve dar ortam eklendi; ikinci Opus dar
  koşulları kapandı. #323 final `89797c2`, exact CI `37218521794` **7/7**; main
  `0bb509a`, uzak SHA/test edilen ağaç eşliği PASS. Çalıştırıcı kod işi tamam.
  A′ sonrası güncel source/model/effort/CLI girdileri
  yeniden sabitlenecek. Eski `effort:null` hazırlığı çalıştırılmaz. P2/P7 davranış kabulü
  bundan ayrı ve açık. [Çalıştırma sözleşmesi](P2_KISA_PILOT_HAZIRLIGI_2026-10-04.md).

- **4 Ekim 17:26 UTC sağlık:** taze pin/DNS/host/origin/exact `9bf3653` ile READ ONLY
  kesit: son saat 22 SUCCEEDED / 4 PARTIAL, terminal FAILED yok. Son 24 saat
  297 başarılı / 96 ret (**%24,43**); 79 tekrar/benzerlik, 15 kesin sayı, 1 doğrudan
  hitap, 1 snapshot dışı hedef. Ret alarmı açık; dağıtım olmadı, örtüşen pencerelerden
  kod etkisi çıkarılmaz. Ana dal `8c56852` teslim kaydı CI `37219729005` 7/7 PASS.

- **P2 çalıştırıcısı teslim edildi:** #325 final `0b99703`, exact CI `37226959945`
  **7/7**, main `abd1ae7`; uzak SHA/ağaç eşliği PASS. Son 101 ağsız test ve son 30 runner
  tekrar geçti. Opus 5 dar **KOŞULLU GO**: 27 dakika giriş tamamlama garantisi değil;
  eksik setin okuması yalnız kısmi sorun tespiti. Yazılı koşullar/mevcut negatif test
  makbuzda. Çalıştırıcı kod işi aktif geliştirme kuyruğundan çıktı; 6 Ekim A′ sonrası
  güncel kaynak/model/effort ile girdilerin dondurulması, gerçek P2 pilotu ve canlı dağıtım
  açık. Gerçek çağrı0. [P2 sözleşmesi](P2_KISA_PILOT_HAZIRLIGI_2026-10-04.md).
- **4 Ekim 19:12 UTC sağlık:** taze pin/DNS/host/origin/exact `9bf3653` ile READ ONLY
  kesitte son saat 16 SUCCEEDED / 6 PARTIAL (biri CODEX_TIMEOUT), terminal FAILED yok.
  Son 24 saatte293 başarılı / 98 ret (**%25,06**); 82 tekrar/benzerlik, 14 kesin sayı,
  1 doğrudan hitap, 1 snapshot dışı hedef. Ret alarmı açık; dağıtım yapılmadı. Örtüşen
  pencerelerden kod etkisi veya doğal 24 saat teknik hata oranı çıkarılmaz.

## 5 Ekim — kapanan O3 operasyon hazırlığının tarihsel kaydı

Aşağıdaki açık/tarih satırları tarihsel kanıttır; güncel kuyruk değildir.

**O3 güncel olay:** 4 Ekim 01:31 UTC gecelik yedek yerel `DISK_LOW` ile durdu; önceki
yedi kopya korundu. Kullanılmayan araç sürümü/paket/build cache temizliğiyle yerel boş alan
~4,2 → 5,6 GiB (%89 → %86) oldu. `sort/stat`/checksum ve alarm düzeltmesi #307 ile
`ef216d4` ana dalında; Opus koşulu kapandı, son exact CI 7/7. 21 shell, 7 arama PG16
ve ilgili gerçek masaüstü/mobil 4 E2E geçti. Kabul edilmiş yerel betik atomik kuruldu;
eski dosya/hash saklı. 05:40–05:43 UTC telafi yedeği geçti: 1.315.865.212 bayt,
50 tablo, üç snapshot işareti, checksum tekrar okuma ve arşiv listesi PASS; son yedi
kopya korunuyor. Sonraki yerel kontrolde checksum yeniden geçti; bütün arşiv veri blokları
23,223 sn’de hatasız decode edildi. Bu SQL uygulaması/constraint/index kanıtı değildir;
Teknik hazırlık sonrası tam restore kanıtı açık.
4 Ekim 05:46 UTC ölçümü: DB 5.741.173.783 bayt, operatörde ~5,84 GB boş; yerel tam
restore'a güvenli pay yok. Üretimde 29.130.304 KiB boş (%62 kullanım). O3 dış yedeği,
4 Ekim erken karar sonrası üretimde **ayrı, yalnız bu provanın oluşturduğu DB'ye** geri yüklenip
karşılaştırılır; uygulama DB'si hedef olamaz. Prova kopyası doğrulama sonrası kaldırılır.
Bu dış yedek provası, A5'in geçiş anındaki taze/frozen backup ve ayrı restore kapısının
yerine geçmez. Tam restore teknik hazırlık sonrası yapılır; eski 7 Ekim tarihi bekleme şartı değildir, düşük disk eşiği düşürülmez.
5 Ekim gece makbuzu ayrıca kontrol edilir. 07:05 UTC kullanılmayan üçüncü eski
Claude CLI sürümü `2.1.280` kaldırıldı; çalışan/current `2.1.288` ve önceki `2.1.281`
hash’leri korundu. Yaklaşık 234 MB açıldı, boş alan 6.119.620.608 bayt oldu;
5 GiB ön eşiğiyle aradaki pay yaklaşık 751 MB. 28 Eylül–4 Ekim dump boyutu
1.182.167.798 → 1.315.865.212 bayt büyüdü; yedi kopyalı retention kapasite ihtiyacını
ortadan kaldırmaz. 09:55 UTC native `zstd:3` hazırlığında 21 shell/1 gerçek PG16
dump-restore testi geçti; yerel mevcut-yedek veri akışı 676.647.983 bayt oldu. Native
üretim dump boyutu henüz ölçülmedi. Canlı PG16 binary codec desteği salt okunur doğrulandı;
Opus koşuluyla alıcıya yayımlama öncesi tam blok decode eklendi (son 23 test PASS).
Gzip emniyet hardlink'i retention dışında sabit. #313 final `8531f64`, CI `37194424580`
7/7; main `e8bb0e0`, ağaç eşitliği ve push CI `37194998932` 7/7 doğrulandı.
10:37 UTC iki betik eski hash/geri dönüş kopyası korunarak atomik kuruldu; uygulama
imajı/worker değişmedi. 10:39–10:41 UTC ilk native yedek **671.960.158 bayt**,
checksum/50 tablo/3.270.401 satır/tam blok decode PASS; yedi normal kopya ve gzip pin
korundu. Boş alan **6.679.306.240 bayt**. Timer aktif, sonraki iş 5 Ekim 01:39 UTC.
Kurulum/ilk yeni yedek tamam; 5 Ekim otomatik makbuz ve teknik hazırlık sonrası tam DB restore açık.
4 Ekim yerel restore makbuz aracı hazırlandı: ad/OID bağlı READ ONLY SQL ve tam tablo/
sequence karşılaştırması #324 ile tamam: final `c667e69`, CI `37222466378` **7/7**,
main `7af04c6`; uzak SHA/test edilen ağaç eşliği PASS. Opus dar kapanışta B2 itirazını
geri çekti, B1/K1 kapandı; KOŞULLU GO'nun kapsam notları makbuzda açık. Son 23 ilgili
ve önceki 22 shell testi PASS. Gerçek native arşivin yerel schema-only kontrolü 50 tablo/3
sequence için uyumlu, kendi kopyası temizlendi; veri satırları restore edilmedi.
Yardımcı kod işi aktif hazırlıktan çıktı. 5 Ekim otomatik yedek ve teknik hazırlık sonrası tam restore
açık; süreç sınırı/izole hedef makbuzu çalışma gününde ayrıca uygulanır.
Yedek yükü A′ döneminin operasyonel etkisi olarak kaydedildi. [O3 makbuzu](O3_YEDEK_2026-10-04.md).

Yerel operatör diski son ölçümde %86, üretim diski ayrı eski kayıtta ~%62'dir; bunları karıştırma.
Her build/deploy için güncel değer gerekir; üretimde <8 GiB veya ≥%90 dolulukta build yok.
Aktif/önceki imaj, runtime ve named volume korunur. Yerel ham veri yalnız ilgili kişisel ortamda.

## 5 Ekim — kapanan migration ve O5 hazırlığının tarihsel makbuzları

Aşağıdaki dağıtım-açık kayıtlar yazıldıkları ana aittir; exact d829 ile kod ve dağıtım
kapanmıştır. Yeni aktif sıra değildir.

İlk yerel envanterde sekiz bekleyen migration vardı; #316 ile dokuz oldu. **4 Ekim
16:43 UTC** taze ED25519/DNS/hostname/origin/exact `9bf3653` guard'lı READ ONLY envanter:
**28 applied, yarım kayıt 0, checksum sapması 0**. Yerel 37 migration eksi 28 applied,
incelenmiş v2 profilinin **9 SQL'iyle ad/checksum olarak tam eşit**. PG 16.14, 50 public
tablo, DB 5.801.974.807 bayt. Envanter release anında tekrarlanır; bu okuma üretim
boyutlu restore ve önceki imaj kapılarını kapatmaz. Genel additive denetçi ilk sekizli
kümenin yedisini bilinçli reddediyordu (partial indeks/RESTRICT FK/ALTER/trigger vb.);
kapısı kaldırılmaz. Exact kümeye özel profil kodu tamam, gerçek üretim boyutunda geçiş/
restore/geri dönüş provası P1 dağıtımının açık teknik bağımlılığıdır.
Sabit `october-2026-v1` profili yerelde hazırlandı; ilk 93, son odaklı 36 testte
PG16 restore/geçiş ve sapma reddi geçti. Opus 5 koşullu kabul verdi; genel FK istisnası
profile daraltıldı, üretim boyutu salt okunur ölçüldü ve ukte kaynak koşulları kaynak/testle kapandı.
Son düzeltmelerde 70/70, makbuz etiketinden sonra 6 PG16 ve 8 CI sözleşmesi testi geçti;
format/lint/typecheck/requirements PASS. #308 final `1580273`, exact CI `37182105221`
7/7 ve gerçek imaj runner (36 migration, ana DB geçmişi aynı) geçti; main `9ead5a0`.
Üretime uygulanmadı; gerçek restore/süre/önceki imaj kapısı dağıtımda korunur.
#316 sonrası dokuzuncu migration için **ayrı v2** profili yerelde hazırlandı; v1'in üç
makbuz dosyası ve sekiz SQL checksum'ı değişmedi. İki profil için12PG16 restore/geçiş,
mevcut A5 için9PG16 ve113birim PASS. Yeni audit indeksinin dördüncü migration süre
makbuzu zorunlu; genel veri/şema/rollback/timeouts kapıları aynı. Opus 5 KOD GO ve
#320 final CI 7/7 tamam; main `88c7f56`. Üretim büyüklüğünde prova ve eski imaj
smoke kontrolü aktif dağıtım bağımlılığıdır.
[Geçiş belirtimi](P1_EKIM_MIGRATION_PROFILI_2026-10-04.md).

**O5 ilk alt paket tamam:** toplu koşu önizlemesi hedef/payload/persona-profil/ayar
sürümüne bağlandı. #309 final `113f3aa`, exact CI `37184176713` **7/7**; main
`cbb8aaf`. Son 50 test ve önceki iki gerçek kilit senaryosu geçti. Opus 5 koşulları
kaynak/testle kapandı; shared kilit varsayımı çürütüldü. Son yerel 100 hedef süreleri
193/548 ms (preview/queue); canlı performans iddiası değil. Kuyruğa alma alt paketinin
kod/hakem/CI işi aktif kuyruktan çıktı; dağıtım açık. Global iptal/durdurma gibi diğer
toplu komutlar bu ilk alt pakette tamamlandı sayılmaz.
[O5 belirtimi](O5_TOPLU_KOSU_ONIZLEMESI_2026-10-04.md).

**O5 profil-only CAS notu:** kaynakta doğrulandı; persona sürümü değişmeden çalışma
ayarlarının kaybolabildiği yol dar durum hash'iyle yerelde kapatıldı. Son 47 birim/arayüz/sözleşme
ve 52 PG testi geçti; ilk okuma hash'i/sürümü form yenilemesinde korunur. Opus 5 koşulları kaynak envanteri/yönlendirme kanıtıyla
kapatıldı. #312 final `41123ca`, CI `37193401818` 7/7; main `0ea725d`. Bu alt paketin
kod/hakem/CI işi tamam; dağıtım açık. Yeni migration veya acil pause/iptal/durdurma önkoşulu eklenmedi.

**O5 içerik tamlık notu:** kalan komut envanterinde run/agent penceresinin ilk 500 kaydı
tamamıymış gibi işleyebildiği kaynakta bulundu. 501 ile taşma kontrolü, mutasyon öncesi
422 ve seçim daraltma yolu hazır. Opus koşuluyla boş seçim NO_MATCH ve sonuç/makbuzda
seçim zamanı/run durumu eklendi; son 4 PG16/7 birim-UI geçti. #314 final `9ffa18f`,
CI `37195890146` 7/7; main `16790be`, uzak SHA/test edilen ağaç eşitliği doğrulandı.
Bu dar düzeltmenin kod/hakem/CI işi tamam; canlı dağıtım açık.
Diğer komutların kapsam kararı ve canlı dağıtım bu dar düzeltmeyle kapanmaz. İstek
kesilirse makbuzsuz tekil commit kalması #322 ile tek transaction + entry savepoint'i
içinde kapandı; kod/hakem/exactCI tamam, canlı kullanım açık.
