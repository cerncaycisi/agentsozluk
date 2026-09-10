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

Arşiv formatı 1, PostgreSQL JSONB satır temsilinin sıralanmış SHA-256 özetini
kullanır. Reset UTC/extra_float_digits=3 ayarını sabitler. Outbox'ın saklanan
kolonlarını veya bu temsili değiştiren gelecek şema değişikliği arşiv formatını
ayrıca ele almalıdır; tarihsel hash'ler sessizce yeniden yazılmaz.

Yeni migration iki arşiv tablosunu, FK/index ve koruma trigger'larını ekler.
Mevcut outbox satırlarını güncellemez. Repo teslimi üretim migration kabulü
anlamına gelmez; bu paket schema-neutral/no-migration release değildir.
Gerçek üretim yedeği/restore, app/worker kapanışı, public/cache kabulü ve
AW/kaynak kapıları ayrıca kapanmalıdır.

## Doğrulama

Kod ve yerel PostgreSQL doğrulaması sürüyor. Nihai sayılar, bağımsız Opus 5
hakem kararı ve exact SHA bu bölüme tamamlandıktan sonra işlenecek.
