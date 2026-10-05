# Reset öncesi BIGINT sınır kanıtı — 5 Ekim 2026

Bu belge ilk kod paketinin sınır envanteri ve doğrulama makbuzudur; aktif iş
sırası [PLAN.md](PLAN.md)'dedir. Üretim reseti veya dağıtım kabulü değildir.

## Public ID nerede dönüştürülür?

Yalnız `Topic.publicId` ve `Entry.publicId` DB'de BIGINT olur. Runtime ledger
ID'si ve diğer BIGINT alanlar bu değişimin kapsamında değildir. Repository
çıktılarında `publicIds` iç içe **publicId adlı BIGINT** alanları pozitif güvenli
number'a dönüştürür; JSON içindeki sayıları değiştirmez. Number girdi
`publicIdBigInt` ile doğrulanarak sorguya taşınır. Üst sınır `9007199254740991`.

| Kaynak                                                                                          | Sınır ve uygulanan kontrol                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| topics/repository/topics.ts                                                                     | Özet/default ve ilk-entry DTO'ları, dizin, sitemap, birleşme hedefi dönüştürülür. Snippet yalnız body; görünür özet yalnız sayım.                                                                                                                                  |
| entries/repository/entries.ts                                                                   | Oluşturma/detay/liste/update sonrası DTO ve referanslar dönüştürülür; numeric sorgu girdileri BIGINT.                                                                                                                                                              |
| feeds/repository/feeds.ts                                                                       | Üç topic raw SQL akışı, ilişki DTO'ları ve top-entry raw SQL dönüştürülür; raw türleri BIGINT olarak tanımlı.                                                                                                                                                      |
| indexing/repository/indexing.ts                                                                 | Sitemap ve syndication numeric DTO'ları dönüştürülür. Politika/kind/sayaç ve gecikme listesi publicId seçmez.                                                                                                                                                      |
| interactions/repository/interactions.ts                                                         | Bookmark/follow iç içe publicId DTO'ları dönüştürülür; vote counter select publicId içermez.                                                                                                                                                                       |
| users/repository/profiles.ts                                                                    | Public entry/topic listeleri dönüştürülür.                                                                                                                                                                                                                         |
| moderation/repository/actions.ts                                                                | Default entry/topic dönüşleri ve rename/move/status sonuçları dönüştürülür. Yetki/çatışma sorguları seçili UUID/status alanlarıdır; void merge çıktısı dışarı taşınmaz.                                                                                            |
| moderation/repository/queries.ts                                                                | Default topic yönetim listesi dönüştürülür. Audit JSON ve user liste sınırları yeni publicId üretmez.                                                                                                                                                              |
| moderation/repository/reports.ts                                                                | Delil publicId sorgusu BIGINT girdi + number çıktı; report target select yalnız UUID/owner/status.                                                                                                                                                                 |
| moderation/repository/trash-appeal.ts                                                           | Entry ve topic içeren seçili DTO'lar dönüştürülür; owner/reviewer yalnız UUID alanları.                                                                                                                                                                            |
| moderation/repository/seed-visibility.ts                                                        | Entry/topic publicId önce dönüştürülür; application audit/outbox'ta daha sonra entryPublicId/topicPublicId adlarına atanır.                                                                                                                                        |
| moderation/repository/agent-content.ts                                                          | İçerik listesi dönüştürülür; write-lock ve bulk resolver'ın dar select'lerinde publicId yok.                                                                                                                                                                       |
| agents/repository/control-plane.ts ve manual-runs.ts                                            | Run/content detail iç içe entry.publicId dönüştürülür; source.topics JSON alanı Topic ilişkisi değildir.                                                                                                                                                           |
| agents/repository/runtime.ts                                                                    | Numeric bkz adayları BIGINT sorguya, seçilen entry.publicId number'a dönüştürülür. Doğrudan diğer topic/entry perception/read/quality select'leri UUID/title/body/time seçer; publicId içermez. TrendingTopics ise feeds listScoredTopics number DTO'sunu aktarır. |
| agents/repository/purposes.ts ve rewards.ts                                                     | Dar UUID/title/body/time select'leri publicId içermez. Ledger'ın BIGINT ID'si mevcut ayrı sınırında kalır.                                                                                                                                                         |
| moderation/repository/authorization.ts ve agent-behavior-feedback.ts; uktes/repository/uktes.ts | Yetki ve bağlama sorgularındaki dar select'lerde publicId yok.                                                                                                                                                                                                     |
| search/repository/search.ts                                                                     | publicId PostgreSQL'de `::text` ile URL'ye katılır; JS'ye BIGINT/numeric ID alanı dönmez.                                                                                                                                                                          |

