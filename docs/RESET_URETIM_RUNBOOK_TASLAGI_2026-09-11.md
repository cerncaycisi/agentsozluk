# Great reset — üretim runbook taslağı v18 (26 Eylül 2026)

**Yürütme yetkisi değildir.** Tek aktif iş sırası [PLAN.md](PLAN.md) Sıra 5'tir.
Bu dosya, [üretim profili tasarımı](RESET_URETIM_PROFILI_TASARIMI_2026-09-25.md)
için adım ve geri dönüş sözleşmesidir. Kod, migration, 410 davranışı, bütçe,
kontrol bağlantısı, zamanlayıcı envanteri ve production restore yolu kabul edilmedi.
Üretim sunucusuna her erişim ve reset/restore eylemi için Gökhan'ın exact SHA ve
somut eyleme ayrı açık onayı gerekir. Önceki dağıtım veya bu taslak onay değildir.

Salt okunur Opus 5.5 tasarım incelemesi v3 `146a319` için 6 P2, 3 P3;
v4 `3a7d689` için 4 P2, 6 P3; v5 `4a5dc87` için 1 P2, 7 P3 buldu.
v6 `eeb1b54` için **TASARIM UYGUN**, P1/P2 yok, 8 P3 verdi. v7 tek reset
sınırını, kodlanmış başlık URL'sini ve Node middleware adayını netleştirdi.
Opus 5.5 v7 `19a6c85` için de **TASARIM UYGUN** dedi (P1/P2 yok, 7 P3).
Opus 5.5 v8 exact `ace70f6` için **TASARIM UYGUN** dedi (P1/P2 yok, 6 P3);
v9 exact `6ca052f` için **TASARIM DÜZELTİLMELİ** dedi (1 P2, 4 P3).
Opus 5.5 v10 exact `719e191` için **TASARIM UYGUN** dedi (P1/P2 yok, 6 P3).
Opus 5.5 v11 exact `6c032ee` için **TASARIM DÜZELTİLMELİ** dedi (1 P2, 6 P3):
rollback sonrası eski imzalı kayıt yeniden kullanılabiliyordu. Opus 5.5 v12
exact `c0442c8` için **TASARIM UYGUN** dedi (P1/P2 yok, 6 P3). v13 exact
`483886a` için **TASARIM DÜZELTİLMELİ** dedi (1 P2, 6 P3): iç kabul yazısı
geri dönüş özetini bozabilirdi. Opus 5.5 v14 exact `a8b52ca` için
**TASARIM UYGUN** dedi (P1/P2 yok; sıra çelişkisi ve altı P3 kabul ayrıntısı).
Opus 5.5 v15 exact `2a34d8e` için de **TASARIM UYGUN** dedi (P1/P2 yok,
6 P3). v16 restore penceresini ve normal app kabulünü netleştirir. v17 410'u
yalnız bilinen silinmiş sayısal ID'ye daraltır ve üst namespace kilidini ekler.
Astra v17 exact `e34fa5a` için **TASARIM DÜZELTİLMELİ** dedi (2 P2, 1 P3); v18
reset sonrası alt sınır kısıtını ve aşağıdaki adım 3/5 eşlemesini ekler.

## Ön kabul kapıları

- AW tam pencere, kaynak tabanı ve kuyruk kusuru ölçümleri [PLAN.md](PLAN.md)
  Sıra 5'e göre tamamlanır. Reset ancak davranış turu oturduğunda planlanır.
