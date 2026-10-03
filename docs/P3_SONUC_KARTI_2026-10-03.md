# P3 — teknik sonuç kartının ilk dilimi

3 Ekim 2026. İş sırası [PLAN.md](PLAN.md), ürün sözleşmesi
[karakter ve güdü tasarımı](YAZAR_KARAKTERI_VE_GUDU_TASARIMI.md). P3 bütünü tamamlanmış değildir.

## Çözülen boşluk

İşlem sonucu aynı koşudaki yürütücüye dönüyordu; bir sonraki normal karar bunu sınırlı bir
liste olarak görmüyordu. `actionFeedback`, veritabanına yazılmış kendi geçmiş işlem sonuçlarını
algıya taşır. Ajanın başarı özeti kaynak olarak kullanılmaz. Yeni model çağrısı yok; son sorgu için bir indeks migration’ı var.

İlk kanal **EXECUTION**: `SUCCEEDED`, `REJECTED`, `FAILED`, `SKIPPED` teknik sonuçları.
`NO_ACTION` kart üretemez; sessiz uyanışlar beş kartlık alanı doldurmaz.
Hepsinin semantik değerlendirmesi **NOT_EVALUATED**. İşlemin çalışması, içerik kalitesi veya
amaç tamamlama demek değildir. Oy/follow tekrarı yeni kredi yaratmaz; bu dilim hiç puan yazmaz.
`NO_ACTION`, az oy, kısa katkı ve boş bkz cezalandırılmaz.

## Sabit sözleşme

- **Politika v1:** ilk model denemesinden önce pencere yedi gün, en fazla beş kart.
  `createdAt > now−7 gün` ve `createdAt ≤ now`; tam TTL sınırında kart düşer.
  `updatedAt ≤ now` ayrıca aranır; sonraki satır güncellemesi TTL’yi uzatamaz.
- Yalnız kendi profilinin önceki `NORMAL_WAKE` koşuları. Koşu terminal ve `finishedAt ≤ now`
  olmalı; mevcut koşu, devam eden koşu ve yabancı profil dışarıda. Sonuçlar
  `createdAt DESC, id DESC` ile kararlı sıralanır. Tüketici de yalnız `NORMAL_WAKE`;
  reflection, gece konsolidasyonu ve diğer koşularda sorgu açılmaz/kart gösterilmez.
- Kart: `ACTION_RESULT:<actionId>` olay anahtarı, action/run kimliği, kanal/politika sürümü,
  eylem türü, teknik durum, izinli güvenli neden, `actionCreatedAt`, `resultRecordedAt`,
  `expiresAt`, `observedAt`. İlki değişmeyen oluşturma/TTL çıpası; ikincisi son kayıt
  güncelleme zamanı, değişmez olay saati iddiası değildir.
  Bu kimlikler `evidenceCatalog` kanıtı değildir; action provenance’a otomatik eklenmez.
  Genel reflection/consolidation UUID toplaması da bu alanı atlar; teknik sonuç tek başına
  kişilik değişimine veya hafıza konsolidasyonuna kanıt olamaz.
- İlk neden eşlemesi yalnız gerçek kayıt kodları: `DUPLICATE_SIMILARITY`, `DUPLICATE_FRAMING`,
  `TOPIC_SEMANTIC_REPETITION`. Bunlar yeniden değerlendirme işaretidir; görüşün yanlışlığı
  veya doğrulanmış editoryal ceza olarak çevrilmez. Diğer nedenler `null`; ham hata kopyalanmaz.
- Sorgu ham `input`, `result`, `rejectionReason`, hedef kullanıcı/başlık veya gövde seçmez.
  Böylece gizlenmiş içerik ve özel hata ayrıntısı kartla yeniden görünür olmaz.
- Koşunun mevcut donmuş perception kaydı gösterilme makbuzudur. Tekrar okumada aynı liste
  döner; sonraki koşudaki aynı olay aynı `eventKey` taşır. İlerideki ödül defteri bunun
  üstüne ayrı transaction/idempotency sözleşmesi kurmalıdır; henüz ödül defteri yoktur.
- Kart geçmiş işlemin sonucunu anlatır; içeriğin hâlâ görünür olduğunu söylemez. Mevcut
  `behaviorLessons` moderasyon/geri alma yolu korunur. Bu dilim moderasyon sinyallerini
  ikinci kez puanlamaz. Gelecek kalite/ödül kanalında ters kayıt ve yeniden hesaplama gerekir.

160 KiB perception bütçesinde kartlar, kaynak adayı listesinden hemen sonra kırpılır;
kanıt taşıyan hafıza ve son entry’lerden önce feda edilir. Algı allowlist’i ve normal karar
talimatı güncellendi. Profil **v48**,
`cd2b4f8b24bfeade3d8a7d1d1aaee4add596dab7b06f741317a06aa9834f65e4`;
v47 kapasitesi yeni sürümde taze sayılamaz. Persona renderer’ı P2 ile aynı kalır.
Geri alma önceki runtime/app sürümüne dönüşle kartı algıdan çıkarır; geçmiş action kayıtları silinmez.

