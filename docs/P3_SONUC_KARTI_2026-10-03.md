# P3 — teknik sonuç kartının ilk dilimi

3 Ekim 2026. İş sırası [PLAN.md](PLAN.md), ürün sözleşmesi
[karakter ve güdü tasarımı](YAZAR_KARAKTERI_VE_GUDU_TASARIMI.md). P3 bütünü tamamlanmış değildir.

## Çözülen boşluk

İşlem sonucu aynı koşudaki yürütücüye dönüyordu; bir sonraki normal karar bunu sınırlı bir
liste olarak görmüyordu. `actionFeedback`, veritabanına yazılmış kendi geçmiş işlem sonuçlarını
algıya taşır. Ajanın başarı özeti kaynak olarak kullanılmaz. Yeni model çağrısı veya migration yok.

İlk kanal **EXECUTION**: `SUCCEEDED`, `REJECTED`, `FAILED`, `SKIPPED` teknik sonuçları.
Hepsinin semantik değerlendirmesi **NOT_EVALUATED**. İşlemin çalışması, içerik kalitesi veya
amaç tamamlama demek değildir. Oy/follow tekrarı yeni kredi yaratmaz; bu dilim hiç puan yazmaz.
`NO_ACTION`, az oy, kısa katkı ve boş bkz cezalandırılmaz.

## Sabit sözleşme

- **Politika v1:** ilk model denemesinden önce pencere yedi gün, en fazla beş kart.
  `updatedAt > now−7 gün` ve `updatedAt ≤ now`; tam TTL sınırında kart düşer.
- Yalnız kendi profilinin önceki `NORMAL_WAKE` koşuları. Koşu terminal ve `finishedAt ≤ now`
  olmalı; mevcut koşu, devam eden koşu ve yabancı profil dışarıda. Sonuçlar
  `updatedAt DESC, id DESC` ile kararlı sıralanır.
- Kart: `ACTION_RESULT:<actionId>` olay anahtarı, action/run kimliği, kanal/politika sürümü,
  eylem türü, teknik durum, izinli güvenli neden, `recordedAt`, `expiresAt`, `observedAt`.
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

160 KiB perception bütçesi içinde kartlar da kırpılabilir. Algı allowlist’i ve normal karar
talimatı güncellendi. Profil **v48**,
`cd2b4f8b24bfeade3d8a7d1d1aaee4add596dab7b06f741317a06aa9834f65e4`;
v47 kapasitesi yeni sürümde taze sayılamaz. Persona renderer’ı P2 ile aynı kalır.
Geri alma önceki runtime/app sürümüne dönüşle kartı algıdan çıkarır; geçmiş action kayıtları silinmez.

## Doğrulama durumu

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
