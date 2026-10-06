# 6 Ekim — ayrı üretim reset yürütücüsü

Bu belge uygulama sözleşmesidir; tek iş sırası [PLAN.md](PLAN.md)'dedir.
[Kullanıcının reset kapsamı](RESET_URETIM_KAPSAMI_2026-10-05.md) geçerlidir:
HUMAN/AGENT/SEED içerik ve etkileşimler dahil 34 model temizlenir, 25 model
korunur. Tarihsel tasarım belgesindeki 29 sayısı bu teslimin kapsamı değildir.
Kodun birleşmesi veya testlerin geçmesi canlı reset kabulü sayılmaz.

## Kaynak ve bağlantı sınırı

`great-reset-production.ts` yalnız root tarafından, exact immutable release
dizininden ve komuta verilen `AGENT_SOZLUK_PRODUCTION_APPROVED_SHA` ile çalışır.
Request ve freeze inventory root:0600, ebeveynler güvenilir ve gerçek path olmalıdır.
Uygulama credential'ı yalnız mevcut deploy:0600 `.env` içinden alınır; ambient
`DATABASE_URL` kullanılmaz, yeni rol/credential eklenmez. Beklenen DB/container,
imaj, volume, release ve actual OS hostname tekrar ölçülür. Her invocation
`src`, `prisma`, `scripts` ve release girdilerinin aynı implementation SHA-256'sını
gerektirir. Local-only reset izin listesi genişlemez.

Üç hedef vardır: canonical üretim, nonce/OID/marker ile sahipli üretim gölgesi,
nonce/marker ile sahipli operatör provası. Gölge canonical OID16385 olamaz;
canonical URL'den türetilir. Üretimde target ve `postgres` control bağlantıları
aynı mevcut non-superuser role/IP ile, tek bağlantılı pool kullanır.

## Dondurma ve yeniden başlatma

Worker pause tek başına yeterli değildir. Dört global yazma bayrağı false,
koşu/lease sıfır, bütün proje service/timer/socket/path ve cron girişleri
envanterde olmalıdır. Uygulama konteyneri durmalıdır. Envanterin byte özeti ve
ölçülen strict JSON'u her mode'da eşleşir. Normal uygulama/proxy kabulü ayrıca yapılır.

Mevcut bootstrap oneshot'un `ExecStop` komutu DB'yi de kapatır; service stop
edilmez. `INSTALL_BOOT_GUARD`, tam freeze kanıtından sonra root maintenance hold,
kalıcı generation bind mount ve exact root drop-in kurar. Drop-in shutdown için
base `down` komutunu temizleyip `stop --timeout 60` kullanır; konteyner ID'leri
korunur. Graceful shutdown sonrası hold altındaki DB aynı pinli container ID ile
kontrollü başlatılır. Hard reset, sağlayıcı veya manuel reboot için açık apt false
ayarı genel engel değildir; DB/proxy durumu yeniden ölçülür ve proxy izolasyonu
yeniden kanıtlanır. Bootstrap hold'u atlamak veya hold'u elle silmek kurtarma yolu
değildir. Hold'dan sonraki bootstrap active/sub-state farkı yeni root:0600 freeze
envanteri ve byte özetiyle request'lere bağlanır; yalnız beklenen state farkı
kabul edilir, başka pin/aktivasyon farkı ayrıca uzlaştırılır. Bütün freeze kipleri `Unattended-Upgrade::Automatic-Reboot` için açık
`false` ayarı ister; eksik/default/true reddedilir. Başka drop-in veya
`NeedDaemonReload=yes` reddedilir. Hold varken boot uygulamayı açamaz.
Kurulumdan sonra durdurulmuş app konteyneri kalıcı compose override ile yeniden
oluşturulur ve **yeni container ID** freeze/request makbuzuna pinlenir. Bütün
kurulum-dışı kipler `restart=no`, exact root generation dizininden salt okunur
bind mount ve generation environment anahtarını ister. Ham environment değerleri
çıktıya taşınmaz. Mevcut D202 konteyneri bu kapıyı karşılamaz; native ölçümde
`unless-stopped`, mount ve anahtar yoktur. Konteyner henüz değiştirilmedi.
Root mirror yayımlandığında kalıcı compose zorunlu generation admission'a kilitlenir.
Hold yalnız DB ile eşleşen terminal `TRAFFIC_OPEN` veya `ROLLED_BACK` mirror
sonrası kaldırılır. Terminal kanıt doğrulandıktan sonra kalıcı compose atomik/fsync
ile `required=true, restart=unless-stopped` durumuna geçer, ardından hold kaldırılır.
Son app bu terminal override ile yeniden oluşturulup politika/mount/boot kabulü
ölçülür. Terminal compose ile yalnız app için `up -d --no-build --no-deps
--force-recreate app` kullanılır; proxy ayrı kabul adımında açılır. Active/exited
bootstrap için `systemctl start` app'i yeniden yaratma kanıtı değildir; restart
DB'yi durduracağından bu adımda kullanılmaz. Bakım süresindeki `restart=no`
canlı işletimde kalıcı bırakılmaz.
Yarım kalmış kurulum/publish otomatik yeniden denenmez.

