# 3 Ekim plan uzlaştırması — iş kaybı ve çelişki denetimi

**Bu bir kuyruk değildir.** Sıra/tarih yalnız [PLAN.md](PLAN.md). Kaynak: main `f666d2c`.
Eski 808 satırlık plan [aynen arşivlendi](PLAN_ARSIVI_2026-10-03.md); özgün dosya SHA-256:
`1d62a1537b8fcd2007905b65148b203dc7bb68d198ec3cbb2fbf5f1d4411ef97`.
Aşağıdaki “kapalı” hükümleri belirtilen tarihli kanıtın sonucudur; bugünkü canlı sağlık iddiası değildir.

## 1. Kullanıcı taleplerinin karşılığı

| İstek                                           | Yeni karşılık                          | Kaybolmaması gereken sınır                                         |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Hissedilir çok seslilik/karakter                | P0 + P2 + P5                           | Persona alanının veya sürümün varlığı başarı değil                 |
| Amaç ve güdü, tatmin/hayal kırıklığı            | P3                                     | Kalıcı niyet, gerçek sonuç ve sonraki seçim; yalnız öz-beyan değil |
| Doğru davranışı ödüllendirme, yanlıştan öğrenme | P4                                     | Kanaat/oy popülerliği ile ihlal ayrımı; cezasız çekimserlik        |
| Başarılı yazarlardan otomatik yeni yazar        | P8                                     | Önce kalite/çeşitlilik/kapasite; otomatik emeklilik eklenmedi      |
| Boş/yalnız bkz ve ukte                          | P6; bütün deneylerin koruma sözleşmesi | Boş hedef geçersiz değil; otomatik görev/kota değil                |
| Temiz, tarihli, tek plan                        | P0 teslimi                             | Eski açık işler burada izlenir; ikinci aktif plan yok              |
| Opus'la karşılıklı inceleme ve uzlaşı           | Plan inceleme makbuzu                  | Başarısız/yarım hakem çağrısı görüş sayılmaz                       |

## 2. Önceki PLAN.md'deki işlerin eşlemesi

Kaynak bölüm numaraları arşivdeki numaralardır. Bölüm içindeki tarihsel bulgu ve uzun örnekler
arşivde kalır; aktif işle karıştırılmaz. Bir satır birden fazla alt bulgu taşıyorsa aşağıda açılır.

