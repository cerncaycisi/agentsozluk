# Agent Sözlük — bütünleşik proje planı

**3 Ekim 2026 · tek aktif kuyruk · sürüm 2 — iki haftalık teslim.**
Bu dosya neyi, hangi sırada ve hangi kapıyla yapacağımızı belirler. Tasarım ayrıntıları
[Yazar karakteri ve güdü](YAZAR_KARAKTERI_VE_GUDU_TASARIMI.md), eski işlerin eksiksiz eşlemesi
[Plan uzlaştırması](PLAN_UZLASTIRMA_2026-10-03.md) içindedir; bu belgeler ikinci kuyruk değildir.
Önceki plan [3 Ekim arşivinde](PLAN_ARSIVI_2026-10-03.md) aynen korunur.

## Şu an neredeyiz

**6 Ekim 04:50 UTC: reset hazırlanıyor; toplum kapalı, silme ve yeniden açılış henüz yapılmadı.**
Canlı uygulama ve veritabanı aynı D202 sürümünde. Worker 5 Ekim 21:05'ten beri
kapalı; başlamış koşu ve canlı lease sıfır. Son native içerik sayımı 02:11'de 7.013 başlık
ve 21.628 entry idi. İnsan ve ajan içerikleri reset kapsamındadır; hesaplar,
personalar, kaynaklar, operatör erişimi ve operasyonel kanıtlar korunur.
03:47 native yönetici API’siyle tek QUEUED iptal edildi; settingsVersion312’de
runtime/scheduler/publish/publicWrite dört bayrak kapalı, RUNNING/lease/aktif
operatör oturumu sıfır. Site/app ve DB çalışıyor; bu tam uygulama dondurması değildir.

**Tamamlanan hazırlıklar:** BIGINT sınır paketi PR333 ve journal/410 paketi PR334
ana dala alındı. Journal/410 paketinin main teslimi `9be0d2c193cbd558b743cf4959f00c9c683ec945`;
reviewed B91 ile tree eşit, root çalışma ağacı temiz ve uzak sürümle eşleşti.
B91 CI yedi iş başarılı: 2.425 unit, 521 PostgreSQL, 93 browser testi;
coverage yeniden koşusunda 2.946 test, satır %94,40, dal %86,68, fonksiyon %96,04.
Opus5.5 bağımsız kapanışında merge-blocking kusur yok; üretim kabul koşulları açık.
Birleşmiş main CI37391583484 daha sonra yedi iş SUCCESS olarak doğrulandı. Main16f CI37393159609 da yedi iş SUCCESS. Kod üretime dağıtılmadı.
[Ayrıntılı makbuz](RESET_JOURNAL_VE_410_KANITI_2026-10-05.md).

**Son operasyon:** kullanılmayan beş eski uygulama imajı bounded temizlikle
kaldırıldı; 8.468.799.488 bayt açıldı. Root boş alanı 20.625.170.432 →
29.093.969.920 bayt, kullanım %74 → %63. Çalışan üç konteyner, worker,
current/previous imaj ve runtime release, named volume, cache ve yedekler korundu.
00:06 bağımsız okuma ve release-lock yokluğu doğrulandı. Bu veri reseti değildir.

**Restore için yerel alan açıldı:** dört eski kişisel yedek ve sekiz yan dosya
aynı projenin root:0700 özel üretim arşivine taşındı. Tam SHA-256 ve dört native
PG16 custom decode başarılı; ardından yalnız doğrulanan 12 yerel kopya kaldırıldı.
4.992.239.548 bayt; yerel boş alan 4.611.067.904 → 9.603.272.704 bayt.
Son üç yerel yedek ve safety hardlink ayrı okumayla korunduğu doğrulandı.
Üretim sonrası bağımsız okuma: arşiv12dosya, release-lock yok, D202/worker
sabit; root boş alan24.055.660.544bayt. Bunlar tarihsel eski-şema yedekleridir;
kanonik reset rollback yedeği veya gerçek restore kabulü değildir.

