# Great reset — üretim profili tasarımı v3 (25 Eylül 2026)

**Durum: tasarım; uygulama ve üretim erişimi onaylanmadı.** Gökhan'ın 24 Eylül kararı: yürütücü,
prova edilmiş reset aracının sıkı kilitli üretim profili olacak. Üretim reseti için exact SHA ve
eyleme ayrı açık onay gerekir. [Gerçek boyutlu prova](RESET_GERCEK_BOYUT_PROVASI_2026-09-25.md)
PR #223 ile kaydedildi. v2'nin Astra incelemesi `ccc7147` sürümünde **TASARIM DÜZELTİLMELİ**:
2 P1, 6 P2, 1 P3. Bu sürüm tasarım kararlarını netleştirir; yeni profilin ölçümü ve hakemliği
henüz yapılmadı.

## Sabit üretim kimliği ve sınırlar

- Üretim veritabanı `agent_sozluk`, sahibi `agent_sozluk`, PostgreSQL 16; küme kimliği
  `7663503447447879713`. Uygulama rolü süper kullanıcı değil. Compose tek `db` hizmeti,
  `agent-sozluk` projesi ve `agent-sozluk_postgres_data` volume'u kullanıyor. Sağlık kontrolü
  `postgres` veritabanına bağlanıyor; hedef DB oturum sayımına girmiyor. Bunlar 25 Eylül'deki
  salt okunur gözlemlerdir, reset anında tekrar doğrulanacak.
- Host `agent-sozluk-prod`, çalışma dizini `/opt/agent-sozluk/runtime/releases/<SHA>`;
  `.release-sha`, çalışan release ve onaylanan SHA eşit olmalı. Bağlantı IP'si Compose'un tam
  proje/hizmet/ağ/volume kimliğinden araç içinde türetilir; operatör IP verirse eşitliği aranır.
- Kimlik bilgisi yalnız `/opt/agent-sozluk/app/.env` içindeki tek `DATABASE_URL` değerinden
  veri olarak ayrıştırılır; dosya sahibi/izinleri, URL şeması, kullanıcı, host, port, DB ve boş
  query/fragment denetlenir. Değer yazdırılmaz. Kabuktaki `DATABASE_URL`, `AGENT_DB_IP` ve
  onay değişkenleri dosyadan yüklenmez. Bağlantı sonrası `inet_server_addr()`, DB/kullanıcı/
  sahip, PostgreSQL sürümü ve `pg_control_system()` küme kimliği karşılaştırılır.
- Ayrı `scripts/great-reset-production.ts` giriş noktası ve ayrı guard. Repository çekirdeği
  `profile: LOCAL | PRODUCTION` alır ve hedef kapısını **kendi girişinde** uygular. Üretim
  kimliği yerel sentetik hedef listesine eklenmez. Profil, guard/CLI kaynak özeti, release SHA,
  yedek makbuzu özeti ve `operationId` plan hash'ine girer. Üretim audit kaydı reset işleminin
  içinde yazılır; bağlantı koparsa `operationId` ile sonuç ayrıca uzlaştırılır.

## Aşama 1 — çekirdek önkoşulları

1. Her denetimden önce `pg_stat_clear_snapshot()`; `pg_stat_activity` üzerinde aynı DB'deki
   kendi PID'si dışındaki **her** oturum engel. Başka rolün `backend_type`/`state` alanı NULL
   görünse bile `datname` görünür. Autovacuum dahil; bitmesi beklenir. Denetim önizlemede,
   kilitlerden sonra ve COMMIT'ten hemen önce yapılır. **Bu yalnız gözlem, bağlantı kapısı
   değildir**; aşağıdaki `ALLOW_CONNECTIONS false` kapısı zorunludur.
2. `session_replication_role = origin` ve kullanıcı trigger'larının normal açık durumu aranır.
   Önizleme gerçek işlem kümesinin yetkilerini yoklar: silinecek tablolarda `TRUNCATE`, tüm
   tablolarda okuma ve `ACCESS EXCLUSIVE` için en az bir uygun yazma yetkisi, outbox/audit/
   idempotency yazmaları, sequence okuma, `TEMP`, `pg_control_system()`.
3. `entries` ve `topics` public ID sequence'leri için artış tam `+1`, `NO CYCLE`, `CACHE 1`,
   kalıcı sequence, doğru sütun bağlılığı ve doğru tip aranır. `nextval()` çağrılmadan
   `last_value`, `is_called` ve tanımdan sonraki değer hesaplanır. Sonraki değer hem mevcut
   `max(publicId)`'yi hem önceki 410 sınırını aşmalı; `INTEGER` üst sınırına ve sequence `max_value` sınırına yer kalmalı. Önizleme,
   yedek ve uygulama bu tanım/durumu aynı görmeli. **Geçmişte silinmiş ID'lerin tümünü DB
   satırlarından kanıtlamak mümkün değildir:** ilk 410 sınırı için ayrı, kalıcı yüksek su
   işareti ve geçmiş sequence gerilemediğine dair kayıt gerekir. Bu kanıt yoksa GO yok.