- Exact release ve önceden kabul edilmiş migration; `BIGINT` public ID yolu,
  `great_reset_intents`/`great_reset_commits`/UUID `great_reset_tombstones`/
  `great_reset_exposure_events`, 410,
  6.3-5 ve `__Host-` kabulü kod/test/CI ile geçer.
  Yeni ID namespace'i `2147483648` başlar. Migration'dan resete kadar iki
  tablodaki `CHECK ("publicId" <= 2147483647)` ve sequence `MAXVALUE =
2147483647` üst aralığı DB düzeyinde kapatır; önizleme ve uygulama bunları
  denetler, reset transaction'ı kaldırır. Gökhan kararı (26 Eylül): 410 yalnız
  mezar taşında `(kind, publicId)` kayıtlı silinmiş ID'ye; bilinmeyen 404.
  `great_reset_commits`/`great_reset_exposure_events` doluysa veya reset geri
  yükleme audit'i varsa ikinci
  reset bu tasarımla yasaktır. Route
  commit işaretine ön koşul olarak bakar; işaret varsa canlı içerik kaydı
  mezar taşından önce kazanır. İçerik yoksa sayısal veya UUID mezar taşı
  kaydı 410, bilinmeyen adres 404. Yalın
  `/baslik/{kodlanmış başlık}` açılmamış başlık formudur; 410 kapsamına girmez.
  `--rakam` sonekinin mevcut parser'la çakışması ayrıca envanter/validasyon
  kapısıdır. Reset
  öncesi ve pre-reset restore sonrası var olan içerik normal yanıt verir.
  Node middleware uygulaması mevcut geniş matcher/prefetch dışlamasını korur;
  permalinkler için ikinci, prefetch'i kapsayan matcher ve gerçek 410 yanıtında
  `Cache-Control: no-store`, CSP, `X-Robots-Tag: noindex` aranır. Standalone
  build/E2E, yalnız `GET`/`HEAD` eski ID/UUID adaylarında 410,
  POST/yalın başlık/yeni ID'de DB sorgusuz `next()`, DB hata yolunda
  `503 no-store`, RSC/Server Action geçişi,
  tek havuz, toplam bağlantı sayısı ve yoğun prefetch sorgu/p95 ölçümünü
  kanıtlamadan GO yok. İşaret önbelleği kullanılırsa reset/restore süresince
  bütün app süreçleri kapatılıp işaret değişiminden sonra yeniden başlatılır;
  her yeni süreçte boş önbellek iç Host kabulünde ölçülür.
- Kişisel operatör sunucusundaki gerçek boyutlu provada tam digest, reset, sequence
  `RESTART`, niyet COMMIT/rollback, kapı açma/kapatma, başarısız bağlantı ve tam
  gölge restore/DB adı değiştirme yolu ölçülür. Üretim hostunda iki DB'ye aynı
  anda disk yetmiyorsa reset yok. Sayısal kesinti bütçesi ve vazgeçme zamanı **önceden**
  kaydedilir; 8 GiB altı diskle production build başlamaz.
- Exact üretim erişim onayıyla, üretim host/Compose/DB/release kimliği,
  `postgres` kontrol bağlantısına CONNECT/pg_hba/sahiplik, `datallowconn=true`,
  sağlık kontrolünün `postgres` DB'sine gittiği ve container konsol yedek yolu
  doğrulanır. Shadow restore için `rolcreatedb`/`rolsuper`, `--role` üyeliği,
  rename ve untrusted extension ihtiyacı da ölçülür. Bunlar yapılmadan reset
  onayı istenmez.
- Üretim ve operatör sunucusundaki tüm DB/app erişimli timer, cron ve servisler
  adları, önceki `enabled/active` durumları ve çalışan PID'leriyle envantere
  girer. Bilinenler: production bakım timer'ı, canlılık/lease alarmı;
  operatör sunucusu gecelik yedeği. Envanter başka işler bulabilir.
- Operatör sunucusunda üretim DB'si ve yedek dizini dışındaki 0600 anahtarla
  HMAC imzalı reset nesli/backup envanteri hazırlanır. Yedek nesli dosya
  adından değil operatör prova DB'sinde doğrulanan commit tablosu/satırı/operationId
  ve public ID tipinden çıkarılır; migration öncesi şema reddedilir. İmzayı
  yalnız operatör sunucusundaki restore kapısı doğrular; anahtar oradan
  çıkmaz. Kapı dışındaki dump aktarımı yoktur; üretim `pg_restore` öncesi
  SHA-256'yı yeniden doğrular. Kayıt artan sıra/önceki özetle yalnız eklenir;
  her yeni dosya önceki dosyanın byte düzeyinde birebir öneki ile tek yeni
  kayıttır; yazıcı bunu doğrular. Yeni `operationId` önceki terminal kaydı
  yeniden açmaz. Geçici dosya fsync → aynı dizin rename → dizin fsync → geri okuma/imza
  doğrulaması, eski imzalı kayıt tekrarı ve eski gecelik yedek ret yolları
  test edilmeden GO yok. Korunan `great_reset_exposure_events` tablosu migration
  ve app kodu kabulüne girer; trafik açılışı tek append-only satırdır.
  Olayı pinned üretim CLI mevcut doğrulanmış tek `DATABASE_URL` rolüyle yazar;
  yeni credential/rol yoktur. Bu rol tablo sahibi olabileceğinden GRANT geri
  alma sahiplik sınırı değildir. UPDATE/DELETE/TRUNCATE trigger ile reddedilir;
  sahip/süper kullanıcının trigger'ı kapatması tehdit modeli dışındaki yetkili
  operatör eylemidir. `great_reset_commits` ve `great_reset_tombstones` için
  de UPDATE/DELETE/TRUNCATE reddi ve tablo sahibi sınırı negatif testlerle
  kanıtlanır. Kazara/app DML'i negatif testlerle yakalanır.