| Eski iş / bölüm                                           | Yeni karşılık                | Durum                                                                           |
| --------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Üst sıra: bkz deneyi                                      | Kapanış kaydı                | 23 çiftte kapalı; yeniden koşulmaz                                              |
| Üst sıra: A′ 72 saat ve başarısızsa B                     | P1                           | Açık; kısa kontrol resmî Gate 10 değil                                          |
| Üst sıra: heartbeat #296 / Z12                            | P1 + O1                      | Kod tamam, canlı etki açık; migration/temizlik yok                              |
| Üst sıra: okur/marka/SEO, font kırpma                     | P6 + E7                      | Açık; tarihli kontroller var                                                    |
| §1 hızlı işler, §2 runtime, §5.5 sessiz durma             | Ekim arşivi                  | Kapanmış paketler yeniden açılmadı                                              |
| §3 kaynak keşfi aşama 1                                   | Kapanış/koruma               | Canlı kayıtlı; serbest URL açılmaz                                              |
| §3 kaynak keşfi aşama 2                                   | E2                           | Ertelenmiş, ihtiyaç ve egress/kanıt tasarımına bağlı                            |
| §3 eski kaynak tabanı eksiği                              | P7 güncel pencere            | Üç profil için 13 Eylül düzeltmesi kayıtlı; yeni pencere ayrıca ölçülür         |
| §3 credential rotate                                      | Kapalı karar                 | Yapılmayacak                                                                    |
| §4 CODEX_TIMEOUT                                          | O4                           | Nedeni ayrıştırılmamış pay; ölçüm, otomatik eşik değişikliği yok                |
| §4 kaynak çekincesi/kapanış kuyruğu                       | P0/P2 koruma ölçümü          | 12 Eylül kök neden izi korunur; bütün çekinceler kusur sayılmaz                 |
| §4 gezinme verimi atfı ve 50/50 deneyi                    | Kapalı; P4 ölçüm sözleşmesi  | Eski nedensel iddia reddedilmiş; nitelikli katkı/100 başlatılmış koşu korunur   |
| §4 M2/DONE-082                                            | P7                           | Reset bağı yok; kaynak tabanı geçmişi tek başına kabul değil                    |
| §4 Madde 32 ateşleme                                      | E10                          | Yalnız vaka/ateşleme takibi                                                     |
| §5 reset yığını                                           | Kapalı karar                 | `archive/reset/*` korunur; tekrar açma tarihi yok                               |
| §5 reset'e bağlı retention                                | O1 + E6                      | İlk heartbeat/geçiş azaltımı; eski veri silme ayrı tasarım                      |
| §5 reset'e bağlı SEO/indeks/çerez                         | P6 + E4                      | Bağımsız değerlendirme, otomatik uygulama yok                                   |
| §5.6 F07 JSON-LD tam metin                                | Kapalı kısım; E4 kalan       | Tam metin kayıtlı; `digitalSourceType` ayrı karar                               |
| §5.6 F10 IP/hesap kovası                                  | Kabul edilmiş artık risk     | IP koruması var; hesap kilitleme DoS takası korunur                             |
| §5.6 runtime:plan scope ayrımı                            | E8                           | Kimlikler gerçekten ayrışırsa; veri geçişi değerlendirilir                      |
| §5.6 redakte stack/skip-link/README                       | Kapalı kısımlar              | Logger ve odak düzeltmeleri geçmiş kanıtla kapalı                               |
| §5.7 B5.3                                                 | Kapalı karar                 | 2 Ekim etiketli ölçüm: yeni kural yok                                           |
| §5.7 6.3-5 indeks eşiği                                   | E4                           | Reset beklemiyor; etkisi ölçülmeden uygulanmaz                                  |
| §5.7 6.3-2/3 iki aşamalı üretim/tekrar                    | P1 B kolu + P2/P4            | Aynı paket içinde gizli yeni model çağrısı eklenmez                             |
| §5.7 F04/F06/F09 açık gibi duran atıflar                  | Kapalı kısımlar              | Arşiv: rezerv slug, oturum kopyası iptali, container boot kapısı tamam          |
| §5.7 liste metadata/no-follow/llms                        | Kapalı kısımlar              | 24 Eylül makbuzları korunur                                                     |
| §5.7 paginated canonical ve entry JSON-LD eşleşmesi       | E4                           | İddia işe başlarken yeniden doğrulanır                                          |
| §5.7 RSC çağrı sayısı testi                               | E6                           | React cache düzeltmesi var; gerçek RSC regresyon kanıtı kalan                   |
| §5.7 Actions/base image pin                               | Kapalı kısım; E6/E8 kalan    | Digest pin var; Docker --platform testi/frontend güncelleme takibi kalan        |
| §5.7 Google-Extended politikası                           | Kayıt/koruma                 | Eski “karar yok” iddiası arşivde çürütülmüş                                     |
| §5.7 __Host- çerez öneki                                  | E4                           | Ayrı uyumluluk/geçiş; reset önkoşulu yok                                        |
| §5.7 belge rotasyonu/branch protection                    | P0 + E8                      | Tek kuyruk ve arşiv bu teslimde; branch ayar değişikliği yapılmadı              |
| §5.8 A2 karşıt hüküm                                      | E3                           | 24 Eylül raf kararı; yeni kanıt/yaklaşım olmadan açılmaz                        |
| §5.8 B9 “yedek ertelendi”                                 | O3                           | **Bayat:** 25 Eylül gecelik yedek kurulu, 50 tablo restore kanıtı var           |
| §5.8 agent_runs indeksi/retention                         | O1 + E6                      | finishedAt indeksinin kapanışı arşivde; append-only silme açılmadı              |
| §5.8 6.3-1 kaynak gösterimi                               | Kapalı karar                 | 25 Eylül: otomatik entry-altı kaynak satırı yok; yazar doğal bağlantı kurabilir |
| §5.8 B4/B7/B6                                             | Kapalı kısımlar              | Edge/egress kayıtları; onaysız hesabın mevcut oy hakkı değiştirilmez            |
| §5.9 İ1 plan uzlaştırması                                 | P0                           | Eski tur korunur; bu teslim güncel birleşim                                     |
| §5.9 İ2/İ4 takip deneyi                                   | Kapalı; P1 yeni pencere      | 2 Ekim kabul; A′ ile karıştırılmaz                                              |
| §5.9 İ3 tekrar değerlendirme seti                         | P1/P2/P4 ölçüm girdisi       | İlk set yapılmış; yeni sürümde sonuç ayrıca sınanır                             |
| §5.9 İ5 ret sağlık metriği                                | O4 + P3/P4                   | Metrik mevcut; iki haftalık ≤%20 ve verim hedefi açık                           |
| §5.9 İ6 alarm sağlık özeti                                | O4                           | Dört durum kurulmuş; kota/sağlayıcı ayrımındaki açık korunur                    |
| §5.9 İ7 SEO/GEO                                           | P6                           | Search Console 2 Ekim, GEO 3 Ekim tabanı var; takip açık                        |
| §5.9 İ8 toplu işlem önizlemesi                            | O5                           | Açık, güvenlik sertleştirmesi                                                   |
| §5.9 İ9 hassas konu                                       | Kapalı                       | B5.3 ile aynı iş; ikinci açık satır yok                                         |
| §5.9 İ10 model geçişi                                     | E1                           | Tekrar testinde 16/30–21/30; yazı kalitesi ölçülmemiş                           |
| §5.9 Z1 okur değeri                                       | P2/P4 koruma + P6            | Taban ölçülmüş; kör eşli yararlılık takibi                                      |
| §5.9 ana sayfa seçimi                                     | P6                           | Başlık değişimi tamam; yakın dönem seçimi ayrı davranış deneyi                  |
| §5.9 Z6 çerezsiz sayaç                                    | O4/P6 ölçüm girdisi          | Kurulum tamam; entry gösterimi/insan kalite puanı değil                         |
| §5.9 Z8 yetki listesi                                     | Kapalı karar                 | Yeni yetki tablosu yazılmadı; mevcut AGENTS geçerli                             |
| §5.9 tur bütçesi, güvenlik dışı hakem önerisi             | AGENTS / PLAN çalışma sınırı | Tarihli muafiyet dışında mevcut kural korunur                                   |
| §5.9 büyük refactor, gündem performansı                   | E5 / E10                     | Somut değişiklik/yavaşlık olmadan açılmaz                                       |
| §6 mimari/export/transaction                              | E5                           | İlgili iş içinde ayrı PR                                                        |
| §6 prompt rollout imajı/coverage/credential/rollback/scan | E6/E8                        | Başlamadan güncel kod doğrulanır; redakte stack tekrar yapılmaz                 |
| §6 SEO/UX ve belge otoritesi                              | E4/E7 + P0                   | Kapanmış skip-link/metadata ayrılmış                                            |
| §7 UI, SEO/GEO ve anayasa A3–A7                           | E7/P6/E9                     | Eski roadmap ikinci kuyruk olarak açılmadı                                      |

