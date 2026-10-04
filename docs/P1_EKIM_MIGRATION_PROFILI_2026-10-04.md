# P1 — Ekim özellik paketinin sabit migration profili

**4 Ekim 2026.** Uygulama belirtimi ve kanıt; tek aktif sıra [PLAN.md](PLAN.md).
Bu belge üretim geçişinin tamamlandığı veya A′ penceresinin kapandığı anlamına gelmez.

## Sorun ve sınır

Sekiz yeni migration, mevcut A5 additive SQL dilinin dışındadır. Genel denetçi
korunur. Yeni açık seçenek `--reviewed-migration-profile october-2026-v1`, yalnız
`scripts/migration-profiles/october-2026-v1.json` içindeki sıralı sekiz dosyanın
SHA-256 değerleriyle eşleşen tam bekleyen kümeyi kabul eder. Alt küme, ek migration,
değiştirilmiş dosya veya bilinmeyen profil reddedilir; otomatik fallback yoktur.

Profil SHA ve exact migration listesi kapılarına eklenir; kendi başına yetki değildir.
Uzak yeniden giriş kimliği profili de bağlar. Eski A5 kimliği ve varsayılan yolu korunur.
Aday imajdaki SQL dosyaları checkout ile ayrıca karşılaştırılır. İlk üretim erişiminde
canlı applied set yeniden okunur; `9bf3653` checkout kaydı onun yerine geçmez.

## Korunan veriler ve yeni şema

Altı yeni tablo, sekiz yeni enum, üç eski tablo indeksi ve
`agent_global_settings` üzerinde dört sütun vardır. Yeni modlar `OFF`, iki yeni
zaman alanı `NULL` başlar. Yeni tablolar yazıcılar açılmadan boş olmalıdır.

Eski tablo verileri, sequence'ler, migration geçmişi ve tablo şemaları A5 kapılarında
karşılaştırılır. Yalnız global ayar satırının parmak izi iki tarafta JSONB'den alınır;
eksik dört yeni alan OFF/NULL başlangıcıyla tamamlanır ve gerçek satır değerleri
üzerine yazılır. Eski veya yeni alan değişirse kontrol düşer. Yeni alan başlangıçları
ayrıca sınanır. Şema filtresi sadece global tablonun exact dört
`pg_dump` sütun satırını çıkarır; tür/default/eksik/yinelenmiş sütun reddedilir.
Diğer şema metni aynen korunur; genel bir SQL normalizasyonu yapılmaz.

Yeni tablo sütunları, CHECK/FK/indeks tanımları, partial predicate/ifade/sıra,
indeks geçerliliği, trigger etkinliği ve üç ilgili fonksiyonun tanımı sabit katalog
makbuzuyla karşılaştırılır. Makbuz kaynak SQL'den kurulu yerel PostgreSQL 16'dan
alındı; gerçek sıfırdan kurulum→dump→restore→migration testi de aynı sonucu sınar.
Önceden var olan `reject_immutable_history_mutation()` tanımı da karşılaştırılır.

Mevcut tablo indekslerindeki sabit uzunluk kuralı korunur. Tek istisna exact
profilde `agent_runtime_events_feedback_presented_idx` için `eventType VARCHAR(100)`;
UTF8 ve 8192 bayt blok şarttır. Diğer iki alan UUID/zaman türüdür; bu dar üst sınır
B-tree girdisinin büyümesini sınırlar. Genel denetçide metin istisnası açılmaz.
Yeni tablolara giden FK'ler ön kontrolde eski tablo aranarak reddedilmez; son katalogda
hedefleri ve aksiyonları bütünüyle karşılaştırılır.

## Geçiş, süre ve geri dönüş

A5'in genel yazma dondurması, worker drain/hold, app/Caddy durdurması, açık backend
kontrolü, yedek, izole restore ve önceki imajın yeni şemayla açılış/smoke provası sürer.
Yalnız ajan pause'u yeterli değildir. Dondurmadan itibaren mevcut 45 dakika bütçe,
5 saniye kilit ve 300 saniye ifade zaman aşımı değiştirilmedi. Belirsiz migration
çıkışı otomatik resolve/retry veya elle SQL ile geçilmez.