- Başlangıç makbuzunda Gökhan'ın onayladığı exact SHA, `operationId`, kapsam,
  plan/dump SHA-256, son kesim zamanı, disk/WAL/temp başlığı, eski bayraklar,
  önceki timer durumları ve geri dönüş kararı bulunur. Secret veya ham entry
  gövdesi makbuza yazılmaz.

## Uygulama sırası

1. **Dondur.** Dört global ayarın önceki değerini ve settingsVersion'ı kaydet.
   Yeni iş kabulünü kapat; `QUEUED`/`CANCEL_REQUESTED` koşuları iptal et;
   `RUNNING` ve lease sıfıra insin. Worker hold ve systemd worker duruşunu
   doğrula. App'i durdur, Caddy bakım yanıtını doğrula. Etkilenen timer/cron'u
   durdur; çalışan yedek/bakım/alarm servisleri bitsin. Dış DB oturumu sıfır
   olmadan ilerleme. Bekleme, hedef reset işlemi başlamadan yapılır.
2. **Niyet ve yedek.** Onaylı `operationId` için tek, süresi en çok iki saat olan
   `consumedAt=NULL`, `invalidatedAt=NULL` niyet satırını yaz. Kişisel operatör
   sunucusuna yeni custom-format dump al;
   0600 izin, boyut ve SHA-256 kaydet. Aynı sunucudaki ayrı PostgreSQL 16
   geçici DB'ye gerekli roller/üyelikleri önceden kurup tam restore et;
   DB yorumu, limit, DB/rol ayarı ve extension sahipliğini uygula. Kaynakta
   dump öncesi/sonrası ve restore'da bütün tablolar için tam içerik/şema/
   sequence, DB durumu ve yetki özetleri tanımlı farklar dışında eşit olsun. Farkta
   niyete yalnız `invalidatedAt` yazarak geçersizleştir ve bu denemeyi bitir.
   Doğrulanmış exact dump SHA'sı ve `operationId` dış kayda `PREPARED` olarak
   atomik/imzalı yazılıp tekrar doğrulanır; dump içerik sınıfı da kayda girer.
   Bu durum restore izni vermez.
3. **Önizle.** Üretim profili önizlemesi aynı RepeatableRead görüntüsünde tam
   makbuz özetini ve kısa `ctid`/`xmin` plan özetini çıkarır. Makbuz eşitliği,
   kimlik, izinler, oturum/`pg_prepared_xacts`, RLS, trigger, INSERT yazıcıları,
   dört bayrak, lease/outbox, boş `great_reset_commits` ve
   `great_reset_exposure_events`, geri yükleme audit'i
   yokluğu, `AS bigint`, `MAXVALUE = 2147483647`, iki tabloda doğrulanmış
   `CHECK ("publicId" <= 2147483647)`, `max("publicId") ≤ 2147483647`
   ve yazıcı kapıları geçsin.
   Plan hash'i, makbuz özeti ve bitiş bütçesi kaydedilir. Niyet hâlâ
   `consumedAt=NULL`, `invalidatedAt=NULL` olmalıdır.
4. **Bağlantı kapısı.** Hedef DB'ye tek `connection_limit=1` reset backend'i
   açılır, PID pinlenir. Kodun türettiği ayrı kontrol bağlantısı `postgres`
   DB'sinden `ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS false` yapar.
   `datallowconn=false` ve hedefte yalnız pinned PID doğrulanır. Autovacuum
   kapıdan muaf olabileceği için beklenmeyen backend'de işlem içinde bekleme
   yoktur: fail-closed rollback, kapıyı açma ve uzlaşı.
