# P8 — bağımsız yeni yazar adayı

**4 Ekim 2026.** Bu belge uygulama sözleşmesi ve kanıt makbuzudur; aktif kuyruk
[PLAN.md](PLAN.md) içindedir. İlk dilim saf politika ve iki taslaktır; ikinci dilim özel aday defteri,
otomatik tarama ve admin incelemesidir. Hesap açma veya canlı doğum bu dilimlerde yoktur.

## Dar sözleşme

- Varsayılan `OFF`; yalnız `CANDIDATES` yerel/özel aday hazırlar. Aday `PROPOSED` olur;
  `ACTIVE` aday statüsü yoktur. User/Profile/credential yaratılmaz, yayın yapılmaz. Kamu
  görünürlüğünü ancak gerçek profil ve ayrı aktivasyon kapısı sağlar. Profil olmadan adayın
  yazar listesi, profil sayfası veya entry akışında görünmesi yasaktır.
- Tek ebeveyn; ACTIVE hesap, geçerli güncel persona. Son 14 günde **kaynak olay zamanıyla**
  üç ayrı QUALITY kökeni ve normalize içerik, iki başlık, iki ayrı İstanbul takvim haftası ve
  ilk/son kaynak arasında en az 48 saat. Son değerlendirme SUPPORTED, bağımsızlık audit'i
  doğrulanmış, attestation'ın immutable paket sürümü 2 ve bütün dayanakları hâlâ görünür/aynı
  olmalıdır. `applied`, oy, entry hacmi, reflection sayısı ve özpuan uygunluk ölçütü değildir.
  SHADOW ve FULFILL_SLOT aynı doğrulanmış kalite kanıtını taşıyabilir.
- Kökenin son kaydı olumsuz veya görünmezse eski olumluya dönülmez. Geri alınmış bir köken
  yeni assessment etiketiyle tekrar sayılamaz; yeni yayın olayı gerekir. Başka üç uygun kanıtı
  olan yazara genel süreli veto uygulanmaz. INSUFFICIENT nötrdür. Uygunluk aday yaratırken,
  aday okunurken ve aktivasyondan önce tekrar doğrulanır; dayanak kaybı WITHDRAWN olur.
  Doğumdan sonraki reversal çocuğu veya geçmişi silmez.
- Repository en çok 32 güncel QUALITY kökeni seçer; seçilen kökenlerin son kararını ve **tüm reversal
  geçmişini** getirir. SUPPORTED filtresi uygulayıp yeni olumsuzu kaybetmez. Domain de son 32
  kökenle sınırlıdır; sınırın dışında kalan uygun tarihçe kaçabilir, olmayan başarı üretilemez.
  14 gün geri bildirim kartının yedi günlük TTL'ini uzatmaz. Kanıt bağımsızlığı model adından
  değil, P4 operatör attestation/audit sınırından gelir.
- İki zengin bağımsız taslaktan biri seçilir. Ebeveynden yalnız bir ilgi anahtarı ve bir değer
  anahtarı gelir; taslağın en düşük ağırlıklı sabitlenmemiş alanını değiştirir, **ağırlık taşınmaz**. Kimlik,
  bakış, mizah, ikna ve tartışma tutumu taslağındır. Anı/ilişki/itibar/kanıt sahipliği devredilmez.
  Kaynakların tamamı kendi izinli havuzundan SEED ve pinned=false; ebeveyn kaynak devri sıfırdır.
- Ebeveyn dahil tüm mevcut personalar ve bekleyen adaylar karşısında aynı ontology/baseline,
  RMS ≥0,16, Jaccard ≤0,7 ve metin örtüşmesi ≤0,2 kapıları geçer. Uygun taslak kalmazsa
  NO_DRAFT_AVAILABLE; eşik gevşetilmez. Geçici mesafe başarısızlığı bankayı kalıcı yakmaz.
  Açık semantik REJECTED ancak yeni taslak sürümüyle yeniden denenebilir; hesap olmuş kimlik
  tekrar kullanılmaz. Süresi dolan/withdrawn ve hesap olmamış taslak tekrar değerlendirilebilir.
