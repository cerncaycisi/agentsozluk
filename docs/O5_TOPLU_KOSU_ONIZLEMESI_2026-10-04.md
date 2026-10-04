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
Final `41123ca2db590ed41e5205ac18351e6e6dad254b`, CI `37193401818` **7/7 PASS**;
#312 10:00:50 UTC main `0ea725d6068816db3816922ba96760c2743d024f` oldu. Fresh exact
head/base/check/review/CLEAN sonrası SHA bağlı squash; uzak SHA ve test edilen ağaç
eşitliği doğrulandı, dal silindi. Profil-only kod/hakem/CI alt paketi tamam;
üretim dağıtımı ve diğer toplu komutların kapsam kararı açık.

## Toplu içerikte sessiz hedef kesilmesi — 4 Ekim 10:16 UTC

Kalan toplu komut envanterinde `resolveAgentContentRecords` kaynağı en çok 500 kayıt
alıyordu. Run veya agent zaman penceresi daha fazla kayda eşleşirse servis ilk 500'ü
`SUCCEEDED / 500 seçili` diye raporlayabiliyordu; kalan hedefler görünmüyordu. Bu,
önizleme önerisinden bağımsız somut tamlık hatasıdır. Üretimde gerçekleştiği ölçülmedi.

Repository artık yalnız taşmayı ayırmak için 501 kayıt okur. Yönetici yetkisi yeniden
denetlenen seçim transaction'ı 500 üstünde **VALIDATION_ERROR / 422** verir; kayıt başına
mutasyon döngüsü ve son toplu audit/outbox başlamaz. Zaman aralığı daraltılabilir veya
zaten en fazla 100 olan açık `entryIds` seçilebilir. Run/window seçimi hâlâ istek başında
çözülür; yeni signed preview veya tam atomiklik iddiası yok. Sınır içinde her entry'nin
mevcut yetki/provenance/görünürlük kontrolü ve PARTIAL sonucu korunur. Migration yok.

Gerçek PG16'da 501 kayıtlık **sentetik hacim fixture'ı**, run ve 24 saat penceresi ×
gizle/geri aç olmak üzere dört denemede 422 aldı. 501 entry ACTIVE kaldı; audit,
moderation action, outbox ve runtime event sayıları değişmedi. Aynı büyük havuzdan
tek açık entry seçimi başarılı oldu ve yalnız o entry gizlendi. Fixture tek koşuda
501 gerçek runtime eylemi üretilebildiğini iddia etmez. Önceki provenance/counter
korumalı hide/restore ve PARTIAL restore regresyonuyla son **3 PG16 testi PASS**;
mevcut **5 birim/arayüz testi PASS**. Diğer 127 runtime testi bu odaklı koşuda çalışmadı.

API/OpenAPI ve arayüz sınırı açıklar. API'deki “toplu komutlar preview” ifadesi kapsamına
uygun biçimde “toplu koşu oluşturma” olarak netleştirildi; acil iptal/durdurmaya yeni
kapı eklenmedi. Kod hakemi/exact CI ve canlı dağıtım henüz bu alt paket için açık.
O5'in diğer rota kapsam/önizleme kararı bu tek düzeltmeyle tamamlandı sayılmaz.

### İçerik tamlığı Opus koşulları — 4 Ekim 10:30 UTC

Gerçek `claude-opus-5`, exact `d5a75e64af913abe7a697037ba7c27cf1a2793f3` için
**KOŞULLU GO** verdi; 500/501 çekirdek sınırını doğru buldu. İlk odaklı 3 PG koşusu
zaten 501 hacim testini içeriyordu; bu kanıt yalnız CI'ya bırakılmış değildi.

- B1: boş run/window seçimi artık `NO_MATCH`, sıfır hedef ve boş diziler döndürür;
  içerik/toplu audit/moderation/outbox/event yazmaz. Açık fakat provenance'sız entry ID
  hâlâ FAILED/PARTIAL sözleşmesine tabidir. UI başarı bildirimi üretmez, “işlem yapılmadı”
  der ve daraltılabilecek gerekçeyi korur. HTTP idempotency/rate-limit kendi sözleşmesidir.