## Tek kullanımlık işlem

1. Migration öncesi gerçek yedek/restore ayrı kapıdır. Migration sonrası
   `PREPARE_INTENT` iki saatlik DB-clock niyeti ve audit üretir.
2. `MANIFEST` her public tabloyu, tam satır içeriklerini, sequence durumunu,
   şema/owner/ACL/role/default privilege/DB ayarlarını hash'ler; ctid/xmin kullanmaz.
   Taze CUSTOM dump ve actual restore aynı içerik/sequence özetiyle doğrulanır.
   Ortama ait marker/locale/role farkları değer düzeyinde açık makbuz ister.
3. `PREVIEW` namespace, frozen state, katalog, intent ve 100.000 tombstone
   sınırını doğrular; exact plan özeti üretir. Aynı source çekirdeği gerçek boyutlu
   sahipli gölgede bakım süresi/disk/izin/rollback ile prova edilir.
4. `EXECUTE` mevcut tek backend'i pinler, control DB'den yeni bağlantı kapısını
   kapatır. Tek transaction bütün tabloları NOWAIT ile kilitler; kilitlerden
   sonra tam manifest tekrar eşleşir. Intent consume, tombstone, 34 tablo
   TRUNCATE, BIGINT namespace, commit/audit atomiktir. `setval`/`nextval`,
   CASCADE veya trigger kapatma kullanılmaz. Kendi backend'i ayrılıp diğer
   backend sıfır kanıtlanınca bağlantı kapısı açılır.
5. Backend kapanışı için bağlantı kapısı yalnız açılışta en fazla 20×250 ms
   bekler; kapatma ve prepared transaction durumunda bekleyerek geçiş yapılmaz.
   Disconnect/reopen hatası doğrulanmış COMMIT makbuzunu yutmaz:
   `connectionGate=CLOSED_UNCERTAIN`, CLI exit2 ve site bakımda kalır.
6. COMMIT cevabı belirsizse tekrar reset veya otomatik restore yoktur.
   `REOPEN_GATE`, aynı pinli control DB'den target OID ve sıfır backend/prepared
   transaction kanıtıyla yalnız bağlantı kapısını açar; uygulama hold'u sürer.
   `RECONCILE` salt okunur RR transaction'da immutable commit/audit, namespace,
   34 boş tablo, tombstone, intent ve normalize edilmiş korunacak veri hash'ini
   karşılaştırır. Sonuç `COMMITTED` veya başlangıç manifest'i aynıysa `ABORTED`;
   eşleşmeyen kanıt başarı değildir. Kapı zaten açıkken yeniden açma reddedilir.

## DB dışı nesil kanıtı ve açılış

`reset-generation-operator.ts` özel operatör dizininde 32 bayt random key üretir;
key Git'e, üretime veya DB yedeğine taşınmaz. Canonical JSONL/HMAC zinciri yalnız
exact eski prefix ve tek yeni event kabul eder; dosya ve dizin fsync edilir.
Binding operation/release/dump/manifest/plan/implementation ve
`PRE_RESET_BIGINT` backup sınıfını içerir. İzinli sıra
`PREPARED → COMMITTED_MAINTENANCE → TRAFFIC_OPEN | ROLLED_BACK`; belirsiz
COMMIT çözülmeden geçiş yok, geri alınmış işlem `ABORTED` olur.