5. **Tek işlem.** Önce bütün tablo kilitlerini `NOWAIT` al. Kilit altında şema,
   kısa plan, korunan tabloların tam özeti, sequence ve koşuları yeniden ölç;
   exact plan hash'i eşleşsin. Niyet `UPDATE ... consumedAt ... RETURNING`
   ile **aynı işlemde**, `invalidatedAt IS NULL` şartıyla tek satır olarak
   tüketilir. Pending outbox arşivi, silinecek topic/entry
   `(kind, uuid, publicId)` üçlülerinin korunan mezar taşına kopyası
   (`UNIQUE(kind, uuid)`, `UNIQUE(kind, publicId)`, kaynak satırlarla birebir
   eşleşme ve silinecek satır sayısıyla eşitlik), sınıflandırılmış
   tabloların `TRUNCATE ... CONTINUE IDENTITY RESTRICT` işlemi, iki eski
   `<= 2147483647` kısıtının kaldırılıp yerine doğrulanmış
   `CHECK ("publicId" BETWEEN 2147483648 AND 9007199254740991)` eklenmesi,
   `ALTER SEQUENCE ... MAXVALUE <üst sınır> RESTART WITH 2147483648`, commit işareti,
   idempotency süre bitimi ve audit aynı transaction'dadır. Son koşullar:
   silinenler boş, `(kind, uuid, publicId)` mezar taşları ve işaret beklenen
   sayıda, eski kısıtlar yok ve yeni alt sınır kısıtları doğrulanmış,
   `2147483648 ≤ MAXVALUE ≤ 2^53−1`, izin verilen
   korunan tablo farkları dışında içerik aynı, arşiv üyeliği doğru, iki
   sequence satırında `last_value=2147483648 AND is_called=false`, başka
   backend ve hazırlanmış işlem yok. Reset işlemi `nextval`/deneme INSERT'i
   çağırmaz; ilk gerçek yeni ID ancak açılıştan sonra `≥2147483648` ölçülür.
   Sonra COMMIT.
6. **Sonucu uzlaştır.** COMMIT cevabı geldiyse audit, niyet, sequence ve tablo
   son koşullarını doğrula. Cevap belirsizse önce `postgres` kontrol DB'sinden
   hedefte backend/kilit kalmadığını doğrula, sonra kapıyı aç; audit,
   `consumedAt`, commit işareti, sayımlar ve sequence ile tamamlandı/geri alındı/belirsiz
   sonucunu üret. Bu okumada app, worker ve DB erişimli timer/cron'un hâlâ
   kapalı olduğu tekrar doğrulanır. Belirsizde dış kayıt `PREPARED` kalır; yeniden çalıştırma
   veya restore etme. COMMIT öncesi hata `ABORTED` ile biter. Tamamlandıysa
   imzalı dış kayıt `COMMITTED_MAINTENANCE(operationId, dumpSha,
protectedDigest, clearedCounts)` olarak atomik yazılıp fsync edilir ve
   tekrar doğrulanır; korunan tabloların tam özeti ve silinen 29 tablonun boş
   sayımı saklanır. Bu kanıt yoksa app kabulü ve
   restore başlamaz.