## 3. BACKLOG ve diğer belgelerden gelen açık/kısmi satırlar

BACKLOG gövdesinin eski tarihli satırları tarihçe olarak tutulur; bu eşleme öncelik ve güncel
hükmü belirler. Tamamlanmış UI/API işleri buradan yeniden açılmaz.

| Eski kayıt                                                         | Yeni karşılık        | Uzlaştırma                                                                                  |
| ------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------- |
| Major next/prisma/dotenv/geliştirme geçişleri                      | E8                   | Ayrı uyumluluk PR'si, kilitli karar değişmez                                                |
| P0.7 ukte, /baslik/ac kararı                                       | P6/E7                | Arama ve boş başlık composer'ı yapılmış; ukte yapılmış değil                                |
| P4 marka/ton                                                       | P6                   | İlk okur hazırlığı                                                                          |
| D-8 öz-tekrar                                                      | P1/P3/P4             | Eski dar detector sonucu genel çözüm sayılmaz                                               |
| D-10 ilk entry işlevi                                              | E3                   | Ölçüm olmadan yeni kapı yok                                                                 |
| M-2/M-3 final kabul                                                | P7                   | Doğal pencere ve Gate 11/12 ayrı                                                            |
| M-4/O2/BENCHMARK_STALE                                             | O2                   | Ağustos bekleyişi bayat; 3 Ekim kayıtlı kapasite 17 Ekim'e kadar, yeni sürüm bunu bozabilir |
| M-5 stokastik/kaynak/ses                                           | P0/P2/P7             | Kod ve davranış kanıtı ayrılır; bütünü “yapılmadı” sayılmaz                                 |
| F3 entry uzunluğu                                                  | P2 koruma            | Kısa yazı kusur veya otomatik uzatma talebi değil                                           |
| O5 benchmark bakım süresi                                          | O2/E6                | Güncel süre ölçülür; eski üç saat varsayımı sabit değil                                     |
| O4'te kalan profil ayarı CAS notu                                  | O5                   | Persona CAS kapanmış; profil-only alan iddiası ayrıca doğrulanır                            |
| B-3/B-7 belge otoritesi                                            | P0                   | Başlıklar PLAN'a yönlendirilir; tarihsel arşiv topluca çevrilmez                            |
| Bidi/zero-width başlık                                             | Kapalı kod bulgusu   | `topics/validation/schemas.ts:16`, `domain/normalization.ts:19`; #59 `7955fc1`              |
| Başlık rota çakışmaları                                            | E10                  | 27 Ağustos sıfır vaka; ölçülmüş vaka olursa                                                 |
| Moderasyon-meta/offline birinci kişi                               | E3                   | Yeni regex/ön onay yok; gerçek vaka önce                                                    |
| E2E logout yarışı                                                  | Kapalı kod bulgusu   | `auth-content.spec.ts:317` waitForURL; son ilgili `8f3683e`                                 |
| M2 realism eski “Current clean work queue” / “Ordered action plan” | P7 kabul + bu eşleme | Eski sıra tarihsel; aktif otorite PLAN                                                      |
| AGENT_API_BACKLOG harici BYOA/PAT                                  | E9                   | İç managed runtime bearer ile harici API aynı değil; M2 zorunlu kapsamı değil               |
| GOKHAN_ICIN ve eski UI/SEO/Anayasa roadmap                         | Arşiv + P6/P7/E7/E9  | Ayrı güncel onay listesi veya kuyruk yaratılmaz                                             |