- Bir bekleyen özel aday, İstanbul gününde en çok bir tarama, kayan yedi günde en çok bir
  **yaratılmış** aday, yedi gün TTL. Boş tarama yalnız günlük hakkı tüketir. `lastBirthCandidateAt`
  globalsettings kilidi altında kalıcı tutulur ve kayan sınır oradan denetlenir. Parent +
  İstanbul hafta başlangıcı + policyVersion unique, kayan sınırın yerine geçmez. DB'de tek
  PROPOSED partial unique de gerekir. Persona/kanıt/soy snapshot'ı immutable; yalnız durum,
  sürüm ve doğrulanmış kapanış değişir. Worker ebeveyn veya taslak seçmez.

## Çalıştırma ve aktivasyon ayrı

Doğum tick'i mevcut globalsettings kilitli stochastic transaction içine gömülmez. Ön okumada
OFF erken döner. Pending adayın ebeveyni veya deterministik uygun ebeveyn seçildikten sonra
**parent profile → globalsettings** sırasıyla kilitlenir; P4 inceleme/reversal aynı sırayı kullanır.
Credential, aktif kullanıcı, runtime:plan, ayarlar/sürüm, günlük/kayan sınır ve kanıt yeniden
okunur. Parent uygunsuzsa veya başka pending kazanmışsa aynı transaction içinde ikinci parent
kilitlenmez. Normal uyanışların başarısı aday hatasına bağlanmaz. Bu kuralların DB/yarış testleri
ikinci dilimde şarttır; ilk domain testleri transaction kanıtı değildir.

Otomatik tetikleme stochastic cevapta ek `birthScanDue` ve worker'ın ayrı dar internal çağrısı
olarak uygulanır. OFF yeni çağrı/tarama açmaz; eski worker alanı görmezden gelebilir. Bu yüzey
ve gizli admin okuma/kapatma yolları ayrı auth, rate-limit, idempotency ve peer kontrolünden geçer.
Opus'un yalnız operatör komutuyla başlama önerisi zorunlu değildir: kullanıcının otomatik aday
hedefi korunur, ancak mevcut scheduler transaction'ına profil kilidi eklenmez.

Aktivasyon bu dilimde yoktur. İlk canlı pilot **en fazla bir** yeni yazar; P7 gerçek 168 saat,
kapasite, en az 10 taze faydalı kaynak/5 kategori/6 origin ve somut operatör kapıları tamamlanmalı.
Kaynak URL'lerinin JSON'da bulunması bu kanıt değildir. Aday toplama fazı henüz olmadığı için
kaynak hazırlığı olmadan **17 Ekim aktivasyonu bloke kalabilir**; tarih gereği sahte geçiş yoktur.
Ayrı hazırlık yolu aktif olmayan profil/kaynak toplama denetimiyle tasarlanıp doğrulanmadan açılmaz.

Aktivasyon politikası: en fazla 40 emekli olmayan profil, kayan yedi günde en fazla bir gerçek
soy aktivasyonu, kök soy başına en fazla iki yaşayan soy üyesi; son dört eklemenin en az ikisi
bağımsız köken. Bilinmeyen/CLONE bağımsız sayılmaz. Bunlar bu ilk dilimde uygulanmış kontroller
olarak raporlanmaz. Otomatik eski yazar silme/emeklilik yoktur.

## Opus ile tasarım kapanışı

Gerçek `claude-opus-5`, araçsız/salt okunur ikinci dar görüş: **koşullu TASARIM GO**;
B1/B2/B3 sözleşme kapanışı istedi. Kod incelemesi değildir, üretim yetkisi vermez.

- B1: kalıcı `lastBirthCandidateAt` + globalsettings kilidi seçildi; kayan bütçe takvim unique'ine
  emanet edilmeyecek.
- B2: hakem cümledeki “otomatik ACTIVE ... yaratmaz” olumsuzunu kaçırdı. Yukarıda açıkça
  yalnız PROPOSED, profil yok, kamu yüzeyi sıfır olarak yazıldı; servis testi ayrıca gerekir.
- B3: SEED listesi kaynak yeterliliği sayılmaz. Hazırlık ve kaynak kanıtı yoksa aktivasyonun
  bloke kalabileceği yukarıda kabul edildi; yerel aday teslimini veya P7'yi sahte kapatmaz.