7. **Kapıyı aç ve kabul et.** Başarı veya vazgeçmede `postgres` DB'sinden
   `ALLOW_CONNECTIONS true` ve `datallowconn` doğrulaması. Kontrol yolu
   kayıpsa önceden prova edilmiş container konsol yolu kullanılır; kapı
   açıldığının kanıtı olmadan bakım bitmez. **Caddy bakım yanıtı açık kalır.**
   Aynı release/app'i yalnız iç kabul için mevcut DB credential'ıyla,
   bütün havuz oturumlarında kanıtlanmış `default_transaction_read_only=on`
   modunda aç; ayar yalnız atılabilir runtime'ın connection-startup
   parametresidir, kalıcı `.env` veya immutable release'e yazılmaz. Dört
   yazma bayrağı kapalı, worker hold sürer.
   Salt okunur ayar app'in bütün bağlantılarına connection-startup parametresiyle
   gider; Prisma/sürücü ile gerçek standalone build'de havuz üst sınırı,
   `pg_stat_activity` sayısı ve her backend'de `SHOW default_transaction_read_only`
   sonucu karşılaştırılır. `ALTER ROLE`/`ALTER DATABASE` ayarıyla makbuz
   değiştirilmez. `SET ... READ WRITE` ve entrypoint migrate/seed/bootstrap
   yazıcıları taranır; açık kalırsa GO yok. İç kabul boyunca app/PostgreSQL
   loglarında güvenli `SQLSTATE 25006` sayısı sıfır olmalıdır. Sayım uygulama
   güvenli hata kodundan veya redakte PostgreSQL mesajından yapılır; DB log
   ayarı ve makbuz değişmez, ham SQL/entry basılmaz. Sıfırdan büyükse app
   kapatılır, bakım sürer ve restore ayrıca değerlendirilir.
   İç kabul cache'i atılabilir ayrı runtime'dadır; app kapatılınca dosya/ISR/data
   cache'i temizlenir ve container yeniden yaratılır. Rollback sonrası da
   bayat reset cache'iyle servis açılmaz.
   İç Host/loopback üzerinden yalnız GET/HEAD 410/404, sitemap, salt okunur sayaç/önbellek,
   anonim sayfa, health/ready, release/boot ve veri sözleşmesini doğrula.
   Login, Server Action POST, oturum/CSRF üretimi, `__Host-` canlı giriş ve
   başka mutasyon testi bu pencerede yoktur. Salt okunur app'i kapat;
   korunan tablo tam özeti, silinen 29 tablonun boşluğu, iki sequence'in
   tüketilmemiş başlangıcı ve audit/niyet durumunu reset sonrası imzalı
   makbuzla yeniden karşılaştır. Havuzdaki bütün DB oturumlarının gerçekten
   salt okunur olduğu ve bu adımların standalone build'de write yapmadığı
   önceden kanıtlanmadıysa reset GO yok. Kabul geçince canonical DB'de aynı
   `operationId` için commit satırı ve restore audit yokluğu yeniden
   doğrulanır; sonra imzalı dış kayıt atomik/fsync ile `TRAFFIC_OPEN`
   durumuna **önceden** geçirilip tekrar
   doğrulanır. Korunan `great_reset_exposure_events` tablosuna aynı
   `operationId` için append-only trafik açılış satırı yazılıp okunur;
   `UNIQUE(operationId)` ile aynı satırı tekrar okuyan/yazan idempotent yol
   kullanılır. Dış kayıt `TRAFFIC_OPEN` olmuş ama DB yazısı düşmüşse yalnız
   bu DB adımı yeniden denenir, restore yoktur. İki kanıttan biri başarısızsa
   bakım sürer. Dış kayıt `TRAFFIC_OPEN`'a geçtiği anda **geri dönüş penceresi
   kapanır**; DB olayının da doğrulanması sonraki aşama şartıdır ve Caddy
   bakım yanıtı sürer. Normal DB bağlantılı app yeni container/boş kalıcı
   cache ile açılır; bütün havuzda `SHOW default_transaction_read_only = off`
   doğrulanır. GET/HEAD 410/404, sitemap ve anonim sayfalar normal app'te
   tekrar ölçülür. Mevcut yetkili smoke hesabıyla credential basılmadan,
   yerel standalone provada kanıtlanmış TLS'li loopback iç Host yolu ve gerçek
   `APP_URL` Host/Origin/CSRF koşullarıyla yazan `__Host-` giriş smoke'u yapılır.
   Dört bayrak kapalıyken giriş E2E'de çalışmalı; smoke `entries`/`topics`
   yazmamalı ve sequence tüketmemelidir. Oturum/audit kimlikleri kaydedilir; Gate 10
   doğal kohortu smoke bittikten sonra başlar.
   Bu smoke başarısızsa eski dump restore edilmez, bakımda ileri düzeltme
   gerekir. Sonra Caddy bakım yanıtı kaldırılır. Dört bayrağı eski
   değerlerine ayrı ayrı döndür; worker'ı
   kontrollü aç, worker hold en son kalksın.
   İlk doğal koşu ve tüm timer/cron'un önceki `enabled/active` durumu,
   sonraki tetik ve son başarılı yedek/alarm makbuzu kabulde ölçülür.
8. **Gözlem.** Gate 10'un yedi günlük başlangıç zamanı, ayar hash'i, kohort
   ve reset sonrası kaynak aday listesinin boş başlangıcı kayda girer.

## Hata ve geri dönüş dalları

- **COMMIT öncesi hata:** transaction rollback; önce backend/kilit bitişini,
  sonra `ALLOW_CONNECTIONS true`yu doğrula. Niyet rollback ile tüketilmemiş
  olabilir; ayrı güvenli işlemde yalnız `invalidatedAt` yazarak geçersizleştir.
  App/worker/bayrak/timer'ları eski durumlarına döndür. Autovacuum veya `NOWAIT`
  hatası olsa da yeni denemede yeni `operationId`, Gökhan'ın yeni exact eylem
  onayı, yeni dump/restore/tam özet ve plan gerekir; otomatik tekrar yok.