## 4. Yanlış çıkarımları tekrar etmeme

- Takip dönüşümündeki yoğunlaşma −%47, A′ sonucu değildir. A′ için yerel tekrar azalışı
  başka ölçümdür; 6 Ekim canlı kontrolünün yerine geçmez.
- İletilmeyen persona alanları kesin kod bulgusudur; ortak üslubun çok sesliliği bastırması
  ve küçük temperament delta'larının etkisizliği henüz ölçülmemiş hipotezlerdir.
- Prompt üzerinden iletilen state'in etkisi ölçülmedi diye “hiç etkisi yok” denmez.
  Sunucunun seçenek yasaklaması, etkiyi kanıtlamanın tek yolu değildir.
- Yedek kurulu, kaynak tabanı geçmişte düzeltilmiş, bidi ve logout yarışı kodda kapanmış.
  Önceki sohbet/eskimiş satır bunları yeniden açık işe çeviremez. Güncel sağlık ayrı ölçülür.
- Oy sayısı okur yararı, öz-beyan ödül, persona mesafesi davranış çeşitliliği değildir.
- Bu eşleme gereksinim PASS kaydı değildir; çalıştırılmamış test veya canlı doğrulama iddiası yok.

## 5. Kapanış hükümlerinin doğrudan kanıt dizini

Bu dizin §2–§3'teki kapalı satırların parçasıdır. Kod kontrolü mevcut tabanda yapıldı;
tarihsel üretim makbuzu bugünkü canlı sağlığın yeniden ölçüldüğü anlamına gelmez.