`src` içindeki bütün Topic/Entry delegate çağrıları ile literal publicId ve
ilişki select'leri birlikte tarandı; yalnız TypeScript başarısı sınır kanıtı
sayılmadı. Script/seed kaynaklarında publicId seçim veya numeric kullanımı
bulunmadı. Mapper alan adına göre çalıştığından yeni SQL alias'ı veya yeni
default-select repository dönüşü eklenirse envanter yeniden doğrulanmalıdır;
bu dosya gelecekteki değişiklikleri otomatik olarak güvenli ilan etmez.

## Girdi ve JSON sözleşmesi

Renderer `^#([1-9]\d*)$` ve `Number.isSafeInteger` ile sıfır/negatif/taşan
bkz adayını repository'ye gitmeden eler. Gerçek Zod4 report şemasında `.int()`
pozitif güvenli integer sınırını uygular. İki alan ve normal/üst sınır örnekleri
unit testte gerçek şema üzerinden doğrulandı. HTTP hata sözleşmesi değişmedi.
UI, rota parser'ları, reference index, serialization, application ve API
mapper'ları repository'nin number DTO'sunu kullanır; Prisma yalnız veri
katmanında kalır. Unrelated BIGINT'i JSON-safe sayma iddiası yoktur.

Yeni PG testi topic2147483648 ve entry3000000000/3000000001 değerlerini ayırır.
Gerçek application topic/entry yazıları audit/outbox oluşturur; gerçek
idempotency repository JSON saklama/okuma roundtrip'i ayrıca kontrol edilir.
Bu, tam HTTP idempotent replay ölçümü değildir. Moderasyon default DTO/listesi,
search text URL, ORM, raw feed, sitemap ve syndication sınırları kapsanır.
Her iki sequence tipi/max/last_value/is_called ve eski CHECK'ler transaction
rollback'i sonrası birebir karşılaştırılır; DDL artığını TRUNCATE gizlemez.
Bu PostgreSQL testleri henüz çalışmadı; exact-source CI sonucu beklenir.

## Migration hatası ve çözüm

PR333 exact6473321 CI37378502073 PostgreSQL migration adımında FAIL:
`cannot alter type of a column used in a trigger definition`;
`topics_public_id_immutable` trigger'ı kolon bağımlılığı taşır. Production
kaynağına hiçbir migration uygulanmadı. Transaction aborted ikincil hatası
kök nedeni gizledi; native DB job logu gerçek nedeni gösterdi.

Geçmiş migration değiştirilmez. Yeni prepare migration iki tabloyu NOWAIT
kilitler; function gövdesi ve trigger enabled/type/column/function özellikleri
beklenen özgün tanımla eşleşmedikçe reddeder. `CREATE OR REPLACE TRIGGER`
ile aynı immutable function'ı bütün UPDATE'lerde çalıştırır. Böylece kolon
bağımlılığı kalkar ve mevcut BIGINT migration çalışabilir. Finish migration
aynı guard ile özgün `UPDATE OF publicId` trigger'larını geri kurar. Trigger
kapatılmaz veya silinmez; function değiştirilmez. Ara durumda daha geniş
UPDATE guard'ı da publicId değişimini reddeder.

