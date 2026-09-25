# Great reset — üretim profili tasarımı v5 (25 Eylül 2026)

**Durum: düzeltilmiş tasarım; uygulama, üretim erişimi ve reset onayı yok.** Gökhan'ın
24 Eylül kararı, prova edilmiş reset çekirdeğine ayrı ve sıkı kilitli üretim profili
kurmaktır. Üretimde herhangi bir erişim veya eylem için exact SHA ve eyleme ayrı açık
onay gerekir. [Gerçek boyutlu prova](RESET_GERCEK_BOYUT_PROVASI_2026-09-25.md)
yalnız kişisel operatör sunucusundaki yedek kopyasında yapıldı.

Astra'nın v2 incelemesi `ccc7147` için 2 P1, 6 P2, 1 P3; Claude Opus 5.5'in salt
okunur v3 incelemesi `146a319793fbaceaf1b71a0a0a21e3766e5b3f91` için
**TASARIM DÜZELTİLMELİ** (6 P2, 3 P3) verdi. v4 için exact
`3a7d6894ebd2b8ac4371c601672d1fad33c207ce` üzerinde yine Opus 5.5
**TASARIM DÜZELTİLMELİ** (4 P2, 6 P3) dedi: 410 sırası/mezar taşı ve restore
niyeti/sahipliği başlıca açıklar. v5 bunları runbook ile birlikte uzlaştırır.
Yeni digest süresi, geniş public ID geçişi, geri yükleme
ve üretim kontrol yolu henüz kabul edilmediği için bu belge uygulama izni değildir.

## Sabit üretim kimliği

- Hedef host `agent-sozluk-prod`, Compose proje/hizmet/ağ/volume kimliği,
  `/opt/agent-sozluk/runtime/releases/<SHA>` release'i, `.release-sha`, DB adı
  `agent_sozluk`, sahibi `agent_sozluk`, PostgreSQL 16 ve küme kimliği
  `7663503447447879713` birlikte doğrulanır. Bunlar önceki salt okunur gözlemlerdir;
  reset anında yeniden ölçülür. `agent_sozluk_postgres_data` volume'u değiştirilemez.
- Ayrı `scripts/great-reset-production.ts` ve ayrı guard gerekir. Repository çekirdeği
  `profile: LOCAL | PRODUCTION` alır ve hedefi kendi girişinde doğrular. Üretim hostu
  yerel sentetik izin listesine eklenmez. Host, release, Compose ve DB kimliklerinden
  biri uyuşmazsa hiçbir DB mutasyonu yapılmaz.
- Tek credential kaynağı üretimde izinleri doğrulanmış `/opt/agent-sozluk/app/.env`
  içindeki `DATABASE_URL` olur. Değer dışarı yazılmaz. Guard şema, kullanıcı, host,
  port, DB ve boş query/fragment koşullarını doğrular. Sonra **kod içinde** hedef URL'ye
  `connection_limit=1`, `connect_timeout=5` eklenir. Aynı doğrulanmış host/port/kullanıcı
  ile yalnız DB yolu `postgres` yapılarak ayrı kontrol URL'si türetilir; operatör kontrol
  IP'si veya URL'si vermez. Hedefte `inet_server_addr()`, DB/kullanıcı/sahip, sürüm ve
  `pg_control_system()` küme kimliği karşılaştırılır.
- Profil, guard/CLI kaynak özeti, release SHA, yedek makbuzu özeti ve `operationId`
  plan hash'ine girer. Audit aynı `operationId` ile reset işleminin içinde yazılır.

## Aşama 1 — içerik, yetki ve 410 kapıları

1. Her oturum sayımından önce `pg_stat_clear_snapshot()`; aynı DB'deki kendi PID'si
   dışındaki **her** backend ve `pg_prepared_xacts` içindeki her hazırlanan işlem
   engeldir. Başka rolün `backend_type`/`state` alanı görünmese de `datname` sayılır.
   `session_replication_role = origin`, bütün trigger'lar normal etkin durumda ve
   `row_security = off` ile bütün satır sorguları görünür ya da hata verir. Bu kontroller
   çekirdek PR #225'te `d35984e` için Opus 5.5 **KOD GO** aldı.