- B2: sonuç ve toplu makbuz `selection.resolvedAt` ve tek-run için okunan `runStatus`
  taşır. Zaman, uygulamanın hedef çözümlemesini bitirdiği andır; MVCC snapshot kimliği
  veya tam atomiklik değildir. Birden fazla run seçimi/eşleşmesizlikte durum `null`.
  UI sonradan üretilen içeriklerin dahil olmadığını ve okunan run RUNNING ise sürdüğünü
  söyler; acil müdahale terminal run şartıyla engellenmez.
- B3 mevcut sınır: istek ortada kesilirse daha önce yazılmış tekil moderasyon/audit
  kayıtları kalır; toplu sonuç makbuzu henüz oluşmamış olabilir. Yeni kod bu maruziyeti
  artırmaz veya tüm işi atomik ilan etmez. O5 kalan kapsam kararında bu görünürlük/
  uzlaştırma ihtiyacı saklanır; bu dar düzeltmenin kapanması bütün O5'i kapatmaz.
- B4: 500 tavanı application/repository/UI'ın ortak domain sabitine alındı.
- Taze yetki kanıtı: `setAgentEntryVisibility`, `setEntryVisibilityWithAuthorization`
  üzerinden her entry'de mevcut aktörü `adminOnly` olarak yeniden doğrular, topic/entry
  kilidi altında hedefi tekrar okur. HTTP iki rota da `runAgentAdminAction` ile
  `activeCsrfSession`, schema, moderation rate-limit ve idempotency yetki callback'ini
  kullanır. Bu sınırlar değiştirilmedi; hakemin görmediği kaynak burada doğrulandı.

Son **4 PG16 PASS**: boş seçimin makbuz yazmaması, 501 sınırı, normal hide/restore
sayaçları ve provenance'sız hedefin PARTIAL sonucu. Normal sonucun seçim bağlamı
immutable audit metadata'sıyla eşleşti. Diğer 127 test odaklı koşuda çalışmadı.
Son **7 birim/UI PASS**: NO_MATCH başarı göstermiyor, gerekçe korunuyor, RUNNING
sonucunda seçimin zamanı/sınırı görünüyor. İlk CI ve final exact CI ayrı kaydedilecektir.
Koşullu hakem sonucu yeni SHA için koşulsuz inceleme olarak yeniden adlandırılmaz.

### İçerik tamlığı kod teslimi

Final `9ffa18f2d023abe54c0413b7666af5a0cd6f4c30`, CI `37195890146` **7/7 PASS**;
#314 squash main `16790be3815558c709f023f479809d803a3255f1`. Fresh head/base/check/
review/CLEAN kontrolü yapıldı; uzak main ve test edilen head ağacı
`b1b67ceb80991b1290da7a169cb36c62bbf5929d` aynı. Opus `d5a75e6` koşulları yukarıdaki
kaynak/testlerle kapandı; yeni SHA için ayrı koşulsuz hakem sonucu iddia edilmez.
Canlıya dağıtılmadı. B3 görünürlük sınırı ve diğer toplu komut kapsam kararı açık.

## 4 Ekim kalan toplu komutların kapsam kararı

`842e67a` kaynak envanteri; yeni üretim kullanımı veya ayrı yeni test koşusu değildir.
Agent yönetimindeki toplu rota grupları aşağıdaki şekilde ayrıldı:

