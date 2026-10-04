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

## İlk doğrulama

İlk 26, son 45 test PASS: gerçek PG16 değişen payload/tarih/ayar/profil/persona/kadro,
aynı makbuzla iki yarışan istek, başka admin/süre, HTTP preview/submit replay ve taze
yetki; sekiz imza/süre birim, dört hash ve 15 admin UX testi dahil. Ayrı iki mevcut
PG16 profili kilitleme/iptal yarışı da geçti. Sonraki hakemlik ve exact kapanış aşağıdadır.
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

## Exact kapanış

Final `113f3aa8ab3d29be130f448988597520032c1ac7`, CI `37184176713` **7/7 PASS**;
#309 main `cbb8aaf8c3d602a5a4dfe422efe17291b1057a96`. Birleşmeden hemen önce exact
head/base, review durumu ve CLEAN doğrulandı; uzak SHA/ağaç eşitliği geçti, dal silindi.
Son 50 test/kalite kapıları PASS; 100 hedefin son tekrarında 193 ms preview / 548 ms
queue ölçüldü. E2E final exact CI'da da geçti. Üretim dağıtımı henüz yapılmadı.

## Profil çalışma ayarlarının kayıp güncelleme koruması — 4 Ekim

O5'in profil-only CAS notu kaynakta doğrulandı: iki açık form aynı persona sürümündeyken
ilk kaydın çalışma ayarını ikinci form sessizce geri yazabiliyordu. Profil kilidi işlemleri
sıralıyor, fakat ilk okunan ayar durumunu karşılaştırmıyordu. Persona sürümünü sırf ayar
kaydetmek için artırmak karakter evrimi değildir; bu yola gidilmedi.

Yönetici detay yanıtı `profileStateHash` taşır. Hash sürümü 1; profil ID'si ve mevcut audit
snapshot'ındaki kimlik/persona sürümü, lifecycle ve beş çalışma ayarı kanonik SHA-256 ile
bağlanır. Runtime sayaçları dahil değildir. Bu yetki/önizleme imzası veya monoton sürüm
numarası değildir; mevcut değerlerin eşitliği önkoşuludur. A→B→A geçmişini ayrı bir sürüm
olarak ayırt ettiği iddia edilmez.

`activeTimeProfile`, `personaEvolutionEnabled`, `sourceEvolutionEnabled`,
`scheduledTimeoutSeconds` veya `manualTimeoutSeconds` yazan PATCH ve doğrudan servis
çağrısında `expectedProfileStateHash` zorunludur. Mevcut taze admin ve profile → settings
kilitleri altında karşılaştırılır; değişmiş durum **AGENT_PROFILE_STATE_CONFLICT / 409**,
eksik/bozuk zorunlu hash **422** verir. Hash tek başına düzenleme sayılmaz ve audit'in
changedFields listesine yazılmaz. Yalnız persona yazan mevcut operasyon betikleri kendi
`expectedPersonaVersion` kontrolünü kullanmayı sürdürür. Migration yok.

Açık tarayıcı formu persona, persona sürümü, çalışma ayarları ve durum hash'ini aynı ilk
okumaya sabitler. Yeni sunucu prop'ları kullanıcının eski taslağını yeni duruma onay vermiş
saymaz. Başka yazar sayfasında form yeniden kurulur. Eski HTTP istemcileri çalışma ayarı
PATCH'inden önce detay GET'indeki hash'i almalıdır; eski payload 422 ile durur. Bu API
uyumluluk notu dağıtımda korunur; acil pause/iptal/durdurma yollarına yeni kapı eklenmedi.

İlk yerel regresyon **30 birim/arayüz ve 52 PostgreSQL testi PASS**: aynı eski durumdan iki
gerçek yarışan ayar güncellemesinin yalnız biri kabul edildi, bayat form kazananın ayarını
ve audit sayısını değiştirmedi, taze tekrar geçti, ayar değişikliği persona sürümü üretmedi.
Rerender edilen arayüz aynı eski hash/sürümü gönderdi ve kullanıcının 720 saniyelik taslağını
korudu. Toplu koşu önizlemesinin profil değişikliğini reddetmesi de mevcut PG testinde sürdü.
Kod hakemi/exact CI ve canlı dağıtım henüz bu alt paket için tamamlanmış sayılmaz.

