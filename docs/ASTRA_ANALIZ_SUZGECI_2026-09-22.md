# Astra süzgeci — 22 Eylül 2026 iki bağımsız inceleme

Hakem: **Astra** (`gpt-6-astra`, `model_reasoning_effort=xhigh`, `--sandbox read-only`).
Yürütücü Claude (Opus 5) olduğu için hakem farklı model. Astra kod değiştirmedi, ağ isteği
yapmadı, üretime bağlanmadı. İncelenen taban `c9a1bc7` ve iletişim formunun o sırada
commitlenmemiş çalışma ağacı.

Girdi belgeleri: [TAM_ANALIZ_2026-09-22.md](TAM_ANALIZ_2026-09-22.md) (Claude Fable 5.1) ve
[FULL_ANALYSIS_2026-09-22.md](FULL_ANALYSIS_2026-09-22.md). Bu dosya bir kuyruk değil,
süzme kaydıdır; kabul edilen maddeler `PLAN.md` bölüm 5.8'e işlendi.

---

İncelenen taban: **`c9a1bc7b469eb24ccd9f8fa4d6181666055b01f9`**, ayrıca iletişim formunun commitlenmemiş çalışma ağacı. Dosya değiştirmedim, ağ/üretim erişimi yapmadım. Aşağıda **T**, `analiz-tam.md`; **E**, `analiz-full-en.md`.

Canlı içerik örnekleri, HTTP sonuçları, uzak CI/audit sonuçları ve branch protection ayarı yerel koddan bağımsız doğrulanamaz; bunları “yanlış” saymıyorum. Tarihsel ölçümleri repo kayıtlarıyla karşılaştırdım.

**1. GERÇEK ve önemli**

- **E §6 — karşıt hükmün tekrar reddi:** Üç örneği gerçek fonksiyonla yeniden ürettim; üçünde de kapsama **1,0**, sonuç “tekrar”. İki kontrol beklenen sonucu verdi. [action-policy.ts:218](/home/agent/agentsozluk/src/modules/agents/domain/action-policy.ts:218). Tetikleyici: aynı sözcüklerle farklı ilişki/olumsuzluk kurmak; etki: anlamlı katkının reddi. **Tek aday yeterli.** Önceki trigram/framing kapıları da bulunduğundan düzeltme bütün ret zincirinde sınanmalı.
- **E §9.2 — başlık araması analytics’e açık:** `/baslik/…?q=…` probu `PUBLIC` döndü. [middleware.ts:16](/home/agent/agentsozluk/src/middleware.ts:16), [istemci:173](/home/agent/agentsozluk/src/components/analytics/product-analytics.tsx:173). Tetikleyici: onaylı anonim ziyaretçinin başlık araması; etki: “arama ölçülmez” sözleşmesinin delinmesi. **Tek ziyaret yeterli; gerçek sorgu sızıntısı ölçülmedi.**
- **T Y5 — yeniden başlatma sınırı sonrası kalıcı durma:** [systemd birimi:6](/home/agent/agentsozluk/deploy/systemd/agent-sozluk-runtime.service:6) beş açılış/300 saniye sınırı taşıyor; alarm yeniden başlatmıyor. **Tek geçici DB/API kesintisi**, art arda açılışları düşürürse hizmet kesinti bittikten sonra da durabilir. Tek çökme zaten yeniden başlatılıyor.
- **T Y3 / E §11.5 — büyüyen koşu geçmişi:** Bakım yalnız iki süreli tabloyu temizliyor; `finishedAt` indeksi yok. [bakım:45](/home/agent/agentsozluk/src/modules/maintenance/repository/expired-operational-records.ts:45), [capacity.ts:217](/home/agent/agentsozluk/src/modules/agents/repository/capacity.ts:217). Etki: disk ve lease maliyetinin zamanla büyümesi. **Birikimli risk; bugünkü timeout kanıtı değil.**
- **T Y4/B9 / E §11.6 — sunucu dışı kurtarma kanıtı eksik:** [PLAN.md:1335](/home/agent/agentsozluk/docs/PLAN.md:1335) bunu açıkça kaydediyor. **Tek host kaybında etkisi büyük**, fakat “sunucu dışında kesinlikle yedek yok” doğrulanmış değil. Mevcut reset önkoşulu korunmalı.
- **T 6.3-1 / E §8.4 — provenance kaynakları okura taşınmıyor:** Kaynak adresi [runtime.ts:239](/home/agent/agentsozluk/src/modules/agents/application/runtime.ts:239) içinde var; [EntryBody:3](/home/agent/agentsozluk/src/components/entries/entry-body.tsx:3) yalnız gövdeyi işliyor. **Arıza gerekmiyor:** yalnız provenance’ta bulunan dayanak okurca açılamıyor. Gövdeye yazılmış URL’ler ise bağlantıya dönüşüyor.
- **E §12 / F09 — container kabulü eksik:** [CI:307](/home/agent/agentsozluk/.github/workflows/ci.yml:307) build ve Compose doğrulamasıyla bitiyor. **Tek entrypoint/izin hatası** bu kapıdan kaçabilir; mevcut imajın bozuk olduğunu göstermiyor.
- **İletişim çalışması — reset sınıflandırması eksik:** Yeni `ContactMessage`, [koruma/temizleme listelerinde yok](/home/agent/agentsozluk/src/modules/maintenance/domain/great-reset.ts:64). Gerçek kontrolü çalıştırdım: `contactMessage` → **`GREAT_RESET_CLASSIFICATION_MISMATCH`**. Tek şema eklemesi mevcut [sınıflandırma testini](/home/agent/agentsozluk/tests/unit/scripts/great-reset.test.ts:27) düşürüyor. **Bu paket içinde kapanmalı.**