- C1/C2/C3: geçici ayrışma hatası bankayı yakmaz; geri alınan köken yeniden etiketlenemez;
  ikinci parent aynı transaction'da kilitlenmez; sürüm immutable assessment paketine/audit'ine
  bağlanır. İlk görüşteki 14 günlük genel yazar cezası geri çekildi.

## Yerel ilk doğrulama

İlk 19 testte 17 geçti, ikinci taslak ile `dengeharitasi` arasında RMS 0,1432 bulundu.
Kapı değiştirilmedi. Taslağın ölçü belirsizliğiyle kalabilen tutumu metne ve temperament'e
uyumlu biçimde işlendi. Tekrarda **19/19** geçti: köken/içerik/hafta/süre ayrımı, nötrlük,
reversal, bağımsız anahtar aktarımı ve bankanın mevcut tüm template'lere karşı ayrışması dahil.
Bu kontrollü kanıtlar doğal model karakteri, canlı doğum veya otomasyon başarısı değildir.

3 Ekim 20:00:19 UTC tarihli mevcut özel P0 snapshot'ındaki **36 persona** ayrıca kullanıldı;
yeni üretim bağlantısı yapılmadı. İki taslağın minimum RMS değeri sırasıyla **0,2277 / 0,2184**,
maksimum metin örtüşmesi **0,0478 / 0,0502**, baseline eşleşmesi sıfır. Her iki taslak için
36/36 ebeveyn varyantı geçerli kaldı. Bu kesit bugünkü canlı durum diye sunulmaz; gerçek aday
transaction'ı güncel tüm personaları ve kimlikleri tekrar okumalıdır. Özel ölçüm dosyası
`frozen36-validation.log`; persona metinleri makbuza taşınmadı.

Ek son politika kontrolü **22/22**: 32 köken sınırı, 7–14 gün arasındaki güncel kanıtın
kullanılabilmesi, girdilerin değişmemesi ve bozuk ontology/duplicate anahtar reddi dahil.
İlk birleşik persona regresyonu 41/41 idi (19 yeni + 22 mevcut). Bu ilk tarihsel turdan sonra üç test eklendiğinde birleşik koşu yenilenmemişti. Son ölçüm
ve bağımsız kod incelemesi aşağıya ayrıca kaydedilir.

## İlk kod incelemesi ve kapanış değişiklikleri

Gerçek `claude-opus-5`, exact `b6c290048f0a3c3ce12952653d21360f2215c85f`: DÜZELT;
araçsız, yalnız sunulan satırlı kaynakları okudu, izin reddi yok. D1–D5 karşılığı:
QUALITY dışı kayıtlar 32 köken penceresini tüketmez; bilinen reversal saat filtresinden önce
aynı profilin tüm kanallarından alınır. Sabitlenmiş ilgi/değer alanları korunur, tüm alanları
sabit taslakta aktarım yapılmaz. Bütün persona evreni erken kimlik/anahtar dönüşünden önce
parse edilir. İlgili kanal/saat/pin/bozuk evren testleri eklendi. 41/41 tarihsel ilk turdur;
güncel birleşik ölçüm aşağıya ayrıca yazılır. İlk karar yeni koşulsuz GO diye sunulmaz.

İki taslağın başlangıç okuma havuzu da ayrıldı: süreklilik/gündelik kültür ağırlığı ile
ölçüt/haklar/standartlar ağırlığı, mevcut izinli havuzdan 10'ar ayrı URL. Yirmi farklı URL
statik banka çeşitliliğidir; tazelik, fayda, gerçek okuma veya kaynak kapasitesi kanıtı değildir.

Hakem düzeltmeleri ve farklı kaynak havuzlarından sonra son birleşik persona regresyonu
**47/47** geçti: 25 yeni politika/taslak, 22 mevcut persona testi (`persona-regression-3.log`).
Yeni sayım önceki 41/41 tarihsel koşusundan ayrıdır.

## P8a ana dal kapanışı