Dondurma öncesi preflight ve her scratch/üretim migration'ından önce üç eski indeks tablosunun satır/boyut
makbuzu alınır. Sonrasında ilgili üç migration'ın Prisma başlangıç/bitiş aralığı
saklanır. **Bu, tek indeks ifadesinin ayrı süresi değil, onu içeren migration'ın
süre üst sınırıdır.** 4 Ekim 05:46:54 UTC pinli salt okunur kesitte DB 5.741.173.783 bayt;
`agent_actions` 74.973.184, `agent_runtime_events` 2.969.714.688, `audit_logs`
145.375.232 bayt toplam ilişki boyutu ölçüldü. Gerçek restore kopyasında süre
henüz ölçülmedi; yerel küçük fixture performans kanıtı değildir. `audit_logs` ordinary CREATE INDEX sırasında
SHARE kilidi alır; okuma sürer, yazı bekler. Sekiz migration tek atomik işlem sayılmaz.

Geri dönüş, doğrulanmış önceki uygulama imajıdır; yeni tablolar/alanlar silinmez.
Yeni modlar açılmadan eski imaj boot/smoke kapısı geçmelidir. Sonraki persona rollout
ve ödül aktivasyonunun kendi snapshot/geri alma makbuzu ayrıdır. Yerel testte Docker
imaj boot'u yapılmadı; üretim restore kopyasındaki zorunlu kapı onun yerine geçmez.

## Yerel ilk kanıt

İlk odaklı koşu: **93/93**, altı test dosyası. Yeni profil için dört gerçek PG16
senaryosu ve 13 birim; mevcut A5 şema/restore/zaman aşımı, genel SQL denetçisi ve
release betiği regresyonları dahil. Eski ayar/constraint sapması, devre dışı immutable
trigger ve `OFF` dışı başlangıç değeri reddedildi. Son ek dar varchar/mod seçenek
kontrolleriyle odaklı **36/36** (5 PG16, 13 profil birim, 18 release betiği) geçti.
Bu ilk koşunun ardından yapılan bağımsız inceleme ve kapanış aşağıdadır.

## Opus incelemesi ve koşullar

İlk `b57729d` çağrısı 600 saniyede çıktı üretmeden sona erdi; inceleme sayılmadı.
#307 sonrası yalnız parent rebase ile `ad2a58563490ef222e374f194c841069e954dd2f`
ağacı aynı kaldı. İkinci araçsız çağrıda gerçek **`claude-opus-5`**, medium effort,
**KOŞULLU GO** verdi (361 saniye); test çalıştırmadı. Koşulsuz KOD GO denmez.

1. **P2-1:** yeni tablolar arası FK ön-kontrol istisnası yalnız exact profile bağlandı;
   genel yol eski davranışını korur. `Object.hasOwn` ile JavaScript prototype isimleri
   yeni tablo sayılmaz. Gerçek PG16 testi genel moddaki yeni hedefi ve `constructor`
   hedefini reddetmeyi sınar.
2. **P2-2:** hakemin önerdiği alternatiflerden **dondurma öncesi gerçek salt okunur
   üretim boyutu makbuzu** alındı (yukarıdaki 05:46 kesiti). Aynı satır/boyut sorgusu
   preflight'a da eklendi; frozen öncesi ve içindeki makbuzlar korunur. Ölçülmemiş bir
   “bu boyutta kesin 300 sn altında biter” eşiği uydurulmadı. Restore kopyasındaki
   gerçek geçiş/indeks migration süresi üretime uygulamadan önce zorunludur.
3. **P2-3 ukte kaynak kanıtı:** `slug` okur kaydının anahtarı değildir. Public DTO UUID
   ve `writeUrl=/baslik/ac?title=...` kullanır (`uktes/application/uktes.ts`);
   `createTopicSlug(title, "")` en çok 80 karakter üretir. İki ayrı Latin dışı başlığın
   slug'ı boş olabilir ve iki OPEN kayıt olması mevcut PG16 testiyle bilinçli korunur.
   UNIQUE(slug) bu sözleşmeyi bozardı. `targetKeys` istemci alanı değildir; strict
   `ukteCreateSchema` yalnız 400 girdi/2–100 normalize karakterlik başlık kabul eder,
   anahtarlar ondan sunucuda türetilir. Suffix adayları metin çıkararak oluşur; bir
   anahtar 100 karakteri aşmaz. Sınır/NFKC/Cf ve istemcinin key/slug yazma reddi için
   doğrudan birim kanıtı eklendi. Ham SQL yetkisi ayrı güven sınırıdır.

