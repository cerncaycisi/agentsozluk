# O3 — sahipli ve süre sınırlı restore yardımcısı

**4 Ekim 2026.** Teknik belirtim/kanıt; tek aktif sıra [PLAN.md](PLAN.md).
Bu belge üretim restore kabulü değildir.

## Rol ve hedef sınırı

`run-owned.sh` PostgreSQL 16 ortamında yedi exact argüman alır:
`OP32 SOURCE_DB OWNER CONTROL DUMP_SHA256 VERIFY_SHA256 LIMIT_S`.
Üretimde `OWNER=agent_sozluk`, `CONTROL=postgres`; uygulama sahibine CREATEDB,
superuser veya yeni rol yetkisi verilmez. Kaynak DB'nin sahibi, kontrol rolünün
superuser kimliği, PG16 ve libc/collation sürümü dondurulmuş sorguyla doğrulanır.

Kontrol rolü yalnız kopya DB yaratımı, kimlik kontrolü ve hedefli hata temizliğinde;
restore/doğrulama uygulama sahibi rolüyle çalışır. Hedef yalnız yeni
`agent_sozluk_o3_<OP32>`; kaynakla eşit ad veya mevcut hedef reddedilir. SHA/OID/
sahip/comment kimliği bağlanır. Aynı operasyon staging'inin ikinci çalıştırması
reddedilir. Otomatik DROP/retry/deploy/SSH veya uygulama DB restore'u yoktur.

İş bütçesi monotonic `/proc/uptime` ile en çok 2700 saniye; restore ve SQL aynı
kalan süreyi kullanır. Hata temizliği ayrı en çok 30 saniye, yalnız hedef OID +DB
adı +owner +bu işlemin application_name eşliğiyle backend kapatır. Diğer hedefte
aynı app adı ve aynı hedefte farklı app adı korunur. Kimlik belirsizliğinde otomatik
silme yapılmaz. `O3_RESTORE_READY` yalnız restore +seçilen SQL çıkışının başarılı
olduğu kanıtıdır; yedek metadata karşılaştırması ve sahipli kopya temizliği ayrıca
zorunludur.

## Yerel kanıt ve çevre ayrımı

Önceki `wt-o3-bounded-restore` içindeki iki untracked taslak hash'li kopyalandı;
özgün dosyalar korunur. İlk taslak owner rolüyle CREATE DATABASE deniyordu.
Üretim runbook'u bu rolün CREATEDB olmadığını kaydediyor; ilk taslağın güçlü yerel
rolü bunu maskeliyordu. Taslak üretimde çalıştırılmadı.

Yerel ortak PG16 HBA yalnız mevcut `agent` rolünü kabul ettiğinden ilk yeni-role
fixture dört testte `no pg_hba.conf entry` ile düştü. Ortak sunucuya rol/bağlantı
izni eklenmedi. Yeni, yalnız sentetik verili, 127.0.0.1:55441 PG16.14 kümesinde
beş test **5/5 PASS**; küme sonrasında kontrollü kapatıldı. Her fixture'ın sahibi
LOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE, kontrol rolü ayrı superuser'dır.

- Yeni kopyada hash/ad/tekrar koruması, sequence SQL makbuzu ve kaynak değişmezliği.
- Gerçek yavaş indeks restore'u 5s iş bütçesinde kesme, iki yabancı oturumu koruma.
- Doğrulamanın restore ile aynı bütçeyi tüketmesi.
- Yetkisiz kontrol rolünün yaratmadan reddi; owner ayrıcalığı değişmez.
- Güvensiz argümanların DB komutuna erişmeden reddi.

Kaynak tabanı main `d829dd06eb4aa68154f521667302e6744b67399e`; önceki yerel
`ee1cd48` ile kod/test eşliği doğrulandı, yalnız #327 belge kapanışı eklendi.
Format/lint/typecheck/3 gereksinim kontrolü ve shell sözdizimi PASS. Yeni teknik
belge makbuzunun kontrolleri, bağımsız farklı model incelemesi ve exact CI açık.

