# Reset öncesi outbox arşivi — 10 Eylül 2026

Bu belge uygulama ve doğrulama makbuzudur; aktif sıra [PLAN.md](PLAN.md).
Paket yerel sentetik reset hazırlığıdır. Üretim migration/reset uygulanmadı.

## Problem ve yöntem

15:21 TSİ salt okunur envanterde outbox'ın 191.768 satırı da processedAt=NULL
idi. Mevcut mimaride consumer yok; kendiliğinden drain beklemek çözüm değildir.
Olayları tüketilmiş göstermek veya silmek yerine, arşiv manifesti ve olay
kimliklerinden oluşan ayrı bir üyelik tablosu eklenir. Olayların orijinal bütün
kolonları, payload ve processedAt dahil, aynı kalır.

`OutboxResetArchive` reset planının hash'ini, format sürümünü, olay sayısını ve
satırların SHA-256 özetini tutar. `OutboxResetArchiveEvent` her olayın hangi
arşive ait olduğunu foreign key ile bağlar; bir olay yalnız bir arşive girebilir.
Sınır tarih karşılaştırması değildir: reset sonrası eklenen geriye tarihli olay
eski arşive katılmaz. Daha önce gerçekten işlenmiş olaylar da değiştirilmez.

Varsayılan yerel CLI, arşivlenmemiş pending olay varsa OUTBOX_PENDING ile
kapalı kalır. Yalnız `--archive-outbox` seçimi arşivleme politikasını açar;
hem dry-run hem execute aynı politikayı kullanmalıdır. Politika plan hash'ine
bağlıdır. Önizlemeden sonra seçenek, veri, şema veya uygulama kaynağı değişirse
eski plan kullanılamaz. Mevcut hostname/loopback/cluster/owner/DB-name/marker
kapıları geçerlidir; üretim hedefi veya force seçeneği eklenmez.

Execute bütün reset tablolarını kilitler; eski arşivleri doğrular; pending
olayların özetini planla eşleştirir. Yeni arşiv üyelikleri, içerik temizliği,
idempotency expiry ve audit tek transaction içindedir. Arşivleme veya sonraki
kontrol başarısızsa hepsi geri alınır. Eski manifest/üyelikler de korunan
satırlar karşılaştırmasına dahildir; yalnız bu resetin eklediği satırlar ayrılır.

Arşiv manifest ve üyelikleri UPDATE/DELETE ile değiştirilemez; dolu arşiv
TRUNCATE/CASCADE ile temizlenemez. Arşivlenen outbox satırlarının değişimi de
DB trigger'ıyla reddedilir. Böylece processedAt ile sahte tüketim yapılamaz.
Boş arşiv tabloları normal test veritabanı temizliğini engellemez.

## Tüketim ve kapsam

`findPendingOutboxEvents` yalnız processedAt=NULL **ve arşiv üyeliği olmayan**
olayları seçer. Ayrı bir consumer, dış servis veya bildirim kurulmaz.
Gelecekte consumer yazılırsa bu aday sözleşmesini kullanması gerekir;
herhangi bir özel SQL okuyucusunun dış eylemini bu paket denetlemez.

Arşiv formatı 1, iki zaman alanını epoch olarak temsil eder; JSONB satırlarının
SHA-256 özetlerini sıralayıp tekrar SHA-256 alır. Reset ayrıca UTC/extra_float_digits=3
ayarını sabitler. Outbox'ın saklanan
kolonlarını veya bu temsili değiştiren gelecek şema değişikliği arşiv formatını
ayrıca ele almalıdır; tarihsel hash'ler sessizce yeniden yazılmaz.

Yeni migration iki arşiv tablosunu, FK/index ve koruma trigger'larını ekler.
Mevcut outbox satırlarını güncellemez. Repo teslimi üretim migration kabulü
anlamına gelmez; bu paket schema-neutral/no-migration release değildir.
Gerçek üretim yedeği/restore, app/worker kapanışı, public/cache kabulü ve
AW/kaynak kapıları ayrıca kapanmalıdır.