2. `entries` ve `topics` için public ID `DEFAULT` ifadesi doğru sequence'i doğrudan
   çağırır; `OWNED BY`, tip, `+1`, `CACHE 1`, kalıcılık, döngüsüzlük ve sonraki
   değerin mevcut `max(publicId)` üstünde olması denetlenir. **Üretim profiline ek
   kapı:** bu iki tabloda beklenen migration listesi dışında INSERT yazabilen
   trigger veya `pg_rewrite` kuralı yoktur. Bütün public kurallar şema özetine girer;
   beklenmeyen yazar varsa reset durur. Mevcut yerel çekirdeğin yalnız sequence
   kapısını üretim yazma yolu kanıtı sanma.
3. **410 için seçilen güvenli namespace yolu:** bugün eski `publicId` sütunları
   `INTEGER` olduğu için geçmişte atanmış her sayısal ID en fazla `2147483647` olabilir.
   Ayrı, önceden onaylı migration `entries`/`topics.publicId` ve sequence'leri
   `BIGINT` yapar; sequence `AS bigint`, `MAXVALUE ≥ 2147483648`, `CACHE 1`,
   `NO CYCLE` tanımı önizleme kapısında aranır. Public API ve istemci alanları
   `number` olarak kalır: Prisma `bigint` değerleri repository sınırında yalnız
   `Number.isSafeInteger` koşuluyla çevrilir, giriş de güvenle `bigint`e dönüşür.
   Sequence üst sınırı `Number.MAX_SAFE_INTEGER` değerini aşmaz. Envanter;
   route regex ve ayrıştırıcıları, tüm `publicId` seçen repository/service/UI
   tipleri, worker wire/Zod şemaları, feed/sitemap, gövde içi `#id` bağlantıları,
   prompt kataloğu ve JSON çıktısını kapsar. `2147483648` ve `2^53` sınır
   testleri ile production build geçmeden migration kabul edilmez. Migration
   sonrası reset öncesinde eski değer üretimi devam eder. Reset işlemi, iki tablo
   temizlendikten sonra **aynı transaction**
   içinde `ALTER SEQUENCE ... RESTART WITH 2147483648` uygular; `setval()` kullanılmaz.
   Son koşulda iki sequence'in sonraki değerinin `2147483648` olduğu ve yeni
   içeriklerin bu sınırdan başladığı doğrulanır. PostgreSQL 16'da `RESTART`
   transaction'a bağlıdır; bu davranış ve kilit süresi yerel gerçek boyutlu provada
   ayrıca sınanacaktır. Ayrı, korunan `great_reset_commits` satırı reset
   transaction'ında audit ve niyet tüketimiyle birlikte eklenir; rollback veya
   reset öncesinde satır yoktur. Public route sırası **önce canlı kaydı ara**:
   varsa normal yanıt; yoksa yalnız commit işareti varsa eski sayısal namespace
   (`≤2147483647`) 410; diğer bulunmayan sayılar 404. Böylece migration sonrası
   reset öncesinde ve pre-reset yedekten restore sonrasında canlı eski içerik
   200 kalır. Eski aralıkta hiç üretilmemiş ID'ye reset sonrası 410 verilebilir;
   SEO/ürün kabulünde Gökhan'a açıkça gösterilir.
4. Eski UUID ve slug adresleri için korunan `great_reset_tombstones` tablosu
   migration'la eklenir; cleared içerikle FK bağı taşımaz. Reset transaction'ı,
   `topics`, `topic_aliases` ve `entries` silinmeden önce eski UUID/slug/alias
   anahtarlarını burada toplar, satır sayısı ve benzersizliği doğrular. Public
   route **önce canlı içeriği**, sonra committed reset işaretiyle mezar taşını
   arar: canlı içerik aynı slug'ı yeniden kullanıyorsa 200 ve güncel içerik
   kazanır; yalnız eski silinen UUID/slug 410, hiç bilinmeyen 404. Kanonik
   `slug--publicId` zaten sayısal sınırla ayrılır. Korunan `users`/ajan profili
   silinmediği için var olan yazar profilinin 410'a dönmesi beklenmez; yalnız
   gerçekten silinen adres için 410 uygulanır. Eski/yeniden kullanılan slug,
   UUID ve restore sonrası route testleri zorunludur.
   `BIGINT` geçişi veya bu ürün kararı kabul edilmezse **reset GO yok**; mevcut
   sequence'den tarihsel en yüksek silinmiş ID'yi çıkardığımız iddia edilmez.