| Kapalı kayıt                                     | Doğrudan kanıt                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Heartbeat kodu, bkz deney kapanışı               | [STATUS 3 Ekim](STATUS.md), [ATTEMPT_LOG 3 Ekim](ATTEMPT_LOG.md); #296/d373376 ve Opus bkz makbuzları                                                                                                                                                                                                                                      |
| §1/§2/§5.5 kapanan işler, runtime indeksleri     | [Ekim arşivi](PLAN_ARSIVI_2026-10.md), üst kapanış listesi ve aynı kimlikli maddeler                                                                                                                                                                                                                                                       |
| Kaynak aşama 1 ve 13 Eylül taban düzeltmesi      | [Ekim arşivi](PLAN_ARSIVI_2026-10.md), “Kaynak tabanını kapat” bölümü; [önceki plan §3](PLAN_ARSIVI_2026-10-03.md)                                                                                                                                                                                                                         |
| F04/F06/F09                                      | [Ekim arşivi](PLAN_ARSIVI_2026-10.md), aynı kimlikli 23–24 Eylül kapanış makbuzları                                                                                                                                                                                                                                                        |
| B9 gecelik yedek/restore                         | [Ekim arşivi B9](PLAN_ARSIVI_2026-10.md); [gecelik betik](../deploy/backup/gecelik-yedek.sh), [14 testin kaynağı](../tests/unit/ops/nightly-backup.test.ts)                                                                                                                                                                                |
| Redakte stack                                    | [logger.ts](../src/lib/logging/logger.ts):132–188; [önceki plan F10 sonrası not](PLAN_ARSIVI_2026-10-03.md)                                                                                                                                                                                                                                |
| Skip-link/README düzeltmeleri                    | [Ekim arşivi](PLAN_ARSIVI_2026-10.md); [önceki plan §5.6](PLAN_ARSIVI_2026-10-03.md) 23 Eylül makbuzu                                                                                                                                                                                                                                      |
| Bidi/zero-width                                  | [schemas.ts](../src/modules/topics/validation/schemas.ts):16, [normalization.ts](../src/modules/topics/domain/normalization.ts):19; `7955fc1` tabanın atası olarak git ile doğrulandı                                                                                                                                                      |
| Logout yarışı                                    | [auth-content.spec.ts](../tests/e2e/auth-content.spec.ts):317; `8f3683e` tabanın atası olarak git ile doğrulandı                                                                                                                                                                                                                           |
| Metadata/llms/no-follow, React cache, digest pin | [önceki plan §5.7](PLAN_ARSIVI_2026-10-03.md): #196/#198/#200 ve b53408e makbuzları; kalanları E4/E6'ya ayırdık                                                                                                                                                                                                                            |
| Google-Extended kararı                           | [crawler politikası](SEO_GEO_CRAWLER_POLICY.md); [önceki plan §5.8 düzeltmesi](PLAN_ARSIVI_2026-10-03.md)                                                                                                                                                                                                                                  |
| Kaynak satırı yok, B6 oy hakkı, B4/7 edge/egress | [Ekim arşivi](PLAN_ARSIVI_2026-10.md), 6.3-1/B6/B4/B7 maddeleri; tarihlenmiş kullanıcı kararları                                                                                                                                                                                                                                           |
| Takip dönüşümü / İ2–İ4                           | [USLUP_LAB](USLUP_LAB_2026-09-27.md), 2 Ekim sonuç; [önceki plan §5.9](PLAN_ARSIVI_2026-10-03.md)                                                                                                                                                                                                                                          |
| B5.3/İ9                                          | [etiketli ölçüm](B53_HASSAS_KONU_ILK_TARAMA_2026-09-25.md), 2 Ekim ek sonucu ve [önceki plan §5.7](PLAN_ARSIVI_2026-10-03.md)                                                                                                                                                                                                              |
| Alarm/ret metriği/sayaç, İ6/Z6                   | [önceki plan §5.9](PLAN_ARSIVI_2026-10-03.md), #274/#277 ve 2 Ekim kurulum makbuzları; eksikler O4'te                                                                                                                                                                                                                                      |
| JSON-LD tam metin F07                            | [önceki plan §5.6](PLAN_ARSIVI_2026-10-03.md), 3416827/f88d64d tarihsel makbuzu; güncel [public-seo.ts](../src/modules/indexing/domain/public-seo.ts):174/201 tam `text`, [entry sayfası](../src/app/entry/[id]/page.tsx):160 tam `body`; [regresyon kaynağı](../tests/unit/indexing/public-seo.test.ts):71; `digitalSourceType` kapanmadı |
| Reset/credential rotate/Z8/F10 artık risk        | [önceki plan verilen kararlar ve §5.6/§5.9](PLAN_ARSIVI_2026-10-03.md); [tehdit modeli](THREAT_MODEL.md)                                                                                                                                                                                                                                   |

A2 **kapalı uygulama değil, ertelenmiş karar**; E3'te korunuyor. Açık olmasına rağmen linki
olmayan bir satır bu dizinle PASS'e çevrilmez. Git atalık doğrulaması uygulama testini veya
üretim makbuzunu ikame etmez.
