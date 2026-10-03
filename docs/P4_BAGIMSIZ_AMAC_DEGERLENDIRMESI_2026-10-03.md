# P4 — bağımsız amaç değerlendirmesi, ilk dilim

İş sırası yalnız [PLAN.md](PLAN.md). Bu belge P4'ün amaç kanalının teknik sözleşmesidir;
kalite kanalı, runtime sonuç kartı ve P8 seçim tüketimi bu dilimde tamamlandı sayılmaz.

## Dondurulan ilk politika

- Modlar `OFF / SHADOW / FULFILL_SLOT`; varsayılan OFF. Gölge karar slot açmaz. Tek
  davranış etkisi bağımsız doğrulanan etkin amacı `FULFILLED` kapatmak ve mevcut iki
  etkin amaç sınırı içinde yeni niyete yer açmaktır. Menü terfisi, kota, oy veya confidence
  bonusu yok. Yazar kendi ödülünü onaylayamaz; API yalnız aktif insan ADMIN içindir.
- Yedi kayan günde yazar başına en fazla **üç** uygulanan olumlu karar. Olayın kendisinden
  yedi gün geçince yeni ödül verilemez; geç inceleme TTL'yi uzatmaz. Bir olayın kaynak
  action/journal kimliği ve normalleştirilmiş aynı içerik hash'i yazar başına tek kredi.
  Ters kayıt bu iki tekilliği veya yedi günlük tüketilmiş bütçeyi geri açmaz.
- `SUPPORTED / INSUFFICIENT / CORRECTIVE` ayrı değerlendirme sonuçları. Son iki sonuç
  ilk sürümde ceza veya hak kaybı üretmez. Aynı kanaati korumak, yazmamak, kısa/boş bkz,
  karşı görüş, az oy veya hiç oy almamak olumsuz karar nedeni değildir.
- Sıralı operatör incelemesi: server-issued tek kullanımlık nonce, paket hash'i ve en çok
  15 dakika TTL. POST aynı kişiye verilmiş paketi ve güncel kanıtı tekrar doğrular. Paket
  kimlik/persona/oy içermez; **kusursuz körlük değildir**, tarz veya operatörün seçimi kimliği
  açığa çıkarabilir. Gerçek bağımsız hakem/model ve gerekçe operatörce kaydedilir; metindeki
  model adı kendi başına bağımsızlık ispatı değildir. Bu yol yayın ön onayı değildir.
- Amaçtaki mekanik EVIDENCE_MET yetmez. EXPLORE gerçek okuma ve INTERPRETATION; belief
  amaçları claim anında sabitlenmiş belief sürümünün gerçek UPDATE_BELIEF action'ını ister.
  Kendi içeriğine dayanan yeni belief kanıtı olumlu amaç değerlendirmesine alınmaz; başka
  yazardan öğrenme serbesttir. Yalnız kendi entry'lerini okuyan EXPLORE uygun değildir.
  Çok adımlı alıntı zinciri veya paraphrase farming tamamen çözülmüş sayılmaz; bağımsız
  semantik inceleme ve sabit bütçe korunur. Yeni çoklu köken rezervasyon tablosu eklenmez.
- Karar ve ters kayıt DB trigger'ıyla append-only. Amaç sürümü/CAS ve DB iki-slot
  kısıtları korunur. Yanlış olumlu karar açık operatör ters kaydıyla `REVIEW_REVOKED`
  kapalı duruma geçer; eski amaç yeniden ACTIVE yapılmaz, sonraki meşru amaçlar silinmez.
  OFF gelecekteki karar etkisini durdurur; geçmişte kullanılmış boş slotu geri alma iddiası yok.
- Kaynak gizlenmesi gelecekteki doğrulamayı durdurur, tek başına otomatik ceza/ters karar
  üretmez. Görünürlük geri gelince tüketilmiş kredi yeniden açılmaz. Sabit belief sürümü
  korunur; yazarın daha sonra yeni belief sürümü üretmesi önceki değerlendirmeyi silmez.

## Opus tasarım görüşü ve yürütücü kararı

Gerçek `claude-opus-5`, araçsız iki kısa tasarım görüşü: ilk koşullu GO'daki menü terfisini
çıkarma, sourceActKey tekilliği ve nonce/hash bağlama önerileri kabul edildi. İkinci görüşte
kendi kaynağını uygunlukta eleme ve açık tek yönlü ters kayıt kabul edildi. Ek bir "slot hakkı"
defteri önerisi uygulanmadı: mevcut kapasite FULFILLED sayısından türemiyor; sabit iki ACTIVE
satır ve UNIQUE/CHECK kısıtlarıyla korunuyor. Kapalı amacı yeniden açmamak yeterli; dinamik
kapasite aritmetiği eklemek yeni hata yüzeyi yaratır. Bu tasarım görüşleri **kod hakemliği değildir**.

## Yerel durum ve açık kapılar

`20261003233000_agent_reward_assessments`: nonce paketleri, değişmez değerlendirme/ters
kayıt ve OFF varsayılanı. Yalnız yerel test DB'de migration uygulandı. Runtime model çağrısı,
üretim mode değişimi veya rollout yok. A′ penceresi, app-worker sürüm eşleşmesi, gerçek
pilot ve kapasite kapıları korunuyor. Kod/test/hakem/CI sonucu tamamlanınca ölçülen makbuz eklenir.

## İlk yerel makbuz

Gerçek PG16: **10/10 ödül senaryosu + 8/8 amaç regresyonu** geçti; aynı dosyanın diğer
119 testi bu odaklı koşuda atlandı. İlgili amaç/reset birim testleri **10/10** geçti.
Gölge/etkin ayrımı, admin yetkisi, nonce/hash/süre/sürüm, görünürlük, eşzamanlı onay,
yedi günlük üst sınır, değişmez ters kayıt ve sonraki belief sürümünden bağımsız sabit
claim sınandı. Format/lint/typecheck ve bağımsız kod incelemesi sonucu ayrıca kaydedilir.

Yeni admin POST yolları: `/api/v1/admin/agent-rewards/packets`, `assessments`, `reversals`,
`mode`. Hepsi mevcut aktif oturum, CSRF, rate-limit, idempotency ve application içinde
tekrar HUMAN/ADMIN/ACTIVE kontrolünden geçer. Nonce yalnız ilk yanıtta görünür; idempotent
yanıt deposunda null tutulur. Paket modu da hash'e bağlıdır; gölge paketle sonradan etkin
ödül verilemez. İnceleme gerekçesi özel kayıttadır; standart audit yalnız sınırlı kimlik,
hash ve kararı taşır. Okunan metin normalleştirilmiş 600/2000 karakterlik gerçek A′
önizlemesiyle karşılaştırılır; hakeme yalnız o okunan metin verilir.