5. Önizleme, hedef DB rolünün okuma, tüm tablo kilidi, silinecek tablo `TRUNCATE`,
   outbox/audit/idempotency yazma, sequence okuma, `TEMP` ve `pg_control_system()`
   yetkilerini yoklar. Ayrı kontrol bağlantısı için doğrulanmış URL ile `postgres`
   DB'sine gerçekten bağlanma, `pg_hba` kabulü, hedef DB sahipliği ve başlangıç
   `datallowconn = true` ayrıca önkoşuldur. Salt okunur önkontrol yalnız katalog
   sahipliğini ve gerçek `postgres` bağlantısını doğrular; `ALTER DATABASE`
   yalnız exact onaylı kapı eyleminde mutasyondur. Hata ham SQL veya credential
   dökmeden güvenli kodla durur.

## Aşama 2 — iki özet ve yedek makbuzu

**Makbuz özeti** ve **kısa plan özeti** ayrı veri tipleridir. Makbuzda silinecekler
dahil her tablonun tam içerik SHA-256'sı bulunur: aynı release'in kodu, `UTF8`,
`DateStyle ISO, YMD`, `TimeZone UTC`, `extra_float_digits 3`, `bytea_output hex`
ve açık `COLLATE "C"` ile satırların SHA-256'ları sıralanıp tablo SHA-256'sı alınır.
Tablo satır sayısı, şema/enum/trigger/fonksiyon/kural tanımları, bütün nesnelerin
sahibi ve ACL'si (`relowner`, `relacl`, `nspowner`, varsayılan yetkiler, sequence ve
fonksiyon izinleri, DB `datacl` dahil) ve sequence tanımı ile `last_value`/
`is_called` ayrıca girer. Kaynak tam özet dump'ın hemen öncesi ve
sonrası aynı olmalı; operatör sunucusundaki ayrı PostgreSQL 16 prova kümesine
restore sonrası tam özet de aynı olmalı. Sequence MVCC görüntüsünden bağımsız
olduğundan iki kaynak okumasında ayrıca eşit olmalıdır. SHA-256 kriptografik
bütünlük kanıtıdır, matematiksel eşitlik teoremi değildir.

Önizleme **tek RepeatableRead snapshot'ında** iki özet üretir: makbuzla karşılaştırılan
tam içerik özeti ve yerel araçtaki kısa plan için `ctid`/`xmin` satır sürümü özeti.
Bu `count + sum(hashtextextended)` yalnız kısa bakım penceresinde bayat planı
yakalama aracıdır; dump/restore eşitliği yerine geçmez. Makbuz eşitliği yalnız
önizlemede yapılır ve plan hash'ine makbuz SHA-256'sı ile tam özet bağlanır. Son
uygulama bütün tablo kilitlerinden sonra **kısa satır sürümü özetini** ve korunan
tabloların tam içerik özetini yeniden ölçüp aynı plan hash'ini arar. Silinecek
29 tablo için tam içeriği kilit altında tekrar taramaz. Yeni tam özetin süresi ve
temp/WAL/disk kullanımı ölçülmeden bakım bütçesi kabul edilmez. Önizleme ile
uygulama arasında başka DB backend'i kalmaması ve kapı bu kısa özetin sınırıdır.

Makbuz; `operationId`, kaynak/restore küme kimlikleri, dump SHA-256, iki kaynak
okuması, restore özeti, serileştirme sürümü ve sonuçlarını taşır. Kaynağın
başlangıç yedeği, operatör sunucusunda 0600 korumalıdır; ham satırlar Git'e girmez.

## Aşama 3 — tek kullanımlık niyet ve bağlantı kapısı

- Ayrı, önceden onaylı release migration'ı korunan `great_reset_intents`,
  `great_reset_commits` ve `great_reset_tombstones` tablolarını ekler. Niyetin
  `consumedAt` ve `invalidatedAt` alanları aynı anda dolu olamaz (DB `CHECK`).
  Operatör, exact SHA/eylem onayından sonra `operationId`, kapsam, release SHA
  ve en çok iki saatlik son kullanmayı tek satırda kaydeder. Bu kayıt yedekten
  **önce** yapılır; yedek, önizleme ve uygulama onu aynı `consumedAt = NULL`,
  `invalidatedAt = NULL` durumunda görür. Niyet satırı içerik makbuzu ve plan
  özetine dahildir. Yanlış, geçersiz veya süresi geçmiş niyetle reset yapılmaz.