API/OpenAPI koşulları eşitlendi: beş alanın her biri profil hash'ini gerektirir; yalnız
karşılaştırma token'ı içeren nesne düzenleme sayılmaz. Yeni 409 kodu ErrorCode listesine
alındı. Güncellenen sözleşme denetçisi ve olumsuz sapma testleriyle son birim/arayüz/sözleşme
koşusu **47/47**; OpenAPI **152 işlem** hizalamasında PASS. Doğrudan servis çağrısındaki
yalnız-token koruması eklendikten sonra 52 PG16 testi yeniden geçti (09:34 UTC).

## Profil ayarı Opus incelemesi — 4 Ekim 09:45 UTC

Gerçek `claude-opus-5`, exact `14883538c48f8b132bc0ff003a3dfa8665892d18` için
salt okunur **KOŞULLU GO** verdi. Hakem yalnız iletilen diff/blokları gördü; testleri
kendisi çalıştırmadı. Koşullar aşağıdaki kaynak kanıtıyla değerlendirildi:

- **Başarılı kayıt sonrası eski token:** form mevcut `router.push` ile düzenleme
  sayfasından `/moderasyon/agentlar/{id}` detayına gider ve refresh eder. Aynı formda
  ardışık kayıt varsayımı olağan başarılı akışa uymuyor. Profil ayarı UI testi bu iki
  çağrıyı artık doğrudan doğrular; taslak açıkken dış prop yenilenmesinde token
  dondurma korunur. Bu jsdom sözleşme testidir, gerçek tarayıcı iddiası değildir.
- **Hash kapsamı:** beş ayarı yazma koşulu, yalnız beş alanın hash'i demek değildir.
  Mevcut audit snapshot'ındaki lifecycle/kimlik/persona bağlamı bilinçli olarak korunur.
  Araya giren evrim veya lifecycle değişimi 409 gerektirir; yönetici güncel bağlamı
  yeniden okur. Bu kullanılabilirlik maliyetidir; yanlış-pozitif oranı ölçüldü denmez.
  UI zaten okuduğu `expectedPersonaVersion` değerini gönderiyordu.
- **Çağrı sahipleri:** `updateAgent` doğrudan çağrıları repo genelinde tarandı.
  `reconcile-public-agent-bios.ts`, `apply-writer-naturalization-w1.ts`,
  `reconcile-persona-weight-locks.ts`, `rollout-persona-prompts.ts`,
  `apply-writer-naturalization-w2.ts`, `reconcile-persona-sources.ts` yalnız kimlik/
  persona ve mevcut sürüm token'ını yazar; beş çalışma ayarını yazmaz. Admin PATCH
  tek HTTP rotası; UI hash'i taşır. Genel `operator-admin.ts` rota istemcisi
  gövdeyi operatörden alır; önce GET hash'i alınarak PATCH gövdesine konur, sabit eski
  çalışma ayarı payload'ı yoktur. Test fixture'ı güncellendi. `docs/API.md`,
  `docs/openapi.yaml` ve OpenAPI validator yeni zorunluluğu içerir. Repo dışındaki
  eski istemcilerin 422 alacağı açık uyumluluk sınırıdır, dış envanter iddiası yok.
- **Arayüz metni:** “ayrı kaydedilir” yerine yalnız çalışma ayarı değişikliğinin
  persona sürümü oluşturmadığı açıklandı; istek hâlâ tek atomik PATCH'tir.
- **Kanoniklik:** `canonicalRequestHash`, iç içe nesneleri özyinelemeli anahtar
  sıralamasından sonra hash'ler; JSON anahtar geliş sırası token'ı değiştirmez.
  Mevcut ortak yardımcı değiştirilmedi. Davranışı gelecekte değişirse açık form
  tokenlarının geçersizleşmesi uyumluluk incelemesi gerektirir.
- **Token-only doğrulama kilitleri:** hakemin engelleyici olmayan erken-doğrulama
  önerisi yeni bir güvenlik açığı değildir. Yetkisiz çağrı önce reddedilir; mevcut
  kilit sırası korunur, geçersiz çağrıda transaction rollback olur. Genel ayar
  seri işlemini yeniden tasarlamak bu dar düzeltmenin şartı yapılmadı.

Kaynakla kapatılan koşullar yeni bir koşulsuz hakem turu olarak adlandırılmaz.
Son exact CI ve birleşme sonucu ayrıca kaydedilecektir; üretim dağıtımı açık.