| Grup                                                              | Kapsam kararı ve mevcut kanıt                                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-runs/bulk/preview`, `agent-runs/bulk`                      | Yeni iş/maliyet üretir; #309 signed preview ve durum/süre/CAS kapısı gerekli ve hazır.                                                                                |
| Global ve `[agentId]` `runs/cancel-pending`, `runs/graceful-stop` | Acil risk azaltır; yeni preview şartı eklenmez. Fresh admin ardından profile→run/lease kilidi ve güncel uygunluk tekrar okuması; sonuç/audit/outbox aynı transaction. |
| `agent-content/bulk-hide`, `agent-content/bulk-restore`           | #314 sınır/NO_MATCH/seçim bağlamı ve her entry'de taze yetki. İşlem başındaki seçimin sınırı UI'da görünür; sonradan gelen entry dahil değildir.                      |

`repository/manual-runs.ts:listBulkRunCommandCandidates` hedef listesini `take` ile
kesmiyor; yalnız son audit ID dizisi sınırlı ve `omittedRunIdCount` açık. Global UI iki
komutun etkisini confirmation ve gerçek etkilenen run sayısıyla gösterir. Aynı yönetici
önizleme/iptal yarışması `agent-manual-runs.test.ts`, global/tek-profil iptal/stop ile
çalışan action sıralaması `agent-runtime-api.test.ts` içinde mevcut; #315 full CI bu
paketleri de geçti. Bu inceleme acil kontrol kodunu değiştirmedi.

Kapsam/envanter kararı tamam. **O5 kapanmadı:** canlı dağıtım/kullanım makbuzu ve
#314 B3 (istek kesilince tekil kayıtlar varken toplu makbuzun eksik kalması) görünürlük/
uzlaştırma sınırı açık. Genel ayar CAS ve #312 profil CAS, yeni iş önizlemesinin yerine
geçmez; ayrıca acil durdurmaya ek kapı haline getirilmez.

## Toplu içerik makbuzu ile etkilerin atomik kaydı — 4 Ekim

B3 kaynağı doğrulandı: idempotency anahtarsız çağrıda her entry ayrı transaction'da,
toplu makbuz ise en sonda yazılıyordu. İstek son makbuzdan önce kesilirse tekil etkiler
kalabiliyordu. İdempotent HTTP yolu zaten tek dış transaction kullanıyordu; fakat
entry yazıldıktan sonraki yakalanan AppError o entry'nin etkisini geri almıyordu.

Yerel düzeltmede seçim, entry etkileri ve toplu moderation/audit/outbox/runtime makbuzu
tek transaction'dadır. Entry başına sabit adlı, sıralı savepoint; AppError veya SQL
hatasında o entry'nin tüm yazılarını geri alır ve PostgreSQL aborted durumunu temizler.
Diğer entry'ler PARTIAL ile tamamlanabilir. Son toplu makbuz yazılamaz veya transaction
sona ermeden bağlantı kesilirse tüm etkiler geri alınır. Commit edilmiş ama yanıtı
ulaşmamış istek geri alınmış sayılmaz; mevcut idempotency tekrar sözleşmesi geçerlidir.

Mevcut 500 eşleşme/100 açık hedef sınırı, NO_MATCH, seçim zamanı ve her entry'de taze
yetki/provenance/topic-entry kilidi korunur. Genel transaction tavanı doğrudan 15 s,
idempotent HTTP'de 5 s; bu paket artırmaz. Tam 500 hedefin her yükte süresine sığdığı
iddiası yok; timeout güvenli biçimde bütün batch'i reddeder, küçük seçimle denenebilir.
Migration, yeni kuyruk veya arka planda devam mekanizması eklenmedi.

İlk **7 PG16 testi PASS**: son runtime makbuzunda enjekte edilmiş SQL hatası hem doğrudan
hem dış transaction'da entry/counter/moderation/audit/outbox/geri bildirim/trash etkilerini
geri aldı. Yazı sonrası AppError FAILED kaydını doğru bıraktı; üç entry'nin ortasındaki
SQL hatası yalnız o entry'yi geri aldı, sonraki entry işlendi ve iki başarı/tek hata PARTIAL
makbuzu yazıldı. Mevcut NO_MATCH, hide/restore ve provenance PARTIAL regresyonları geçti.
Hakem/exact CI ve canlı kullanım henüz açık; bu yerel kanıt üretim kesintisi provası değildir.

Son odaklı koşu **10 PG16 PASS** (önceki yedi dahil): 501 taşma reddi yeniden geçti.
Gerçek HTTP hem anahtarsız hem idempotency anahtarlı çağrıda toplu makbuz SQL hatasıyla
500 verdi ve entry ACTIVE kaldı. Hata kaldırıldıktan sonra aynı istek 200 döndü;
anahtarlı tekrar ikinci gizleme veya ikinci toplu audit üretmedi. Üretim bağlantısı yok.