Operatör, mirror'ı mevcut canlı HMAC store'un aynı doğrulanmış byte'larından
türetir; üretime aktarım güvenilir root request ile yapılır. Üretimde HMAC anahtarı
yoktur ve imza matematiksel olarak doğrulanmaz. `PUBLISH_GENERATION` root request,
DB admission ve kalıcı root latch'i doğrular; operatörün canlı zinciri doğrulaması
ayrı zorunlu kapıdır. Bu güven sınırı root operatörüne karşı izolasyon iddiası değildir. Boot/entrypoint/standalone/migration başında
DB/mirror/immutable latch birlikte doğrulanır. Eski dump ve yeni mirror birlikte
LEGACY kabul edilemez. İç kabulde normal readonly pool ve 410 davranışı,
ardından fresh normal app/TLS/Host kabulü ölçülür; topic/entry sequence tüketen
smoke kullanılmaz. `EXPOSURE` aynı operasyon/journal için idempotent immutable
DB olayıdır; başka journal reddedilir. Exposure, mirror ve hold sonrası bayraklar
yeni settingsVersion ile açılır, worker en son açılır ve yeni gerçek P7 T0 ölçülür.

Restore kararı öncesinde `COMMITTED_MAINTENANCE` root mirror yayını zorunludur;
sonradan ilk yayın olarak `ROLLED_BACK` kabul edilmez. Trafik journal'ı terminal
olmadan hemen önce aynı `COMMITTED_MAINTENANCE` mirror ile idempotent
`PUBLISH_GENERATION` yeniden çalıştırılır: DB admission salt okunur, root mirror
yayını dosya yazmasıdır. CLI'da ayrı VERIFY kipi yoktur. Ret varsa journal
terminale geçmez. Proxy kapalı/izole iç kabul ve
hata sonrası control kapısını belirsiz kabul edip readonly uzlaştırma operasyonel
ön koşullarıdır. Restore otomatik değildir. Canlı HMAC store yalnız `COMMITTED_MAINTENANCE`
ve exact reset-anı dump'ına izin verir; DB'nin aynı commit'i, exposure/restore
yokluğu, boş yeni namespace ve tüketilmemiş sequence başlangıçları ayrıca
kanıtlanır. Tam restore edilmiş sahipli gölge ve iki bağlantı kapısı/atomic rename
provası yapılmadan canlı reset GO verilmez. Eski DB önce silinmez. Restore audit,
intent invalidation, tam eşlik ve `ROLLED_BACK` admission ayrıca doğrulanır.
`ROLLED_BACK` mirror yayımlanmadan bütün içerik manifest'i yeniden hesaplanır;
yalnız aynı operation'ın intent `invalidatedAt` alanı ve restore audit satırı
normalleştirilir. Sonuç original `manifestSha256` ile eşleşmezse yayın reddedilir.
DB owner/ACL/locale/comment/settings dahil diğer farklara tolerans yoktur.
Normal cold boot bu ağır karşılaştırmayı tekrar etmez; kısa DB/latch admission
sürer. Restore edilen sahipli gölgede intent invalidation, native DB konsolundan
aynı `agentsozluk.reset_operation` GUC ile, tüketilmemiş exact operation/release
satırı için yapılır; executor'un canonical OID kapısı gevşetilmez.
Atomic rename yeni DB'nin OID'sini değiştirmez; canonical ad artık yeni OID'ye bağlıdır. Değişmez latch source
`databaseOid` değerini korur; yalnız imzalı terminal `ROLLED_BACK` event'i
`restoredDatabaseOid` taşır. Mirror, actual yeni canonical OID ve restore audit'i
aynı yeni OID'yi gerektirir. Ordinary reset/mutation source OID16385 kapısı
aynı kalır; yalnız rollback mirror'ın salt okunur admission'ı yeni OID'yi kabul eder.

## Açık üretim kabulü

