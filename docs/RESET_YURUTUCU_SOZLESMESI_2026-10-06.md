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
kalıcı generation bind mount ve exact root drop-in kurar. Başka drop-in veya
`NeedDaemonReload=yes` reddedilir. Hold varken boot uygulamayı açamaz.
Root mirror yayımlandığında kalıcı compose zorunlu generation admission'a kilitlenir.
Hold yalnız DB ile eşleşen terminal `TRAFFIC_OPEN` veya `ROLLED_BACK` mirror
sonrası kaldırılır. Yarım kalmış kurulum/publish otomatik yeniden denenmez.

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
5. COMMIT cevabı belirsizse tekrar reset veya otomatik restore yoktur. Native
   salt okunur commit/audit/namespace uzlaşısı yapılır. Control gate sonucu
   belirsizse site bakımda kalır; kapı körlemesine açılmaz.

## DB dışı nesil kanıtı ve açılış

`reset-generation-operator.ts` özel operatör dizininde 32 bayt random key üretir;
key Git'e, üretime veya DB yedeğine taşınmaz. Canonical JSONL/HMAC zinciri yalnız
exact eski prefix ve tek yeni event kabul eder; dosya ve dizin fsync edilir.
Binding operation/release/dump/manifest/plan/implementation ve
`PRE_RESET_BIGINT` backup sınıfını içerir. İzinli sıra
`PREPARED → COMMITTED_MAINTENANCE → TRAFFIC_OPEN | ROLLED_BACK`; belirsiz
COMMIT çözülmeden geçiş yok, geri alınmış işlem `ABORTED` olur.

`PUBLISH_GENERATION` yalnız DB admission ile eşleşen, imzalı canlı store'dan
türetilmiş root mirror yayımlar. Boot/entrypoint/standalone/migration başında
DB/mirror/immutable latch birlikte doğrulanır. Eski dump ve yeni mirror birlikte
LEGACY kabul edilemez. İç kabulde normal readonly pool ve 410 davranışı,
ardından fresh normal app/TLS/Host kabulü ölçülür; topic/entry sequence tüketen
smoke kullanılmaz. `EXPOSURE` aynı operasyon/journal için idempotent immutable
DB olayıdır; başka journal reddedilir. Exposure, mirror ve hold sonrası bayraklar
yeni settingsVersion ile açılır, worker en son açılır ve yeni gerçek P7 T0 ölçülür.

Restore otomatik değildir. Canlı HMAC store yalnız `COMMITTED_MAINTENANCE`
ve exact reset-anı dump'ına izin verir; DB'nin aynı commit'i, exposure/restore
yokluğu, boş yeni namespace ve tüketilmemiş sequence başlangıçları ayrıca
kanıtlanır. Tam restore edilmiş sahipli gölge ve iki bağlantı kapısı/atomic rename
provası yapılmadan canlı reset GO verilmez. Eski DB önce silinmez. Restore audit,
intent invalidation, tam eşlik ve `ROLLED_BACK` admission ayrıca doğrulanır.
Atomic rename yeni DB'nin OID'sini değiştirmez. Değişmez latch source
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