## Doğrulama

PR #127 taslak, head `a0687448bf63a168975b3cc6c20ce50c3382ad23`.
Bu ilk sürümde 1.452 unit / 11 PostgreSQL entegrasyonu ve format/lint/typecheck
geçti; CI `34485420687` 7/7 SUCCESS. İlk Opus 5 kararı **NO-GO**.
Aşağıdaki düzeltmeler yerelde, commit/push edilmedi; ilk CI bunları kapsamıyor.

Güncel düzeltmelerde 28 odaklı unit ve typecheck geçti. Yeni 12. entegrasyon
testi henüz çalıştırılmadı; son format/lint oturumlarının sonucu alınamadı.
`probe-03`, 10 Eylül 17:02:42–17:07:01 TSİ: **32/35 sonrası FAIL**,
psql yardımcısında `TimeoutExpired / REHEARSAL_STEP_FAILED` (failedAt 33,
line 42). Tam sorgu/kök neden açık; CLI timeout'u olarak sınıflandırılmadı.
Scratch temizliği başarılı, katalog korundu. Son hakem kapanışı yok;
yerel büyük yük, merge veya üretim için GO verilmedi.
[Sohbet devri ve kanıt dosyaları](DEVAM_RESET_OUTBOX_2026-09-10.md).

## İlk Opus 5 incelemesi ve karşı kanıt

İlk aday `a068744` için Opus 5/medium, 374,822 sn / tek tur / araçsız
incelemede NO-GO verdi. Çekirdek transaction ve korunumu sağlam buldu;
ölçek, teşhis ve makbuz için kapanış istedi. Bu karar son kod için GO sayılmaz.

- Genel hata aynı iki nesilli akışta yeniden üretildi: Prisma P2010,
  SQLSTATE **55P03**, 0,139 saniye. Aynı kesimde PostgreSQL autovacuum'un
  VacuumTruncate beklediği gözlendi. NOWAIT kilidi işlemi doğru biçimde
  reddetti. İlk iki kaydın alt kodları saklanmadığı için onların her birine
  kesin kök neden atfedilmez; hakemin 57014/P2028 timeout tahmini doğrulanmadı.
- Artık 55P03 `GREAT_RESET_LOCK_NOT_AVAILABLE`, 57014
  `GREAT_RESET_QUERY_CANCELLED`, P2028 `GREAT_RESET_TRANSACTION_FAILED`
  olarak ayrılır. Ham SQL/Prisma mesajı yazma önerisi alınmadı; sabit güvenli
  kodlar teşhisi açar. Yerel provanın üç outbox tablosunda autovacuum kapatılır;
  bu yalnız yeni scratch DB'ler içindir. Üretimde timeout/kilit kuralı değişmez.
- Fingerprint önce her satırın SHA-256'sını alır, sonra 64 karakterlik
  hash'leri sıralayıp birleştirir. Böylece toplu ara metin payload toplamı
  yerine yaklaşık 65 bayt × satır sayısıdır. 192.001 satırda en fazla
  12.480.064 bayt; tek satır ve PostgreSQL kaynak sınırları hâlâ geçerlidir.
  Geçmiş arşivler doğrulamadan çıkarılmaz; tam korunumu kontrol etmeyi sürdürür.
- Kalıcı arşiv hash'inde iki timestamptz epoch olarak temsil edilir; TimeZone
  bağımlılığı giderilir. Format 1 bu yeni, henüz dağıtılmamış sözleşmedir.
- Her rapor toplam arşiv neslini ve teslim edilmemiş arşiv üye sayısını
  gösterir. Varsayılan ad `REQUIRE_NO_UNARCHIVED_PENDING_KEEP_ROWS`;
  eski olayların tüketildiği iddia edilmez. Prova makbuzunda PASS/FAIL,
  beklenen/tamamlanan senaryo sayısı ve güvenli hata bilgisi bulunur.