Bu teslim full-size native dump/restore, actual control/rename izin provası,
gerçek bakım süresi, iç pool/410 p95, unknown-COMMIT uzlaşısı, reboot ve production
reset/reopen kanıtlarının yerine geçmez. Bu kanıtlar [STATUS.md](STATUS.md)'ye
yalnız ölçüldükten sonra yazılır. Yeni 168 saatlik pencere başlamadan eski
USER_REQUEST_INTERRUPTED_NOT_PASS kaydı başarıya çevrilmez.

## İnceleme kapanışı ve native ön koşullar

İlk kaynak `435595a235989ceab95a0845981cba4806cd38fc` için actual Opus5.5
salt okunur inceleme 465.840 ms'de **NO-GO** verdi. Başarılı COMMIT makbuzunun
cleanup hatasında kaybolması ve eski konteynerin generation kapısını taşımaması
yüksek bulgulardı; yukarıdaki düzeltmeler kapanış incelemesine sunulur. Bu kayıt
sonraki GO olarak yeniden adlandırılmaz. İki saatlik intent süresine PREPARE,
dump, operatör restore'u, üretim gölgesi, canonical PREVIEW/EXECUTE zincirinin
**tamamı** sığmalıdır. Süre yetmezse yeni intent/dump/manifest/prova gerekir.
User-systemd/linger ve diğer kullanıcı cron aktivatörlerinin bulunmadığı ya da
freeze kapsamına alındığı ayrıca native envanterle ölçülmelidir.

Native bootstrap base SHA-256
`ef47dccff5dbff0dd4f34b19c378c2339155a8c164abd1d73d3fb5578d434d02`
altında tek `ExecStartPre`, mevcut compose `config --quiet` kontrolüdür.
Başka migration-hold/docker-wait ön koşulu yoktur. Drop-in aynı config kontrolünü
kalıcı generation override ile taşır; `Requires`, `After` ve mevcut path koşulları
korunur. Generic release maintenance hold veya tamamlanmamış generation state
varken migration marker/state dizini değişikliğinden önce reddedilir.

İlk exact-source CI37399661339 quality işi **FAIL**: production zincirindeki
`source-map-js@1.2.1`, [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
Override `1.2.2`, frozen install ve `pnpm audit --prod --audit-level=high` geçti.
Node22.23.1 üzerinde PostCSS map generation ve malicious indexed offset reddi
ölçüldü. Yeni full CI ve actual closure ayrı kapılardır; ilk kırmızı CI başarı değildir.

6 Ekim ikinci actual Opus5.5/440.438ms incelemesi exact206 için önceki Y1/Y2/O1–O4
kaynak koşullarını kapattı; yeni Y3 shutdown/ID kaybıyla merge **NO-GO** verdi.
Yeni drop-in stop, terminal restart ve explicit apt false kapıları kapanışa sunulur.
02:17 native apt readonly: değer ayarlı değil; açık false şartını karşılamaz.
Üretim ayarı veya drop-in bu kaynak değişikliğiyle kurulmuş sayılmaz. Native02:11
root/deploy user manager ve user unit dosyaları/cron'da proje veya PG yazıcısı yok;
bilinen dört active timer ve eski disabled activation timer envanteri korundu.

6 Ekim 02:35:56 UTC: [PR335](https://github.com/cerncaycisi/agentsozluk/pull/335)
ana dala `0914d34380e481b96d9b3bcac3e6eeca818f7760` olarak birleşti. Tree reviewed
`01bb98f3d5a855eda75c1bce62046cd4d2316d62` ile aynı; exact head CI37403773670
yedi iş SUCCESS. Üçüncü actual Opus5.5/298.005ms Y3'ü kapattı; source merge
engeli yok, üretim kapıları açık. Yeni main CI ayrı ölçümdür.

Terminal compose `.terminal` veya latch `.latched` geçici dosyası kalmışsa
kapı kapalı kalır. Sahip/izin/exact beklenen body ve aynı operation hold
kanıtlanmadan dosya kaldırılmaz; hold elle silinmez. Aug20 reboot nedeni
bu reset hazırlığında native journal ile doğrulanmış değildir; apt false
ayarı her reboot nedenini önlediği iddiasıyla kullanılmaz.