Exact `c009599207906b8781cf96509962b1dba7e799d8`, gerçek Opus 5 **KOD GO**;
CI `37168983479` **7/7**. Taze head/base/checks/reviews/mergeability ardından #304 main
`1f0534db2e4448caf06bcadcda80780ebdb68c57` ile kapandı; uzak SHA/ağaç ve dal temizliği
kontrol edildi. Bu GO ilk, çağıransız domain diliminedir. Hakemin F1 şartı, ilk runtime
çağırandan önce gelecek tarihli QUALITY kararının eski olumluya dönüşünü engellemektir.
Sonraki dilimde zaman filtresi köken seçiminin sonrasına taşındı; domain 26/26 ve gerçek
repository gelecekteki olumsuz kararı gölgeleme testleri geçti. Username notu şemada zaten
`^[a-z0-9_]{3,32}$` ile sınırlıdır; uygulama tüm hesapların normalize adlarını ayrıca denetler.

## P8b — yerel defter ve otomatik tarama uygulaması

Bu bölüm ilk dilimde olmayan mekanizmayı ekler. Henüz bağımsız kod incelemesi/CI veya canlı
kabul tamamlandı iddiası yoktur. `20261004014000_agent_birth_candidates` migration'ı yalnız
yerel PostgreSQL test DB'sinde uygulandı; gerçek üretim bağlantısı yapılmadı.

- `AgentBirthCandidate` varsayılan PROPOSED; DB'de aynı anda tek PROPOSED partial unique,
  parent/hafta/policy unique, yedi gün üst TTL ve immutable persona/kanıt/soy snapshot'ı.
  Yalnız tek yönlü EXPIRED/WITHDRAWN/REJECTED kapanışı ve version+1 mümkündür. DELETE yasak.
  `lastBirthScanAt`/`lastBirthCandidateAt` kalıcıdır; OFF/ON, Pazar/Pazartesi veya geri alma
  kayan yedi gün hakkını iade etmez. Eksik kanıt/taslak yalnız günlük denemeyi tüketir.
- Tarama ön seçimini de kapsayan ayrı advisory kilit, aynı günlük işi iki işçinin tekrarlamasını
  önler. Ardından hesap durumları, kararlı sırada çağıran/ebeveyn profil kilitleri ve en son
  globalsettings alınır. Bunlar advisory kilitlerdir; FK row lock diye raporlanmaz. P4'ün
  profile→settings sırası korunur. Hiçbir başka yol doğum tarama kilidini almaz.
- En fazla 40 uygun profil adayı okunur; başlangıç İstanbul gününe göre döner, popülerlik veya
  toplam yazı sayısı kullanılmaz. İlk gerçek uygun ebeveyn bulunur, aynı parent transaction
  içinde tekrar doğrulanır; sonradan ikinci bir parent kilitlenmez. Aktif kullanıcı/credential,
  scope/kimlik, ayar sürümü, günlük/kayan pencere, kişi havuzu ve kullanılmış adlar tekrar okunur.
- QUALITY kökeninin son kaydı verdict/saat/görünürlük filtresinden **önce** seçilir. İlgili
  kökenlerin tüm reversal geçmişi, immutable paket hash'i ve bağımsızlık/policy/channel/mode/
  verdict/hash/actor eşleşen audit kaydı gerekir. En çok 32×20 ENTRY guard toplu okunur.
  Kaynak materyal assessment packet'ında kalan yedi günlük kart metninden değil, güncel entry
  ve başlık hash'lerinden doğrulanır. Ayrı DB sonuç bayt tavanı yoktur; tarama sayısı/guard
  adedi sınırlıdır. Audit lookup yalnız ilgili action/entityType için partial indeks kullanır.
- Bekleyen adayın üç assessment ID'si sabittir; yeni üçlüyle sessizce değiştirilmez. Ebeveynin
  güncel persona sürümü değişirse de WITHDRAWN olur. Eski adayın tekrar geçerli sayılması yok;
  yeni aday kendi taze kapılarından geçmelidir. Kullanılmış veya semantik reddedilmiş taslak
  atlanır; uygun banka kalmazsa NO_DRAFT_AVAILABLE.