- **COMMIT sonrası kabul hatası:** restore yalnız dış kayıt
  `COMMITTED_MAINTENANCE` iken, `TRAFFIC_OPEN` geçişinden önce ve Caddy
  bakım yanıtı/yazma bayrakları/worker kapalıyken mümkündür.
  `TRAFFIC_OPEN`, dış trafik veya yeni içerikten biri gerçekleştiyse reset
  dump'ı ve eski gecelik yedek dahil
  pre-reset yedeğe dönüş **yasaktır**; ileri
  düzeltme/ayrı namespace planı gerekir. Bu dar pencerede Gökhan ayrı restore
  eylemini onaylarsa, doğrulanmış dump kişisel operatör sunucusundan production
  hostuna kontrollü aktarılır. Önce dış imza `COMMITTED_MAINTENANCE` olmalı;
  yalnız bu `operationId`'nin exact reset-anı `dumpSha`'sı ve gölgede
  içerikten doğrulanan nesli kabul edilir, eksik/bozuk kayıt fail-closed durur.
  Canlı canonical DB'de **aynı `operationId` için tam
  `great_reset_commits` satırı ve hiçbir
  `GREAT_RESET_PRODUCTION_RESTORE` audit olayı olmaması** zorunludur. Herhangi
  bir `great_reset_exposure_events` satırı, yeni namespace satırı veya iki
  sequence ilişkisinden doğrudan `SELECT last_value, is_called` sonucu
  `last_value = 2147483648 AND is_called = false` **true** değilse restore'u
  durdurur; NULL veya satır yokluğu da ret sebebidir. Başarılı rollback'ten
  sonraki pre-reset DB'de aynı
  commit bulunmadığı için eski imzalı kayıt tekrar kullanılamaz; bu dal
  negatif testle kanıtlanır.
  App/worker/timer kapalı, Caddy bakım yanıtı açık
  kalır. Canlı DB'yi silmeden, kaydedilmiş sahip/encoding/locale/DB ACL ile
  `template0` üzerinden yeni **gölge DB** oluşturulur. Dump bu DB'ye
  `agent_sozluk` rolü altında (`--role=agent_sozluk` veya rol bağlantısı),
  `--single-transaction --exit-on-error --no-owner` ile yüklenir; kaynakta
  açık GRANT varsa ACL yeniden uygulanır, `--no-acl` ancak bunların boşluğu
  kanıtlandıysa kullanılır. Operatör sunucusundaki prova restore'u da aynı
  owner/ACL politikasını kullanır. DB yorumu, `datconnlimit`,
  `pg_db_role_setting`, extension ve kaydedilmiş DB izinleri gölgeye uygulanır.
  Tek imzalı manifestte operatör prova ve üretim gölgesi için değer düzeyinde
  ayrı owner/extension farkları kullanılır; gölge farkı üretim önkontrolünden
  türetilir ve izinli farkların alt kümesi olmalıdır. DB adı ve `datallowconn`
  içerik eşitliğinden çıkarılır,
  kimlik ve gate olarak ayrıca doğrulanır.
  `ANALYZE` ve sıcak sorgu plan denetiminden sonra kaynak makbuzuyla
  tablo/şema/sequence/migration, DB durumu ve **nesne sahibi/ACL** eşitliği
  doğrulanır. Backup'tan geri gelen geçerli ve tüketilmemiş bütün niyetlere
  gölgede yalnız `invalidatedAt` yazılır; yalnız bu beklenen farkla ikinci
  makbuz karşılaştırması yapılır. `consumedAt` değişmez, geçerli niyet sayısı
  sıfırdır. Uygulama rolüyle, sequence'e dokunmayan korunan tablo DML smoke'u
  `SET CONSTRAINTS ALL IMMEDIATE` ile transaction içinde çalıştırılır ve
  rollback edilir; `entries`/`topics` INSERT'i yapılmaz. Gölgeye `operationId`
  ve dump SHA-256 ile, önceden okunan canlı commit satırı özetini de taşıyan
  `GREAT_RESET_PRODUCTION_RESTORE` audit'i yazılır; bu da
  izinli makbuz farkıdır.
  Audit sonrası son özet yalnız `invalidatedAt`, rollback audit'i ve onaylı
  üretim gölgesine özgü owner/extension farkıyla tekrar karşılaştırılır. Reset commit
  işareti backup ile aynı olmalıdır; geri yükleme audit'i sonraki reseti durdurur.
  App/worker kapalıyken canonical ve gölge DB'de birer pinned salt okunur
  bağlantı dışında backend/hazırlanmış işlem sıfır doğrulanır. Kontrol DB'si
  iki DB'yi `ALLOW_CONNECTIONS false` yapar. `pg_stat_clear_snapshot()` ve
  en çok 5 saniye bekleme sonrası yalnız iki pinned PID kaldığı tekrar
  sayılır; autovacuum veya başka backend varsa restore denemesi durur. Her
  pinned bağlantı kapıdan sonra **yeni `READ COMMITTED` transaction** açar;
  önceki RepeatableRead görüntüsü kullanılmaz. Canonical bağlantı aynı
  commit satırı özetinin audit'tekiyle eşitliğini, audit/trafik
  olayı/satır/sequence koşullarını, sequence'in `DEFAULT`/`OWNED BY`
  kimliğini, korunan tam özeti ve silinen 29 tablonun boşluğunu; gölge
  bağlantı restore makbuzunu tekrar okur. Bu tam ölçümün süre/temp/WAL
  maliyeti gerçek boyutlu provanın bakım bütçesine girer.
  İkisi de kapanınca
  kontrol DB'si backend sıfırını yeniden doğrular; başka bağlantı artık
  giremez. `postgres` kontrol bağlantısındaki tek transaction, canlı
  canonical DB'yi rollback adına,
  doğrulanmış gölge DB'yi canonical ada çevirir; hata transaction'ı geri alır.
  Eski reset DB'si `datallowconn=false` kalır ve kabul bitene kadar tutulur.
  Yeni canonical DB'nin `datallowconn`,
  sahip/ACL, sequence, app rolü ve iç Host/loopback route kabulü doğrulanır;
  aynı `operationId`/`dumpSha`'lı restore audit'i ve commit yokluğu
  doğrulanır; imzalı dış kayıt atomik/fsync ile `ROLLED_BACK` durumuna
  geçirilip tekrar doğrulanır. Rename sonrası çökmede bu kanıtlarla geçiş
  idempotent tekrar edilir. Yalnız bundan sonra bakım yanıtı kaldırılır.
  Bu kabul düşerse eski reset DB'sine yeniden dönüş yolu yoktur; site bakımda
  kalır ve ayrı exact onaylı iyileşme planı gerekir. Başarılı rollback ikinci
  reseti kalıcı kapatır; bu sonuç Gökhan'ın exact onay metninde gösterilir.
  Gölge restore için disk yetmiyorsa reset
  başlamaz. Bu yöntemin local gerçek boyutlu ve exact onaylı production-host
  scratch provasında süre, yetki ve disk kanıtı henüz **yok**; bunlar kapanmadan
  reset GO yok.
