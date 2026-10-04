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

## İkinci hakem koşulları ve son yerel kapanış

Gerçek Opus5 exact `ecf7bf0a20efb75ffa2ae1f884315dc669f02e3a` KOŞULLU GO;
271,563 saniye, CLI yardımcı Haiku14 tokenı ayrıca kayıtlı. Tekrarlanabilir satır
metni için yalnız restore SQL'i değiştirmek yetmez: `DateStyle=ISO, MDY`,
`IntervalStyle=iso_8601`, `bytea_output=hex`, `lc_monetary=C` **hem kaynak metadata
READ ONLY oturumunda hem restore READ ONLY oturumunda SET LOCAL** ile sabitlendi.
DB/rol GUC'una kalıcı yazım yok; helper ortamın PGDATESTYLE değerini kaldırır.

Metadata satır formatı/üç eski marker ve strict parser korunur; önerilen dört
current_setting satırı doğrudan eklenmedi, çünkü eski yedi backup bu yeni satırları
içermez. Eski metadata yeniden yazılmaz veya yeni ayarla yakalandı denmez. Eski
yedeğin gerçek kıyas sonucu ayrıca zorunlu, uyumsuzlukta kapı kapalı kalır.
Sonraki kaynak yedek betiğinin exact inceleme/CI ve atomik kurulum makbuzu gerekir;
yerel kaynak düzeltmesini üretimde kurulmuş sayma.

Faz testleri üretim timeout'unu değiştirmeden hafif fixture için 15s ortak bütçe
kullanır. Kimlik değişimi filesystem dosyasına değil gerçek verify backend'inin
`pg_stat_activity.wait_event=PgSleep` kanıtına bağlanır; final `phase=verify` de
sınanır. 7/7 helper PG16 tekrar PASS; ayrı gerçek kaynak-producer/native-restore
senaryosu iki owned DB'de farklı DateStyle/IntervalStyle/bytea ayarları ve
`date/timestamptz/interval/bytea/money` verileriyle geçti: odaklı **2/2 PASS**.
İlk birleşik koşuda helper7 PASS/producer fixture1 FAIL; `binary` rezerv kelimesi
ve genişletilen INSERT kolon listesinin iki yazım hatası düzeltildi. Ürün guard'ı
ve eşik gevşetilmedi. AggregateError özgün cause'u korur; isolated runner test
exit'ini artık kabuk exit'ine taşır. Bütün sentetik kümeler sonrasında kapatıldı.
43 gece-yedek/receipt birim-shell testi PASS; son format/kod incelemesi/exact CI açık.

Kıyas public tablo ad/kardinalite/satır metni toplamsal hash'i ve sequence güvenliği
ile sınırlıdır. Kriptografik içerik özeti veya view/function/extension/constraint/
index kataloglarının bağımsız eşliği iddiası yok; pg_restore bütün arşivi hata
çıkışıyla uygular. Partition ebeveyn/çocuk toplamları iki tarafta da aynı yöntemle
hesaplanabilir, rows benzersiz fiziksel satır sayısı vaadi değildir. A5'in daha
ayrıntılı frozen katalog/şema/index kapıları bu O3 helper ile değiştirilmez.

O3 üçüncü hakem gerçek `claude-opus-5`, exact `8e8e27d543649f7b9b82fee6476e0b7ddbc2daa2`
**KOŞULLU GO**, 191,979 saniye; Haiku yardımcı 29 çıktı tokenı ayrıca kayıtlı.
Koşullar: timezone/lc_monetary/float fixture farklılığı, kaynak `t` sütunu reddi,
öngörülebilir tmp lock symlink/truncate koruması ve son exact CI. Bunlar source
kontrolüyle açık kabul edildi; önceki görüş GO diye yeniden adlandırılmadı.
Yeni private0700 UID lock/0600 tek-link append ve descriptor inode eşliği;
kaynak snapshot içinde dump öncesi `O3_AMBIGUOUS_ROW_ALIAS`. Son **44 unit/shell
+2 gerçek PG16 PASS** (source alias negatif dahil); parasal locale farklılığının
ayrı owned LOCPATH kümesindeki doğrudan gösterim testi sürüyor. Üretim backup
komutu henüz değiştirilmedi; gerçek eski dış backup restore hâlâ açık.