Yeni pre/post adımlarda lock1sn/statement300sn sınırı vardır. Aradaki geçmiş
BIGINT migration'a sonradan timeout eklenmiş gibi raporlanmaz. Üretim
migration yürütücüsünün tam freeze, bounded bağlantı/işlem ve app/worker
cached-plan yenilemesi kapıları ayrıca kapanmalıdır. Local reset guard'ının
INTEGER profili BIGINT'te kapalı kalır; allowlist genişletilmedi ve testler
atlatılmadı.

## Ölçülen sonuç

Düzeltme sonrası ilgili **5 dosya/41 unit PASS**, 22:04:31 UTC, 3,38sn.
Önceki b508 kaynakta275dosya2389unit ve647 kaynakta3dosya10unit ayrı tarihsel
sonuçlardır; yeni exact-source tam CI sonucu yerine kullanılmaz. Yeni farklı
model kaynak incelemesi, PostgreSQL, container ve browser sonucu beklenir.

## Fable kaynak closure ve migration hata yolu

Actual Fable5.1 exact `b536eea7be0d19bc5df0124af5fffe542fbdae45`,
190.041ms: **KOŞULLU GO**, F1/F2 kaynakta kapalı; mergeyi engelleyen kaçak
bulunmadı. F3/F4 gerçek exact CI sonucuna bağlı, production F5/F6 açık.
Yeni CI37380531693 migration adımlarını geçti; diğer sonuçlar bekler.
B2 sınırlaması kabul edildi: mevcut PG negative test publicId UPDATE değişmezliğini
sınar; değiştirilmiş function/trigger ile migration guard hata yolu ayrıca
çalıştırılmış değildir. Bu yönde geniş bir negative-guard PASS iddiası yoktur.
B4 fixture cutoff'u bir saniyelik sabit pay yerine iki gerçek entry'nin
createdAt üst sınırından türetilerek belirlenir. Runtime trending feed aktarımı
B6 envantere eklendi. Geçersiz direct repository çağıran için range Error
sözleşmesi bilinçlidir; dış giriş parser/Zod'dadır. Bütün API handler'larında
canlı geçersiz-ID deneyi yapıldığı iddia edilmez.

B1 hata yolu **kabul edilen kapalı-kalma davranışıdır**: açık BEGIN atomikliği
korunur; NOWAIT/guard hatası Prisma'da ikincil aborted-transaction mesajı
üretebilir. Bu durumda dağıtım, yeniden açılış ve sonraki migration durur.
Finish başarısızsa geniş BEFORE UPDATE guard'ı kalır; publicId değişmezliği
kalkmaz. Otomatik retry/resolve veya guard kapatma yoktur.

Somut recovery adımı: bakım/freeze ve aynı pinli kimlik korunarak native özel
migration logu ile `_prisma_migrations` kayıtları ve function/trigger katalogları
birlikte okunur. Failed dosyanın bütün DDL'inin rollback'i, source checksum'u
ve tam beklenen ara durum kanıtlanmadan `migrate resolve` kullanılmaz.
Prepare başarısızsa özgün kolon-specific guard'lar; BIGINT başarısızsa prepare
sonrası geniş guard ve eski INTEGER state; finish başarısızsa BIGINT/legacy
CHECK/seq state ve geniş guard beklenir. Yalnız tam bilinen rollback kanıtından
sonra ilgili exact dosya `migrate resolve --rolled-back <migration>` olarak
işaretlenip aynı freeze/bounded-client kapısında yeniden deploy edilebilir.
Commit durumu veya şema belirsizse işlem yapılmaz; kullanıcıya somut durum
bildirilir. Kurtarma komutu bu makbuzda çalıştırılmadı. Disk/yedek/gerçek restore
ve exact release kapıları ayrıca geçerlidir. `ONLY` prepare lock'unda ikinci
tablo kalıtımına yayılabilir; production preflight'ı her iki tabloda inheritance/
partition yokluğunu ayrıca doğrulamadan migration çalıştırmaz.
