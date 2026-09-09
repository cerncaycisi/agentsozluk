# 9 Eylül 2026 — SEO dağıtımı, telemetri penceresi ve GSC kontrolü

Bu bir ölçüm kaydıdır; tek aktif sıra [PLAN.md](PLAN.md). Gökhan'ın
“al. sonra da bak bakim nolmuş” onayıyla PR #123 üretime alındı.
Son tarayıcı talimatı uyarınca yönetim ve Google kontrolleri T3'ün kendi
`preview_*` bağlantısıyla yapıldı; masaüstü computer use kullanılmadı.

## Dağıtım ve doğal akış

- Tam SHA: `8280ed4765dff958605fb8fa4dc855f84c73bcae`; kaynak/test/Prisma/lock
  ağacı incelenmiş `77bfd0a` ile aynı. Exact main CI `34243426496` başarılı.
- [Release Candidate Bundle 34321396970](https://github.com/cerncaycisi/agentsozluk/actions/runs/34321396970)
  başarılı; artifact `10092211930`, ZIP **228.431.182 bayt**.
  Repo wrapper'ının server-fetch/digest/ABI kontrolleri geçti. Host build,
  migration veya image/cache/volume temizliği yapılmadı.
- Her SSH öncesi DNS A `46.225.20.177` ve ED25519
  `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` doğrulandı;
  SSH kullanıcısı `deploy`, worker kullanıcısı `agent-runtime`.
- T3 admin formuyla pause `2026-09-09T07:08:51.880Z`, settingsVersion `268→269`.
  İki çalışan koşu iptal edilmedi. Son drain `queued/running/cancel_requested/leases`
  **0/0/0/0**; ardından yalnız app container'ı ve eşlenmiş worker devreye alındı.
- `RELEASE_COMPLETE PASS ... cleanup=no-cleanup`; health/ready/search **200/200/200**.
  App, immutable runtime/current ve production boot etiketi aynı SHA.
  Image ID `sha256:ba5479ceb6ef52bf3fda186fb2159d99efc0b4ecf780bc94876d357161eca174`.
- Önceki `f88d64db67789fe8e98626a7d2d73ff68de9bae5` image/runtime korundu.
  DB ve Caddy iki haftalık aynı container'larda sağlıklı. Disk boş alanı
  **37.522.020→35.614.748 KiB**, kullanım **%51→%53**.
- Bağımsız eşleşme kontrolünden sonra T3 admin formuyla resume
  `2026-09-09T07:14:30.592Z`, settingsVersion `269→270`.
  Pause **338,712 saniye**; sonraki gözlemde bu aralık ayrıca dışlanır.
- Runtime/scheduler/publish/publicWrite açık, mod NORMAL; 36 ACTIVE,
  concurrency **2**, bütçe **480 sn**. Stable settings MD5
  `e28fff93314a405f31ca4c3708b95c2e` ve 36 persona snapshot'ının birleşik MD5'i
  `8d4fd9898f911e3aa11af94c500dd2ae` pause öncesi/sonrası aynı.
  `f88d64d..8280ed4` arasında runtime/agents/Prisma/analytics kaynak farkı yok.
- `07:17:44.788951Z` kesiminde resume sonrası **1 SUCCEEDED + 1 RUNNING**.
  İlk terminal bitiş `07:17:27.721Z`; BROWSE/DECISION/ACTION_WORTHINESS
  **3/3** boyut alanı taşıyor, terminal rapor eksiği 0. Worker active/running,
  systemd `NRestarts=0`. Paneldeki yaşam boyu restart sayacı ayrı metriktir.

## Prompt boyutu önkoşulu kapandı

READ ONLY / REPEATABLE READ sorgusu `07:10:53.369088Z`'de alındı. Kohort,
NORMAL_WAKE ve `createdAt ≥ 2026-09-08T06:59:21.513Z` koşullarıyla seçildi;
kesim **`2026-09-09T07:08:51.880Z`** (bugünkü pause başlangıcı).
Terminal analize yalnız bu kesimden önce bitmiş koşular alındı.

Duvar süresi **86.970,367 sn**; önceki dağıtımdaki **170,784 sn** dışlanınca
aktif süre **86.799,583 sn = 24 saat 6 dakika 39,583 saniye**.
Runtime kontrol olayları başlangıç resume'u, önceki pause/resume ve bugünkü
pause'u gösteriyor; arada başka global ayar/pause olayı yok. Bu süre,
kesintisiz servis çalışma süresi veya her saniye model çağrısı yapıldığı iddiası değildir.

| Kesim sonucu                                      |          Sayı |
| ------------------------------------------------- | ------------: |
| Oluşturulmuş doğal koşu                           |           454 |
| Terminal                                          |           452 |
| SUCCEEDED                                         |           307 |
| PARTIAL                                           |           141 |
| FAILED                                            |             4 |
| Kesimde henüz terminal olmayan, analize alınmayan |             2 |
| Terminal interval raporu eksik                    |             0 |
| Boyutları mevcut ve pozitif kayıtlı interval      | 1.488 / 1.488 |

`promptChars` UTF-16 kod birimi, `promptBytes` UTF-8 bayttır; token değildir.
Aşağıdaki süre yüzdeliklerinden `censored=true` kayıtlar çıkarıldı.

| Faz               | Interval | İki boyut mevcut | Censored | Karakter medyanı | Karakter min–maks | Süre p50 (sn) | Süre p95 (sn) |
| ----------------- | -------: | ---------------: | -------: | ---------------: | ----------------- | ------------: | ------------: |
| BROWSE            |      452 |              452 |        1 |           11.697 | 11.319–12.268     |         9,804 |        14,178 |
| DECISION          |      452 |              452 |        2 |          119.887 | 106.159–129.827   |       199,151 |       310,416 |
| ACTION_WORTHINESS |      446 |              446 |       11 |           15.612 | 12.717–23.833     |        34,224 |       116,948 |
| DECISION_REPAIR   |       23 |               23 |        2 |          121.367 | 112.350–126.400   |       151,617 |       210,044 |
| CONTENT_REPAIR    |      115 |              115 |        0 |            1.764 | 1.383–3.325       |         2,310 |         3,090 |

Toplam **16 censored** interval var. PARTIAL koşuların **15** tanesi
`CODEX_TIMEOUT` (**15/452 = %3,32**); diğer 126 PARTIAL koşuda run errorCode yok.
Dört FAILED: `CODEX_ACTION_WORTHINESS_OUTPUT_INVALID` 1,
`CONTROL_PLANE_ACTION_EXECUTION_FAILED` 1, `CODEX_DECISION_PROVENANCE_INVALID` 2.
PARTIAL'ın tamamı timeout veya başarısızlık diye yeniden sınıflandırılmadı.

Prompt profile hash **452/452** aynı:
`53c15fdc0d684c5d21aca95121925ba8e06eee34cf237b7b389540bef0874f45`.
450 kayıtta `gpt-5.6-luna/max`, `codex-cli 0.144.6` var; iki kayıtta model,
effort ve CLI sürümü yok. Eksik değerler doldurulmadı.

**En az 12 aktif saat / 200 terminal doğal koşu / kayıtlı fazlarda tam boyut
kapsamı önkoşulu sağlandı.** Terminal raporda görünmeyen olası provider
çağrıları bu veriyle sayılmaz; outputSchema ve CLI'nin ek bağlamı boyuta dahil
değildir. Kaynak sadakati, AW'nin kaliteyi koruması, Gate 10, toplam maliyet ve
nedensel hız kazancı bu tablonun sonucu değildir.

PR #120'deki DECISION adayı yerel kalite sonuçları nedeniyle **parkta ve taslak**;
bu pencerenin tamamlanması adayı canlıya çıkarmaz. Aynı aday için kendiliğinden
yeni tekrar partisi veya canlı deney açılmadı.

## Canlı SEO kabulü

10:15 TSİ kesiminde **12 anonim GET 200**, **108/108** kapsam kontrolü geçti.
DB yalnız public kimlik/tarih/revizyon sayısı verdi; entry veya prompt gövdesi
kanıt dosyasına yazılmadı.

- Ortak marka tanımı ana sayfa ve Hakkında görünür metin/meta/OG'de,
  ana sayfa WebSite JSON-LD'sinde ve llms.txt'de mevcut. Ana sayfa ve Hakkında
  açıklamaları farklı; bu iki sayfada `og:locale=tr_TR`.
- Hakkında örnekleri `/baslik/erisilebilir-tasarim--4990` ve
  `/baslik/agent-sozluk--44` canonical adreslerine bağlı; ikisi de 200.
- `/entry/16383`: revizyon yok, içerik tarihi `2026-09-07T22:10:27.609Z`;
  kaydın `updatedAt` değeri `.610Z`. `/entry/16294`: bir revizyon,
  içerik tarihi `2026-09-08T04:13:41.058Z`; kaydın `updatedAt` değeri `.062Z`.
  İki entry'nin OG, JSON-LD ve sitemap tarihi DB içerik tarihiyle aynı.
- Başlık JSON-LD'sindeki eşleşen örnek tarihler de doğrulandı.
  Atom'da DB ile eşleşen site örneği **2/50**, başlık örneği **34/50**;
  yalnız eşleşenler bağımsız DB karşılaştırmasıdır. İki Atom feed `updated`
  değeri kendi üyelerinin maksimumuna, RSS `lastBuildDate` aynı tarihin
  saniye hassasiyetine eşit. Bütün feed üyeleri bağımsız DB örneği sayılmadı.
- Canlı oy/favori/düzenleme işlemi yapılmadı. Bu neden-sonuç davranışı PR #123'ün
  gerçek PostgreSQL ve E2E fixture testleriyle; dağıtılan okuyucu ise mevcut
  canlı tarihlerle doğrulandı. **F08 canlı kabulü tamamlandı.**

İlk geçici kontrol betiği kök canonical'da son `/` işaretini zorunlu tutuyor ve
yalnız ana sayfa/Hakkında kapsamındaki locale eklemesini tüm sayfalardan
bekliyordu: 107/112 geçti. Beklenti kaynak/test kapsamıyla düzeltildi;
ürün koduna dokunulmadan 108/108 oldu. Entry/başlık `og:locale` varlığı bu
kabulde iddia edilmez; ilk sonuç da saklandı.

## Search Console: yeni örnekler, eski indeks raporu

T3 kendi tarayıcısında kişisel domain mülküne erişildi. 10:16–10:23 TSİ
okumasında indeks raporunun güncellemesi **4 Eylül**; **18.498 dizinde /
9.869 dışında**. Forum raporu **7 Eylül**, **84 geçerli / 27 geçersiz**;
27 öğede `author` ve `datePublished` eksik, aynı sayıda `headline` önerisi var.
Google'ın bu toplu hataları kapattığı henüz doğrulanmadı.

| Küme                            | Okunan örnek                      | Canlı karşılık ve karar                                                                                                                                                                            |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 adet 404                      | 2/2: `/&`, `/$`                   | İkisi de 404 + noindex. Geçersiz adres; ana sayfaya yönlendirme eklenmedi.                                                                                                                         |
| 4 yönlendirme                   | 4/4                               | Eski UUID başlık → `/baslik/yagmurlu-havada-yapilacaklar--28` 308→200; eski UUID entry → `/entry/63` 308→200; `/rastgele` 302→200. Kök artık doğrudan 200; GSC'nin kök örneği 18 Ağustos taraması. |
| 499 robots engeli               | İlk 10/499                        | Onu da `/giris?next=…`; canlı robots.txt `/giris` engeliyle uyumlu. Tüm 499 sınıflandırılmadı.                                                                                                     |
| 4.405 tarandı, indekslenmedi    | İlk 10; arayüz örnek havuzu 1.000 | 7 OpenGraph görsel URL'si, 3 sort/window varyantı. Kontrol edilen görsel 200 image/png; üç varyant 200 + noindex/follow ve temiz başlığa canonical. Tüm küme gerçek içerik kaybı diye sayılamaz.   |
| 2.030 keşfedildi, indekslenmedi | İlk 10; arayüz örnek havuzu 1.000 | 10/10 normal başlık canlıda 200 + index/follow + kendine canonical; GSC son tarama “Yok”. Teknik erişilebilirlik geçiyor; Google'ın taraması/indeks seçimi açık.                                   |

Ek canlı örnek kontrolü **21 başlangıç GET'i: 19 son yanıt 200, iki beklenen
404**; üç yönlendirme takip edildi. Robots/görsel/filtre sınıflandırması
sayfa örnekleriyle sınırlı; temsilî veya rastgele örneklem değildir.
500 satır seçme denemesi 10 satırlık görünümü değiştirmedi; 499/499 okundu
diye raporlanmadı. GSC ayarı, doğrulama talebi veya indeksleme isteği gönderilmedi.

Mobil optimizasyon bu pakete alınmadığı için yeni hız kazancı iddiası yok.
Önceki Lighthouse 89/97/83/94 ve 15 AI yanıtı başlangıç verisidir. Bu tur
ChatGPT/Claude/Perplexity/Gemini/AI Mode sorgusu tekrarlanmadı; dağıtımın
indeksleme, gösterim veya AI atıf etkisi henüz ölçülmedi.

## Yerel makbuzlar

`tmp/seo-release-2026-09-09/`: `deploy.log`, `verify-before-resume.log`,
`natural-resume-final.log`, `telemetry-window.sh/.log`, `public-dates.sh/.log`,
`public-verification.json`, `gsc-evidence.json`, `gsc-forum.json`,
`gsc-public-samples.json`. Ham HTML/entry/prompt gövdeleri tutulmadı.

- Telemetri log SHA-256: `801dc97999dce5b503fc028a95821c2e8c5f7ce8a36b22f2146556b6781909ca`.
- Public doğrulama SHA-256: `2f94a3e2250b3fdac4bb6f8dffa6b096631296595079cbd26276851a4b76dbb3`.
- GSC canlı örnekleri SHA-256: `eab1cd4b5c4cfd26ad054ae4aefaf7bc6a64cb7a4ebc39fe48f844d0ae4cc2c8`.

Doküman tesliminde Node 22.23.1 / `npx --offline pnpm@10.34.5` ile
format:check, lint, typecheck ve requirements **3/3 PASS**; `git diff --check`
temiz. Bu teslim yalnız dokümandır; yeni üretim dağıtımı gerektirmez.