Düşük önem notlarının kaynakla kapanışı:

- Uzak yürütücü `production-release-remote.sh:2` **`set -Eeuo pipefail`** kullanır;
  faz o kabukta source edilir. Normalizer hatası boru hattında yutulmaz.
- `migration_phase()` başında kaydedilmiş `identity`, `migration_identity` ile
  karşılaştırılır; uyuşmazlık `MIGRATION_OPERATION_INCOMPLETE` verir. Kısa hakem
  paketinin satır kesiti karşılaştırmadan iki satır sonra başlıyordu; kaynakta mevcuttur.
- Enum ekleme/dosya sırası exact sekiz checksum ile kilitlidir. SQL migration dosyaları
  birleştirilmez, yeniden yazılmaz; Prisma bütün paketi tek atomik işlem saymaz.
- TRUNCATE test GUC'u, keyfi SQL çalıştırabilen güvenilir DB rolüne karşı güvenlik
  sınırı değildir. İlgili değişmezlik uygulama yazma yolları/normal rol kullanımı
  içindir; kaldırılmış reset burada çalıştırılmadı.
- Küresel tek PROPOSED niyeti P8 sözleşmesinde zaten kabul edilmiştir. `targetKeys`
  kesişiminde ukte tekilleştirme/gizleme aynı title-lock kümesi ve `hasSome` ile
  korunur; DB'de slug benzersizliği varsayılmaz. Yeni tasarım sorusu açılmadı.
- Sabit katalog, inceleme sonrası tanım sapması denetimidir. SQL tasarımının kabulü
  dosya incelemesi ve davranış testleriyle yapılır; aynı kaynaktan üretilen fixture
  tek başına tasarım doğruluğu iddiası vermez.

**Ek imaj kanıtı:** mevcut CI container boot probe zaten bütün migration'ları boş
PG16'ya uygular. Buna, imaj içindeki gerçek `run-migration.mjs` ile ayrı boş DB'ye
uygulama ve ana probe DB geçmişinin değişmemesi kontrolü eklendi; son CI sonucu
aşağıda PASS olarak kaydedildi. Eski şemadan geçiş yerel PG16 restore testinde, önceki imaj boot/smoke'u
ise A5 üretim provasında ayrıca kalır. Bu sınırlar birbirinin yerine yazılmaz.

Son hakem düzeltmeleri sonrası **70/70** geçti: 6 profil PG16, 7 mevcut A5 PG16,
20 ukte PG16, 13 profil birim, 18 release betiği ve 6 ukte anahtar sınırı testi.
Genel FK kapısının korunması ve prototype hedef reddi doğrudan sınandı. Preflight ve
frozen boyut makbuzları ayrı etiketli dosyalarda tutulur; birbirinin üzerine yazılmaz.
Makbuz dosyası etiketinden sonra 6/6 PG16 ve 8/8 CI sözleşmesi testi de geçti.
`format:check`, `lint`, `typecheck`, `requirements:check` PASS. Exact CI `37182105221` **7/7 PASS**, final `1580273cc5ef54f3d47a581c4d09751c4a50c755`.
Gerçek container runner probu `applied=36 main_history=unchanged` verdi. #308 main
`9ead5a0746e3af7e94622670c76efc28254fd362` olarak birleşti; uzak SHA ve squash ağaç
eşitliği doğrulandı. Üretim restore/önceki imaj/cutover kapıları açık.

## V2 — doğum hesabı hazırlığının dokuzuncu migration'ı

#316 sonrasında hedef şema37 migration içerir. `october-2026-v2`, v1'in sıralı sekiz
SQL dosyasını **aynı checksum'larla** ve yalnız ardından
`20261004120000_birth_preparation` dosyasını kabul eder. V1 manifest/ek SQL/ek katalog
baytları değişmedi; ayrı v2 dosyaları eklendi. Genel additive SQL denetçisi ve varsayılan
migration'sız yol korunur. Wrapper/uzak yürütücü/checker yalnız explicit v1 veya v2
adını kabul eder; bilinmeyen ad veya path ile farklı katalog seçilemez.