### O3 son yerel kapanış — 4 Ekim 22:57 UTC

Owned `de_DE.UTF-8` → C para gösterimi önce gerçek COPY format hatasını ortaya
çıkardı; source dump ve helper restore istemcisi geçici `lc_monetary=C` ile düzeltildi.
Son focused farklı para locale provası **2/2 PASS**; mevcut helper ve native format
birlikte **9/9 gerçek PG16 PASS** (53,77 saniye), **44 unit/shell PASS**. Kaynak/target
`saat dilimi`, float ve para ayarları da ayrışır. Kaynak `t` sütunuyla dump öncesi
reddedilir; boş stdout, sentinel kilit dosyası değişmezliği, symlink/hardlink/unsafe
mode olumsuz yolları geçti. Teste ait özel locale/kümeler kapalı; ortak PG korunur.
CLI `Address already in use` ön yoklaması TIME_WAIT bağlanmasıydı; private probe
SO_REUSEADDR ile dinleyen sunucuya dokunmadan ayrıldı. Bu hata ürün regresyonu değildir.
Yeni kaynak betiği üretimde kurulmadı; son hakem/exact CI ve gerçek dış restore açık.

## O3 son dar hakem kapanışı ve kapasite başlangıcı — 4 Ekim 23:16 UTC

Gerçek `claude-opus-5`, sunulan exact
`8084fc7bbc9421af3e1f782e9851e4364b371f2a` dosya metinleri için **KOŞULLU GO**;
82,918 saniye, 5.078 çıktı/3.865 düşünme tokenı; yardımcı Haiku 25 çıktı tokenı.
Hakem araçsızdır: git ağacını kendisi açmadı. Operatör packet `git show` ve temiz
exact checkout ile bağlandı; bağımsız Git/SHA sorgusu yaptığı iddia edilmez.
Yeni bloklayan ürün riski bulmadı; source holder/metadata `pg_catalog` pin'i doğru.
Koşulu target shadow provasının eksikliğiydi. Yalnız sentetik target DB'ye de
`search_path=public,pg_catalog` eklendi; restore edilmiş gölge fonksiyon unqualified
0, catalog fonksiyon nonzero. Actual source/target gölge altında strict comparison,
özel de_DE/C para render ve native restore **2/2 PG16 PASS** (23:15:55). Runtime
kodu reviewed `8084fc7` ile aynı; yalnız test/ölçüm belgesi kapanır. Son exact CI
normal zorunlu kapıdır; koşulsuz GO veya üretim restore kabulü denmez.

Eski dış native arşiv yerel TOC/schema-only ön kontrolü: 671.960.158 bayt, PG16.14/
zstd/CUSTOM, 50 public tablo adı kendi metadata'sıyla eşit; 3.270.401 satır/3 sequence.
Materialized/foreign/BLOB/large object TOC kaydı yok. Metadata hash
`554e9ffe76ef9c0405222dad56bd17516aea11c0ba0b206d5561955cac7b718c`, schema-only
hash `5065da0e582422c6889fa5aab5a1b8e92390d0e7497a7fe955a78af5a5e7efba`.
Bu arşiv tam restore/veri eşliği değildir; gerçek izole restore açık.

23:08:28 UTC pinli canlı `d829dd0`, pause/ayar305/openRuns0/leases0 ve diğer Codex
süreci yok kapılarıyla existing reviewed CLI **cold10→warm10→dual2** kapasite
başladı. Worker app/image/PID korunur; output/diagnostics create-exclusive 0600.
O3 CI beklerken bağımsız ilerler; üretimde tek ağır iş, restore başlamadı. Paket
strict runbook diagnostics doğrulaması ve admin rota kaydı ayrıca gereklidir;
başlatma kapasite PASS değildir. P7/T0 henüz yok, final M2 BLOCKED aynı.