4. Bağlantı kaybında sonuç üç değerli: audit kaydı ve son koşullar `operationId` ile
   uzlaştırılınca **tamamlandı / geri alındı / belirsiz**. Belirsizde otomatik yeniden
   uygulama veya restore yok. Kalan backend ve kilitler ayrıca kontrol edilir.

## Aşama 2 — yedek makbuzu ve tek kullanımlık niyet

**Yedek eşitliği.** Dondurma ve kuyruk boşaltma sonrası operatör sunucusuna yeni dump alınır,
operatör sunucusundaki ayrı prova kümesine geri yüklenir. Aynı release'in kodu ve sabit
serileştirme ayarları (`UTF8`, `DateStyle ISO, YMD`, `TimeZone UTC`, `extra_float_digits 3`,
`bytea_output hex`, açık `COLLATE "C"`) altında kaynak ve restore için her tablonun satır
sayısı ile sıralı satır SHA-256'larından tablo SHA-256'sı hesaplanır. Şema özeti, enum,
trigger/fonksiyon tanımları, sequence tanım + `last_value` + `is_called` ve public ID yüksek su
sınırı ayrıca karşılaştırılır. Kaynak tablo/şema özeti dump'ın hemen öncesinde
ve sonrasında eşit olmalı; dump'tan geri yüklenen özet de bunlara eşit olmalı. Sequence
değişiklikleri MVCC snapshot'ına bağlı olmadığı için kaynak sequence durumu dump'ın hemen
öncesinde ve sonrasında da eşit olmalı; farkta makbuz geçersizdir. SHA-256 çakışması teorik olarak mümkündür; makbuz
**kriptografik bütünlük güvencesidir**, matematiksel eşitlik ispatı değildir. v2'deki
`count + sum(hashtextextended(t::text,0))` kesin eşitlik iddiası kaldırıldı.

Makbuz; `operationId`, kaynak küme/DB, dondurma anı, dump sha256, restore kümesi, tablo/şema/
sequence özetleri, serileştirme sürümü ve karşılaştırma sonucunu taşır. Ayrı önizleme,
app/worker ve yedek bağlantıları durduktan sonra makbuzu üretimle karşılaştırıp plan hash'i
verir. Son uygulama çağrısı hedef DB'ye tek backend açar, aşağıdaki kapıyı kapatır ve **aynı
pinned transaction içinde** tablo, şema, sequence ve tüm önkoşulları yeniden ölçer; plan hash'i
eşit değilse `STALE_PLAN`. Son uygulama önizlemeden aldığı snapshot'a güvenmez. Makbuz ölçümü
ve her plan özeti kendi tutarlı tablo/şema snapshot'ını kullanır; sequence durumu ayrıca okunur
ve kapı sayesinde arada başka oturum tarafından değiştirilemez. Operasyonel niyet kaydının
tüketim alanı bu eşitlikten açıkça hariçtir ve audit'te ayrıca izlenir. Yeni tam tablo
özetinin süresi ve disk/temp/WAL kullanımı **yeniden ölçülmeden** bakım bütçesi kabul edilmez.

**Tek kullanım.** v2'deki `COMMENT ON DATABASE` niyeti bırakıldı; başka veritabanından
zamanında değiştirilebildiği için oku–sonda sil atomik değil. Bunun yerine korunacak
`great_reset_intents` tablosu migration ile **resetten ayrı, önceden onaylanmış ve kabulü
bitmiş bir release'te** eklenir; bakım sırasında ad hoc DDL yoktur. Operatör, açık onaydan sonra
`operationId`, exact release SHA, son kullanma zamanı (en çok 2 saat) ve eylem kapsamını
tek satırda yazar; bu satır yedekten **önce** oluşturulur. Araç, dump makbuzunu ve planı
doğruladıktan sonra ayrı kısa transaction'da
`UPDATE ... SET consumedAt = now() WHERE operationId = ? AND consumedAt IS NULL AND expiresAt > now() AND releaseSha = ? RETURNING ...`
ile niyeti **reset işleminden önce** tüketir. Sıfır satırda durur. Böylece rollback/bağlantı
kaybı niyeti yeniden kullanılabilir kılmaz. Kullanılmayan niyet de süre sonunda geçersizdir.
Makbuzdaki başlangıç satırı ile önizlemedeki tüketilmiş satırın tek beklenen farkı kayıtlıdır;
uygulama sonrası satır korunur ve audit aynı `operationId`'yi taşır. `--operation-id` ve
`AGENT_GREAT_RESET_PRODUCTION_PLAN_APPROVED` eşitliği yalnız hata önleyicidir; Gökhan'ın
ayrı exact SHA/eylem onayının yerine geçmez.

## Aşama 3 — yeni bağlantıları durduran bakım kapısı