V2 **v1 uygulanmış DB'ye yalnız dokuzuncu dosyayı uygulama profili değildir**.
Önceki üretim tabanından tam dokuz bekleyen migration gerekir; sekiz/tek dosya/ek dosya
ve sıra sapması reddedilir. Canlı applied set, artifact içi dosyalar ve exact checkout
üretim preflight'ında yeniden eşleşmelidir; checkout SHA tek başına DB geçmişi değildir.

Doğum tablosunda altı ek nullable alan, iki FK, bir CHECK ve üç indeks; mevcut enum'da
iki ek durum ve yeni immutable geçiş fonksiyonu tanımı pinlenir. Audit tablosunun
`audit_agent_creation_lookup` partial indeksi ayrı ek katalogda yer alır. Toplam170
katalog tanımı yerel PostgreSQL16'dan çıkarıldı. Katalog makbuzu tasarımın bağımsız
ispatı değildir; immutable hazırlık davranışı #316'nın gerçek PG16 testlerinde sınandı.

Eski veri/sütun karşılaştırmasının istisnası yine yalnız aynı dört global ayar alanıdır.
Doğum tablosu üretim tabanında yeni tablodur ve writers açılmadan boş kalmalıdır.
Yeni imajda bütün migration'lar uygulanır; enum sırası dahil son katalog bütünüyle
karşılaştırılır. V2 audit lookup için dördüncü migration süre makbuzu zorunludur;
aynı üç mevcut tablonun boyut makbuzları sürer. V1 üç süre makbuzuyla çalışmaya devam eder.

İlk44 birim PASS. İlk gerçek PG koşusunda v1'in altı ve v2'nin beş senaryosu geçti;
v2 genel katalog kapısı `CATALOG_EXPECTATION_MISMATCH` ile durdu. Yeni FK listesi
manifestte sona eklenmişti, sorgu sütun adına göre sıralıyordu. Yerel gerçek katalog
karşılaştırması tek farkın bu sıra olduğunu doğruladı. Manifest sırası düzeltildi;
karşılaştırma/SQL kısıtı gevşetilmedi. Ayrıca iki senkron test grubunun RPC cevabını
geciktirmesi için senaryolar arasında event loop'a dönüş eklendi; timeout artırılmadı.

Son gerçek PG16 eski şema→dump→restore→geçiş denemesi **12/12 PASS**,6v1+6v2.
Her ikisinde eski veri, sequence/geçmiş/şema ve yeni nesneler doğrulandı; eski ayar ve
constraint sapması, disabled trigger ve OFF dışı başlangıç değeri reddedildi. Bu
boş/küçük fixture ölçümü üretim büyüklüğünde süre veya eski9bf Docker boot kanıtı değildir.
Üretimde genel yazma dondurması, gerçek restore/indeks süresi, eski imaj boot/smoke,
45dakika bütçe ve5/300s DB zaman aşımı kapıları aynen sürer. Üretime uygulanmadı.
Son regresyon **113birim/21PG16 PASS**: iki profil için12restore/geçiş, mevcut A5
için7SQL ve2gerçek zaman aşımı. V1 makbuz baytları, tam v2 superset, ilk/son SQL
checksum sapması ve yeni CHECK tanımı sapması ayrıca sınandı.

Gerçek Opus 5, `1d1de66230eb334a5416d585adb9aff95d7ebea7` için **KOD GO** verdi;
somut kod kusuru bulmadı. B1 bilgi eksiği `audit_logs.entityId` tipiydi. Kaynakta
`prisma/schema.prisma:738` ve immutable başlangıç migration'ı `:211`, **UUID**
tipini doğrular. Genel indeks preflight'ı canlı katalog tipini zaten yeniden sınar;
bu makbuz canlı tip okumasının yerine geçmez. Gerçek model `claude-opus-5`;
yardımcı Haiku kullanımı hakem modelini değiştirmez. #320 exact head CI açık.