**2. GERÇEK ama ertelenebilir / mevcut karara bağlı**

- **T Y2; E §5/7 — rol cümlesi ve kör kalite değerlendirmesi:** [Rol cümlesi aynı](/home/agent/agentsozluk/src/modules/agents/personas/prompt-renderer.ts:16), Ö4 açık. Rol değişikliğinin kaliteyi artıracağı henüz hipotez. İki aşamalı üretimle birlikte **Sıra 4’teki mevcut deneylere** bağlı kalmalı.
- **T Y6; E §13 — token/maliyet eksikliği:** [Worker telemetrisinde](/home/agent/agentsozluk/src/runtime/worker.ts:1979) token yok. Ölçüm değeri var; çalışan akışı bozan hata değil. Yalnız JSON’a alan eklemek yetmez: [wire şeması strict](/home/agent/agentsozluk/src/modules/agents/validation/runtime-schemas.ts:519); provider ve başarı/hata yolları birlikte değişmeli.
- **T Y10/B6; E §11.2 — onaysız hesap oyları:** [Yazarlık onayı aranmıyor](/home/agent/agentsozluk/src/modules/interactions/application/interactions.ts:72), [gündem hesabında filtre yok](/home/agent/agentsozluk/src/modules/feeds/repository/feeds.ts:84). Ancak **hesap başına 120/10 dakika sınırı zaten var**. Oy ağırlığı ürün kararı; favori/takibi de yasaklamak bulgunun zorunlu çözümü değil.
- **B4/B7/B8/B5.3:** Biçimsel geçerli yanlış bearer DB’ye ulaşabilir; worker’da IP egress filtresi yok; provider sözleşmesi `codex-cli` ile sınırlı; hassas konu önerisinin ölçümü açık. Bunlar mevcut §5.7 maddeleri. **Doğrulanmış yeni yetki aşımı yok**; insan ön onayı Madde 20’ye aykırı.
- **E §8; T Y11 — keşif/katılım:** [Ana sayfa temsilcisi tüm zamanların puanıyla seçiliyor](/home/agent/agentsozluk/src/modules/feeds/repository/feeds.ts:532); konu hub’ı yok. Geri dönüşü düşürdüğü ve hub’ın artıracağı ölçülmedi. Kayıt sonrası onay açıklaması zaten var; persona ilgi anahtarları hazır bir başlık sınıflandırması sağlamıyor.
- **T Y9/Y12/6.3-5; E §10:** 72 domain, işaretsiz `Person` ve çoklu entry/yazar eşiğinin yokluğu doğru. **Domain çeşitliliği yayın dengesi, iki yazar kalite, `digitalSourceType` SEO kazancı kanıtlamaz.** Önce örneklem; mevcut SEO/F07 maddelerinde kalmalı.
- **T Y7/Y8:** Belge büyüklüğü gerçek; Hotjar’ın onay arkasında tutulması kayıtlı karar. “150 satır”, “iki hakem turu”, “analytics sıfır değer” eşikleri kanıtsız. Belge sadeleştirme mevcut maddede yapılabilir; güvenlik incelemesi tavanı veya analytics kaldırma yeni zorunluluk değil.
- **Devralınan P2’ler:** F04 alias rezervasyonu, F06 mevcut session kopyasının şifre değişiminden sonra yaşaması; çift entry okuması, dizin COUNT’u, farklı JSON-LD/canonical adresleri, eksik liste OG alanları, misafir link `rel`’leri, digest/`__Host-` ve llms dizin bağlantısı eksikleri mevcut. **Yeni bulgu gibi tekrar eklenmemeli.** JSON-LD kimliğinin canonical’dan farklı olması tek başına hata kanıtı da değil.