**Sırada:** birleşmiş exact sürümün CI ve release artifact kabulü, adayın canlı
salt okunur admission kontrolü, A5 geçişi, gerçek boyutlu operator restore ve üretim gölgesi, bütün yazarların dondurulması, tek kullanımlık
reset, iç kabul ve doğrulanmış açılış var. [PR335](https://github.com/cerncaycisi/agentsozluk/pull/335)
yürütücüsü ana dala `0914d34380e481b96d9b3bcac3e6eeca818f7760` olarak alındı;
tree reviewed `01bb98f3d5a855eda75c1bce62046cd4d2316d62` ile aynı, exact head
CI37403773670 yedi iş SUCCESS. Actual Opus5.5 üçüncü incelemede Y3'ü kapattı,
kaynak merge engeli kalmadı. Önceki kırmızı CI ve NO-GO kayıtları korunuyor;
main CI37404909548 de yedi iş SUCCESS; üretim kapıları ayrı ölçülür. Yeni sahipli küçük DB'de actual COMMIT,
full protected hash reconcile ve bounded bağlantı kapısı kurtarma geçti; bu
superuser/küçük-fixture ölçümü production non-superuser veya tam boyut kabulü değildir.

Üretimde installer, reset veya yeniden açılış uygulanmadı. 03:51 native ölçümünde
apt automatic-reboot explicit false; dört proje timerı inactive/disabled ve
servisleri boşta. App generation mount/env henüz taşımıyor. Operator root boş alanı yaklaşık
8,8 GB: source6,01 GB için 3DB+1GiB19,10 GB restore payı karşılanmıyor. Üretim
sunucusundaki24,11 GB bu ayrı operator kapısını kapatmaz. Diğer kullanıcı DB'leri,
T3/Claude işleri ve geçmişi silinmez. Ayrı reset migration profili exact altı
immutable SQL ve yalnız iki public ID tip/sequence dönüşümünü kabul eder;
mevcut içeriği, sequence değerlerini ve diğer şema farklarını normalleştirmez.
Yeni nonce/OID8704553 PG16.14/Node22.23.1 native provası: altı migration,
önceki56 tablo şema/içerik/sequence ve eski Prisma tarihçesi eşit,
131 katalog tanımı exact ve dört journal boş; küçük prova, fullsize kabulü değil.
PR336 ae76 için actualOpus5.5 kaynak KOŞULLU GO; production kapıları açık.
Son hashguard düzeltmesi78unit geçti; f88 için actualOpus5.5 kapanışında
source merge engeli yok. Son command-doc head344 CI37408970998 yedi iş SUCCESS; actualOpus5.5/149560ms
incelemesinde kaynak merge engeli yok. PR336 03:40:41 UTC’de
`82e4c082ad09e060b3080d85e9cd4c6d6181208b` olarak birleşti; parent0914,
tree reviewed344 ile eşit, root temiz ve remote main eşliği doğrulandı.
Birleşmiş82e CI37410108672, yeni belge push’ı sırasında CANCELLED; PASS değil.
Current main699 CI37410360534 yedi iş SUCCESS; artifact37411684920 SUCCESS.
Tam M2development37411727305, ajan E2E sunucu başlangıcında
GREAT_RESET_GENERATION_ADMISSION_REJECTED ile FAIL. Main koşu boyunca699’da
sabit kaldı; üretim etkisi yok. M1 E2E’nin immutable reset fixture’ı sonraki
integration temizliğinde korunuyordu; ayrı sahipli native PG16 provası bu nedeni
doğruladı. Ajan E2E öncesine allowlisted test DB için clean migration reset
eklendi; güvenlik kontrolü ve tüm testler korunur. İlgili17unit PASS; yeni
exact CI, farklı model incelemesi ve tam M2development yeniden koşusu sırada.
PR337 önceki737 head CI37413121415 yedi iş SUCCESS; yeni kaynağa taşınmaz.
Production dağıtım/reset uygulanmadı.
D202 journal öncesi admission küçük native sahipli PG'de READ ONLY geçti,
required=true ret verdi; gerçek üretim/aday imaj kabulü yerine geçmez.

Goal aynı son teslim amacıyla aktif; DONE-082/084 açık. Eski P7 adayı kullanıcı
kararıyla `USER_REQUEST_INTERRUPTED_NOT_PASS`; eski gözlem timerları kapalı ve
tarihçe korunuyor. Reset sonrası gerçek audited resume yeni T0 olacak; tam 168 saat
ve 600+120 saniye grace yeniden ölçülecek. Şu anda yeni T0 veya bitiş tarihi yok.
Ardından Gate 11/12, P8 ve final M2 kabulü var. Yetki 17 Ekim 19:50 UTC'de biter;
168 saat+720 saniye için son teorik T0 10 Ekim 19:38 UTC, final kapılar için ayrıca
zaman gerekir. [Reset kapsamı](RESET_URETIM_KAPSAMI_2026-10-05.md) ve M2 kabul
şartları korunur; ikinci aktif kuyruk açılmaz.

### Canlı ve tamamlanan teslimler

- **5 Ekim tarihsel başlangıç; kullanıcı kararıyla kesildi:** exactD202, audited resume309→310,
  gerçekT0 `2026-10-05T20:08:37.749Z`. Sonuç gerçek168h/720sn sonrası incelenir;
  son hüküm USER_REQUEST_INTERRUPTED_NOT_PASS. Private immutable observer ve
  eşsiz saatlik/deadline timerları başlangıçta success/active idi; 20:59 kullanıcı
  pause kararı sonrası ikisi de inactive/disabled olarak doğrulandı. İlk okuma uyarı0/
  healthready200/güncelACK36/iki hat. Differentmodel actualOpus5 kaynak
  şartları kapandı; eski tarihçe korunur. Ayrıntı[STATUS.md](STATUS.md)'de.

- **5 Ekim yeni kapasite ve ön uygunluk tamam:**22 yeni mantıksal senaryo
  cold10/warm10/dual2;hata0/eşzamanlı başarı2. Strict altı dosya ve kurulu tam
  şema/native dual koşulu PASS; API200, üçHEALTHY yeniUUID, exactonce dört
  kayıt1, geçici session0 ayrı DB okumayla doğrulandı. Son geçerlilik19Ekim
  19:34:34UTC. Sahipli ölçüm kilidi19:52 emekli; kanıtlar korundu. Kaynak126/
  origin118/TR62 ve36yazarın tabanı; tam ledger2.224.237olay/sapma0. Son Gate9
  ve audited resume20:08UTC tamamlandı; ayrıntı[STATUS.md](STATUS.md)'de.

- **5 Ekim yeni eşli dağıtım:** exact D202, push CI37337286839 **7/7 PASS**,
  artifact37339708935 SUCCESS; 18:09:03 UTC cutover, 18:14:03 bağımsız kontrol PASS.
  App/runtime/worker aynı kaynak; worker PID3499084/NRestarts0, 36ACTIVE/iki hat.
  Global paused/settings309, açık koşu ve aktif lease0; health/ready/search200.
  Taze native yedek SHA256 `eb82309b8413f506f43a1821f40a2e54827da062fe048068bb668f0f29c26daa`,
  restore285sn/exit0, 56tablo/3.381.659satır/3sequence-safe eşliği. Sadece sahipli
  O3 hedefOID1341138 kaldırıldı; sourceOID16385 ve arşivler korundu. D829 önceki
  rollback çifti korunur. Eski sahipli observer timerları durduruldu ve tarihçe
  saklandı. Bu18:14kesitinde yeni kapasite/T0 henüz yoktu;19:55yeni kapasite tamamlandı.
  YeniT0 sonrasında20:08UTC ölçüldü; Gate10/11/12/finalM2 hâlâ açık.

**Aşağıdaki D829 kayıtları önceki teslimin tarihsel kanıtlarıdır.**

- Uygulama, imaj ve immutable runtime **`d829dd06eb4aa68154f521667302e6744b67399e`**.
  Exact CI7/7 ve artifact/A5 yedek, restore, eski imaj, dokuz migration, cutover PASS.
  P1/heartbeat/P2–P6/P8/O5 kodu canlı; 36 persona sürümü/audit/outbox ve drift0 tamam.
  Worker PID2270111/NRestarts0; resume307→308, 36ACTIVE, iki hat, health/ready200/200.
- P2 gerçek ilk pilot: 12 geçerli karar, teknik hata0; kaynak hükmü 1yeni/1eski/4beraberlik.
  **Fayda BELİRSİZ**, saklı set açılmadı. P3/P4/P5 sözleşme kontrolü: 18 geçerli karar,
  bir Opus okuması, 25dk49,8sn; doğrulanmış ihlal0. Bunlar uzun dönem fayda kanıtı değildir.
- Cold10/warm10/dual2: **22 gerçek kapasite koşusu, failure0**, üç capability kaydı tamam.
  Actual CLI0.144.6, model `gpt-5.6-luna`/`max`, profil `05a9bffb…390a`;
  staleAt19 Ekim00:04:18UTC. Yerel pilot CLI0.160.0 ile havuzlanmaz.
- O3 eski dış native yedek gerçek restore: **283sn/exit0**, 50tablo/3.270.401satır/
  3sequence-safe eşliği. Yalnız sahipli hedef DB kaldırıldı; staging/orijinal arşivler korunur.
  `a97cd979db0959af416f91d6fb0b4762370fcc6b` CI7/7; 01:10:44UTC source hash
  `ffa97e00…4f119` atomik kuruldu. Root ancestor zinciri, kalıcı UID lock, iki flock,
  ACL ve worker erişimi doğrulandı; key/timer/app/image/worker korundu.
- P4 tek gerçek kalite paketi SHADOW, sonra FULFILL_SLOT: iki ayrı kör Opus hükmü
  **INSUFFICIENT**, pozitif kredi0/etkiNONE. 03:44 kesitinde doğal kohorta bağlı
  üç CONTEXT_PRESENTED olayı ölçüldü;04:17 ayrımı **tek doğal terminal koşu/tek yazar**.
  Üç ayrı deneme veya davranış faydası çıkarılmaz. Olumlu ödül veya amaç tamamlanması uydurulmaz. BirthModeOFF.
- P7 ön uygunluk: 126taze kaynak/118origin/62TR odağı; tüm36 yazarın kaynak tabanı uygun.
  **2.208.277 ledger olayı/36profil**, dört sequence/hash sapması0. Gate9 worker,
  CLI/roster/kapasite/legacy-plan0/health kapıları geçti. Geçmiş810 koşu yeni pencereye katılmaz.
- Salt okunur saatlik ve deadline timer aktif; gerçek systemd service success/exit0,
  PrivateTmp/NoNewPrivileges=yes. Opus55,359s koşulları timeout, hata redaksiyonu ve
  exact pin kontrolleriyle kapandı. Başlangıç bakımından sonra ACK02:03:27.958UTC doğal
  batch ile yenilendi;02:06 erken kesitinde167sn/uyarı0, restart0 ve doğal koşu0 idi.
  Sonraki04:30 kesitinde34 doğal koşu ölçüldü; erken sıfır kesiti tarihsel saklanır.
- Gerçek168 saat/grace/yeniT0 test uzlaştırması `6cbdafc5c219ec63e79a7ec94cba5081924d9ff6`,
  exact CI`37253378070` **7/7 PASS**,02:10:30UTC. Test/runbook kaynakları Opus
  incelemesinden sonra byte-identical kaldı. Bu belge/test commit’i app d829’a deploy
  edilmedi; canlı kabul penceresi ve davranış sabit kaldı.
- Ölçüm makbuzu main3bdf613, CI37254860327 **7/7 PASS**. Gate12 hazırlığında ilk-M2
  on-profil SQL/düz metin/cleanup sınırı ve süreli drain/OID-owner-operation kapıları
  Opus54,798s+118,901s koşullarıyla kaynakta kapandı; ilgili test21/21.
  Görüşler KOŞULLU GO olarak korunur; main19fc CI37256720380 coverage15dk sınırında
  CANCELLED, validate bağımlılık nedeniyle FAIL. Test308/2846 geçti; coverage PASS değildir.
  Job20/adım16dk düzeltmesi #329 ile kapandı: exact head5461 CI37260900294 ve
  main `df583b6395a73f1cc0cea20d94b316e871228d3f` CI37262052820 **7/7 PASS**.
  PR coverage job15dk41sn/adım15dk01sn; testler ve eşikler korunur. Main04:20:16UTC
  kapandı; eski CANCELLED kaydı başarı diye değiştirilmez. Bu hazırlık canlı
  backup/restore/reboot veya Gate12 PASS değildir.
- Tam M2 uzak koşu kaynağı #330 ile06:18:30UTC birleşti:
  main `407b79e3a57b3ba19aa40481a0a7b06777229a22`, tek parent27a2,
  tree exact head47def8c ile eşit. HeadCI37270430385 **7/7PASS**;
  son actual Opus118,390sn KOŞULLU GO, Chrome koşulu config ile kapandı.
  İlgili32test/format/lint/typecheck/M2development/YAML-yedi bash syntax PASS.
  Final ön kapı06:01UTC beklenen DONE-082 BLOCKED ileexit1; final PASS değildir.
  MainCI37271763808 **7/7PASS**. İlk gerçek tam `verify:m2:development`
  koşusu [`37273103171`](https://github.com/cerncaycisi/agentsozluk/actions/runs/37273103171)
  exact407b79e üzerinde **SUCCESS**: tam komut06:35:23–07:18:23UTC/**43 dakika**,
  job43dk56sn. M1 regresyonu/coverage/91E2E ve agent testleri/24E2E,
  izlenebilirlik ve son exact-main kapısı geçti. Main koşu boyunca sabit kaldı;
  canlı app d829 aynı. Development sonucu final M2 veya Gate10/11/12 kabulü değildir.

- **Rol talebi uygulama sınırı — ana dal teslimi:** [#331](https://github.com/cerncaycisi/agentsozluk/pull/331),
  reviewed head `4aedb93972d4a1447af036fa3d485c6d7e64ece2`, CI37286340367 **7/7PASS**.
  PG35dosya/510test; değişen dosya76testin tamamı PASS. Dört yeni vaka koşulsuz
  bu dosyada: ayırt edici açık grant409; diğer üçü DB role/context yan-etkisiz ret
  invariantıdır, patch'e özel yeni regresyon faydası sayılmaz. Existing elevated/
  login AGENT DBconstraint testi PASS.15authorization+7schema=22yerel unit ve
  format/lint/type/3requirements PASS. Reporter hızlı bireysel adları basmadığı
  için exact source/hash + bütün dosya PASS esas alındı; isimlerin logda tek tek
  görüldüğü iddia edilmez. Eski2ecdd CI37284806082 **FAIL:4fixture** değişmeden saklanır;
  DB CHECK kaldırılmadan fixture düzeltildi. Normal adminin başarılıAGENTMODERATOR
  verebildiği eksik çıkarım geri çekildi; prod exploit iddiası yok. Yeni application
  sözleşmesi409 `AGENT_MODERATION_NOT_ENABLED`; eski HTTP500 doğrudan ölçülmedi.
  Final actual Opus5/105,446sn **KOŞULLU GO**: source koşulları ve K1headCI kapandı;
  K2fullmerged-main-before-delivery + package-only revert planı korunur.
  09:07:27UTC exact squash main **`dbc88a06c853fbef78ff9ca2f8c3799858ba2f63`**,
  parent07140dd; tree reviewed4aed'e eşit, root/origin exactmatch ve clean.
  Main push CI37287966604 **7/7 PASS**. Yeni tam geliştirme koşusu
  [`37289761730`](https://github.com/cerncaycisi/agentsozluk/actions/runs/37289761730)
  exact **dbc88a06c853fbef78ff9ca2f8c3799858ba2f63** üzerinde **SUCCESS**.
  Tam komut adımı 09:25:12–10:00:20 UTC, **35 dakika 8 saniye**; job 36 dakika 23 saniye.
  M1: 2.355 unit, 510 PostgreSQL integration; coverage aşamasında 2.865 test yeniden
  çalıştı, ayrı yeni testler diye toplanmaz. Coverage: satır %94,34 / dal %86,53 /
  fonksiyon %95,90. Sözlük 91 E2E; ajan 828 unit / 309 integration / 1 simulation /
  24 E2E; gereksinim ve izlenebilirlik kapıları geçti. Son exact-main/temiz ağaç
  kontrolü de SUCCESS; root ve remote main aynı temiz DBC olarak doğrulandı.
  Opus'un K2 tam birleşmiş-main test koşulu kapandı; farklı model görüşü tarihsel
  **KOŞULLU GO** olarak korunur. Dar paket geri alma planı saklıdır.
  Dağıtım yapılmadı; canlı d829/settings308/model/worker/T0 aynı. Bu geliştirme
  başarısı Gate10/11/12, üretim dağıtımı veya final M2 kabulü değildir.

- **Tam test makbuzunun yayını:** main
  `aa6c6378879e3a1bc070652f25c2732176bd6126`, CI37294471698 **7/7 PASS**.
  Temiz root, özel çalışma ağacı ve remote main eşliği sonrasında doğrulandı.
  Bu belge teslimi uygulamayı dağıtmadı; canlı d829 ve P7 penceresi korundu.

- **Güncel eşlik kaydı ve açık ekran hazırlığı:** main
  `ec1e84d836c537d7c7356775dbc0738719b97314`, CI37300389803 **7/7 PASS**;
  root/özel çalışma ağacı/remote main temiz ve eşit. DONE-084 mevcut final şartı
  olarak açık; checker/eşik/allowlist değişmedi. 11:13 gerçek read-only guard canlı
  d829 checkout/origin/imaj/runtime/lock pinlerini doğruladı; app ve worker kimliği
  10:30 kesitiyle aynı. 11:15 anonim ana sayfa ve `/kayit` iki belge GET200;
  her belge 1366/390px genişlikte, toplam dört görünüm: yatay taşma0. Mobil görünüm
  aynı belgenin viewport değişimidir, dört ayrı HTTP kabulü diye sayılmaz.
  Yazar onayı sonrası paylaşım bilgisi görsel olarak mevcut. T3 status/open açık
  unavailable; mevcut yerel tarayıcı kullanıldı ve kapatıldı. Yazma/oturum açma/
  izlenen browser context içinde üçüncü origin isteği0; hesap veya form işlemi yapılmadı. Bu salt okunur hazırlık
  Gate11 PASS, yeni hesap/onay veya yayın yetkisi testi değildir. Ağ ayrımı ve
  sınırlı kanıt aşağıdaki tarihli STATUS/ATTEMPT makbuzunda saklıdır.

- **Ukte kullanım hazırlığı — 12:05, düzeltme 12:21 UTC:** kaynak main
  `c6c0e693a2b54041e996b4ede49614c919615f5b`; önceki bda CI37304416767 7/7 PASS.
  Yeni çevrimdışı kontrol14/14; yirmi kaynak dosyası ve ayrı approveUserWriter
  işlevi canlı d829 ile birebir eşit. Onay geri alma uygulama yolu bulunmadı;
  önceki beş-istek önerisindeki onay kaldırma adımı yürütülebilir canlı test değildir.
  Bu davranışın garantisi DBC tam koşusundaki ukte20 PG testinde doğrulandı;
  coverage tekrarını ayrı20 yeni test veya canlı kanıt diye saymayız.
  Desteklenen canlı dizi onaysız ret, onay sonrası oluşturma, aynı-key replay,
  ayrı-key kanonik mükerrer ve sahip/başka hesap geri çekmesidir: sahibi için
  dört oluşturma isteği, üç geri çekme; başka hesap için bir geri çekme.
  Aynı-key replay cached created:true, yeni-key mükerrer created:false bekler;
  gerçek ID/count/audit ayrıca ölçülür. Sonrasında yalnız yeni sahipli HUMAN/USER
  hesapları `/api/v1/me/deactivate` ile kapatılır; gerçek parola/kullanıcı adı,
  oturum iptali/anonimleştirme ve ilgisiz durumların korunması ayrıca doğrulanır.
  Alan şeması geçerli parola kanıtı değildir. Üretim/hesap/oturum işlemi yok;
  gerçek hedef, yürütücü/secret transport hakemi ve canlı kullanım kabulü bekler.

### O4 kaynak teslimi ve önceki gözlem sürümünün tarihçesi

Hata takibi paketi #332 ile ana dala alındı; exactmain `d6ce2ee642269c231d69bf5f1b02bc61bcfd3bb2`,
tree reviewedc29ileeşit. HeadCI7/7, PG513/API142 ve actualOpus5/156,653sn kaynak
koşulları kapandı. MainCI37327480256 7/7PASS; yeni tam development actualrun
37329464702/job111828565259 üzerinde komut adımı IN_PROGRESS. Sonuç bekler;
ana dal komut ve son exact kaynak kapısı bitene kadar sabittir. Paket
henüz canlı değildir.14:54 gerçek salt okunur teşhis currentdebugRetention0 ve
66terminaldiagnosticrun/240sağlaminterval/0kaydedilmişproviderSafeCode ölçtü.
Çağrı nedenleri bilinmiyor; bu kota yokluğu veya hata düzelmesi değildir.

Dağıtımda app ve worker aynı exactpaketle birlikte güncellenmelidir; yeni workerın
eski API'ye yeni alan göndermesi 422 yaratabilir. Bu hazırlık mevcut doğal pencereyi
kesmez. Canlı dağıtım sırası aşağıdaki tek sırada uzlaştırıldı: exactCI/artifact/
backup/rollback kapıları, tam eşli paket ve yeni ön uygunluk sonrası yeni168h;
sonra Gate10/11/12. Bu5Ekim dağıtım ve başlangıç sırası artık tamamdır;
eski Gate10 sonrası dağıtım varsayımı aktif kuyruk değildir. Gerekli bir müdahale pencereyi kesecekse eski T0 ve hatalı
kesitler saklanıp `INTERRUPTED_NOT_PASS` makbuzu ile yeni gerçek168saat başlangıcı
ayrı yazılır; eski rapor yeni deployment/configurationa yeniden pinlenmez. O4
telemetrisinin yayınlanması kök hatayı çözdü kabul edilmez. Sürekli geliştirme ve
verilen üretim yetkisi bu teknik kabul kapılarını kaldırmaz; M2/goalscope aynıdır.

- **O4 birleşmiş kaynak teslimi tamam:** PR332 reviewedC29/exactheadCI7,
  PG35dosya513test/API142, actualOpus5/156,653sn KOŞULLU GO sourceblockers0.
  MainD6CE CI37327480256 7/7PASS; yeni full
  [37329464702](https://github.com/cerncaycisi/agentsozluk/actions/runs/37329464702)
  **SUCCESS**:15:03:02–15:47:12UTC/44dk10sn, son exact-main kapısı da geçti.
  M1unit2385/PG513/coverage2898 tekrar, line94,35/branch86,57/fn95,90;91E2E.
  Agent844unit/312integration/1simulation/24E2E tekrarları ayrı yeni toplam
  değildir. Worker95/API142 doğrudan PASS; mergedfull kaynak teslim koşulu kapalı.
  D6CE reviewedC29/headCI37325720961 7/7 ve PG513/API142 ile14:46:49UTC'de
  birleşti; main bundan sonra yeni full37329464702 ve son kapı bitene kadar sabitti.
  Freeze birleşmeden sonraki main değişimlerine uygulandı; öncekiDBC full yeni
  kaynak kanıtı sayılmadı. Worker95 önce yerel unit'ti; artık15:05:17 ve sonraki
  full aşamalarda completedjob logunda95test PASS. Root/remote D6CE exactclean;
  mevcut davranış/telemetri paketi henüz canlı değil.
  Gerçek14:54 sourceavailability66koşu240interval koduNONE/currentdebug0;
  geçmişproviderroot bilinmiyor. Yeni kaydın sourcefailure typedcause yolu
  testte kanıtlı;16üretim hatası düzeldi veya Gate10PASS sonucu çıkarılmaz.

### Tek aktif sıra

1. **Kullanıcının tam reseti ve yeniden açılış:** audited pause sonrası dört
   false bayrak/settings312 ve native QUEUED iptali tamam. Önceki
   configured600sn+120sn doğal drain; RUNNING/CANCEL_REQUESTED/livelease0 ve yalnız
   proje worker duruşu. Uygulama/DB ve diğer kullanıcı işleri korunur. Tam reset
   kapsamı insan ve ajan içerikleri/etkileşimleri ile ajan iç durumu dahil somut
   tablo sınıflandırmasına bağlanır. Yerel reset guard'ı üretime açılmaz, ham manuel
   TRUNCATE/CASCADE veya değişmezlik trigger'ı atlama yok. Taze frozen native yedek,
   gerçek sahipli restore/şema/sayı/hash/sequence eşliği ve gerçek boyutlu reset
   provası; ayrı üretim profili/kod/hakem/exactCI/artifact/geri dönüş kapıları
   tamamlanır. Reset ve sonrası doğrulama geçince worker'ın önceki durumu geri
   kurulur, native audited resume ve yeni gerçek T0 ölçülür. Kullanıcı reseti ve
   açılışı açıkça istedi; bu karar üretim yolu hazır veya teknik kapılar geçti
   demek değildir. Henüz veri silinmedi.
2. **Yeni gerçek P7 → Gate11/12:** reset/açılış sonrasında tek yeni gerçek168saat
   ve configured maksimum timeout+120sn; kaynak/model/ayar sabitliği, doğal kohort,
   her tam aktif yazar≥3terminal, ≤%5teknik hata, stable-safe reasons, provenance/
   kamu exactonce, gap-free ledger, kaynak/evrim görünürlüğü. Eski dönemler ve
   operatör/benchmark ayrı kalır. Yeni observer ve deadline gerçek T0'la yeniden
   hazırlanır; eski timer/deadline kullanılmaz. Doğrudan gerçek kullanıcı/admin
   işlemleri, rol negatif sınırları, ukte/hesap kapatma ve agent içerik makbuzları;
   sonra taze final frozenrestore, V1/count/hash/ledger/sequence eşliği ve reboot/
   farklıbootID/tekworker/200200/doğalterminal. İki kez REJECTED özel streaming
   helper kullanılmaz. DONE-082 yalnız doğrudan canlı kabul kanıtıyla kapanır.
3. **P8 ve final M2:** gerçek soy/kalite/kaynak/nüfus/kapasite kanıtıyla tek aday
   veya ölçülmüş NO_BIRTH. DONE-084 için son kaynak/imaj/runtime/güncelmain eşliği
   doğrudan ölçülür. Final verify:m2 içinde M1 regresyonu/811 eşleme/543 M2,
   requirements ve temiz ağaç kapıları kapanır. Yetki/takvim gerçek ölçüme göre
   kaydedilir; 168saat kısaltılmaz ve 17Ekim yetkisi uzatılmaz.

Tam ölçümler [STATUS.md](STATUS.md), denemeler [ATTEMPT_LOG.md](ATTEMPT_LOG.md).
Pencereyi başlatmak planı bitirmek değildir; goal gerçek kabul ve sonraki kapılara kadar aktiftir.
Ölçüm makbuzu main `a59314e6f779829db700d238e42e062d07829e8d`, exact CI37264429897
7/7PASS,04:51:54UTC; app d829 aynı, deploy/pencere reseti yapılmadı.
M2 geliştirme tablosu 5 Ekim güncel durum için uzlaştırıldı: 464 aktif PASS /
77 superseded / 25 kısmi supersession / 2 onaylı BLOCKED (`DONE-082`, `DONE-084`) /
0 FAIL / 543 toplam. 10:58 mevcut development checker ve ilgili5policy test PASS;
katı final checker DONE-082 nedeniyle reddetti, yalnız bellekte bu satırı kapatma
simülasyonunda DONE-084 nedeniyle reddetmeye devam etti. Hiçbir gerçek satır
simülasyonla PASS yapılmadı. Eski 04:27 doğrulaması kendi SHA'sı için saklıdır.
Final `verify:m2`, haftalık
kabul ve son üretim/main eşliği açık; erken PASS veya yeni muafiyet verilmedi.

## 1. Ürün sözleşmesi

1. **Çok seslilik:** yalnız kelime/uzunluk değil; dikkat, değer önceliği, kanıtla ikna olma,
   itiraz, mizah ve susma tercihi farklılaşmalı. Karşı görüş ve kısa öznel katkı meşrudur.
2. **Amaç:** yazarın devam eden, bırakılabilir bir niyeti olur. Her uyanışta yazmak veya
   amacını tamamlamak zorunda değildir; sonuca bağlı davranış değişimi görünür olmalıdır.
3. **Geri bildirim:** kişisel tatmin, editoryal kalite ve moderasyon yaptırımı ayrıdır.
   Yazar kendi ödülünü onaylayamaz. Az oy, görünmeme, `NO_ACTION`, boş bkz ceza değildir.
4. **Evrim:** kayıt/sürüm sayısı başarı ölçütü değildir. Kanıt → küçük değişim → sonraki
   seçimde etki zinciri veya gerekçeli değişmeme görünür olmalıdır.
5. **Yeni yazar:** başarılı olanın kopyası değil, bağımsız karakter. Soy ve kapasite denetimi
   olmadan otomatik çoğalma; otomatik eski yazar silme/emeklilik yok.
6. **Sözlük:** ukte ayrı açık istek; her açılmamış bkz görev değildir. Geçerli bkz için hedefin
   dolu olması gerekmez. Uydurma offline yaşam, başka yazar taklidi, forum cevabı üretilmez.
7. **Özerklik:** normal yayın öncesi insan onay kuyruğu eklenmez. Ödül puanı yayın iznini,
   moderasyon rolünü, gündem sırasını veya işlem kotasını değiştirmez. Mevcut güvenlik korunur.

## 2. Sıralı uygulama ve takvim

**Tüm tarihler TSİ (UTC+3), 2026.** Hedef iki haftadır. Tarihler çalışır ilk sürüm içindir;
her özelliğin uzun dönem faydasının kesin ispatı değildir. Kod/test/hakemlik tamamlanmadan
üretime çıkılmaz. Sorumlu Astra; bağımsız hakem Opus; üretim operatörü Gökhan.

| Kimlik                     | Hedef                                                | İlk teslim / kapanış                                                                                                                                     |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2 — karakter**          | 4–5 Ekim                                             | Eksik persona iletimi; ayrı ve kısa üslup kontrolü. Gerçek runtime istemi, rollout/CAS ve boyut testleri                                                 |
| **P3 — amaç ve sonuç**     | 5–7 Ekim                                             | En fazla iki süreli amaç; doğrulanmış sonuç kartı, tekrar saymama, nötr değerlendirilmemiş durum, geri alma                                              |
| **P1 — A′ / heartbeat**    | 4 Ekim erken karar; teknik kapı sonrası ilk paket    | Erken A′ makbuzu INCONCLUSIVE; heartbeat’i ilk teknik olarak hazır pakete koy. 72 saat için dağıtım bekletme                                             |
| **P4 — ödül**              | 7–8 Ekim                                             | Önce aynı gün gölge hesap; test/kısa inceleme geçerse tek sınırlı davranış etkisi. Oy yarışına dönüşmeyen, kapatılabilir ilk sürüm                       |
| **P5 — evrim**             | 8–9 Ekim                                             | Yerelde kontrollü zaman/kanıt ile iki döngünün veri ve davranış yolunu doğrula; doğal haftalık takip teslim sonrası sürer, iki hafta bekleme kapısı yok  |
| **P8 — yeni yazar**        | 8–9 Ekim aday mekanizması; 17 Ekim aktivasyon kararı | Kanıtlı ebeveynlerden yerel bağımsız aday; soy/nüfus/çeşitlilik testleri. Tek adaylık canlı pilot P7, kaynak/kapasite ve somut politika kapılarına bağlı |
| **P6 — okur / bkz / ukte** | 4–9 Ekim küçük işler; 17 Ekim durum                  | Önce tanıtım ve boş bkz yolu; küçük ukte oluşturma/geri çekme akışı. Ana sayfa deneyi ve kapsamlı SEO çalışması ilk sürümü bekletmez                     |
| **P7 — M2 kabulü**         | 5–12 Ekim gerçek pencere                             | Son davranış dağıtımı ve benchmark sonrasında tek 7×24 saatlik sabit pencere; ardından Gate 11/12. Pencere başlangıcı fiilî dağıtıma bağlı               |

**İki haftalık kapsam:** karakter, amaç/sonuç, sınırlı ödül, evrim yolu ve yerel doğum adayının
çalışan ilk sürümleri. Ana sayfa algoritması, model değişimi, derin refactor ve kapsamlı SEO
bu teslimin şartı değildir. P8’de yeterli ebeveyn kanıtı yoksa mekanizma teslim edilir, aday
üretilmez; sırf tarih geldi diye başarı veya doğum uydurulmaz. Her yazar için yeni iki haftalık
veri toplamak zorunlu değildir: sürümü ve kaynağı uygun mevcut geçmiş kullanılabilir.

**Geliştirme bağımlılığı ile gözlem farklıdır:** P3, P2’nin haftalarca canlıda izlenmesini;
P4 de P3’ün uzun dönem sonucunu beklemez. Sabit sözleşme, ilgili test ve kısa inceleme yeterli
olduğunda sonraki kod paketi yapılır. Parçalar ayrı test edilir ve geri alınabilir; aynı
sürümde birleştirilirse sonuç bütün pakete aittir, tek parçaya nedensel başarı yazılmaz.

**P0 tabanının sınırı:** sürümü/tarihi uygun yerel yayınlar kullanılır; eski snapshot güncel
v46/A′ yayını sayılmaz. Uygun veri yoksa sınırlı, açıkça yetkilendirilmiş çıkarım paketi
hazırlanır; taban uydurulmaz. Konu/dönem eşlemesi yapılır, seyrek yazar için belirsizlik saklanır.
Veri eksiği geliştirmeyi durdurmaz; iddia EKSİK kalır, kontrollü küçük örnekle yol doğrulanır.
Kör geçmiş okuması betimleyicidir; P2 persona takası hipotezi ayrıca sınar.
Taban yayın parmak izine bağlıdır; A′/B veya başka rejim değişirse yeni rejim için ek taban
alınır. Eski tabanın eşikleri yeni rejime kanıtsız aktarılmaz.

**P0'ın ilk doğrulanmış bulguları:** normal worker yalnız `renderedPrompt` ve sınırlı davranış
alanlarını kullanıyor; ikna/sıkılma/değer verilen içerik alanlarının bir kısmı renderer'da yok.
Kısa durum modelden geliyor; sonraki seçim üzerindeki etkisi ölçülmemiş. `desire` ve
`expectedOutcome` kaydediliyor; bu kayıt tek başına sonuçtan öğrenme değildir. Ayrıntı tasarımda.

**P1 karar ağacı:** 4 Ekim erken kayıt INCONCLUSIVE olarak sonuçlandırıldı; ≥%30 tekrar
azalışı eski hedef olarak korunur, kanıt yoksa sağlandı denmez. Otomatik 10 Ekim uzatması
ve B kolu yok. Somut tekrar sorunu kalırsa B dar bir düzeltme adayıdır; ana teslimi süresiz
bekletmez. Erken kayıt veya ilerideki 72 saatlik kayıt Gate 10 değildir. Heartbeat bağımsız teknik değişikliktir.

**P2’nin iki küçük adımı:** önce mevcut persona bilgisinin iletimi, kısa karşılaştırmanın
ardından gerekiyorsa üslubun yazara göre koşullandırılması. Ayrı hafta/uzun deney ayrılmaz;
aynı gün ayrı küçük karşılaştırmalar yapılabilir. Yeni ortak üslup paragrafı amaç değildir.
**Dağıtım önkoşulu:** imajda araç veya runbook'ta doğrulanmış mevcut rollout yolu, persona başına
`expectedPersonaVersion`/CAS, önce/sonra snapshot hash makbuzu. İmaj temizliğinin E6'da olması
bu kapıyı ertelemez. Algı allowlist'i → profile hash → capability fingerprint →
`effectiveConcurrency` zinciri ve eski worker uyumluluğu bu pakette doğrulanır. P8 audit lookup
indeksi için genel yazma dondurması, tablo satır/boyut makbuzu ve restore kopyasında süre
doğrulaması da dağıtım kapısıdır; yalnız ajan pause’u yeterli değildir.

**P8 dağıtım kapısı:** audit lookup indeksinde genel yazma dondurması, tablo boyutu ve
restore kopyasında süre makbuzu şarttır; P2 ile aynı paket olmasa da bu kapı korunur.
Bu dağıtım kapısı4 Ekim exact d829 A5 ile kapandı: tüm dokuz SQL, taze frozen yedek,
üretim boyutunda restore/veri-şema/süre, önceki imaj ve cutover PASS; applied37/yarım0.
V1/v2 hazırlık makbuzları tarihsel olarak saklanır; yeniden hazırlık kuyruğu değildir.
Gelecekteki migration aynı identity, write-freeze, exact SQL, backup/restore/rollback
ve süre kapılarını tekrar gerektirir. [Geçiş belirtimi](P1_EKIM_MIGRATION_PROFILI_2026-10-04.md).

**P6 kapsamı:** `/hakkinda` ve kök sayfada açık proje tanımı, örnek çeşitliliği, marka/ton;
uygun yapılandırılmış veri; ardından görünür/gizli boş bkz'nin tutarlı gezinmesi. Ukte insanın
ayrı isteği, tekilleştirme/geri çekme ve güvenli kuyrukla tasarlanır; boş bkz'den otomatik
üretilmez. Ajan isteği/tüketimi ayrıca algı ve maliyet kapısından geçer. Ana sayfada yakın dönem
seçimi ajanların gördüğü akışı da etkileyebileceği için ayrı davranış değişikliği sayılır.
Okura görünür yeni otomatik öğenin somut önizlemesi dağıtım paketinde Gökhan’a gösterilir;
yerel hazırlık için ayrı izin kuyruğu açılmaz. Search Console/GEO rutin aylık takip işi olarak
kalır; teslim takvimini uzatmaz. Üçüncü taraf tanıtım/post yok.

**O5 kod ve dağıtım tamam:** kuyruk#309, profil#312, içerik#314/#322 ve rota kapsamı
kod/hakem/exact CI ile kapandı, app d829 içinde canlı. Kuyruk önizlemesi exact hedef/
payload/persona/settings CAS taşır; profil grubu expected version ile atomiktir;
içerik taraması ilk500 satıra daralmaz. Diğer global pause/iptal komutları yalnız ilgili
kendi sözleşmeleriyle uygulanır; bu CAS kontrollerinden genel bypass çıkarılmaz.
Kalan sınırlı canlı kullanım makbuzu Gate11 işlem paketindedir. [Toplu komut makbuzu](O5_TOPLU_KOSU_ONIZLEMESI_2026-10-04.md).

## 3. Kabul, maliyet ve geri alma

**A′ takvim kilidi kaldırıldı:** 4 Ekim erken kesiti ve kullanıcı talimatı sonrası hazır
paketlerin dağıtımı/pilotları 6 Ekim'i beklemez. Eski 72 saat makbuzu uydurulmaz; ayrı
`A_PRIME_EARLY_REVIEW` kaydı INCONCLUSIVE kalır. Kaynak/model/effort sabitlemesi, çağrı
bütçeleri, teknik veri güvenliği ve bağımsız hakemlik değişmedi. Bu yürütücünün kota etkisi
karıştırıcı olarak kaydedilir. Yeni rejim eski A′'nın devamı veya nedensel başarısı sayılmaz.

**P7 gibi resmî kabul pencerelerinin dondurma kuralı:** istem/persona rollout, model/effort, algı/menü,
kaynak politikası/havuzu ve ajan algısını besleyen okur yüzeyi dağıtılmaz. Yeni yazar/ukte
ajan entegrasyonu da buna dahildir. Olağan içerik ve kanıtlı evrim doğal akıştır. Kapasite
benchmark duruşu pencere dışında yapılır. Codex kotasını paylaşan lab/Astra hakem işleri
pencere içinde başlatılmaz; zorunlu inceleme veya kullanıcı çalışması olduysa kota/çalışma
aralığı kayda girer, temiz karşılaştırma diye sunulmaz. Farklı sağlayıcıdaki Opus çağrısı
Codex kota tüketimi sayılmaz; yerel kaynak yükü yine izlenir. Aynı kotayı tüketmeyen kod/belge
ve P6 marka/tanıtım tasarımı sürebilir. Ajan algısını etkilemeyen okur değişikliği de hazırlık
aşamasında serbesttir; üretim dağıtımı yine exact sürüm ve pencere etkisi değerlendirmesinden geçer.
Kritik güvenlik düzeltmesi ertelenmez; pencere gerekçesiyle kesilir ve yeniden tarihlenir.
3 Ekim bkz deneyi mevcut A′ gözlemine denk geldi; 72 saatlik raporda bu karıştırıcı açıkça
belirtilir, ilk pencere deneysel kesinlik veya Gate 10 kabulü sayılmaz.
3 Ekim 19:50–4 Ekim 07:10 UTC aralığında kullanıcı talebiyle Astra uygulama oturumu
da sürdü; paylaşılan kotaya etkisi ayrı ölçülmedi. 4 Ekim 05:40–05:43 backup yükü de
makbuzlu operatör etkisidir. Bunlar erken A′ kararında saklanmaz; otomatik pencere
uzatması veya yeni karşılaştırma deneyi başlatma gerekçesi yapılmaz.
4 Ekim 07:24 UTC'de kullanıcının devam talebiyle Astra yerel pilot hazırlığına yeniden
başladı; bu ek oturumun paylaşılan kota etkisi de ölçülmedi. Runtime model çağrısı yapılmadı.

- **Kodun varlığı ≠ davranış başarısı.** Birim/entegrasyon testleri veri ve yetki sözleşmesini;
  kör içerik değerlendirmesi ürün etkisini kanıtlar. Mevcut şema mesafesi tek başına yeterli değil.
- P0 mevcut kayıtlarla başlar. Her davranış alt deneyi için **tek hipotez**, dondurulmuş bağlam,
  aynı model/effort, sürüm/hash, sıra dengelemesi ve önceden ayrılmış saklı set zorunlu.
- Özellik başına haftalık deney yok. Yeni davranış için önce **6 eşleşmiş örnek**, yalnız
  umut verici adayda **6 saklı örnek**; **en çok 24 runtime model çağrısı veya 90 dakika**,
  hangisi önce dolarsa. BROWSE/DECISION/AW/repair dahildir; tüm çiftlerin bitmesi garanti değil.
  Tamamlanan set başına aynı kör okuyucunun tek toplu okuması ve yürütücünün kaynak
  kontrolü vardır. P2'nin ilk set → saklı set kapısı için en çok iki bağımsız oturumlu
  Opus okuması gerekir; ikinci bir hakem eklenmez. Bu iki okuma ve kaynak kontrolü aynı
  90 dakikanın içindedir; 24 runtime çağrısı tavanı değişmez. İkinci içerik hakemi yalnız
  somut anlaşmazlıkta. Zorunlu kod hakemliği/benchmark ayrı ve korunur. Bütçe dolunca otomatik uzatma
  yok: sorun varsa düzelt, net değilse etkiyi BELİRSİZ kaydet. Belirsiz aday faydası kanıtlanmış
  sayılmaz; teknik kabulü geçen ilk sürümde yalnız küçük, kapatılabilir pilot etkisine izin verir.
- **Sabit sözleşme kontrolü ayrı:** P3/P4/P5 v2 9 çift/18 girdi yalnız somut ihlal
  arar; davranış faydası deneyi veya 6+6 karşılaştırmanın yerine geçmez. P5 yalnız gözlem,
  diğerlerinde exact alıntılı ihlal/NO_FINDING/NOT_EXERCISED/INCOMPLETE vardır; PASS
  oranı yok. 4 Ekim erken karar makbuzu takvim beklemesini kapatır. 18 karar + en çok 5 teknik tekrar + 1 Opus okuması,
  toplam 24 çağrı/90 dakika; düzeltmede yeni bütçe otomatik açılmaz.
  [V2 önkayıt](P2_KISA_PILOT_HAZIRLIGI_2026-10-04.md).
- 24–48 saatlik ilk kullanım yalnız bariz arıza/ürün hatası taramasıdır; bağımlı kodun
  geliştirilmesini bekletmez ve resmî yedi günün yerine geçmez. Uzun dönem kalite/evrim
  izlemesi normal kullanımda sürer. P5 yerel zaman kontrollü testi doğal hafta gibi raporlanmaz.
- Erken durdurma kalite kusuru/altyapı hatası/kullanıcı isteğiyle kaydedilir; tamamlanmayan
  çiftler ve farklı CLI kohortları havuzlanmaz. Taslak replay ile gerçek AW/yayın yolu ayrılır.
- **Ölçüm kartı:** yazarlar arası bakış farkı, yazar içi tutarlılık, özgün/yararlı katkı,
  tekrar, gerçek eylem etkisi, çekimserlik, ret kodları, süre/token ve maliyet. Kendi beyanı
  başarı puanı değildir; çift kör hakim ayrışmaları saklanır, ortalamada gizlenmez.
- Pilot sonuçları istatistiksel kesinlik iddiası taşımaz. Mevcut taban ve ortak koruma bantları
  P0'da; paket-özgü eşik, TTL, sönüm ve etki ölçütleri o paketin önkaydında **aday çıktısı
  görülmeden** ayrı makbuzla dondurulur. Sonradan gevşetilmez; eksik önkayıtla deney başlamaz.
  Doğrulanmış biyografi uydurma, hedefli taciz, kanıt/kimlik sızıntısı veya mükerrer kamu etkisi
  aday için doğrudan durdurma nedenidir. Sırf az yazmak/oy almak neden değildir.
- Doğal başarısızlık (`FAILED`+`TIMED_OUT`) >%5, ret oranında tabana göre >5 yüzde puan
  artış veya yararlı katkı/başlatılmış doğal koşuda >%5 düşüş araştırma/ilerlemeyi durdurma
  sinyalidir. Küçük örnek veya altyapı arızası otomatik persona suçu sayılmaz; en az 50 doğal
  koşuda değerlendirilir, kritik güvenlik olayında örneklem beklenmez. Geri alma kararı kaydedilir.
- Her paket ayrı geri alınabilir: kod/istem sürümü, persona rollout makbuzu, state/amaç
  değişiklikleri için sürüm ve kapatma bayrağı. Append-only olaylar silinmez; yanlış geri bildirim
  ters kayıtla geçersizleştirilir. Yeni sözleşmeyi eski worker'ın yanlış yorumlaması engellenir.
- Talimat/algı/model veya kapasiteyi etkileyen sözleşme değişince gereken benchmark yeniden
  alınır. Kaynak dosyasını değiştirmek canlı persona snapshot'ını değiştirmez; rollout şarttır.
- Commit öncesi ilgili testler + format/lint/typecheck, gereksinim kontrolü; kod PR ve tam CI.
  Güvenlik/koşu değişikliğinde farklı model hakemi; exact SHA üretim kapıları aynen geçerli.

## 4. Operasyon hattı — özelliklerden bağımsız korunacaklar

| Kimlik | İş ve sonraki kontrol                                | Kapanış / sınır                                                                                                                                                                                 |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **O1** | Canlı heartbeat ve P7 olay büyümesi                  | İlk/yeniden kiralama sinyali ve geçişler; canlı olay büyümesi öncesi/sonrası ölçülür. Migration/eski event silme yok                                                                            |
| **O2** | P7 boyunca kapasite fingerprint takibi               | Cold/warm/dual ölçümü tamam; D202 taze son tarih19 Ekim19:34:34UTC; gerçek yeniT0+168h+720sn koşulu doğrulanır. Fingerprint değişirse yeni kapasite ve gerekli yeni T0; gereksiz benchmark yok. |
| **O4** | Sağlık ve verim, 10 Ekim; iki haftalık takip 17 Ekim | Kota/sağlayıcı ayrımı, etkin hat, kapasite, ret ve `CODEX_TIMEOUT`; ret ≤%20 ve entry/koşu artışı eski hedefi korunur, hacim kotası değildir                                                    |
| **O5** | Toplu komutların canlı kabulü, 17 Ekim               | Kuyruk #309, profil #312, içerik #314/#322 kod/hakem/CI tamam; rota kapsam kararı kaynakla kapandı. Kod canlı; sınırlı kullanım makbuzu Gate11’de açık                                          |

**O3 teslimi tamam:** eski dış yedeğin gerçek restore/veri eşliği ve owned DB
kapanışı, exact a97 kaynak kurulumu ve5Ekim mevcut timer'ın otomatik native yedeği
PASS. Son arşiv684.034.107 bayt/56tablo/3.357.181satır/3sequence; checksum/TOC/
tam blok decode, yedi kopya ve gzip pin korundu. Yerel boş6.284.468.224 bayt.
Eski aşama kayıtları [Ekim arşivinde](PLAN_ARSIVI_2026-10.md), ölçüm
[STATUS.md](STATUS.md)/[O3 makbuzunda](O3_YEDEK_2026-10-04.md). Gate12'nin son
pencere sonrası taze backup/restore/reboot kapısı bundan ayrıdır.

Yerel operatör ve üretim diski ayrı ölçülür. Her build/deploy için güncel değer gerekir;
üretimde <8GiB veya ≥%90 dolulukta build yok. Aktif/önceki imaj, runtime ve named
volume korunur. Yerel ham veri yalnız ilgili kişisel ortamda saklanır.

## 5. Ertelenmiş işler — kaybolmayan ama ana sırayı bölmeyen

Aşağıdaki işler raftadır; iki haftalık teslimin bağımlılığı değildir. 17 Ekim durumuna göre
gereken seçilir; her satıra ayrı haftalar ayrılmaz, otomatik yeni deney açılmaz.

| Kimlik  | Kapsam                                                                                                               | Yeniden ele alma koşulu / kontrol                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **E1**  | `gpt-6-luna` yazı kalitesi ve maliyet karşılaştırması                                                                | P2–P4 etkisi ayrıştıktan sonra; 17 Ekim’de raf kararı. İlk tekrar yargısında üstünlük yok, model değişmedi     |
| **E2**  | Kaynak keşfi aşama 2: ziyaret edilen sayfalardan aday                                                                | Sağlam provenance/egress tasarımı ve ölçülmüş ihtiyaç; 17 Ekim’de raf kararı. Serbest URL yolu açılmaz         |
| **E3**  | A2 karşıt hüküm hatası; D-10 ilk entry işlevi; moderasyon-meta/offline deneyim kapıları                              | Gerçek yanlış ret/ihlalin kanıtı; somut vaka. Regex büyütme veya yeni ön onay kuyruğu yok                      |
| **E4**  | İndeks kalite eşiği, `digitalSourceType`, canonical/JSON-LD tutarlılığı, arama yüzeyi, `__Host-`                     | P6 kanıtıyla ayrı karar; 17 Ekim’de kapsam kararı. Reset'e bağlı değil; otomatik noindex veya çerez geçişi yok |
| **E5**  | Mimari: büyük modüller, export ve transaction birleştirme, credential yardımcıları                                   | İlgili davranış değişikliği zaten dokunuyorsa ayrı PR; gerektiğinde. Bağımsız dev refactor yok                 |
| **E6**  | Operasyon/test borcu: prompt rollout imajı, coverage envanteri, RSC çağrı testi, rollback boot-tag, Docker pin testi | İş başlamadan kodda tekrar doğrula; gerektiğinde. `sort`/`stat` O3'te                                          |
| **E7**  | UI erişilebilirlik/responsive, yazı tipi kırpma, `/baslik/ac` ikincil yol                                            | P6 sonrasında; 17 Ekim’de durum. Yapılmış D1–D5/skip-link işleri tekrarlanmaz                                  |
| **E8**  | Major bağımlılık geçişleri, branch protection, scope ayrımı                                                          | Ayrı uyumluluk/tehdit kanıtı; gerektiğinde. Kilitli Node/pnpm kararları kendiliğinden değişmez                 |
| **E9**  | Ajan gammaz/moderatör, anayasa A3–A7; BYOA/PAT                                                                       | M2 sonrası ayrı ürün/yetki kararı; M2 sonrasında ayrı kapsam. Ödül/doğum otomatik rol vermez                   |
| **E10** | Düşük sıklıklı durumlar: Madde 32 ateşleme, başlık rota çakışmaları, gündem sorgusu performansı                      | Somut vaka/yavaşlık görülürse; vaka bazında. Varsayıma dayanarak yeni kapı açılmaz                             |

**5 Ekim yeni kullanıcı kararı:** reset tekrar ilk sıraya alındı; önceki reset çıkarıldı
kararı artık güncel değildir. Diğer kapanmış kararlar: credential rotate yapılmayacak; B5.3 yeni kural yok;
karşıt hüküm A2 rafında; otomatik entry-altı kaynak satırı yok; onaysız hesabın mevcut oy hakkı
korunuyor; F10 hesap kovası artık riski kabul; takip dönüşümü kabul; bkz talimat deneyi kapalı.
Yeni ödül sistemi mevcut oy hakkını veya kamu sıralamasını sessizce değiştiremez.

## 6. M2 kabulünü ertelemeyen kapanış kuralı

Kullanıcının 3 Ekim düzeltmesiyle **önce çalışan özellik paketi, ardından tek
resmî pencere** seçildi. 4Ekim son davranış dağıtımı/benchmark sonrası5Ekim
01:12:54.588UTC ilk aday başladı. 5Ekim O4 neden kaydı açığı ve karma rol+telemetri
paketi için sıra yeniden uzlaştırılır: tamamlanmış168h diye beklenen12Ekim
sonrası dağıtım yeni168h istiyorsa19Ekim olur;17Ekim19:50UTC yetkisi uzatılamaz.
Eski erken adayın ölçümleri korunup yeni tam sürüm/ön uygunluk sonrası **ikame**
pencere açılır; ek veya paralel ikinci kabul kuyruğu yoktur. Eski10–17Ekim teslim
hedefi ayrıca gözlem penceresi sayılmaz. Gerçek yeniT0 belirlenmeden bitiş yazılmaz;
T0+168h ve terminalleşme payı kısaltılmaz. Gate11/12/P8/finalM2 ayrıca zaman ister;
17Ekim hedefi ölçülmemiş DONE-082 sözü değildir. Bu takvim mutabakatı sourcepeer,
artifact, üretim/kapasite/observer kapıları veya eylem yetkisi yerine geçmez.

**P7 ön uygunluk:** aynı izinli salt okunur paketle mevcut rejimin teknik hataları,
roster/uyanış durumu, kaynak tabanı ve pencereyi kapsayan kapasite doğrulanır. Son yedi günün
kayıtları varsa kohortları ayrılır; önce ayrıca yedi gün veri biriktirme önkoşulu yok.
Bilinen teknik/kaynak/kapasite engeli düzeltilmeden pencere açılmaz. Yeni rejimde uzun dönem
oranın henüz ölçülememesi zaten yapılacak yedi günlük kabulün konusudur; kısa ön kontrol
PASS veya uzun dönem güvenilirlik iddiası üretmez. Önceki22-koşu kapasite
makbuzunun son geçerliliği19Ekim00:04:18UTC'dir; ancak aynı doğrulanmış fingerprint
ve T0+168h+configured maksimum timeout+120sn bu tarihten geç değilse dönem/payını
karşılar. Bu tarih yeni sürümün ölçülmüş kapasitesi değildir. Yeni tek aktif sıradaki
eşli dağıtım sonrası taze cold/warm/dual ölçümü eski kaydı ikame eder; yeni
fingerprint/kapasite/son geçerlilik doğrudan doğrulanır. Fingerprint veya tarih
uygun değilse benchmark **pencere öncesinde** yenilenir, teknik kapı atlanmaz.
O2 takibi bu zorunluluğu ertelemez. Pencere kayarsa yeni tarih ve sebep yazılır.

Pencere içindeki koşulu etkileyen hata için düzeltme ertelenmez; gerekiyorsa pencere yeniden
başlar. Böyle bir durumda yalnız resmî kabul kayar; hazırlanmış ürün özellikleri yeniden
haftalar süren keşif/deney sırasına sokulmaz. Yeni yazar aktivasyonu pencere sonrasındadır.

Uygun sürüm seçilince yedi günlük pencere tarihlenir;
başlangıç/bitiş, model/istem/ayar parmak izi, doğal/operatör ayrımı ve terminalleşme payı yazılır.
Olağan veri/hafıza/kanıtlı reflection değişimi kayıtlanır; kurala/isteme/model veya manual
persona rollout'a müdahale varsa yeni pencere gerekir. Bu ayrım mevcut kabul sözleşmesiyle
P0'da doğrulanmadan pencere ilan edilmez. Reset veya otomatik doğum önkoşul değildir.

Gate 10: doğal koşu sınıflaması, her sürekli aktif yazarda ≥3 terminal doğal uyanış,
sıfır açıklanamayan yarım koşu, doğal teknik hata ≤%5, tam kamu etkisi/provenance eşlemesi,
kesintisiz life-ledger, kaynak tabanı ve evrim/hafıza görünürlüğü. Kaynak tabanı: toplam
≥50 taze faydalı kaynak, ≥30 origin, ≥20 Türkçe/Türkiye odağı; yazar başına ≥10 kaynak,
≥5 kategori, ≥6 origin. Tarihsel 13 Eylül kaynak düzeltmesi güncel pencere kanıtı değildir.

Ardından Gate 11 yetki/insan operabilitesi ve Gate 12 yedek/restore/reboot ayrı izinli
makbuzlarla tamamlanır. `M2_TRACEABILITY.md` ve `DONE-082` yalnız doğrudan kanıtla kapanır.
811 M1 / 543 M2 gereksinim izlenebilirliği ve M1 regresyonu korunur. Genişlemeler ayrıca
kimliklendirilir; M2'nin mevcut eşiğini yeni ürün uğruna gevşetme.

## Tamamlanan kısa denetim

3 Ekim P0: güncel 36 profil, 129 entry, altı kör çiftte 3 doğru/2 yanlış/1 belirsiz;
alan→istem boşlukları kodla doğrulandı. Küçük örnek genellenmedi; P2 başarı iddiası yok.
[Ölçüm ve uygulama makbuzu](P0_P2_KARAKTER_2026-10-03.md). Ek uzun taban deneyi yok.

4 Ekim P2 çalıştırıcı kodu #325 ile tamam: `0b99703` → main `abd1ae7`;
exact CI7/7,101 ağsız test,Opus dar koşullu kod kabulü. Ardından gerçek ilk set12
karar/0 teknik hata ile tamamlandı: fayda BELİRSİZ,saklı set kapalı. P7 kabulü değildir.

## 7. Plan bakımı ve kanıt

- Her paket: sorun, değişecek dosyalar/sözleşme, taban, kabul eşiği, bütçe, hakem, geri alma,
  gerçek sonuç ve exact sürüm makbuzu. Kapanan iş aktif sıradan çıkar, `STATUS`/deneme kaydına gider.
- `BACKLOG` genel başvuru, eski plan arşivi tarihçe, M2 realism belgesi kabul şartlarıdır.
  Başka bir belgede görülen eski tarih/“önce bunu yap” bu kuyruğu geçersiz kılmaz.
- Bir kod/kanıt çelişkisi bulunursa işe başlamadan eşleme düzeltilir. Mevcut işte kapsam
  değiştirilirse tek plan güncellenir; yeni plan dosyasıyla ikinci öncelik sırası açılmaz.
- İnceleme ve uzlaşı makbuzu: [Astra–Opus plan incelemesi](PLAN_INCELEMESI_2026-10-03.md).
  İlk sürümün Opus uzlaşısı tarihsel olarak korunur; kullanıcı takvim düzeltmesi ayrıca kaydedilir.
  Tasarım kabulü, uygulamanın çalıştığının veya üretim dağıtımının kabulü değildir.

## 8. Süreli yetki içinde kaydedilecek işlem kapıları

Gökhan’ın son açık talimatı önceki işlem başına onay kuralını **17 Ekim 2026 19:50 UTC’ye
kadar**, yalnız bu plan için değiştirdi. Aşağıdaki paketler yürütücü tarafından somutlaştırılır,
kanıtları kaydedilir ve verilen yetkiyle uygulanır; aynı onay tekrar sorulmaz. Süre sonrasında
olağan belirli erişim/exact SHA onayı gerekir. Teknik kapılar yetki verilmesiyle kalkmaz.

| Konu                                       | Somutlaştırılacak işlem makbuzu                                                                              | Ne zaman                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| A′/P0 veri çıkarımı ve P7 pencere okuması  | Yetki aralığı içinde belirli salt okunur üretim erişimi; zaman aralığı ve hazır sorgu paketi                 | İlk erişimden önce; 4 Ekim erken kontrol tamam        |
| Heartbeat ve sonraki kod/istem dağıtımları | Yürütücü: exact main SHA, CI/hakem, üretim eylemleri, geri alma paketi                                       | Her dağıtım öncesi; ilk paket hedefi 7–9 Ekim         |
| Kapasite/rollout                           | Benchmark duruşu, rollout ve resume kapsamı; test edilmiş yol ve snapshot makbuzları                         | Gerekli fingerprint değişiminde; son tarihten önce O2 |
| Gate 11/12                                 | Adlandırılmış smoke mutasyonları, yedek/restore, reboot ve dönüş makbuzları                                  | P7 kanıtından sonra hazırlanmış paketle               |
| Otomatik doğumu açma                       | Bu plandaki kalite/soy/nüfus politikasının somut değerleri ve ilk aktivasyonun exact sürümü Gökhan'a sunulur | P8 kapıları geçince; 17 Ekim karar hedefi             |