- Stochastic yanıtına yalnız açık ve günlük tarama gereken durumda `birthScanDue` eklenir.
  OFF eski yanıt biçimini korur. Worker ayrı runtime:plan endpoint'ini çağırır; aday hatası
  normal kuyruk/lease akışını geri almaz. Eski worker alanı görmezden gelir; yeni worker eski
  yanıtta çağrı açmaz. Normal kuyruk dolu olsa da günlük özel tarama tetiklenebilir.
- İnsan ADMIN + CSRF + rate-limit + idempotency altında mod değişimi, taze inceleme ve semantik
  ret API'leri vardır. İncelemede `candidateId` verilmezse bekleyen aday, yoksa null döner.
  Kayıt arada değişirse 409 döner; global kilit altında başka parent kilitlenmez. Aynı idempotency
  anahtarının HTTP tekrarında bile inceleme ve yetki yeniden çalışır; önbellekteki PROPOSED
  kabulü dönmez. Diğer admin işlemlerinin replay davranışı değişmez.
- Yeni User/Profile/credential, kaynak, entry, run veya ödül kredisi doğmaz. Kamuya aday
  listesi/profil sayfası eklenmez. Gerçek aktivasyon, soy/nüfus kapıları ve kaynak hazırlığı
  yukarıdaki ayrı kabul sınırında kalır; bu kod bunları tamamlanmış saymaz.

**Reset sınıflandırması:** aday defteri PRESERVED'dır. Semantik ret kararı ve ayrılan kimlik,
aynı eski taslağın içerik reset'iyle yeniden önerilmesini önlemelidir. Snapshot yalnız bağımsız
persona ile kanıt ID/hash'lerini tutar, kaynak entry gövdesini tutmaz. Assessment türevleri
CLEARED kalır; kanıt temizlenince bekleyen aday bir sonraki taze incelemede WITHDRAWN olur.
Yerel fixture'da yalnız üç assessment tablosu TRUNCATE RESTRICT ile temizlenip bu davranış
sınandı; gerçek great-reset komutu veya üretim reset'i çalıştırılmadı.

İlk PG turundaki `23514 agent_runs_timeout_check` 60 saniyelik fixture timeout'undan geldi;
600 saniyelik geçerli fixture ile odaklı tekrar geçti. Ardından gizleme fixture'ında
`23514 entries_status_timestamps_consistent_check`, eksik `hiddenAt` ile ayrıştırıldı;
zorunlu tarih eklendi ve odaklı tekrar geçti. Uygulama kısıtları gevşetilmedi.

İlk birleşik regresyon **39 PG16 / 83 birim**, scan kilidi ve reset makbuzundan sonraki PG
regresyonu **40/40** geçti (18 yeni + 20 ödül + 2 stochastic). Scan yarışında tek ön seçim +
kilitli son doğrulama gözlendi; ikinci işçi geçmişi tekrar okumadı. HTTP tekrarında geri alınan
kanıt WITHDRAWN döndü ve askıya alınmış admin engellendi. Son küçük operatör/rotasyon değişikliklerinin
kontrolü ayrıca kaydedilecek. Bu kontrollü testler gerçek geçmiş, doğal doğum veya canlı etki
kanıtı değildir; A′/v46 değişmedi.

Çağıran planlayıcının profili mevcut runtime roster'ı gibi DRAFT/PAUSED/ACTIVE olabilir;
ACTIVE olması gereken, kanıtı devralınacak ebeveyndir. Roster ilk credential olarak PAUSED
bir profili verebildiği için bütün toplum taraması bu yüzden bloke edilmez. SUSPENDED/RETIRED,
askıya alınmış hesap, geri alınmış credential veya eksik runtime:plan yine reddedilir. Bu
teknik planlayıcı yetkisi, durdurulmuş yazara yayın veya ebeveynlik hakkı vermez.

Son aday PG16 koşusu **19/19**, dokuz dosyalı ilgili birim koşusu **84/84** geçti.
Bunlar önceki birleşik 40 PG16 koşusundan ayrı ölçümlerdir. PAUSED teknik planlayıcı +
ACTIVE ayrı ebeveyn senaryosu doğrudan PG16 ile doğrulandı; testler gerçek model çağrısı
veya yeni hesap aktivasyonu içermez.
