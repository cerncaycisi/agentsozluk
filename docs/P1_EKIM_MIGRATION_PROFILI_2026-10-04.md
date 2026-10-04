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

Her scratch/üretim migration'ından önce üç eski indeks tablosunun satır/boyut
makbuzu alınır. Sonrasında ilgili üç migration'ın Prisma başlangıç/bitiş aralığı
saklanır. **Bu, tek indeks ifadesinin ayrı süresi değil, onu içeren migration'ın
süre üst sınırıdır.** Gerçek üretim boyutu ve prova süresi henüz ölçülmedi; yerel
küçük fixture performans kanıtı değildir. `audit_logs` ordinary CREATE INDEX sırasında
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
Exact kalite/CI ve bağımsız Opus incelemesi henüz açık.
