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
  ve istem profil hash'ini kapsar. Gösterilen kullanıcı/görünen ad da özete bağlıdır. Date alanları ISO metni olarak karşılaştırılır.
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

## Bağımsız Opus incelemesi

İki araçsız çağrıda gerçek `claude-opus-5` kullanıldı; SHA
`05b110bbdedb692deafe40fc069d0aa1b38ac695`. İlk çağrı 274 saniyede yalnız inceleme
niyeti döndürdü; rapor/GO sayılmadı. İkinci dar paket (araçlar ve MCP kapalı),
210 saniyede **KOŞULLU GO** verdi. Hakem test çalıştırmadı, üretime bağlanmadı.

- **P2-1 kaynakla çürütüldü:** `auth/repository/users.ts:85` → `lockUserStates`
  shared kip / `pg_advisory_xact_lock_shared` kullanıyor. İptal de shared alır;
  bunlar birbirini engellemez. Yeni gerçek PG16 testinde önizleme transaction'ı
  bekletilirken aynı admin iptali tamamlandı. Yetki kilidi kaldırılmadı; askıya alma
  gibi exclusive geçişlerin taze yetkiyle seri olması korunur.
- **P2-2 ölçüm alternatifi tamam:** yerel PG16, 100 hedef, 100 credential'ın bulunduğu
  managed sync, değişmeyen 15 saniyelik uygulama transaction tavanı. İlk başarılı
  ölçüm önizleme **227 ms**, kuyruk **621 ms**. 100 run oluşturuldu, 101. hedef
  reddedildi. Fixture hazırlığı ölçümün dışında; bu canlı veri büyüklüğünde performans
  veya gerçek model çalışması kanıtı değildir. Tavan yükseltilmedi/batch şartı doğmadı.
- **Tekil/toplu kapı karşılaştırması:** `createManualAgentRun` da taze admin,
  profile → settings kilidi, ACTIVE/current persona ve credential hazırlığı ister;
  non-publishing izinleri ve tür bazlı timeout aynı. Kuyruğa alma, worker'ın sonraki
  global pause/degraded/yayın/aksiyon kapılarını atlamaz. Bu alt paket onları değiştirmedi.
- İlk exact CI `37183082219` **7/7 PASS**; gerçek tarayıcı M2-E2E-013 artık formdan
  hedef/persona/geri alma özetini okuyup onayla iş oluşturuyor. Hakem sonrası exact CI
  ayrıca kaydedilecektir.
- **P3-2/3/4:** TTL saati transaction/admin kilidinden önce başlatıldı; görünen kimlik
  alanları da özete eklendi; boş önizleme daha onay gösterilmeden reddedilir.
- **P3-1:** bütün hedefler tek transaction'da yazılır; digest aynı kümeyi sabitler.
  İlk hedef anahtarı bu atomik tüketimin makbuzudur, unique anahtarlar ikinci savunmadır.
  Uygulama yolunda “yalnız sonraki hedef yazılmış” durumu üretilemez; keyfi DB yazısı
  güven sınırının dışındadır. İdempotency başlığı olmayan HTTP tekrar ayrıca sınanır.
- **P3-5 kaynakla kapandı:** Prisma `AgentRun.trigger` enum değil `String @db.VarChar(64)`;
  hakemin “Prisma enum tipini kullan” önerisinin kaynak varsayımı geçerli değil. Yeni
  serbest runtime alanı açılmadı; mevcut admin sabitleri kullanılıyor.
- **P3-6 dağıtım notu:** Date dönüşümü bütün `canonicalRequestHash` çağrılarını etkiler.
  Aktif HTTP yolları tekil `/admin/agents/{agentId}/runs`, toplu `/admin/agent-runs/bulk`
  ve preview içindeki `availableAt` alanıdır. `agent-schedule/regenerate.localDate`
  şeması da Date üretir fakat rota emekli planlama hatası döndürür. İç bakım `now: z.date()`
  alanı iç bakım şemasıdır. Eski tarihli idempotency kaydında 24 **saat** boyunca conflict
  mümkün; eski istek yeniden çalıştırılmaz. Bu geçiş notu dağıtımda korunur.

Koşullu görüş, kaynak doğrulaması ve ek testlerle kapatılır; koşulsuz KOD GO olarak
adlandırılmaz. Yerel/test/CI kanıtı canlı kabul yerine geçmez.

Son sınır düzeltmeleriyle **50/50** test geçti; ilk admin kilidinde beklerken süre
dolması ve idempotency başlığı olmayan HTTP tekrar reddi de doğrudan doğrulandı.