- Guard'ın iki kopyası yok: `scripts/great-reset-local-guard.ts` doğrudan
  domain modülünü re-export eder. İlk pakette eksik olan bu dosya ve üç
  prova/veritabanı yardımcısı kapanış incelemesine eklenecek.

## Yazıcı envanteri, dağıtım ve geri dönüş sınırı

Yerel Git'teki dağıtılmış `7ebb887` kaynağında `src`/`scripts` taraması:
`outboxEvent.create/createMany/update/updateMany/upsert/delete/deleteMany`
ailesinde **tek yazıcı** var: `src/modules/outbox/repository/outbox.ts:18`
create işlemi. Aynı kapsamda `outbox_events` ham SQL başvurusu yok.
Bakım repository'si yalnız rate_limit_buckets ve idempotency_records siler.
Bu envanter, [mimarideki](ARCHITECTURE.md) consumer yokluğu ile tutarlıdır;
varsayımsal eski bir tüketicinin gerçekten çalıştığı iddiası desteklenmez.

Migration ileride uygulanırsa UPDATE/DELETE'e koruma trigger'ı ekleyeceği
bilinmektedir; bunu genel olarak davranışsız migration diye adlandırmıyoruz.
Önce gerçek sürüm/yazıcı envanteri yeniden doğrulanmalı; consumer eklenmişse
bütün sürümleri arşiv filtresini kullanmalı ve reset boyunca durmalıdır.
Eski processedAt-only seçimin arşivi görebildiği, onu işlenmiş yapmanın 55000
ile reddedildiği test edilir. Bir consumer dış yan etkiyi önce yapıyorsa bu
trigger teslimi geri alamaz; böyle bir sürümle reset/rollback kabul edilmez.

Arşiv bir teslim kuyruğu değildir; reset öncesi tarihsel journal kümesidir.
Normal consumer'a kendiliğinden geri açılmaz. Daha sonra teslim istenmesi
ayrı ürün/operasyon kararı ve ayrı kayıt gerektirir; eski olay tüketilmiş
sayılmaz. Geri dönüş yolu arşiv tablolarını silen down-migration değildir:
önceki uygulama ile birlikte **tam reset öncesi yedeği** izole DB'ye geri
yükleyip doğrulamak gerekir. Prova DB'sinde commit edilmiş arşiv varsa
normal truncate cleanup bilerek reddedilir; yalnız bu işe ait scratch DB
kaldırılıp yeniden kurulur. Mevcut/üretim DB'ye bu temizlik uygulanmaz.

Aday sorgusu için başka tabloya bakarak kısmi index oluşturma önerisi
uygulanmadı. Arşiv üyeliği ayrı tablodadır; mevcut PK ve archiveId index'i
korunur. Gelecekte yüksek frekanslı consumer eklenmeden önce gerçek sorgu
planı ve gecikme ayrıca ölçülmelidir; bu pakette consumer performansı veya
sınırsız üretim kapasitesi kabul edilmiş değildir.

## Astra hakem turları — üç snapshot açığı (10 Eylül, ikinci oturum)

Yürütücü Claude (Opus 5) olduğu için hakem **Astra** (`gpt-6-astra`, xhigh, read-only).
İki tur da NO-GO verdi ve **her iki turun bulguları aynı hata sınıfındaydı**: koruma,
çağıranın kendi snapshot'ında arşivin görünmesine bağlıydı. Arşivden önce snapshot almış
bir oturum için arşiv "yok" görünüyor ve koruma sessizce açılıyordu.

Üçü de gerçek PostgreSQL'de **yeniden üretildi** — kanıt
`tmp/reset-outbox-archive-2026-09-10/astra-verify-03/` ve `truncate-leak-01/`:

| açık                       | gözlenen                                                           | düzeltme                                                                     |
| -------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `REPEATABLE READ` yazıcısı | arşivlenmiş olayın `processedAt`'ini **hatasız** değiştirdi        | arşivleme, üyelikten önce satır sürümünü tazeliyor → yazıcı **40001** alıyor |
| üyelik büyütme             | düz `INSERT`, `eventCount=1` arşive 2. üyeyi ekledi                | niyet kapısı: üyelik yalnız `agentsozluk.archiving='on'` iken eklenir        |
| `TRUNCATE`                 | eski snapshot'lı oturum üyelikleri **hatasız sildi**; başlık kaldı | niyet kapısı: `agentsozluk.allow_archive_truncate='on'` gerekir              |

**`FOR UPDATE` denendi ve yetmedi.** Satır kilidi yeni bir satır sürümü doğurmadığı için
eski snapshot'lı yazıcı yine geçti; ölçüm `fix-hypothesis-02/hypothesis.json` içinde
(`none` ve `forUpdate` guardHeld=false, `bumpRowVersion` guardHeld=true).

**Neden GUC.** Satır görünürlüğüne bakan her kontrol aynı açığı taşıyor. `xmin`
karşılaştırması snapshot'tan bağımsızdı ama savepoint kullanılırsa meşru arşiv yolunu
kırıyordu. GUC kapısı satır görünürlüğüne bağlı değildir; kapı **boolean değil hedef
`archiveId`** taşır ve **yalnız üyelik INSERT'i boyunca** açıktır, böylece aynı
transaction'da sonradan kazara eklenecek üyelik de reddedilir.

**Sınırları açıkça yazıyoruz.**

1. GUC'yi herhangi bir oturum ayarlayabilir. Bu koruma **kazara ve yarışan yazıcıya**
   karşıdır, kararlı bir SQL operatörüne karşı değil — paketin baştan beri ilan ettiği
   tehdit modeli budur.
2. **`SET LOCAL` savepoint'ten bağımsız değildir.** Ayardan önceki bir savepoint'e
   rollback kapıyı geri alır; bu meşru yolun düşmesine yol açar, kapıyı açık bırakmaz.

Eski "tablolar boşsa TRUNCATE serbest" istisnası kaldırıldı; entegrasyon temizliği
(`tests/integration/database.ts`) niyetini açıkça belirtiyor. Her iki yol da tagged
`$queryRaw`/`$executeRaw` kullanır; `$executeRawUnsafe` repo kuralı gereği yasaktır.

**Bedel — tek sayı değil, aralık.** 192.001 olayda ölçülen **preview + execute toplamı**
(yalnız execute süresi değildir):

| koşu     | süre     | not              |
| -------- | -------- | ---------------- |
| probe-04 | 15,36 sn | tazeleme öncesi  |
| probe-05 | 13,38 sn | tazeleme öncesi  |
| probe-06 | 34,57 sn | tazeleme sonrası |
| probe-07 | 23,17 sn | tazeleme sonrası |
| probe-08 | 19,23 sn | tazeleme sonrası |
| probe-09 | 22,90 sn | tazeleme sonrası |

Satır sürümü tazeleme öncesi **13,4-15,4 sn (n=2)**, sonrası **19,2-34,6 sn (n=4)**.
**Varyans yüksek ve örneklem küçük**; tek bir 34,6 sn değeri "maliyet" diye sunulmamalı.
Yönü net (arttı), büyüklüğü bu ölçümle kesinleşmedi. CLI bütçesi 90 sn; bundan ayrı
olarak transaction 60 sn ve her SQL 20 sn sınırları da geçerlidir. Üretimde ~191.768
olay için benzer büyüklük beklenmeli, ama bu ölçüm üretim kapasitesi kabulü değildir.

**Testin ayırt ediciliği kanıtlandı.** Eski snapshot TRUNCATE senaryosu ilk yazımda
arşivden SONRA snapshot alıyordu, yani eski kaçağı hiç sınamıyordu (Astra bulgusu).
Düzeltildikten sonra negatif kontrol koşuldu: eski `EXISTS` guard'ında üyelikler
siliniyor (1 → 0, hata yok), yeni niyet kapısında 55000 ile reddediliyor (1 → 1).
Kanıt `tmp/reset-outbox-archive-2026-09-10/negative-control-01/`. Oturum hazırlığı
`sleep` yerine çıktıdan okunarak senkronize ediliyor.