1. Dört bayrağın **önceki değerlerini** kaydet → yeni iş kabulünü durdur → `QUEUED`/
   `CANCEL_REQUESTED` koşuları iptal et, `RUNNING` bitsin → dört bayrağı kapat → lease yok
   doğrula → worker hold → app kapat (Caddy bakım yanıtı). Operatör sunucusundaki gecelik
   yedek timer'ının önceki etkinlik durumunu kaydet; timer'ı durdur ve hâlihazırda çalışan
   yedek servisini bitene kadar bekle. Yedek bağlantısı sıfır olmalı.
2. Dump/restore makbuzu ve önizleme planı hazırken, `operationId` niyeti tüketilir.
   Son uygulama işlemi hedef DB'ye **tek** reset backend'i açar ve PID'sini doğrular.
   Ayrı kontrol bağlantısı `postgres` DB'sinden, DB sahibi yetkisiyle
   `ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS false` komutunu autocommit'te
   çalıştırır; `datallowconn = false` ve hedefte yalnız reset PID'si doğrulanır. Başka
   oturum varsa devam edilmez. Gözlem döngüsü sonlandırma yapmaz; autovacuum veya başka
   oturumun bitmesi beklenir. `CONNECTION LIMIT 0` kullanılmaz: yaklaşık uygulanır ve
   süper kullanıcı/worker istisnaları vardır. `ALLOW_CONNECTIONS false` yeni bağlantıyı
   reddeder; mevcut reset backend'i çalışmaya devam eder. Bu davranış 25 Eylül'de **yalnız
   yerel geçici PostgreSQL 16 veritabanında** doğrulandı; üretimde yetki ve bağlantı
   düzeni önkontrolü ayrıca gerekir.
3. Son uygulamanın bütün DB sorguları **tek Prisma interactive transaction** içinde aynı
   pinlenmiş backend'de yürür. Kapı, transaction açıldıktan hemen sonra ayrı `postgres`
   bağlantısından kapatılır. Kod PID'yi ve kapının kapalı durumunu doğrular; backend koparsa
   işlem başarısız sayılır ve yeniden bağlanılmaz. Çekirdek tüm tablo kilitlerini `NOWAIT`
   alır; makbuz/oturum/sequence/şema ve plan kontrollerini yineler. Kapı açılmadan hiçbir
   ikinci hedef DB bağlantısı kurulmaz.
   DB sağlık kontrolünün `postgres` DB'sini kullandığı her koşuda ayrıca doğrulanır.
4. Başarı, hata ve vazgeçme yollarında kontrol bağlantısı `postgres` DB'sinden
   `ALTER DATABASE ... ALLOW_CONNECTIONS true` yapar ve eski `datallowconn` değerini
   doğrular; gate kendi kendine açılmaz. Sonuç **belirsizse** önce backend/audit uzlaşısı,
   sonra operatör kararı; onaysız yeniden reset yok. Gate'in açılması app/worker'ı otomatik
   başlatmaz. `postgres` DB'sinden kontrol bağlantısı da kaybolursa runbook'ta doğrulanmış
   Docker konsol yolu ve açık operatör adımı kullanılır; kapanış kontrolü yapılmadan
   bakım bitmiş sayılmaz.
5. App/worker açılış kabulünde dört bayrak önceki değerlerine ayrı ayrı geri yazılır,
   worker hold en son kaldırılır. Gecelik yedek timer'ı önceki etkinlik durumuna döner;
   çalışan servis, sonraki tetik zamanı ve son başarılı yedek kaydı doğrulanır.
   `entries`/`topics` sequence sınırı, 410 uygulaması, 6.3-5 indeks eşiği ve `__Host-`
   çerez geçişi exact release'in kabul listesine girer.

## Bütçe ve açık doğrulamalar

- Üretimde prova yok. Restore provası operatör sunucusunda. Uygulama/worker kapatma-açma
  araçta değil runbook'ta; bağımsız onay ve geri dönüş adımıdır.
- `statement_timeout = 300s`, Prisma işlem sınırı `900s`, `lock_timeout = 1s` ve
  `idle_in_transaction_session_timeout = 60s` farklı riskleri sınırlar. **~20 dakika
  garanti edilmiş üst sınır değildir**; istemci kaybında PID ve kilitler ayrıca gözlenir.
  Yeni digest ölçümüyle toplam kesinti, WAL/temp alanı ve 8 GiB asgari boş alan tekrar
  hesaplanacak. Kaynaklar sınırı aşarsa profil uygulanmaz.
- Profil kodu ve migration, yerel geçici DB'de `ALLOW_CONNECTIONS false` kapısı, başka
  rol oturumu, sequence gerilemesi, niyetin tek kullanımı, başarısız/başarılı gate açılışı,
  bağlantı kaybı ve yedek makbuzu uyuşmazlığıyla doğrudan sınanacak. Farklı model salt
  okunur hakemlik ve exact SHA'ya göre CI/yerel kabul olmadan üretim onayı istenmez.