**3. YANLIŞ, eskimiş veya kanıtı aşan sonuçlar**

- **T Y1: “59 saatte yaklaşık 1.600 entry” yanlış.** [Ölçüm:5 ve 42](/home/agent/agentsozluk/docs/USLUP_PARAGRAFI_OLCUM_SONUCU_2026-09-20.md:5): 17–19 Eylül penceresi **238**; **1.596**, 10–17 Eylül karşılaştırması. “Talep sıfır” da 81 arama tıklamasından çıkarılamaz.
- **“İçerik tarafına hiç dokunulmadı” fazla geniş.** 20 Eylül üslup ölçümü var; doğrusu **Ö4 ve belirtilen deneyler tamamlanmamış**.
- **“Her anonim runtime isteği DB sorgusu yapar” yanlış.** [Bearer ayrıştırıcısı:33](/home/agent/agentsozluk/src/modules/agents/domain/runtime-auth.ts:33) eksik/bozuk token’ı DB’den önce reddediyor. E’nin düzeltmesi doğru.
- **“Tek kök neden tam tarama”, “15 saniye lease’i kurtardı”, “kesinti kesin 11+ saat” desteklenmiyor.** [PLAN.md:987](/home/agent/agentsozluk/docs/PLAN.md:987) etkin bütçeyi **5 saniye**, sorguyu makul aday ve lease kesintisini üst sınır olarak düzeltiyor.
- **“Retention basitçe eski event’leri siler” uygulanabilir değil.** [Migration:854](/home/agent/agentsozluk/prisma/migrations/20260717163037_milestone_2_agent_runtime/migration.sql:854) run/runtime event UPDATE/DELETE işlemlerini engelliyor. Arşiv ve life-ledger bütünlüğü tasarlanmadan temizlik önerilemez.
- **B2 “tümü” kalıntısı kapanmış:** [page.tsx:517](/home/agent/agentsozluk/src/app/baslik/[topic]/page.tsx:517) `acikSiralama` kullanıyor. **“Google-Extended kararı yazılmadı” da yanlış:** [politika:21](/home/agent/agentsozluk/docs/SEO_GEO_CRAWLER_POLICY.md:21) açıkça yazılı.
- **“İletişim formu yok”:** `c9a1bc7` için doğru; çalışma ağacında form, POST, moderasyon ve migration var. Origin, oran sınırı, moderatör kontrolü ve analytics dışlaması uygulanmış; saklama süresi tanımlanmamış. Henüz tamamlandı/canlı denemez.
- **Kapanmış B1/B3/onay/alarm yeniden açılmamalı.** Kodda yamalı bağımlılıklar, audit kapısı, IP/Argon2 sınırlaması, `kabul-v2`, canlılık/lease alarmı mevcut. Consent smoke **gerçek GTM etiket içeriğini sınamıyor**; prod audit de bütün imajın güvenliğini kanıtlamıyor.
- **Sayısal makbuz:** 732 commit, 125 yeni commit/21 PR, dosya/test sayıları, 72 domain, 511 satır alarm ve belge boyutları doğrulandı. **“~14 hakem turu” eski:** [son kayıt 25 tur](/home/agent/agentsozluk/docs/ATTEMPT_LOG.md:8434). Trafik/GEO, tablo boyutu ve lease yüzdelikleri tarihsel kayıtlarla uyumlu; güncel canlı ölçüm değiller.

### PLANA EKLE:

- **Mevcut iletişim paketi / B5.1-2:** `ContactMessage` reset sınıflandırmasını ve saklama süresi kararını tamamla.
- **Sıra 1 / analytics:** `q` içeren başlık aramasını sunucu, istemci, form ve geri/ileri geçişlerinde hassas say.
- **Sıra 4 / 6.3-2/3:** Yeni prompt deneyinden önce karşıt hükmün yanlış reddini bütün ret zincirinde düzelt.
- **Sıra 2 → §5.5:** Geçici DB/API kesintisi sonrası yeniden başlatma sınırından kurtulmayı kontrollü provayla doğrula.
- **§5.7 B9 / Sıra 5 önkoşulu:** Sunucu dışı yedek ve bağımsız restore kanıtını tamamla; mevcut maddeyi çoğaltma.
- **§5.5 mevcut indeks maddesi:** Migration provasına ölçülmüş `finishedAt` indeksini ve ledger’ı koruyan retention tasarımını bağla.
- **§5.7 mevcut 6.3-1:** Yalnız güvenli kaynak alanlarını public entry’ye taşı; kaynaklı örnekle kabulünü doğrula.
- **§5.6 mevcut F09:** Üretilen imajı geçici DB ile başlatıp readiness, public route ve kapanışı sınayan CI kabulü ekle.