**Prova teşhisi.** `psql` yardımcısı artık her çağrının süresini, güvenli sorgu **sınıfını**
ve üst düzey senaryo satırını kaydediyor; bütçe aşılırsa süreç öldürülmeden ÖNCE
`pg_stat_activity` görüntüsü (wait event, `pg_blocking_pids`) alıyor. Teşhis çağrısı
ölçülen sorgunun bütçesini uzatmıyor. Bu dal artık kendi senaryosuyla sınanıyor
(`slow-query-diagnostic-snapshot-captured`, probe-07'de 21,043 sn, görüntü alındı).
**Garanti sınırı:** istemci ~30 sn'de öldürülür ama sunucudaki sorgunun bitişi için mutlak
garanti yoktur; `statement_timeout` konmuş değildir.

**Kapanmayan.** `probe-01/02/03` FAIL'lerinin kök nedeni **kanıtlanmadı ve yeniden
üretilemedi**; başarılı koşular bunun giderildiğinin kanıtı sayılmaz. Prova fingerprint'i
hâlâ tek `string_agg` kullanıyor — ürün algoritmasından **bilerek bağımsız** tutuldu ki
ortak bir hata birbirini götürmesin; ama 256 karakter padding'li fixture daha büyük
payload'lar için kapasite kanıtı değildir.

## Hakem kapanışı — Astra GO (yalnız yerel paket)

Beş tur: **NO-GO, NO-GO, KOŞULLU, KOŞULLU, GO.** Bulunan beş kusurun tamamı gerçek
PostgreSQL'de yeniden üretildi ve düzeltildi; üçü aynı hata sınıfındandı (koruma
çağıranın snapshot'ına bağlıydı), biri prova teşhisinin kendi bütçesini aşmasıydı,
biri entegrasyon temizliğinin arşiv başlıklarını bırakmasıydı.

**Astra ayrıca iki testimi geçersiz buldu** — biri snapshot'ı yanlış sırada alıyordu,
diğeri temizliği hiç commit edilmiş arşivle sınamıyordu. İkisi de düzeltildi. Bu turdan
sonra her regresyon testi için **negatif kontrol** koşuluyor: düzeltme geri alındığında
testin düştüğü kanıtlanmadan test "var" sayılmıyor.

Negatif kontrolün doğru okunuşu (Astra düzeltmesi): temizlik düzeltmesi geri alındığında
düşen sekiz testin **belirleyici olanı yeni testtir** (`expected 1 to be +0`); diğer yedisi
aynı artık başlığın sonraki testleri kirletmesidir, **sekiz bağımsız kusur değildir.**

**GO'nun kapsamı dar.** Astra açıkça şunları çözülmüş saymadı ve bu kapanış onlara
dayanarak daha geniş bir güvence üretmiyor:

- `probe-01/02/03` FAIL'lerinin kök nedeni **kanıtlanmadı ve yeniden üretilemedi.**
- 30 sn prova bütçesi istemciyi öldürür; sunucudaki sorgunun bitişini **garanti etmez**
  (`statement_timeout` konmuş değil, süreç başlatma deadline'a dahil değil).
- Büyük payload kapasitesi kanıtlanmadı; fixture 256 karakter padding kullanıyor.
- GUC'yi herhangi bir oturum ayarlayabilir; koruma **kazara/yarışan yazıcıya** karşıdır.
- `SET LOCAL` savepoint'ten bağımsız değildir.

**Üretim için GO yoktur.** Üretim yedeği/geri yükleme kabulü, uygulama-worker kapanış
tasarımı, kaynak kapıları ve migration/reset kapıları bu teslimle kapanmaz.