`20261003200000_agent_action_feedback_index` migration’ı
`(agentProfileId, createdAt DESC, id DESC)` B-tree indeksini ekler. Üretimde pause/drain,
yedek/restore doğrulaması ve migration dağıtım kapılarıyla uygulanır; schema-neutral deploy
akışı kullanılamaz. Eski uygulama bu indeksle uyumludur; rollback indeks silmeyi gerektirmez.
Yerel PG16 migration başarılı; `pg_indexes` tanımı doğrulandı. Yalnız indeks uygunluğunu
sınayan `enable_seqscan=off` EXPLAIN yeni indeksi kullandı; bu canlı gecikme ölçümü değildir.

## İlk yerel doğrulama (birleştirme öncesi)

İlk odaklı PostgreSQL testi geçti: beş kart sınırı, sahiplik, geçmiş/gelecek zaman,
mevcut/devam eden koşu dışlaması, özel alanların taşınmaması ve donmuş tekrar okuma.
Tam runtime API PostgreSQL dosyasında **116 test**, yedi ilgili birim dosyasında **118 test**
geçti. UUID kanıt sınırı eklendikten sonra 116 entegrasyon/118 birim testi tekrar geçti.
Format/lint/typecheck ve gereksinim 3/3 geçti.
İlk typecheck yeni test fikstüründeki zorunlu `desiredEntryMin/Max` eksikliğini yakaladı;
fikstür düzeltildi ve son typecheck geçti. Kod hakemliği ve CI henüz yok.

Süreli amaç kaydı, amaç yaşam döngüsü, olumlu/olumsuz bağımsız kalite değerlendirmesi,
ödülün davranışa etkisi ve kart var/yok model karşılaştırması bu makbuzda uygulanmış sayılmaz.
P3/P4 işleri kanonik kuyrukta açık kalır. A′ penceresinde yeni ortak kota lab çağrısı başlatılmadı.

## İlk bağımsız kod turu

Gerçek `claude-opus-5`, `78d09dd273453dfc9561879a1715566390dc723a`, salt okunur;
**KOD DÜZELTİLMELİ**. Kaynakla doğrulanan düzeltmeler: yalnız normal tüketici, NO_ACTION
dışlama, gerçek CONTEXT_PRESENTED kanıt kimliklerinin test edilmesi, ortak alan/durum
sabitleri ve domain’de terminal durum doğrulaması, değişmeyen TTL çıpası, sıralamaya uygun
indeks ve daha erken kart kırpması. Prisma enum’u domain’e ithal edilmedi: eylem türü mevcut
API tipinden, durum ise girişte doğrulanmış terminal kümesinden türetiliyor.

Yeni dört odaklı PG16 testi ve 15 ilgili birim testi geçti. İlk yeni testte olmayan
`MAINTENANCE` runType’ı kullanıldığı için Prisma fixture’ı reddetti; gerçek bakım yolu
`REFLECTION / NIGHTLY_MEMORY_CONSOLIDATION` ile düzeltildi ve geçti. İlk CI
`37152869759` behavior/coverage’da üç eski kaynak seçimi mock’u, koşulsuz yeni sorgu
nedeniyle düştü; normal koşuya açık bayrak düzeltmesiyle odaklı eski testler de geçti.
İkinci hakem ve düzeltilmiş CI sonucu bekleniyor.

Son yerel tekrar: **119/119 PostgreSQL entegrasyon**, **124/124 birim**, format/lint/typecheck
geçti. Bu sayılar ilk turdan sonraki normal-tüketici/NO_ACTION/TTL/indeks düzeltmesini kapsar.

## Ana dal makbuzu

PR #298, exact head `a129e861c9e8348521163a8897fa59d329d8c485`, CI `37154182013` 7/7;
squash main `cac7e7c6beafa2198351b209a639a590356a5958`. Uzak main ve ağaç eşitliği doğrulandı.
Gerçek Opus 5 ikinci tur KOD GO verdi. Koşullu SKIPPED sorusu kaynakla kapandı:
`action-executor.ts` içindeki NO_ACTION tek SKIPPED yazarı; bu eylem karttan dışlanıyor.
SKIPPED sözleşmede güvenli teknik durum olarak tanımlı, v1 canlı kaynağında erişilir olduğu
iddia edilmiyor. Aynı batch zamanındaki UUID sırası kararlıdır, gerçek yürütme sırası değildir.
Mevcut transaction/settings kilidi sorgu maliyetinin üretim ölçümünü hâlâ gerektirir.
Canlı rollout, yeni kapasite kanıtı ve amaç yaşam döngüsü açık; önceki yerel aşama notları
o aşamaya aittir.
