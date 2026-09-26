# Great reset — üretim profili tasarımı v19 (26 Eylül 2026)

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
niyeti/sahipliği başlıca açıklar. v5 exact
`4a5dc8772c5587b4bddf08c67ebee5d07c6e8e0f` için Opus 5.5
**TASARIM DÜZELTİLMELİ** dedi (1 P2, 7 P3): yalın slug yolu ile mezar taşı
çelişiyordu. v6, bu adresi kanonik permalink kapsamından çıkarır ve kalan
uygulama/restore ayrıntılarını sabitler.
Opus 5.5, v6 exact `eeb1b5445cc7b114bc6325a4c06618b6426801b0` için
**TASARIM UYGUN** dedi; P1/P2 yok, sekiz P3 uygulama sınırı kaydetti. v7, özellikle
ikinci resetin ID yeniden kullanımını engeller ve HTTP 410 adayını netleştirir.
Opus 5.5, v7 exact `19a6c8513943b82154715ec8abbee847d572f948`
için **TASARIM UYGUN** dedi; P1/P2 yok, yedi P3 kabul ayrıntısı kaydetti.
v8 exact `ace70f611796101ca2a6b175271c3de9deac4788` için Opus 5.5
**TASARIM UYGUN** dedi; P1/P2 yok, altı P3 kabul ayrıntısı var. v9 exact
`6ca052fa893b47931d9f99c43094d02a11742a7f` için **TASARIM DÜZELTİLMELİ**
dedi (1 P2, 4 P3). v10 exact `719e1917a4805947101cbd4dbbdb7e4022164200`
için **TASARIM UYGUN** dedi; P1/P2 yok, altı P3 kabul ayrıntısı var.
v11 exact `6c032eec369fa4796ce7395a28a1096ad79af09f` için Opus 5.5
**TASARIM DÜZELTİLMELİ** dedi (1 P2, 6 P3): rollback sonrası eski imzalı
kayıt, geri yüklenmiş DB'de trafik olayı olmaması nedeniyle tekrar
kullanılabiliyordu. v12 exact `c0442c8a9252734f90bc199b6f93aadd257c132d`
için **TASARIM UYGUN** dedi; P1/P2 yok, altı P3 uygulama sınırı var.
v13 exact `483886a53e605ec92c2334fef6f6c960dfdfb29b` için Opus 5.5
**TASARIM DÜZELTİLMELİ** dedi (1 P2, 6 P3): geri dönüş penceresindeki iç kabul
yazıları tam özet eşitliğini bozabilirdi. v14 exact
`a8b52ca8167e5f33cb45e24a5bc599e7510c3697` için Opus 5.5
**TASARIM UYGUN** dedi; P1/P2 yok, bir P3 sıra çelişkisi ve altı P3 kabul
ayrıntısı kaldı. v15 exact `2a34d8e69b8ea6637ba09a142027edf642f230fb`
için de Opus 5.5 **TASARIM UYGUN** dedi; P1/P2 yok, altı P3 uygulama
sınırı kaydetti. v16 restore penceresini ve normal app kabulünü netleştirir.
v17, Gökhan'ın 26 Eylül ürün kararıyla 410'u yalnız mezar taşında kayıtlı
silinmiş sayısal ID'lere daraltır (bilinmeyen 404) ve Astra'nın bulduğu
migration–reset arası üst namespace açığını DB kısıtıyla kapatır. Astra v17
exact `e34fa5a2a301a10a9f2e89f988166429ab50dbbc` için **TASARIM DÜZELTİLMELİ**
dedi (2 P2, 1 P3): reset sonrası açık değerli INSERT eski ID'yi yeniden
kullanabiliyordu ve runbook önizleme/uygulama adımları yeni sınırla
çelişiyordu. v18 reset sonrasına alt sınır kısıtı ekler ve runbook'u eşler.
Astra v18 exact `4b8bace4c408aa3360b8e0e56a828a2b2a77ae5f` için **TASARIM
UYGUN** dedi; üç bulgu kapandı, yeni P1/P2/P3 yok.
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
   `BIGINT` yapar; üretim profili, yerel çekirdekteki `data_type = integer`
   koşulunu reset öncesinde `AS bigint`, `MAXVALUE = 2147483647`, `CACHE 1`,
   `NO CYCLE`; reset sonrasında `2147483648 ≤ MAXVALUE ≤ Number.MAX_SAFE_INTEGER`
   koşuluyla **değiştirir**. **Üst namespace kilidi (Astra, 26 Eylül):** aynı
   migration iki tabloya adlı ve doğrulanmış (`convalidated`)
   `CHECK ("publicId" <= 2147483647)` kısıtı ekler; sequence üst sınırı da
   `2147483647` kalır; migration SQL'i `AS bigint` ile `MAXVALUE 2147483647`
   değerini **aynı ifadede açıkça** yazar (yalnız `AS bigint` varsayılan üst
   sınırı büyütebilir). Böylece migration ile reset arasında `2147483648` ve
   üstü ne sequence'ten ne açık değerli INSERT'ten üretilebilir; bu bir DB
   garantisidir, "eski değer üretimi devam eder" beklentisi değildir.
   Önizleme ve son uygulama iki kısıtın varlığını/doğrulanmışlığını, iki
   sequence'in `MAXVALUE = 2147483647` olduğunu ve
   `max("publicId") ≤ 2147483647` sonucunu denetler; biri eksikse reset
   `PUBLIC_ID_SEQUENCE_UNSAFE` ile durur. Kısıt ve sequence tanımı şema
   özetine girer. Public API ve istemci alanları
   `number` olarak kalır: Prisma `bigint` değerleri repository sınırında yalnız
   `Number.isSafeInteger` koşuluyla çevrilir, giriş de güvenle `bigint`e dönüşür.
   Sequence üst sınırı `Number.MAX_SAFE_INTEGER` değerini aşmaz. Envanter;
   route regex ve ayrıştırıcıları, tüm `publicId` seçen repository/service/UI
   tipleri, worker wire/Zod şemaları, feed/sitemap, gövde içi `#id` bağlantıları,
   prompt kataloğu, JSON çıktısı, ham SQL'deki `::int`/`int4` cast'leri,
   SQL fonksiyon ve trigger parametrelerini kapsar. `2147483648` ve `2^53` sınır
   testleri ile production build geçmeden migration kabul edilmez; reset
   öncesi `2147483648` INSERT'inin kısıtla reddedildiği de test edilir. Reset
   işlemi, iki tablo temizlendikten sonra **aynı transaction** içinde iki eski
   `CHECK` kısıtını kaldırır, yerine iki tabloya adlı ve doğrulanmış
   `CHECK ("publicId" BETWEEN 2147483648 AND 9007199254740991)` ekler ve
   `ALTER SEQUENCE ... MAXVALUE <üst sınır> RESTART WITH 2147483648` uygular;
   `setval()` kullanılmaz. **Alt sınır kısıtı (Astra v17 P2):** `DEFAULT
nextval()` açıkça verilen değeri sınırlamaz ve mevcut değişmezlik trigger'ı
   yalnız UPDATE'i engeller; bu kısıt olmadan reset sonrası açık değerli
   INSERT mezar taşındaki eski ID'yi yeni içeriğe bağlayabilirdi (canlı kayıt
   mezar taşından önce kazanır). Tablolar TRUNCATE sonrası boş olduğundan
   doğrulama ucuzdur. Son koşul eski kısıtların yokluğunu, yeni kısıtların
   varlığını/doğrulanmışlığını, yeni `MAXVALUE` aralığını ve iki sequence
   satırını **değer tüketmeden** okur:
   `last_value = 2147483648 AND is_called = false`. Reset transaction'ında
   `nextval()` ve deneme INSERT'i yasaktır. Açılış sonrasında ilk gerçek yeni
   içerik için `publicId ≥ 2147483648` aranır; tam eşitlik iddia edilmez.
   PostgreSQL 16'da `RESTART`, `MAXVALUE` değişimi ve `DROP CONSTRAINT`
   transaction'a bağlıdır; bu davranış, rollback'te eski kısıtların geri
   gelip yenilerin kaybolması, reset sonrası eski ID ile açık INSERT'in
   reddi ve kilit süresi yerel gerçek boyutlu provada ayrıca sınanacaktır.
   Restore kapısı pre-reset dump'ta eski kısıtı ve `MAXVALUE = 2147483647`
   değerini makbuz eşitliğiyle bekler. Ayrı,
   korunan `great_reset_commits` satırı reset
   transaction'ında audit ve niyet tüketimiyle birlikte eklenir; rollback veya
   reset öncesinde satır yoktur. **Public sözleşme (Gökhan kararı, 26 Eylül
   2026: "Yalnız bilinen silinmişe 410"):** canlı kayıt varsa normal yanıt;
   yoksa ve commit işareti varsa yalnız `great_reset_tombstones` içinde
   `(kind, publicId)` olarak kayıtlı sayısal ID 410; hiç kullanılmamış veya
   bilinmeyen her sayı 404. Eski aralığın tamamına 410 verilmez. Böylece
   migration sonrası reset öncesinde ve pre-reset yedekten restore sonrasında
   canlı eski içerik 200 kalır. **Kapsam sınırı:** mezar taşı yalnız reset
   anında veritabanında bulunan kayıtları kapsar. Resetten önce fiziksel
   olarak silinmiş, eldeki yedeklerde de olmayan içerik saptanamaz ve 404
   döner; sequence boşlukları geçmişte içerik bulunduğunu kanıtlamaz.
   Tarihsel tam envanter iddia edilmez. `BIGINT` namespace'i bu durumda da
   gereklidir: bilinmeyen eski ID'lerin yeni içeriğe yeniden atanmasını
   engelleyen şey mezar taşı değil, yeni aralığın `2147483648`'den
   başlamasıdır.
