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
sadece dört yeni alan dışarıda tutulur. Eski alan değişirse kontrol düşer. Yeni
alan değerleri ayrıca sınanır. Şema filtresi sadece global tablonun exact dört
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
henüz açık. Eski şemadan geçiş yerel PG16 restore testinde, önceki imaj boot/smoke'u
ise A5 üretim provasında ayrıca kalır. Bu sınırlar birbirinin yerine yazılmaz.

Son hakem düzeltmeleri sonrası **70/70** geçti: 6 profil PG16, 7 mevcut A5 PG16,
20 ukte PG16, 13 profil birim, 18 release betiği ve 6 ukte anahtar sınırı testi.
Genel FK kapısının korunması ve prototype hedef reddi doğrudan sınandı. Preflight ve
frozen boyut makbuzları ayrı etiketli dosyalarda tutulur; birbirinin üzerine yazılmaz.
Makbuz dosyası etiketinden sonra 6/6 PG16 ve 8/8 CI sözleşmesi testi de geçti.
`format:check`, `lint`, `typecheck`, `requirements:check` PASS. Exact CI ve gerçek
imaj probu sonucu ayrıca kaydedilecektir.