## Üretim açık kapıları

İlk hazır uygulama paketi dağıtılmadan bu helper main'e birleştirilmez; mevcut
artifact/deploy adayı SHA sabit kalır. O3 daha sonra aynı uygulama/worker sürümü
korunarak, yalnız izinli mevcut PG konteynerinde sahipli izole DB'ye uygulanır.
Exact helper SHA, kaynak dump/verify hash'leri, host pin, disk/rol/DB kimliği,
operatör kilidi, metadata eşliği ve hedefli temizleme makbuzu gerekir. Eski dış
backup kendi yakalandığı metadata ile karşılaştırılır; sonraki canlı şemaya eşit
olduğu uydurulmaz. A5'in taze frozen backup/restore'u bu dış yedek kanıtının yerine
geçmez. P7'ye başlamadan yük/duruş makbuzu tamamlanır.

## İlk bağımsız inceleme ve kaynak uzlaştırması

Gerçek `claude-opus-5`, exact `645190b3b554baa8d217663eafcd73fc324f0c92`
için **KOŞULLU GO** verdi; 265,245 saniye, araç/üretim erişimi yok. CLI
`modelUsage` ayrıca 21 çıktı tokenlı bir `claude-haiku-4-5-20251001` çağrısı
kaydetti; karar metni/18.414 çıktı tokenı Opus'tadır. Yalnız Opus kullanım iddiası
kurulmuyor; yürütücünün modeli farklı `gpt-6.1-sol`.

İlk argüman testi yalnız eksik sayı kapısını sınadı; beşinci madde o testten genişti.
Yeni yedi-argümanlı 14 bozuk içerik ve üç staging symlink yolu hash/DB komutlarına
erişmeden reddi sınar. Gerçek hedef comment'i doğrulama sürerken değiştirilince
cleanup hedefe dokunmaz; iki bu-iş backend'i korunur, `O3_CLEANUP_UNCONFIRMED`
ayrı **exit 2** ve `cleanup-status` makbuzuna yazılır. Sentetik fixture kendi
ad/OID bağlı oturumlarını sonrasında temizler. Restore başarısızlığı exit 1'dir.
Cleanup sorgusu 20s statement timeout, dış kabuk 30s üst sınır kullanır; yeni
süre restorasyon iş bütçesini uzatmaz. Son isolated PG16 **7/7 PASS**; küme kapalı.
İlk beş testin makbuzu ayrı korunur. Son kaynak farklı model görüşü/exact CI açık.

Hash denetimi de toplam 2700s bütçeye dahildir; tek-kullanım staging dizini hash
hatasında tüketilmiş sayılır. Yeniden deneme aynı OP32 ile yapılmaz. Geçerli arşiv
tekrar kullanılabilir ancak yeni OP32/yeni staging ve bütün kapılar gerekir;
bu otomatik retry izni değildir. Kaynak PG16/encoding/libc locale kimliği ve arşivin başlık/şema-only makbuzu
üretim operatör kapısında ayrı kontrol edilir. Metadata eski locale kaydı içerdiği
varsayılmaz; helper güncel doğrulanmış kaynak DB locale'ini kullanır. Sonraki
canlı veriye veya sonraki şemaya eşitlik iddiası yapılmaz.

`O3_CREATE_RECEIPT_INVALID` veya create bağlantısının yarıda kesilmesinde helper'ın
beklenen OID'si yoktur: otomatik backend kill/DROP yok. Operatör süreç/scope'un
bittiğini doğrular, exact yeni target adının OID/owner/comment'ini salt okunur alır;
marker `o3:<OP32>` dahil kimlik üçlüsü kanıtlanmadan DB korunur. Bir kaynak veya
başka hedef bu işlemde silinmez. Kimlik eksikse normal cleanup başarı gibi
kaydedilmez; belirsiz artık ve disk etkisi makbuza girer, manuel uzlaştırma kapısı
açık kalır. Son hakem paketine gerçek `verify.sql` ve test DB koruması da eklenir.
