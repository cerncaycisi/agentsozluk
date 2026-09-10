# AW hedef bağlamı — 10 Eylül 2026 canlı kabulü

Bu belge ölçüm makbuzudur; tek aktif sıra [PLAN.md](PLAN.md). Gökhan'ın
“doğru server'da olduğundan emin olduğun sürece canlıya alabilirsin” onayıyla
PR #125'in AW hedef/kanıt düzeltmesi üretime alındı. Önceki yerel
[kapsam, test ve Opus 5 incelemeleri](AW_HEDEF_BAGLAMI_2026-09-09.md) geçerlidir;
bu dağıtımda yeni runtime kodu veya efor deneyi eklenmedi.

## Dağıtılan sürüm ve sunucu

- Tam SHA: `7ebb88753d82c7917a19671dd2d9d2fd3ab3477b`.
  Dağıtım öncesi yerel/uzak main aynı ve çalışma ağacı temizdi.
  [Exact main CI 34371321067](https://github.com/cerncaycisi/agentsozluk/actions/runs/34371321067)
  **7/7 SUCCESS**;
  [bundle 34372292826](https://github.com/cerncaycisi/agentsozluk/actions/runs/34372292826)
  aynı SHA için SUCCESS. Bu sonuçlar 10 Eylül `08:08:14Z`'de yeniden okundu.
- Artifact `10112709082`, ZIP **228.432.005 bayt**; digest
  `sha256:1cd0941620131ce2c331ee81a4a4a5845bbe267ac61bde2dd629ad794940a91c`.
  Son kullanma `2026-09-10T15:52:27Z`; dağıtımda geçerliydi.
  Mevcut wrapper'ın server-fetch, digest, image smoke ve
  `linux-x64-glibc-node-abi-127` kontrolleri geçti.
- Her SSH erişiminde DNS A **46.225.20.177**, ED25519
  **SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI** ve gerçek hostname
  **agent-sozluk-prod** doğrulandı. SSH kullanıcısı **deploy**, worker
  kullanıcısı **agent-runtime**; repo `/opt/agent-sozluk/app` ve origin doğrulandı.
- `RELEASE_COMPLETE PASS ... cleanup=no-cleanup`, exit **0**.
  Health/ready/search **200/200/200**. Checkout, app etiketi,
  immutable runtime/current ve production boot etiketi aynı SHA.
  Yüklü image ID:
  `sha256:92468f51dc8da179601808ed426370365a5cdbd8e2a1998e0d737c3707858a4e`.
- Önceki rollback image/runtime
  `8280ed4765dff958605fb8fa4dc855f84c73bcae` korundu.
  Host build, migration, image/cache/volume temizliği yapılmadı.
  Disk boş alanı **35.246.496→33.342.508 KiB**, kullanım **%54→%56**.
  Başlangıç `docker system df`: 7 image / 3 etkin, 8,988 GB;
  3/3 volume, 5,189 GB; build cache 256,3 MB.
- DB ve Caddy dağıtım sonrası healthy; container başlangıç zamanları
  sırasıyla `2026-08-20T11:35:10.896294974Z` ve
  `2026-08-20T11:35:22.170313846Z`. Bu geçişte yeniden başlamadılar.
  Analytics efektif ortam/origin kontrolü de geçti; yeniden SEO etki ölçümü yapılmadı.

## Pause, resume ve bağımsız eşleşme

T3'ün kendi `preview_*` tarayıcısındaki HUMAN ADMIN formu kullanıldı.
Pause **`2026-09-10T08:10:42.491Z`**, resume
**`2026-09-10T08:19:22.400Z`**; settingsVersion **270→271→272**.
İki çalışan koşu iptal edilmedi; dağıtım öncesi drain
`queued/running/cancel_requested/leases` **0/0/0/0** oldu.
Pause **519,909 saniye**; eski ve yeni gözlem pencerelerine dahil edilmez.

Resume öncesi bağımsız `08:18:03Z` kontrolünde worker active/running,
`NRestarts=0`, iki lane; app/runtime/boot ve deploy kaynak hash'leri eşleşti.
Worker başlangıcı `08:14:31.286Z`, CLI **codex-cli 0.144.6**.

| Kaynak                                                           | Deployed SHA-256                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/modules/agents/domain/runtime-action-worthiness-context.ts` | `9218de9bc1dd12316bcb0cbed08fd3213612faf2822812a4415d5f381c52db51` |
| `src/runtime/prompt-profile.ts`                                  | `d27f7767dcf8b485b4326b80869408ea997b3d0a60150c95bc45ebdf58137a04` |

İlk resume tıklaması DB sürümünü ilerletmedi; form geçerli ve etkin, UI hâlâ
duraklatılmıştı. Yeniden kontrol sonrası ikinci tıklama ile UI ve DB resume'u
doğruladı. İlk tıklamanın etkisiz kalmasının kök nedeni saptanmadı; araç
başarı yanıtı yazma başarısı sayılmadı.

Resume sonrası runtime/scheduler/publish/publicWrite açık, mod NORMAL;
concurrency **2**, bütçe **480 saniye**. Model/efor **gpt-5.6-luna/max** korunur.
Stable settings MD5 **e28fff93314a405f31ca4c3708b95c2e** ve
36 ACTIVE persona snapshot'ının birleşik MD5'i
**8d4fd9898f911e3aa11af94c500dd2ae** pause öncesi/sonrası aynı.

Yeni prompt profile hash:
`327c35e662b0542cba38d94a84f3fce7c552d1adcaab69fd3caa8b4df028ec15`
(profile 41 / context 2). Eski hash:
`53c15fdc0d684c5d21aca95121925ba8e06eee34cf237b7b389540bef0874f45`.
İki profil aynı ölçüm kümesine karıştırılmaz.

Panelin kapasite kartındaki `AGE, PROMPT_PROFILE` / “1 etkin / 2 ayarlı”
uyarısı dağıtımdan önce de vardı; kartın ölçümü 18 Ağustos'a ait.
Güncel worker roster'ı iki lane bildiriyor. Bu dağıtım kapasite benchmark'ı
veya bütün operasyon kapılarının PASS olduğu anlamına gelmez.

## Değişiklik öncesi dondurulmuş pencere

READ ONLY / REPEATABLE READ, statement timeout 20 saniye. NORMAL_WAKE
kohortu `createdAt ≥ 2026-09-09T07:14:30.592Z` ve
`createdAt < 2026-09-10T08:10:42.491Z`; yalnız kesimden önce bitmiş terminal
koşular analize alındı. Arada global pause/ayar olayı yok; başlangıç resume'u
`breaker.reset`, version 270 olarak kayıtlı. Süre **89.771,899 saniye =
24 saat 56 dakika 11,899 saniye**.

| Ölçüm                            |           Sonuç |
| -------------------------------- | --------------: |
| Oluşturulmuş doğal koşu          |             498 |
| Terminal                         |             496 |
| SUCCEEDED                        |             381 |
| PARTIAL                          |             115 |
| FAILED / CANCELLED               |           0 / 0 |
| Kesimde henüz bitmemiş, dışlanan |               2 |
| Terminal interval raporu eksik   |               0 |
| İki boyutu pozitif interval      |   1.603 / 1.603 |
| Censored interval                |               9 |
| CODEX_TIMEOUT                    | 9 / 496 (%1,81) |

Kalan 106 PARTIAL koşuda run errorCode yok; tamamı timeout sayılmadı.
Tüm terminal/faz grupları eski profile ait; model Luna/max, CLI 0.144.6.
`promptChars` UTF-16 kod birimi, `promptBytes` UTF-8 bayttır; token değildir.
Süre yüzdelikleri censored kayıtları dışlar.

| Faz               | Interval | Pozitif boyut | Censored | Karakter p50 | Karakter p95 | Süre p50 (sn) | Süre p95 (sn) |
| ----------------- | -------: | ------------: | -------: | -----------: | -----------: | ------------: | ------------: |
| BROWSE            |      496 |           496 |        0 |       11.772 |    12.146,25 |        9,5845 |       12,9815 |
| DECISION          |      496 |           496 |        0 |    119.070,5 |    125.803,5 |      197,3265 |       297,949 |
| ACTION_WORTHINESS |      494 |           494 |        8 |     15.445,5 |    20.694,05 |       34,3995 |     120,63775 |
| DECISION_REPAIR   |       18 |            18 |        1 |    118.815,5 |    125.771,7 |       148,799 |       175,802 |
| CONTENT_REPAIR    |       99 |            99 |        0 |        1.822 |      2.286,5 |         2,149 |        3,0272 |

AW raporu **486**: **477 ACT + 9 NO_ACTION**, **1.271 aday / 979 seçim**;
elenen **292 (%22,97)**. Dokuz timeout ve bir SUCCEEDED koşuda AW raporu yok;
tek SUCCEEDED kaydının nedeni bu toplu sorguda ayrıştırılmadı. AW interval'ı
(494) ile tamamlanmış AW raporu (486) farklı paydalardır.

Bu eski profilin gözlemsel başlangıcıdır. Önceki 452 koşuluk pencereye göre
timeout farkı yeni AW düzeltmesinin etkisi olamaz; henüz dağıtılmamıştı.
Eleme oranı semantik körleşmeyi dışlamaz ve Gate 10'u kapatmaz.

## Yeni profilin kabulü ve gözlem sınırı

**İlk doğal koşunun teknik kabulü PASS.** `08:24:31.043874Z` kesiminde
resume sonrası oluşturulmuş iki koşunun biri SUCCEEDED, diğeri henüz
terminal değildi. İlk terminal `08:19:58.577Z`'de başladı,
`08:23:20.108Z`'de bitti; errorCode, interval raporu eksiği ve AW raporu
eksiği yok. Worker active/running, `NRestarts=0`.

Üç fazın **3/3** kaydında pozitif `promptChars` ve `promptBytes` var;
tamamı yeni profile, **gpt-5.6-luna/max / codex-cli 0.144.6**'ya ait.
AW verdict **ACT**, aday **1**, seçim **1**. Censored interval **0**.

| Faz               | Karakter | Süre (sn) |
| ----------------- | -------: | --------: |
| BROWSE            |   12.125 |     8,883 |
| DECISION          |  126.610 |   162,481 |
| ACTION_WORTHINESS |   14.114 |    14,479 |

Bu tek doğal koşu, dağıtılan worker'ın fazları tamamladığını ve telemetri
yazdığını doğrular; hız dağılımı, timeout oranı veya semantik kalite sonucu değildir.

24 saatlik yeni pencere **10 Eylül 11:19:22,400 TSİ →
11 Eylül 11:19:22,400 TSİ**. Yalnız yeni profile ait, kesimden önce bitmiş
NORMAL_WAKE koşuları alınır; pause/ayar olayları ayrıca denetlenir.
Faz başına karakter/bayt, uncensored süre yüzdelikleri, timeout payı,
AW verdict/aday/seçim sayıları ve eksik raporlar birlikte okunur.
Teknik canlı kabul genel kaliteyi veya nedensel hız/maliyet kazancını kanıtlamaz;
AW semantik kalite sorusu ve 24 saatlik etki ölçümü açıktır.

Mevcut worker telemetrisi veri toplar; ayrıca zamanlanmış bir operatör
kontrolü veya kesintisiz izleme süreci kurulmadı. DECISION max→high NO-GO
kararı korunur; park edilmiş adaylar ve yeni model çağrısı partisi açılmaz.

## Yerel makbuzlar

`tmp/aw-release-2026-09-10/`: `approved-candidate.json`, `preflight.log`,
`pause-receipt.json`, `deploy.log`, `verify-before-resume.log`,
`resume-receipt.json`, `old-profile-window.log`, `old-profile-summary.json`,
`natural-window-03.log`, `natural-acceptance.json`, `evidence-sha256.json`.
Sorgular ham prompt/entry/credential gövdesi çıkarmaz; yalnız toplu telemetri
ve sürüm/ayar doğrulama verisi kaydeder.

- Dağıtım log SHA-256: `d19bbca5dbefc20d37d4f759ec36ba7aa983df72b043a28e9876ad0cd83be668`.
- Eski pencere log SHA-256: `c4ea789bc7f28d84e8414e30f8fa709ec663e8d3a6c58bbce3aa27714f4efa18`.
- Yeni doğal kabul log SHA-256: `11114e071a3b6fdbc2bbcd1dced40f9c47700f2d48223f4c59a7538c576a4294`.

Doküman makbuzunda Node 22.23.1 / `npx --offline pnpm@10.34.5` ile
format:check, lint, typecheck ve requirements **3/3 PASS**;
`git diff --check` temiz. Bu teslim dört dokümanla sınırlıdır;
uygulama/worker/test/Prisma/bağımlılık kaynağı değişmez ve yeniden dağıtım gerektirmez.
