# O5 — toplu koşu önizlemesi

Bu belge uygulama sözleşmesi ve kanıttır. Tek eylem sırası `PLAN.md` içindedir.

## Sorun ve kapsam

Toplu koşu formu, tarayıcıdaki seçim değişince önizlemeyi kaldırıyordu. Sunucudaki
ACTIVE kadro, persona/profil veya ayar değişikliğini önceki önizlemeye bağlayan kanıt
yoktu; API confirmation ile önizlemeden bağımsız yeni kadroyu kuyruğa alabiliyordu.
Bu alt paket yalnız toplu koşu oluşturmayı bağlar. Tekil koşu komutu ve global
iptal/durdurma gibi diğer toplu komutlar için yeni bağlama garantisi verilmez.

## Sözleşme

- HUMAN/ACTIVE/ADMIN, CSRF/origin, rate limit ve taze yetki kontrolü sürer.
- Önizleme, aynı aktöre HMAC ile bağlı 10 dakikalık makbuz üretir: rastgele UUID,
  yayın zamanı ve SHA-256 durum özeti. Ham makbuz audit'e veya idempotency yanıt
  deposuna yazılmaz; preview replay taze okuma ve yeni makbuz üretir.
- Durum özeti seçim türünü, sıralı hedefleri, tüm normalize koşu alanlarını,
  persona sürüm ID'sini, profil updatedAt/manualTimeout değerini, settingsVersion
  ve istem profil hash'ini kapsar. Date alanları ISO metni olarak karşılaştırılır.
- İşlemde admin user-state → sıralı profil kilitleri → settings kilidi sırası korunur.
  Kilit altında kadro ve sürümler yeniden okunur; allActive ekleme/çıkarma da sapmadır.
  Aktivasyon yolları aynı settings kilidini kullanır. Bütün hedefler doğrulanmadan
  hiçbir run/audit/outbox yazılmaz. En çok 100 hedef; 101. kayıt taşmayı gösterir.
- Makbuzun süresi kilit bekleme süresi eklenerek tekrar kontrol edilir. Hedef değişmiş,
  süresi dolmuş, başka admine ait veya değiştirilmiş makbuz 409 verir. Boş iş oluşturulmaz.
- Her run mevcut unique idempotencyKey alanında preview UUID + hedef ID ile tüketilir.
  Aynı makbuz yeni request-id ile tekrar gönderilirse ikinci iş oluşmaz. API'de aynı
  idempotency-key başarılı yanıtı döndürür; yetki yeniden kontrol edilir. UI ağ hatasında
  aynı preview ve idempotency-key'i korur, sürüm hatasında yeniden önizlemeye döner.
- Panel hedef kullanıcı adlarını/persona sürümlerini, etkili işlem türü/izinleri,
  başlangıcı/önceliği, ayar sürümünü ve geri alma sınırını gösterir. Yayımlanan içerik
  otomatik geri alınmaz; bekleyen koşu iptali ve başlayan işin güvenli durdurulması ayrıdır.
- Migration eklenmedi. Genel request hash artık Date'i ISO'ya çevirir. Eski Date hash'li
  idempotency kaydı 24 saatlik TTL içinde conflict verebilir; eski kayıt yeniden yürütülmez.
  Date içermeyen isteklerin hash'i değişmez.

## Doğrulama

İlk 26, son 45 test PASS: gerçek PG16 değişen payload/tarih/ayar/profil/persona/kadro,
aynı makbuzla iki yarışan istek, başka admin/süre, HTTP preview/submit replay ve taze
yetki; sekiz imza/süre birim, dört hash ve 15 admin UX testi dahil. Ayrı iki mevcut
PG16 profili kilitleme/iptal yarışı da geçti. Hakem, son kalite ve exact CI henüz açık.
Üretim değişmedi; normal ajan davranışı bu admin önizlemesinden etkilenmez.