- Önizleme ve dump/restore doğrulamasından sonra, ama niyet tüketiminden önce,
  dış oturumlar ve autovacuum sıfıra iner. Başka oturum varsa **işlem başlamadan**
  beklenir; sınırlı bakım penceresi aşılırsa vazgeçilir. Son uygulama tek hedef
  backend ve tek Prisma interactive transaction açar; PID pinlenir. Ayrı kontrol
  bağlantısı `postgres` DB'sinden `ALTER DATABASE ... ALLOW_CONNECTIONS false`
  yapar. Hedef `datallowconn = false` ve yalnız pinned PID doğrulanır. PostgreSQL
  autovacuum worker'ı bu kapıdan muaf olabilir; kapıdan sonra yeni bir backend
  görünürse beklenmez, işlem geri alınır. Kapı koruması `pg_stat_activity` sayımıyla
  birlikte kullanılır; `CONNECTION LIMIT 0` kullanılmaz.
- İşlem bütün tablo kilitlerini `NOWAIT` alır, şema/sequence/plan ve makbuz bağını
  tekrar doğrular. Niyetin tüketimi **aynı reset transaction'ında**, kilitler ve
  plan eşitliği geçtikten sonra koşar:
  `UPDATE ... SET consumedAt = now() WHERE operationId = ? AND consumedAt IS NULL
AND invalidatedAt IS NULL AND expiresAt > now() AND releaseSha = ? RETURNING ...`.
  Tam bir satır aranır. Sonra arşiv, mezar taşı kopyası, silme, `RESTART`,
  commit işareti, audit ve son koşullar aynı transaction'da yürür. Korunan
  tablo karşılaştırmasının **izinli farkları** yalnız bu `operationId` niyetinin
  `consumedAt` değeri, yeni commit/mezar taşı ve audit satırları, outbox arşiv
  üyelikleri ile idempotency süreleridir; diğer korunan satırlar eşit kalır.
  Başarılı COMMIT hem reseti hem niyet tüketimini kalıcılaştırır. Rollback ikisini
  de geri alır. Hatalı giriş için otomatik yeniden deneme yok; gate açılır, sonuç
  uzlaştırılır, eski niyete ayrı işlemde yalnız `invalidatedAt` yazılır ve yeni
  deneme için Gökhan'ın yeni exact eylem onayı gerekir. Geçersizleştirme
  başlangıç makbuzunu değiştirdiği için yeni denemede **yeni dump, restore,
  tam özet ve plan** şarttır; autovacuum veya kilit hatası da buna dahildir.
  `consumedAt` hiçbir zaman "geçersiz" anlamında kullanılmaz. `--operation-id`
  ve onay değişkeni
  yalnız yanlış komutu önler; sohbet onayının yerini tutmaz.
- Hedefte `connection_limit=1`; kapı kapandıktan sonra ikinci hedef bağlantısı yok.
  `idle_in_transaction_session_timeout = 60s`, `statement_timeout = 300s`,
  `lock_timeout = 1s`, `client_connection_check_interval` ve Prisma işlem sınırı
  kodda sabitlenir. Belirsiz COMMIT otomatik tekrar veya restore başlatmaz.

## Aşama 4 — durdurma, geri dönüş ve yeniden açılış

1. Dört global bayrağın eski değerleri ve settingsVersion kaydedilir. Yeni iş kabulü
   durur; `QUEUED`/`CANCEL_REQUESTED` iptal edilir, `RUNNING` ve lease sıfıra iner.
   Worker hold, app kapatma ve Caddy bakım yanıtı ayrı ayrı doğrulanır.
2. **Tam zamanlayıcı envanteri kabul kapısıdır.** Üretim hostunda bakım ve canlılık
   alarmı timer'ları, operatör sunucusunda gecelik yedek timer'ı ve her iki hosttaki
   diğer timer/cron/servisler exact bakım öncesi salt okunur envanterle çıkarılır.
   DB veya app'e erişebilen her birinin eski etkinlik durumu kaydedilir, durdurulur,
   çalışan servisinin bitmesi beklenir; hedef oturum sıfır olur. Alarmın bakımda
   yanlış ntfy göndermemesi de denetlenir. Envanter eksikse reset yok.
3. Hata ya da başarıda kontrol bağlantısı `postgres` üzerinden
   `ALTER DATABASE ... ALLOW_CONNECTIONS true` yapar ve `datallowconn` değerini
   doğrular. Kontrol bağlantısı koparsa doğrulanmış container konsol/süper kullanıcı
   yolu kullanılır; **bu yol yerel prova ve exact üretim önkontrolüyle kanıtlanmadan
   GO yok**. Gate açılması app/worker'ı başlatmaz.