- **Kapı açılamıyor:** app/worker açılmaz. Önceden doğrulanmış container konsol
  süper kullanıcı yolu `postgres` DB'sinden kapıyı açar; sonuç ayrıca
  `pg_database.datallowconn` ile doğrulanır. Bu yol sınanmadan reset GO yok.
- **Yürütücü süreci öldü (SIGKILL, OOM, oturum kopması):** `finally` çalışmaz; kapı
  kapalı ve tek yürütücü advisory kilidi kontrol oturumuyla birlikte düşmüş olabilir.
  Otomatik tekrar yok. Önce `postgres` DB'sinden hedef backend'in ve kilitlerin bittiği
  doğrulanır, sonra kapı açılır ve `datallowconn` doğrulanır, ardından audit, niyet,
  commit işareti, mezar taşı ve sequence ile sonuç tamamlandı/geri alındı/belirsiz
  diye uzlaştırılır (Astra, PR #231).
- **Belirsiz COMMIT:** önce uzlaştır, sonra operatör kararı. Kısmi başarı
  varsayımıyla `--execute` tekrar edilmez.

## Açık kabul kanıtı

Profil kodu, migration, 410 ve büyük ID sözleşmesi, yeni digest/bütçe ölçümü,
production kontrol/restore yolu, timer envanteri, yerel tüm hata dalları ve
farklı model hakemliği henüz açık. Bunlar [PLAN.md](PLAN.md) içinde sıralanır;
bu taslak ayrı aktif kuyruk değildir. Üretime bağlantı veya dağıtım yapılmadı.