#320 final `4f68c57b497e91013fafe4cf8903ca5450e0613e` için CI `37206758504`
**7/7 PASS**. Main `88c7f562124020d45c0041e98b1e2ebb6287d000`; uzak SHA ve test
edilen head'in tree eşliği doğrulandı. Önceki CI yeni belge push'u nedeniyle iptal
edildi, PASS sayılmadı. V2 kod/hakem/CI tamam; üretim prova ve cutover kapıları açık.

## Release ayar özetinin Ekim profiliyle uyumu — 4 Ekim

A5'in veri parmak izi yeni dört alanı ayırıp başlangıç değerlerini ayrıca denetlerken,
release betiğinin `settings_fingerprint()` işlevi tam satır JSON'unu karşılaştırıyordu.
Doğru migration bile `OFF/NULL` alanları ekleyince hash'i değiştiriyor ve son release
kontrolü geçişi durduruyordu. Üretimde denenmedi; dağıtım ön hazırlığında bulundu.

Yalnız exact `october-2026-v1/v2` için eksik alanlar `OFF/OFF/NULL/NULL` ile tamamlanır,
gerçek satır JSON'u sağ tarafta bunların üzerine yazılır. Böylece hiçbir gerçek ayar
değeri özetten çıkarılmaz; dört yeni alandaki sapma da hash'i değiştirir. Diğer profiller
ve migration'sız mod tam satırı karşılaştırır. A5'in eski veri, katalog, başlangıç değerleri
ve geri dönüş kapıları korunur.

İki profilde 16 PG16 / 18 release betiği testi PASS; son kaynakta dört yeni PG16
senaryosu ayrıca tekrar geçti. Eski `runtimeEnabled` ve yeni dört alanın sapması,
şema eklemesinin eşliği, migration'sız ve bilinmeyen profil davranışı gerçek psql ile
sınandı. Format/lint/typecheck ve üç gereksinim testi PASS. Exact kod hakemi/CI ve
üretim büyüklüğündeki restore/önceki imaj geçişi henüz açık.

### İlk hakem ve iki katmanın uzlaştırılması

Gerçek `claude-opus-5`, exact `fd4a3b927f5cc9457c47f80b798c68f0baf3b8a0` için
**DÜZELTİLMELİ** verdi; actual modelUsage yalnız bu model. B1'in eski migration
kapısında genel fail-open iddiası kaynakla doğrulanmadı: `post_verify()` başlangıç
OFF/NULL kontrolünü zaten zorunlu çağırır. Buna rağmen veri özeti de release ile aynı
`defaults || to_jsonb(t)` kuralına daraltıldı; artık yeni alan sapması içerik
karşılaştırmasında doğrudan görünür, son başlangıç kontrolü de korunur.

B2'de profil değişikliğinin ayar verisi yerine farklı hash hesabı üretmesi teşhis
belirsizliğiydi; eski guard fail closed kalıyordu. Baseline artık `settings-profile`
makbuzunu da atomik tamamlama işaretinden önce yazar; eksik veya değişmiş profil
`SETTINGS_PROFILE_CHANGED` ile durur. Aynı SHA yeniden girişinde profil korunmalıdır.
Önceki sürümün eksik makbuzu otomatik tamamlanmaz veya baseline silinmez.

B3 tip sapmasını ham JSON metniyle ayırma önerisi alınmadı: JSON null veya enum/text
OFF temsili tip denetimi değildir; mevcut exact SQL checksum, normalize-schema ve
sabit katalog kapıları type/default/eksik/yinelenmiş sütunu ayrıca reddeder. Hash
eşliği yerel gerçek pre/post DB testiyle sınanır. Mevcut tip/default regresyonları
yeniden çalıştırılır. İlk görüş yeniden adlandırılmaz; son test/ikinci hakem/CI açıktır.

Son yerel **82 PASS**:18 PG16,29 exact profil,16 faz davranışı,19 release betiği.
Tam `post_verify` başlangıç/son temiz eşliğinde dört yeni alan sapmasını doğrudan
`POST_TABLE_CONTENT_CHANGED` ile reddeder. Aynı hash'lerle profil değiştirme/eksik
profil makbuzu `SETTINGS_PROFILE_CHANGED` ile reddedilir; doğru üç profil yolu geçer.
B3 için mevcut type/default/eksik/yinelenmiş sütun testleri yeniden geçti.