4. COMMIT cevabı belirsizse önce `postgres` DB'sinden hedef backend ve kilitlerin
   bittiği doğrulanır; sonra gate açılır; `operationId` audit, `consumedAt`, silinen
   tablo sayımları, commit işareti ve sequence sınırıyla sonuç **tamamlandı / geri alındı /
   belirsiz** olarak uzlaştırılır. Belirsizde operatör kararı beklenir.
5. Başarılı reset sonrası app dört yazma bayrağı kapalı, worker hold açıkken
   başlatılır. Caddy bakım yanıtı sürerken iç Host/loopback ile 410 route'ları,
   sitemap, sayaç/önbellek, anonim sayfalar ve health/ready ölçülür; dış trafik
   ancak kabul geçince açılır. İlk doğal koşu açılış sonrası ölçülür.
   Dört bayrak eski değerlerine ayrı ayrı
   döndürülür, worker hold en son kaldırılır. Durdurulan her timer/cron eski
   etkinlik durumuna getirilir; sonraki tetik ve son başarılı yedek/alarm kayıtları
   doğrulanır. `__Host-` çerez geçişi ve 6.3-5 indeks eşiği exact release kabulünde.
6. Reset COMMIT'i olmuş ama site kabulü düşmüşse rollback **ayrı bir üretim eylemidir**.
   Gökhan onaylarsa doğrulanmış dump production hostunda **yeni gölge DB'ye**,
   DB sahibi `agent_sozluk` rolüyle veya `--role=agent_sozluk` altında restore
   edilir; canlı DB önce silinmez. Gölge, kaynak makbuzuyla içerik, şema,
   sahiplik/ACL ve sequence açısından karşılaştırılır. Uygulama rolüyle
   rollback edilen DML smoke geçer. Backup'tan gelen geçerli/tüketilmemiş
   bütün niyetlere gölgede `invalidatedAt` yazılır; ayrı bu beklenen fark
   kaydedilir ve geçerli niyet sayısı sıfır doğrulanır. Gölge DB'de reset
   commit işareti yokluğu veya eski makbuzla uyumu doğrulanır. App/worker
   kapalıyken iki DB'de `ALLOW_CONNECTIONS false` ve bağlantı sıfır doğrulanır;
   kontrol DB'sindeki **tek transaction**
   ile eski canonical DB rollback adına, doğrulanmış gölge canonical ada
   çevrilir. Yerel PG16'da iki `ALTER DATABASE ... RENAME` ve rollback mümkün
   olduğu görüldü; gerçek boyut/izin/disk ve iki DB'nin `datallowconn` durumu
   ayrıca prova edilir. İsim kesiminde hata olursa transaction geri alınır,
   eski canonical DB kalır. Eski reset DB'si ilk kabul bitene dek rollback
   kanıtı olarak saklanır. Yeni canonical DB için gate ve app kabulü tekrar
   doğrulanır. Gölge restore'a disk yetmezse **reset GO yok**; eski DB'yi önce
   silen yol bu tasarımın geri dönüşü değildir. Otomatik restore yok.

## Açık kabul ölçümleri

- Üretim profili ve migration'lar henüz yazılmadı. Büyük `BIGINT` dönüşümü ve
  `2147483648` namespace'i gerçek boyutlu yerel kopyada süre, disk, WAL, index,
  ORM ve URL davranışıyla sınanmalı; ürün kararı ayrıca onaylanmalı.
- Yedek tam digest'i, kısa planın eşitliği, niyetin rollback/COMMIT sonucu, kapı,
  başka rol, autovacuum, özel INSERT yazıcısı ve RLS uçtan uca senaryoları yerel
  PostgreSQL 16'da doğrulanmalı. Yeni digest süresi ile temp/WAL/disk ve kesinti
  bütçesi ölçülmeden ~20 dakika üst sınır iddia edilmez. Kararlaştırılacak sayısal
  pencere aşılırsa reset başlamaz; işlem içi sınır ihlalinde fail-closed kapanır.
- Kontrol URL'si/pg_hba/sahiplik, timer envanteri, container konsol yedek yolu ve
  production restore prosedürü için exact üretim erişimi ancak Gökhan'ın ayrı açık
  onayından sonra doğrulanır. Yerel bulgular bu onayın yerine geçmez.
- [Runbook taslağı](RESET_URETIM_RUNBOOK_TASLAGI_2026-09-11.md) bu sırayı izler.
  Release, migration, CI, farklı model kod ve runbook hakemliği, 410 uygulaması,
  6.3-5/`__Host-` kabulü ve ayrı reset onayı olmadan üretim eylemi yok.