4. Eski **UUID permalinkleri** için korunan `great_reset_tombstones` tablosu
   migration'la eklenir; cleared içerikle FK bağı taşımaz. Reset transaction'ı,
   `topics` ve `entries` silinmeden önce `(kind, uuid, publicId)` üçlülerini
   burada toplar; `UNIQUE(kind, uuid)` ve `UNIQUE(kind, publicId)` ile
   benzersizlik, silinecek satır sayısıyla eşitlik ve bütün `publicId`
   değerlerinin `≤2147483647` olduğu doğrulanır. Sayısal 410 araması
   `(kind, publicId)` indeksini kullanır. İşaret varken bile canlı
   içerik mezar taşından önce kazanır. Kanonik
   `/baslik/{slug}--{publicId}` ve `/entry/{publicId}` sayısal namespace ile
   ayrılır. **Yalın `/baslik/{kodlanmış başlık}` bir silinmiş içerik
   permalink'i değildir:** mevcut uygulamada açılmamış başlık için noindex
   yazma formudur ve resetten sonra da 410'a çevrilmez. `Topic.slug`/
   `TopicAlias.slug` benzersiz olmadığı
   için slug mezar taşı üretilmez. Korunan `users`/ajan profili silinmediğinden
   var olan yazar profili 410 olmaz. Eski UUID (ilk 36 karakterden sonra
   sonek taşıyan legacy yol dahil), kanonik sayısal, Türkçe kodlanmış yalın
   başlık, 308 kanonikleştirme ve restore sonrası route testleri zorunludur.
   `--[0-9]+` ile biten başlık mevcut parser'da ID sanılır. **v19:** 26 Eylül
   01:32Z yedeğinde 6.120 başlık ve 2 alias ayrıştırıcıyla tarandı, çakışma 0.
   `topicTitleSchema` artık kendi açılmamış adresi `parseTopicRouteReference`
   tarafından kimlik okunacak başlığı reddeder (`--sayı` sonu, UUID öneki).
   Reset öncesi tarama üretimde yeniden koşulur.
   `BIGINT` geçişi ve üst namespace kilidi kabul edilmezse **reset GO yok**;
   mevcut sequence'den tarihsel en yüksek silinmiş ID'yi çıkardığımız iddia
   edilmez.
   HTTP 410 için birincil aday, Next.js 15.5.25'in **Node runtime middleware**
   yoludur (`src/middleware.ts`, `config.runtime = 'nodejs'`). Mevcut geniş
   matcher ve prefetch dışlaması korunur. **v19 düzeltmesi (Astra, PR #229):** dar
   prefetch matcher'ı eklenmez. Next 15.5.25 adaptörü `next-router-prefetch`
   başlığını middleware'den önce siler; middleware prefetch'i ayırt edemez ve dar
   matcher prefetch yanıtına CSP/analytics eklerdi. Prefetch eskisi gibi
   middleware'e uğramaz; silinmiş adrese tıklama RSC navigasyonudur, 410 alır ve
   istemci tam sayfa gezinmesine düşer. Kapı segmenti sayfanın `params` biçimine
   (`encodeURIComponent(decodeURIComponent(ham))`, baştaki `_NEXTSEP_` silinerek)
   getirerek ayrıştırır. UUID öneki + `--sayı` başlık segmenti iki kimliğe okunabilir
   (literal `.rsc` adreste sayfa UUID'yi seçer, middleware `.rsc`'yi göremez): sayısal
   kimlik mezar taşındaysa UUID de sorulur, canlıysa 410 verilmez. Kalan kabul edilmiş
   fark: hiçbir içeriğe ait olmayan `/entry/7.rsc` 7 silinmişse 404 yerine 410 alır.
   **Açık GO kapısı:** tamamlanmış bir prefetch'in reset sonrası Router Cache'ten bayat
   içerik göstermediği kanıtlanmadı; mevcut E2E yalnız tıklamanın sunucuya gidip 410
   aldığını ölçer (Next 15.5 kısmi prefetch akışı CI'da tamamlanmadı).
   Middleware Prisma'yı doğrudan kullanmaz; aynı application service ve aynı
   `parseTopicRouteReference`/`parseEntryRouteReference` ayrıştırıcılarıyla
   karar verir. **Önce metot ve URL sözdizimi** sınıflandırılır: yalnız
   `GET`/`HEAD` ve eski sayısal namespace veya legacy UUID adayı 410 yoluna
   girer. `POST` (eski sekmenin Server Action'ı dahil), yalın başlık,
   `>2147483647` sayısal ID ve ayrıştırılamayan yol DB'ye dokunmadan `next()`
   alır; POST'un mevcut uygulama güvenli hata kodu test edilir. Adayda
   **önce commit işareti** okunur; yoksa `next()`. İşaret varsa canlı kayıt,
   ardından mezar taşı aranır. Mezar taşında olmayan aday `next()` alır ve
   mevcut sayfa akışının 404'ü döner; middleware 404 üretmez.
   İşaret sonucu yalnız uygulama süreci ömründe, başarılı okumadan sonra
   önbelleklenebilir; reset ve restore sırasında bütün app süreçleri kapatılır,
   işaret değişiminden sonra yeniden başlatılır; her yeni süreçte boş önbellek
   iç Host kabulünde ölçülür. Bu değişmez ve yoğun permalink
   prefetch'inde sorgu sayısı/p95 gecikme ölçülmeden önbellek kabul edilmez.
   İşaret veya mezar taşı sorgusu hata verirse 410 uydurulmaz; ilgili eski yol
   için `503` ve `Cache-Control: no-store` döner. Bilinen silinmiş
   adreste statik kısa HTML gövdeli doğrudan 410 yanıtı; `Cache-Control: no-store`,
   mevcut nonce/CSP, `X-Robots-Tag: noindex` ve
   `Content-Type: text/html; charset=utf-8` taşır. `HEAD` aynı statü ve
   başlıkları gövdesiz taşır.
   Böylece rollback sonrası tarayıcı/proxy bayat 410 saklamaz. Diğer yanıtta
   mevcut `NextResponse.next()` başlıkları korunur. Migration tabloları
   middleware release'inden **önce** kabul edilmiş olmalıdır. `0123`, güvenli
   tamsayı üstü ve UUID+sonek ayrıştırması test edilir. Node middleware bundle,
   CSP, RSC istemci navigasyonu, eski sekmeden Server Action POST'u,
   `generateMetadata`, anonim/oturumlu HTML, prefetch, gerçek HTTP
   410 ve restore sonrası 200/404 yerel production build/E2E ile kanıtlanmadan
   GO yok. Production ile aynı standalone açılışında `server-only` importu,
   dosya izlemesi ve `pg_stat_activity` ile toplam DB havuzu/bağlantı sayısı,
   yoğun prefetch'te sorgu sayısı ve p95 gecikme ölçülür; ayrı havuz veya
   sorgu yükü kaynak sınırını aşarsa aday kabul edilmez.
   Middleware yolu çalışmazsa eşdeğer Caddy/Node çözümü ayrıca tasarlanıp
   hakemden geçer; doğrulanmamış route handler rewrite kullanılmaz.
5. **Tek reset sınırı:** `great_reset_commits` veya
   `great_reset_exposure_events` tablosunda herhangi bir satır **veya** reset
   geri yükleme audit kaydı varsa önizleme ve uygulama
   `RESET_ALREADY_COMMITTED` ile durur.
   `RESTART WITH 2147483648` yalnız ilk reset içindir; ikinci reset ayrı ID
   namespace tasarımı ve Gökhan kararı olmadan yapılamaz.
6. Önizleme, hedef DB rolünün okuma, tüm tablo kilidi, silinecek tablo `TRUNCATE`,
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
`is_called` ayrıca girer. DB yorumu, `datconnlimit`, `pg_db_role_setting`,
encoding/locale, gerekli roller/üyelik ve extension listesi (`extowner` dahil)
de makbuza girer; custom dump bunları tek başına taşır varsayılmaz. Kaynak
tam özet dump'ın hemen öncesi ve sonrası aynı olmalı. Operatör sunucusundaki
ayrı PostgreSQL 16 prova kümesinde gerekli roller/üyelikler önceden kurulur;
DB yorumu, bağlantı limiti, DB/rol ayarı ve extension sahipliği uygulanır.
Extension sahibi veya üye nesneleri birebir kurulamıyorsa beklenen fark
önceden ölçülüp ayrı onaylanır. Tek imzalı manifestte **ortam başına değer
düzeyinde ayrı beklenen fark** tutulur. Üretim gölge farkı, üretim
önkontrolündeki rol/extension sahipliğiyle türetilir ve izinli farkların
alt kümesi olmalıdır; tercihen boştur. DB adı ve kapı anına bağlı
`datallowconn` karşılaştırma dışında tutulur; ayrı kimlik/gate koşullarıyla
doğrulanır. Sessiz eşitlik iddiası yoktur. Restore sonrası
tam özet bu açık kapsamla aynı olmalı. Sequence MVCC görüntüsünden bağımsız
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
  `great_reset_commits`, `great_reset_tombstones` ve append-only
  `great_reset_exposure_events` tablolarını ekler. Son tablo reset anında
  boştur, silinmez ve içerik makbuzuna girer. `great_reset_commits` ve
  `great_reset_tombstones` için de UPDATE/DELETE/TRUNCATE reddi negatif
  testlerle kanıtlanır; tablo sahibi/süper kullanıcı sınırı ayrıca kaydedilir.
  Niyetin
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
   belirsiz** olarak uzlaştırılır. Bu okumada app, worker ve DB erişimli bütün
   timer/cron'un hâlâ kapalı olduğu yeniden doğrulanır. Belirsizde operatör
   kararı beklenir.
5. Başarılı reset sonrası **yalnız iç kabul için** aynı release/app, aynı
   `DATABASE_URL` kimliğiyle ama bütün DB oturumlarında doğrulanmış
   `default_transaction_read_only=on` koşuluyla başlatılır; dört yazma
   bayrağı kapalı, worker hold açık kalır. Ayrı credential/rol yoktur.
   Salt okunur ayar app'in bütün bağlantılarını kapsayan connection-startup
   parametresiyle verilir; Prisma/sürücü bu parametreyi iletmiyorsa GO yok.
   `ALTER ROLE`/`ALTER DATABASE ... SET default_transaction_read_only` yolu
   kullanılmaz; DB ayar makbuzu değiştirilmez. Parametre yalnız atılabilir
   iç kabul runtime'ına geçici verilir, kalıcı `.env` veya immutable release'e
   yazılmaz. Havuzun sabit bağlantı üst
   sınırı, `pg_stat_activity` backend sayısı ve her açılan bağlantıda
   `SHOW default_transaction_read_only` sonucu gerçek standalone build'de
   karşılaştırılır. Kaynakta `SET ... READ WRITE` veya read-only ayarını
   geri alan yol ve container entrypoint'inde migrate/seed/bootstrap yazısı
   taranır; iç kabul modunda yazan yol açık kalırsa GO yok.
   Caddy bakım yanıtı sürerken iç Host/loopback ile yalnız GET/HEAD 410/404,
   sitemap, anonim sayfa, health/ready ve salt okunur sayaç/önbellek okumaları
   ölçülür. Login, Server Action POST, oturum/CSRF üretimi, `__Host-` canlı
   giriş kontrolü, mutasyon yapan açılış veya write smoke **geri dönüş
   penceresinde koşulmaz**. İç kabul app'i kapatılır; korunan tabloların tam
   özeti, silinen 29 tablonun boşluğu, iki sequence'in tüketilmemiş başlangıcı
   ve audit/niyet durumu reset sonrası imzalı makbuzla tekrar eşit olmalıdır.
   Salt okunur DB oturumunun tüm havuzda sağlanması ve bu ölçümlerin gerçek
   standalone build'de kanıtı yoksa reset GO yok; beklenmedik yazı denemesi
   kabul hatasıdır; iç kabul süresinde PostgreSQL/app loglarında güvenli kod
   düzeyinde `SQLSTATE 25006` sayısı sıfır olmalıdır. Sayım yöntemi uygulamanın
   güvenli hata kodu veya önceden kanıtlanmış redakte PostgreSQL mesajıdır;
   log ayarı makbuzu değiştirilmez, ham SQL/entry yazılmaz. Sayım sıfırdan
   büyükse app kapatılır, bakım sürer ve restore kararı ayrıca verilir.
   İç kabul app'inin kalıcı Next.js dosya/ISR/data cache'i izole, atılabilir
   runtime'dadır; app kapatılınca cache temizliği ve container yeniden
   yaratılması doğrulanır. Rollback sonrası da bayat reset cache'iyle app
   açılmaz. `TRAFFIC_OPEN` dış kayda yazıldığı anda **rollback penceresi
   kapanır**; DB trafik olayı da doğrulanmadan sonraki aşama başlamaz. Caddy
   bakım yanıtı sürerken normal DB bağlantılı app **yeni container ve boş
   kalıcı cache** ile açılır; bütün normal havuzda
   `SHOW default_transaction_read_only = off` kanıtlanır. GET/HEAD 410/404,
   sitemap ve anonim sayfalar bu normal app üzerinde tekrar ölçülür.
   Mevcut yetkili smoke hesabıyla, credential'ı basmadan TLS'li loopback iç
   Host yolundan gerçek `APP_URL` Host/Origin/CSRF sözleşmesiyle `__Host-`
   giriş smoke'u yapılır; bu yol yerel standalone provada kanıtlanır.
   Dört bayrak kapalıyken girişin çalışması E2E kapısıdır; smoke
   `entries`/`topics` yazmaz ve sequence tüketmez. Ürettiği oturum/audit kimlikleri
   ölçülür, Gate 10 doğal kohortu bu smoke'tan sonra başlar. Smoke PASS olursa
   Caddy bakım yanıtı kaldırılır; düşerse eski dump restore edilmez, bakımda
   ileri düzeltme gerekir. İlk doğal koşu dış trafik açıldıktan sonra ölçülür.
   Dört bayrak eski değerlerine ayrı ayrı
   döndürülür, worker hold en son kaldırılır. Durdurulan her timer/cron eski
   etkinlik durumuna getirilir; sonraki tetik ve son başarılı yedek/alarm kayıtları
   doğrulanır. `__Host-` çerez geçişi ve 6.3-5 indeks eşiği release kod/E2E
   kabulündedir; üretim giriş smoke'u `TRAFFIC_OPEN` sonrası, Caddy açılmadan
   öncedir.
6. Reset COMMIT'i olmuş ama site kabulü düşmüşse rollback **ayrı bir üretim eylemidir**.
   Bu yol yalnız dış kayıt `COMMITTED_MAINTENANCE` durumundayken,
   `TRAFFIC_OPEN` geçişinden **önce** geçerlidir; Caddy bakım yanıtı ve
   yazma bayrakları/worker kapalı kalır. `TRAFFIC_OPEN`, dış trafik veya yeni
   içerikten hangisi önce gerçekleşirse, o andan sonra
   pre-reset dump'a dönüş bu tasarımda **yasaktır**; ileri düzeltme veya yeni
   namespace tasarımı gerekir. Bu yasak reset anı dump'ı kadar eski gecelik
   yedekler için de geçerlidir. Operatör sunucusundaki
   üretim DB'si ve yedek dizini dışında, 0600 erişimli ayrı anahtarla HMAC
   imzalı reset nesli/backup envanteri tutulur. İmza yalnız operatör
   sunucusunda doğrulanır; anahtar oradan çıkmaz. Dump'ı production hostuna
   yalnız bu kapı aktarır; production `pg_restore` öncesi dosyanın SHA-256'sını
   `dumpSha` ile tekrar karşılaştırır. Yedek nesli dosya adından değil,
   operatör sunucusundaki prova DB'sinde doğrulanan dump içeriğindeki
   `great_reset_commits` tablosu/satırı/`operationId` ve public ID sütun
   tipinden belirlenir; sınıf `PREPARED` kaydına yazılır. Üretim gölgesinde
   rename öncesi bu içerik ve beklenen boş commit işareti yeniden doğrulanır;
   migration öncesi şema uyumsuzdur. Reset COMMIT'i uzlaştırılınca imzalı kayıt
   geçici dosya fsync → aynı dizinde rename → dizin fsync → geri okuyup
   imzayı doğrulama sırasıyla
   `COMMITTED_MAINTENANCE(operationId, dumpSha, protectedDigest, clearedCounts)`
   olur. Korunan tabloların reset sonrası tam özeti ve silinen 29 tablonun boş
   sayımı bu kayda girer; restore öncesi canonical aynı makbuzla karşılaştırılır;
   kayıt doğrulanmadan app kabulü veya restore yok. Caddy bakım yanıtı ancak
   kayıt aynı sırayla `TRAFFIC_OPEN` durumuna **önceden** geçirilip tekrar
   doğrulanırsa ve korunan `great_reset_exposure_events` tablosuna aynı
   `operationId` için `UNIQUE(operationId)` korumalı append-only trafik açılış
   satırı yazılıp okunursa
   **kaldırılabilir**; ayrıca normal app ile iç Host yazan smoke PASS olmalıdır.
   `TRAFFIC_OPEN` öncesi canonical DB'de aynı `operationId` commit'i ve restore
   audit yokluğu doğrulanır. İki kanıttan biri başarısızsa bakım sürer. Bu geçiş
   rollback penceresini ihtiyatlı olarak kapatır. Dış durum yazılıp DB olayı
   düşerse yalnız idempotent DB satırı yeniden denenir; restore yoktur.
   Olayı pinned üretim CLI, mevcut doğrulanmış tek `DATABASE_URL` rolüyle yazar;
   yeni credential/rol eklenmez. Bu rol tablonun sahibi olabilir; dolayısıyla
   GRANT geri alma gerçek bir sahiplik sınırı değildir. UPDATE/DELETE/TRUNCATE
   trigger ile reddedilir; sahip/süper kullanıcının trigger'ı kapatması tehdit
   modeli dışındaki yetkili operatör eylemidir. Koruma kazara/app DML'ine
   yöneliktir ve negatif testlerle kanıtlanır.
   Restore kapısı varsayılan
   olarak reddeder: yalnız `COMMITTED_MAINTENANCE` ve aynı `operationId` için
   exact reset-anı `dumpSha`'lı, içerikten doğrulanmış dump kabul edilir;
   canlı canonical DB'de **aynı `operationId` için tam bir
   `great_reset_commits` satırı** ve **hiçbir
   `GREAT_RESET_PRODUCTION_RESTORE` audit olayı olmaması** olumlu koşuldur.
   Herhangi bir `great_reset_exposure_events` satırı veya yeni namespace'te
   satır varsa restore durur. İki sequence ilişkisinden doğrudan okunan
   `last_value = 2147483648 AND is_called = false` sonucu **true** olmalıdır;
   satır/alan yokluğu veya NULL fail-closed durur. Bu koşullar geri
   yüklenmiş pre-reset DB'de eski imzalı kaydın tekrarını da reddeder.
   Eski gecelik yedekler dar pencerede bile reddedilir.
   Dış kayıt `PREPARED → COMMITTED_MAINTENANCE → TRAFFIC_OPEN | ROLLED_BACK`
   geçişleriyle sınırlıdır. COMMIT uzlaşısı tamamlandıysa
   `PREPARED → COMMITTED_MAINTENANCE`, geri alındıysa
   `PREPARED → ABORTED` yapılır; yalnız sonuç belirsiz kalırsa geçiş yapılmaz.
   `TRAFFIC_OPEN`, `ROLLED_BACK` ve
   `ABORTED` son durumdur; diğer geçişler reddedilir. Her geçiş artan sıra
   numarası ve önceki kaydın özetini taşıyan zincire yazılır; yeni dosya eskisinin
   byte düzeyinde birebir öneki ve tek yeni kayıttan oluşmalıdır.
   Restore kapısı en yüksek sırayı doğrular. Başarılı restore sonrası
   `ROLLED_BACK` için canonical DB'de aynı `operationId` ve `dumpSha`'lı restore
   audit'i, commit yokluğu gerekir. Rename COMMIT'i sonrası kayıt yazılamazsa
   bu kanıtlarla geçiş idempotent olarak yeniden denenir; doğrulanmadan trafik
   açılmaz.
   Gölgeye yazılan `GREAT_RESET_PRODUCTION_RESTORE` audit kaydı
   da ikinci reseti kapatır.
   Gökhan onaylarsa doğrulanmış dump production hostunda **yeni gölge DB'ye**,
   DB sahibi `agent_sozluk` rolüyle veya `--role=agent_sozluk` altında restore
   edilir; canlı DB önce silinmez. Kaynakta gerçek GRANT varsa restore ACL'leri
   yeniden uygular; `--no-acl` ancak makbuzda bütün açık ACL'lerin boşluğu
   kanıtlandıysa kullanılır. Aynı owner/ACL politikası operatör sunucusundaki
   prova restore'unda da geçer. Önceden ölçülen DB yorumu, `datconnlimit`,
   `pg_db_role_setting`, encoding/locale ve extension'lar gölgeye uygulanır.
   Sonra `ANALYZE` ve sıcak sorgu plan denetimi yapılır; içerik, şema,
   sahiplik/ACL, DB durumu ve sequence kaynak makbuzuyla eşit olmalıdır.
   Backup'tan gelen geçerli/tüketilmemiş bütün niyetlere gölgede yalnız
   `invalidatedAt` yazılır; **yalnız bu farkla** ikinci makbuz karşılaştırması
   ve geçerli niyet sayısı sıfır kanıtı alınır. Uygulama rolünün DML smoke'u
   sequence'e dokunmayan bir korunan tablo yazısını transaction içinde yapar,
   `SET CONSTRAINTS ALL IMMEDIATE` ile ertelemeli kısıtları yoklar ve rollback
   eder; `entries`/`topics` INSERT'i ile `nextval` kullanılmaz. Gölgeye
   `operationId` ve dump SHA-256'sı için ayrı rollback audit satırı yazılır;
   bu da makbuzun kayıtlı izinli farkıdır. Audit sonrası son özet yalnız
   `invalidatedAt`, bu audit ve üretim gölgesine özgü onaylı owner/extension farkıyla
   yeniden karşılaştırılır. Gölge/kanonik DB adı ve `datallowconn` bu içerik
   eşitliğine girmez; ayrı doğrulanır.
   Gölge DB'de reset commit işareti yokluğu veya eski makbuzla uyumu
   doğrulanır. App/worker kapalıyken canonical ve gölge DB'de birer pinned
   salt okunur bağlantı kurulur; bunların dışındaki backend ve hazırlanmış
   işlem sıfır olmalıdır. Kontrol DB'si iki DB'yi `ALLOW_CONNECTIONS false`
   yapar; sonra `pg_stat_clear_snapshot()` ve en çok 5 saniyelik beklemeyle
   iki DB'de **yalnız iki pinned PID** kaldığı yeniden doğrulanır. Autovacuum
   veya başka backend kalırsa bu restore denemesi fail-closed durur; otomatik
   tekrar yoktur. Pinned bağlantılar
   kapı sonrası açılan yeni `READ COMMITTED` transaction'larda denetler;
   kapı öncesi RepeatableRead görüntüsü kullanılmaz. Pinned canonical
   bağlantı **aynı `operationId` commit'i ve önceden audit'e yazılan commit
   satırı özetiyle eşitliği, restore
   audit yokluğu, trafik olayı yokluğu, yeni namespace satır yokluğu ve iki
   sequence'in `DEFAULT`/`OWNED BY` bağlarıyla doğru nesne olduğuna dair Aşama
   1 madde 2 kapısını, tüketilmemiş başlangıcını, korunan tablo tam özetini ve silinen
   29 tablonun boşluğunu** kapı kapandıktan sonra yeniden doğrular; pinned
   gölge bağlantı restore makbuzunu doğrular. Restore audit'i önceden okunan
   commit satırının özetini taşır. İkisi de
   bırakılır, kontrol DB'si backend sıfırını yeniden ölçer; kapalı DB'ye
   yeni bağlantı giremediğinden bu son kanıtla rename arasındaki değişiklik
   yarışı kapanır. Bu kapıdaki tam özetin süre/temp/WAL maliyeti gerçek boyutlu
   provanın bakım bütçesine ayrıca girer. Kontrol DB'sindeki **tek transaction**
   ile eski canonical DB rollback adına, doğrulanmış gölge canonical ada
   çevrilir. Yerel PG16'da iki `ALTER DATABASE ... RENAME` ve rollback mümkün
   olduğu görüldü; gerçek boyut/izin/disk ve iki DB'nin `datallowconn` durumu
   ayrıca prova edilir. İsim kesiminde hata olursa transaction geri alınır,
   eski canonical DB kalır. Eski reset DB'si `datallowconn=false` durumda,
   ilk kabul bitene dek rollback kanıtı olarak saklanır. Yeni canonical DB
   için gate ve app kabulü tekrar doğrulanır. Bu kabul düşerse eski reset
   DB'sine ikinci ad değişimiyle dönüş bu tasarımda yoktur; site bakımda kalır
   ve yeni exact onaylı iyileşme planı gerekir. Başarılı rollback sonrası
   `GREAT_RESET_PRODUCTION_RESTORE` audit'i ikinci reseti kalıcı olarak
   engeller; bu ürün sonucu Gökhan'ın exact onay metninde açık yazılır.
   Gölge restore'a disk yetmezse **reset GO yok**; eski DB'yi önce
   silen yol bu tasarımın geri dönüşü değildir. Otomatik restore yok.
   Kesim önkontrolünde kontrol rolünün `rolcreatedb`/`rolsuper`, rol üyeliği,
   shadow sahibi olabilmesi, `ALTER DATABASE RENAME` ve dump'taki untrusted
   extension gereksinimleri ölçülür; yetki yoksa exact onaylı container konsol
   yolu kanıtlanmadan reset GO yok.

## Açık kabul ölçümleri

- Üretim profili ve migration'lar henüz yazılmadı. Büyük `BIGINT` dönüşümü ve
  `2147483648` namespace'i gerçek boyutlu yerel kopyada süre, disk, WAL, index,
  ORM ve URL davranışıyla sınanmalı. 410 ürün kararı 26 Eylül'de verildi
  (yalnız bilinen silinmiş ID); üst namespace kısıtı da aynı provada sınanır.
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
