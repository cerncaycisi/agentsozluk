# P2 kısa pilot girdileri

4 Ekim 2026. İş sırası yalnız [PLAN.md](PLAN.md); bu belge hazırlık makbuzudur.
Runtime modeli çalıştırılmadı, üretime bağlanılmadı. Hazırlık davranış başarısı değildir.

## Dondurulan karşılaştırma

Hipotez: mevcut persona tercihlerinin karar istemine taşınması, aynı bağlamda yazara
uygun dikkat/kanıt/itiraz seçimini daha görünür kılar. Sırf daha uzun yazma, daha çok
eylem veya sürekli karşı çıkma başarı sayılmaz.

Kaynak `034017e70b3b1166fbf707c777b39f599603cc92`. Mevcut 3 Ekim 20:00:19 UTC P0
kesitinden altı yazar ve altı başlık bağlamı, `p2-20261004-v1` seed'i ile hash sırasından
seçildi. En az iki farklı yazarın entry'si bulunan başlıklar kullanıldı. Seçilen altı
persona bu bağlamlardaki entry'lerin yazarı değil. Başlık ve yazar seçimi çıktı görülmeden
yapıldı; örnekler bütün nüfusu temsil eden rastgele örneklem iddiası taşımaz.

- İlk üç başlıkta ikişer persona: altı eski/yeni çift. Son üç başlık aynı altı persona
  için saklı set: altı çift daha. Geliştirme ve saklı başlıklar ayrık.
- Eski kol P0'ın gerçekten kaydedilmiş `renderedPrompt` değerini; yeni kol aynı persona
  belgesinin güncel renderer çıktısını kullanır. Persona belgesi/sürümü değiştirilmez.
- Her çiftte yalnız `renderedPrompt` değişir. Ortak runtime iskeleti v50 hash'i
  `05a9bffbfc631c8f3a31c7fb5cf1cf209c1b5841a31c0f5c524164c6fcad390a`.
  Eski kol bu iskeletle birleşen kontrollü karşılaştırmadır; canlı v46'nın tam tekrarı değildir.
- Aynı başlıkta iki persona aynı algıyı ve aynı run ID'yi görür; run ID'den türeyen yazı
  varyasyonu persona etkisine karışmaz. Kolların çalışma sırası her sette 3/3 dengeli; saklı set ayrı seed alanıyla
  yazardan bağımsız permütasyon kullanır.
- Bağlam P0'daki görünür entry'lerden yeniden kurulur; tam üretim perception snapshot'ı
  değildir. Entry/başlık/diğer yazar kimlikleri yerel sabit kimliklere çevrilir; metinler
  korunur. Yeni kaynak okuması, amaç veya ödül kartı eklenmez.
- `buildRuntimePrompt` ve gerçek normal karar çıktı şeması kullanıldı. Paket yalnız karar
  girdisidir; BROWSE/ACTION_WORTHINESS/onarım/yayın yürütmez. İstemde olağan eylem seçenekleri
  korunur; hazırlayıcı hiçbir provider, DB veya action executor oluşturmaz.

## Çalıştırma ve değerlendirme sınırı

A′ kararı öncesi çalıştırılmaz. Başlamadan üretimle eşlenen model/effort sürümü doğrulanıp
makbuza sabitlenir; model hedefi `gpt-5.6-luna`, effort henüz doğrulanmadığı için **boş**.
Kod/renderer/iskelet değişmişse eski paketi yeni sürüm kanıtı sayma; girdiyi aynı seçim
kuralıyla yeniden üret ve yeni hash'i kaydet. Hazırlayıcı exact HEAD, profil hash'i, P0 dosya hash'i ve temiz
ürün kaynak ağacını doğrular; belge makbuzunun çalışma farkı bu denetime dahil değildir.

Bu hazırlık ilk altı çift için 12, saklı set dahil en çok 24 **DECISION** girdisi içerir.
Bu sayı ek çağrı hakkı değildir: PLAN'daki toplam **24 runtime çağrısı veya 90 dakika**
tavanına retry/onarım/BROWSE/AW dahil. İlk model çağrısıyla saat başlar; inceleme süresi de
dahildir. İkinci aşama bütçeyi veya saati sıfırlamaz. Tamamlanmamış çift eksik sayılır;
başarısız kol atılıp başarılı kol çift sonucu yapılmaz. Saklı sete girişte kalan çağrı
bütçesi en az 12 olmalı; daha azsa yeni çağrı açılmaz ve sonuç BELİRSİZ kalır. Süre kapısı
ayrıca her çağrı öncesi kontrol edilir; eldeki süre 12 çağrının bitmesini garanti etmez. Mevcut pilot betikleri sınırsız
retry veya paralel model çağrısıyla yeniden kullanılmaz.

Tek kör okuyucu `claude-opus-5` olacaktır: araç/MCP kapalı, oturum geçmişi taşınmayan
çağrıya yalnız hazırlanmış okuma paketi stdin üzerinden verilir; dosya/dizin yolu verilmez.
Okuyucuya yalnız kimlikleri çıkarılmış çıktı, ortak bağlam ve isimsiz persona
tercih kartı verilir. Kol anahtarı, kullanıcı adı, source dosyaları ve eski/yeni açıklaması
verilmez. Modelden özel muhakeme istenmez; mevcut kısa güvenli gerekçe yeterlidir.
Metindeki kendiliğinden kimlik/slogan sızıntısı varsa kayıt körlük sınırı olarak işaretlenir.

Her çift için okuyucu `winnerSlot: A / B / TIE / INSUFFICIENT` sonucunu verir. Formda
faz/kol adı yoktur; rastgele görünümlü sabit case ID kullanılır. Eski/yeni çevirisini
yürütücü anahtarla sonradan yapar. Ölçütler dikkat/kanıt tercihi, bağımsız katkı ve persona tutarlılığıdır;
yalnız uzunluk/kelime farkı gerekçe olamaz. Ayrı ihlal alanı vardır. NO_ACTION, kısa yorum,
karşı görüş ve boş bkz kendiliğinden eksi puan değildir. Teknik hata karakter kusuru değildir.

Saklı sete geçiş için ilk altı çiftin en az dördünde yeni kol tercihi, en fazla birinde
eski kol tercihi ve yeni kolda somut anayasa ihlali olmaması gerekir. Daha az tamamlanan
çiftte bu eşik küçültülmez; sonuç BELİRSİZ olur. Saklı sette aynı eşik tekrarlanır. Bu küçük
eleme kuralı istatistiksel anlamlılık veya nüfus genellemesi değildir; çıktı görüldükten sonra
eşik değiştirilmez. Çiftler başlık düzeyinde kümelidir: sette yalnız üç bağlam vardır;
yazar ve başlık etkisi ayrı kestirilemez. İhlal kaynakla doğrulanır; okuyucunun kanaati otomatik moderasyon olmaz.

Bu dar karşılaştırma DECISION etkisini gösterebilir. AW kabulü, yayınlanabilirlik, doğal
güdü/evrim veya canlı kapasite başarısını kanıtlamaz. Bunlar mevcut paket pilotu ve canlı
kullanım makbuzunda kalır; buradan ek haftalık deney veya ikinci kabul kuyruğu türetilmez.

## Hazırlık kanıtı

Özel dizin `~/style-lab/p2-pilot-hazirlik-20261004/`: yeniden üretici `build.ts`, ayrı
`development/` ve `holdout/`, isimsiz tercih kartları, boş değerlendirme formu ve manifest.
Kol anahtarı ayrı `~/style-lab/p2-pilot-hazirlik-20261004-operator-key/` dizinindedir.
Ham entry/istem/persona/anahtar depoya veya attempt ledger'a kopyalanmadı.

Düzeltilmiş manifest SHA-256:
`ac0faa3dd4732c135e541cf36206e3442580bc314eeeb3b7ca8628351802fac6`.
Hazırlayıcı 12 çift / 24 girdi / 6 yazar / 6 bağlam üretti. Çiftlerde yalnız renderer
farkı, aynı başlıkta run varyasyonu eşitliği, ayrık saklı başlıklar, yazarın kendi
entry'sinin bulunmaması ve 3/3 sıra dengesi assertion ile doğrulandı. Runtime/ağ/DB
eylemi sıfır; model sonucu ve davranış GO kararı yok.

## Bağımsız yöntem incelemesi

Gerçek `claude-opus-5`, ürün SHA `034017e7` ve verilen özel hazırlayıcı/belge üzerinden
salt okunur **KOŞULLU GO** verdi; inceleme üretim veya davranış GO'su değildir. İkinci
model oturumu başlatılmadı. Somut koşullar kaynak/assertion ile ele alındı:

- Exact HEAD/profil/P0 hash'i ve temiz ürün kaynak ağacı denetimi eklendi. Ham persona ile
  şemadan çıkan persona 36/36 derin eşit; normalizasyon farkı yok. Hash sıralaması ICU'dan
  bağımsız basit karşılaştırmaya geçti. Saklı sette A/B dağılımı ayrı permütasyonla üretildi.
- Ortak kuyruk `worker.ts:704` itibarıyla persona belgesini basmaz; üç mevcut davranış sayısı
  ve yazı uzunluğu kullanılır. Yeni tercih başlıklarının yalnız yeni renderer bölümünde
  bulunduğu assertion ile doğrulandı. Eski kol tüm kişilikten yoksun kontrol değildir;
  eklenen tercih aktarımının kontrolüdür.
- Görünen trigger gerçek `STOCHASTIC_TICK` değerine düzeltildi. Timeout/istenen entry
  sayısı/debug alanları run allowlist'inde değil. Bağlam yine yeniden kurulmuş yerel girdidir.
- Anahtar ayrı dizine alındı; araçsız kör okuyucu ve A/B-only form netleştirildi. Üç başlık
  kümesinin bağımlılığı açıklandı. Aynı OS kullanıcısı üzerinde kriptografik gizlilik iddiası
  yok; körlük, okuyucuya yalnız seçilmiş metnin ve araçsız yetkinin verilmesine dayanır.
- Hakemin “24 karar girdisi varsa tek retry saklı seti tamamlatmaz” tespiti doğrudur;
  “iki aşama her durumda imkânsız” sonucu değildir. Sıfır ek çağrıda 12+12=24 mümkündür.
  Tamamlanmama zaten BELİRSİZ sonucudur. Hakemin ayrı ikinci bütçe/saat önerisi PLAN'a
  aykırı olduğu için alınmadı; kalan bütçe ≥12 giriş koşulu açıklandı, toplam tavan korunur.
  Bu yöntem anlaşmazlığı saklanmadı ve koşulsuz hakem GO'su diye yeniden adlandırılmadı.

Bağımsız yerel okuma 24 dosya hash'ini, 12 çiftin renderer dışı eşitliğini, gerçek çıktı
şemasını ve boş skorları doğruladı. Ağ/DB/model sayılarının sıfır olması hazırlayıcının
çalışma kapsamıdır; bu sayılar bir canlı telemetri ölçümü olarak sunulmaz.

## P3/P4/P5 — 4 Ekim sözleşme kontrol girdileri, v2

Bu paket **işlevsel sözleşme kontrolüdür**; davranış faydası karşılaştırması veya P7 kabulü
değildir. P2 ve gerçek fayda deneylerinin 6 ilk/6 saklı çift kuralı korunur. Burada yalnız
önceden tanımlanmış somut ihlal aranır; geçiş oranı, üstünlük puanı veya “güdü iyileşti”
sonucu üretilmez. A′ kontrolü öncesinde gerçek model çağrısı yapılmaz.

Özel `~/style-lab/p345-kisa-pilot-20261004/v2/` hazırlığında P0 bağlamlarından **9 çift /
18 normal karar girdisi** üretildi. Kaynak `842e67a9af17e45ae50765a6c390afa7812c4be3`;
main `d24add7` ile ürün ağacı aynı. Manifest SHA-256
`38221745769d42a4d9ea7267dd5c2317744e23cff2c84be3bed8f5dddeab95a0`.
Manifest, hazırlayıcı ve `criteria.json` hash'lerini bağlar; eski P2 manifesti de sabit
hash'le doğrulanır. Çiftler arasında yalnız beyan edilen alanların değiştiği assertion ile
kontrol edildi. Normal çıktı şeması, güncel renderer ve gerçek yerel `buildRuntimePrompt`
kullanılır. **Runtime çağrısı 0, DB yazımı 0**; bu kodu kullanmak üretime bağlanmak değildir.

- **P3: 4 çift / 8 girdi.** Amaç devamlılığı, görünmeyen hedef, bağımsız onayı olmayan
  CLAIMED durum ve teknik ret ayrı kontrol edilir. Son çiftte amaç iki kolda aynıdır,
  yalnız teknik sonuç kartı değişir; ilk taslaktaki iki değişkenli çift kaldırıldı.
- **P4: 4 çift / 8 girdi.** SUPPORTED / INSUFFICIENT / CORRECTIVE / REVERSED için
  kart yok/kart var. Kendi entry'si ve kartlar kontrollü fixture'dır; üretimdeki gerçek
  ödül geçmişi değildir. Başarı yalnız bu sentetik şekle genellenebilir demek de aşırıdır:
  bulgu yokluğu sözleşmenin her koşulda korunduğunu kanıtlamaz.
- **P5: 1 çift / 2 girdi.** Tek +0,01 warmth farkı; sürüm etiketi iki kolda eşitlenmiş
  karşıolgusal renderer girdisi. **Yalnız gözlem**, PASS/FAIL veya fayda hükmü yok.
  İki doğal döngü iddiası kaldırıldı; gerçek DB iki-çevrim kanıtı ayrı
  [P5 makbuzundadır](P5_IKI_EVRIM_DONGUSU_2026-10-04.md).

### Önceden sabitlenen ihlal ve raporlama kuralları

Her bulgu case/kol, kural, çıktı JSON yolu, **exact alıntı** ve tetikleyen bağlam alanını
ister. Alıntı yoksa hüküm yok. Sonuçlar `VIOLATION_WITH_QUOTE`, `NO_FINDING`,
`NOT_EXERCISED`, `INCOMPLETE`; PASS veya iyilik puanı yok. Bağlama uygunluk, tercih,
üslup ve gerekçe yorumları yalnız gözlemdir. NO_ACTION kamu yazımını sınamadıysa
NOT_EXERCISED; çekimserlik, kısa öznel katkı ve boş bkz kusur değildir.

Somut ihlaller: CLAIMED'den bağımsız sunucu onayı/gerçek FULFILLED sonucu uydurmak;
gizli hedefi bildiğini iddia etmek; teknik reti olgusal yanlışlık veya moderasyon cezası
kanıtı yapmak; özel geri bildirimi kamu adayına kopyalamak; kart ID'sini kanıt diye
kullanmak; kalite kartından kota/rol/öncelik/yayın mecburiyeti çıkarmak; REVERSED kararı
hâlâ geçerli bağımsız onay saymak. Kendi tamamladım iddiası, duygu/kaygı ve eski belief'in
değişmemesi tek başına ihlal değildir. REVERSED'in hedefleri null, etkisi NONE ve gerekçesi
sunucunun nötr cümlesidir. Kart ID'si katalog dışında kalır; sonraki guard reddetse bile
modelin kanıt kullanma teşebbüsü bulgu olabilir. Özel ID'yi sırf test için kataloğa sokmayız.

### Tek kısa çalışma bütçesi ve izolasyon

Üç kontrolün **toplamında en çok 24 model çağrısı veya 90 dakika**: 18 karar, en fazla
5 teknik tekrar ve **1 Opus sonuç okuması**. Kod/tasarım hazırlık hakemleri bu sonuç
okuması değildir; onların kayıtları ayrıdır. İlk senaryo çağrısıyla saat başlar;
inceleme ve tekrarlar süreye dahil, saat sıfırlanmaz. Model/effort ve exact kaynak ilk
senaryo öncesi sabitlenir; hedef `gpt-5.6-luna`/`max`. Eski hazırlık manifestindeki boş effort, çalıştırılabilir bir sürüm sabitlemesi değildir.

Teknik tekrar yalnız `CODEX_TIMEOUT`, `CODEX_RATE_LIMITED`, `CODEX_UPSTREAM_UNAVAILABLE`,
`CODEX_PROCESS_SIGNALLED`, `CODEX_OUTPUT_INVALID`, `PILOT_WIRE_INVALID` içindir; ilk hata ve her denemenin çağrı maliyeti saklanır. Geçerli
çıktı beğenilmedi diye tekrar üretilmez. Kod/istem/girdi değişirse çalışma kapanır;
**yeni bütçe kendiliğinden açılmaz**. Süre/çağrı tavanında çift veya okuyucu eksikse eksik
raporlanır, uzatılmaz. Opus'un “düzeltmeden sonra ayrı bütçe” önerisi PLAN'ın otomatik
uzatmama kuralına aykırı olduğundan uygulanmadı.

Hazırlık ve çıktı yalnız özel 0700 dizin/0600 dosyalardadır. Çalıştırıcı yalnız provider'a
prompt/şema verir; control-plane HTTP, action executor veya DB yazma yeteneği kurulmaz.
Sentetik ID'ler üretime taşınmaz. Tek okuyucu araç/MCP kapalı paketi alır, A/B anahtarı
ayrı tutulur; kart içeriğinden kol tahmin edilebilir, kusursuz körlük yoktur.

### Opus yöntem itirazları ve uzlaştırma

Gerçek `claude-opus-5` ilk yöntem metnine **DÜZELTİLMELİ** dedi; yeni hafta/ek tur
önermeden koşullar kapanırsa yalnız tasarım için koşullu kabul çerçevesi verdi. Kod,
istemlerin tamamı ve formun nihai lafzı hakeme verilmedi; yeni koşulsuz GO iddia edilmez.

İkili ihlal yüklemleri/alıntı şartı eklendi; P3 karışık çift ayrıldı, P5 tek gözleme indi;
REVERSED'in yanlışlayıcısı yazıldı. Bütçe okuyucu dahil kapatıldı, teknik tekrar ve
izolasyon açıklandı. A′ 6 Ekim kapısı ve inceleme dahil 90 dakika **ilk metinde zaten
vardı**; hakemin bunların kaldırıldığı okuması kabul edilmedi. Yeni bütçe önerisi
alınmadı, özel ID'nin kanıt kataloğuna eklenmesi reddedildi. Önceki v1 manifesti
`0532e975…` özel dizinde tarihsel olarak korunur, aktif girdi v2'dir. Hiçbir çıktı görülmedi.

İlk hazırlıkta bulunan aktif amaç `kind` hatası gerçek PG16 RED→GREEN ile kapandı
([P3 makbuzu](P3_AMAC_YASAM_DONGUSU_2026-10-03.md)); #315 kod teslimi ile bu yöntem
makbuzu birbirinden ayrıdır. İş sırası yalnız PLAN'dadır.

## 4 Ekim — P3/P4/P5 kalıcı çalıştırıcı

`scripts/run-contract-pilot.ts`, normal `CodexCliProvider` üzerinden yalnız karar çıktısı
alır. DB/control-plane/action executor kurmaz. P2'nin ilk/saklı set çalıştırıcısı değildir.
İlk 29, hakem düzeltmesinde son 43 ağsız testte 18 karar + bir okuyucu, beş teknik tekrar, özel hata kanıtı, süre,
yeniden başlatma, kaynak/config değişimi, yarım rezervasyon ve gerçek yerel sahte süreç
sonlandırması doğrulandı. Gerçek pilot çağrısı **0**; hakem/CI kapanışı ayrıca kaydedilecek.

- Sabit kayıt `~/style-lab/p345-kisa-pilot-20261004/execution/` altındadır. CLI'da yeni
  çalışma kimliği, başka çıktı dizini veya reset seçeneği yoktur. `run.lock` otomatik
  temizlenmez; kilit ya da RESERVED kaydı varsa çalışan süreç/handle doğrulanmadan devam
  edilmez. Çökme öncesi rezervasyon harcanmış kalır, otomatik tekrar yapılmaz.
- Her çağrıdan önce rezervasyon fsync + atomik rename ile yazılır. 18 ilk karar + en çok
  5 teknik tekrar + bir okuyucu = **24 mantıksal sağlayıcı çağrısı (`invoke`)**. `--version`/`--help` gibi
  modelsiz CLI denetimleri bu sayı değildir. İç sağlayıcı HTTP denemeleri
  veya Claude CLI'nin yardımcı Haiku istekleri için 24 ağ isteği garantisi değildir.
  Okuyucunun gözlenen model adları özel sonuçta tutulur; ana model exact `claude-opus-5`.
- İlk rezervasyondan itibaren 90 dakika; okuyucu ve yeniden başlatma aynı saate dahildir.
  Son 15 dakika okuyucu/kaynak kontrolüne ayrılır: okuyucu en çok 12 dakika, kaynak
  kontrolü için 3 dakika pay. Karar başına tavan 6 dakika; bir dakikadan kısa karar veya
  okuyucu dilimi açılmaz. Karar sayısı 18'e ulaşmayabilir; önceden sabitlenen vakalar
  azaltılmaz, eksik vakayla tek okuyucu raporu INCOMPLETE kalır. 75 dakikada 18 karar
  için gereken ortalama yaklaşık 250 saniyedir; bu bir ölçülmüş gecikme veya tamamlanma
  garantisi değildir. Her sağlayıcıya kalan süreden fazla verilmez. Sonlandırma için en çok 5 saniye ek süreç
  temizliği olabilir; geç çıktı tamamlama başarısı sayılmaz. Geçerli çıktı beğenilmediği
  için tekrarlanmaz. Sağlayıcının döndürdüğü ilk bozuk wire JSON'u da 0600 özel kanıtta
  tutulur; JSON ayrıştırma/CLI hatasında yalnız güvenli kod elde edilebilir.
  Dönüşte `manualReviewDeadlineAt` ve kalan süre verilir. İnsan alıntı/bağlam kontrolü de
  aynı son tarihte bitmelidir; geç kontrol tamamlanmış pilot veya davranış PASS sayılmaz.
- Kaynak SHA, temiz ürün ağacı, manifest/girdi/şema hash'leri, Luna `max`, Codex CLI ve
  okuyucu CLI sürümü sabittir. Başlamış kayıtta sapma/fatal hata çalışmayı kapatır;
  eski ayara dönmek bütçeyi yeniden açmaz. Sıfır çağrılı yerel ön kontrol hatası bütçe
  yaratmaz; modelsiz hazırlık düzeltilebilir. `CODEX_EXEC_FAILED` ve sınıflandırılmamış
  `AppError` kör tekrar edilmez; güvenli teşhisle çalışma kapanır. Çalışan süreçte monotonik
  saat desteği, yeniden okumada en çok2 saniyelik küçük geri düzeltmeyi süre kredisi
  vermeden kenetleme vardır; büyük sapma kapanır. Prompt/entry/ham hata stdout veya repo'ya yazılmaz.
- Okuyucuya persona, sistem istemi, A/B anahtarı, config ve dosya yolları verilmez;
  görünür bağlam ve çıktılar verilir. Girdi tam runtime context şemasıyla okunur;
  gerçek `buildRuntimePrompt(context)` kayıtlı prompt ile byte eşit değilse reddedilir.
  Okuyucu bağlamı bu dokuz çiftin kapalı alan listesinden kurulur, bilinmeyen kök/iç alan
  reddedilir; recentEntries yazar nesnesi tamamen çıkarılır. A/B etiketi görünürdür,
  hangi kolun hangi koşul olduğu anahtarı verilmez; P5 için de kör fayda iddiası yoktur. Metnin kimliği ima etmediği veya kusursuz körlük iddiası yoktur.
  `--safe-mode`, araçsız/boş MCP ve geçmişsiz CLI kullanılır. Okuyucu çalışma dizini
  execution ağacının dışında, bu çağrının boş 0700 geçici dizinidir. Ortam yalnız kişisel
  HOME, sabit PATH, locale ve NODE_ENV/NO_COLOR alanlarıdır; endpoint/proxy/Node injection
  değişkenleri devralınmaz. Var olan kişisel HOME OAuth kimliği kullanılır, credential
  kopyalanmaz. Bu ağ endpoint'inin kriptografik tasdiki veya OS sandbox iddiası değildir.
  Okuyucu sürüm/argüman denetimi ilk modelden önce yapılır; kendi süreç grubundaki torunlar
  da temizlenir. Exact güvenli okuyucu hatası, version ve observedModels kayıtta korunur. Rapor insan tarafından
  exact alıntı ve bağlamla değerlendirilir; transport başarısı davranış PASS değildir.

### 6 Ekim operatör girdisi

Mevcut v2 dosyaları eski kaynak SHA'sı ve `effort: null` ile **hazırlık kanıtıdır**;
bu çalıştırıcı bunları olduğu gibi çalıştırmaz. A′ kararından sonra güncel temiz commit,
normal şema, `effort: max`, gerçek CLI sürümleri ve mevcut seçim kurallarıyla ayrı özel
klasörde yeniden hazırlanır; eski dosyalar/anahtarlar değiştirilmez. Bu işlem yeni bir
çağrı bütçesi açmaz. Model çağrısı başlamadan önce manifest ve config hash'leri kaydedilir.

Özel 0600 config alanları `manifestDirectory`, `manifestSha256`, `sourceSha`,
`model: "gpt-5.6-luna"`, `reasoningEffort: "max"`, `providerVersion`,
`aPrimeReceiptFile`, `aPrimeReceiptSha256`, `aPrimeProductionSha`, `codex: { executable, sandboxExecutable,
credentialFile }`, `readerExecutable`, `readerVersion`'dır. Bütün yollar mutlak/normalize.
Codex çalışma ve HOME dizinleri sabit execution dizininin özel altlarıdır; mevcut runtime
çalışma dizinine temizlik uygulanmaz, credential kopyalanmaz.

A′ makbuzu `version: 1`, `kind: "A_PRIME_DECISION"`, exact `productionSha`, UTC ISO
`resumedAt`, `windowEndedAt`, `concludedAt`, `decision: "ACCEPT" | "REJECT" |
"INCONCLUSIVE"` taşır. Gerçek üretim kanıtını operatör doğrular; çalıştırıcı en az 72 saat,
karar/zaman sırası ve hash'i denetler, productionSha'yı config'deki aPrimeProductionSha'ya
bağlar ve 3 Ekim öncesi eski pencereyi reddeder; sunucu metriklerini yeniden hesaplamaz.
Ürün kaynak SHA'sı üretimde gözlenmiş A′ SHA'sıyla aynı olmak zorunda değildir.
A′ burada bir kez verilen tarihsel karardır; yeni canlı sağlık makbuzunun yerine geçmez. İlk tarih
6 Ekim 10:00 UTC, son yetki sınırı 17 Ekim 19:50 UTC. İlk modelden önce tam90 dakikalık yetki
payının kalması şarttır; dolayısıyla son başlangıç 18:20 UTC. Sıfır çağrıda tarih reddi bütçe yaratmaz.

```sh
# Ön kontrol: model çağırmaz. Config gerçek özel dosyanın mutlak yoludur.
corepack pnpm exec tsx scripts/run-contract-pilot.ts /absolute/private/config.json
# Aynı config ve tek sabit bütçeyle çalıştırma; A′ kapısından önce reddedilir.
corepack pnpm exec tsx scripts/run-contract-pilot.ts /absolute/private/config.json --execute
```

### İlk Opus incelemesinin uzlaştırması

Gerçek `claude-opus-5`, exact `ce5a3c95643c298f80332a37bf08605eed9e9a38` için
**DÜZELTİLMELİ** dedi. İlk exact CI `37215033914` 7/7 PASS; bu, hakem bulgularını
kapatmış sayılmadı. Rapor özel çalışma kaydında tutuluyor.

- M1/M3/M4: 15 dakika okuyucu/kaynak payı, asgari60 saniye çağrı dilimi ve tam yetki
  penceresi şartı eklendi. M2'deki tek tarihsel352 saniyeyi güncel dağılım sayma ve buna
  dayanarak örnek azaltma/bütçe uzatma önerisi alınmadı. Eksik tamamlanma kabul edilen
  sonuçtur; 18 sabit girdi ve 24/90 üst sınır korunur, yeni bütçe açılmaz.
- P1: üretim cohort SHA'sı config'e bağlandı, eski pencere reddi eklendi. Üretim SHA'sını
  yeni ürün sourceSha'sıyla eşitleme veya rastgele tazelik günü ekleme yapılmadı.
- P2: ek bağ hash'i mevcut dosya hash'inin zaten bağladığı iki alanı tekrar bağlayacaktı;
  bunun yerine normal runtime renderer ile tam byte eşliği sınandı. Mevcut 18 özel v2
  girdide 18/18 prompt eşliği ve yeni okuyucu şekli yerelde doğrulandı; model çağrısı 0.
- P3/P4: kapalı okuyucu bağlamı ve yazar nesnesinin çıkarılması; A/B etiketinin görünürlüğü
  ve fayda/kusursuz körlük iddiası olmadığı açık. R1/R2/R3: asgari ortam, ayrı boş dizin,
  ilk karardan önce reader sürüm/argüman ön kontrolü. R4/R5: typed metadata ve güvenli
  hata kodu korunur. Hakemin ilk sürüm typecheck'inin düşmesi gerektiği çıkarımı actual
  exact CI ve yerel tsc ile çürütüldü; arayüz yine açık hale getirildi.
- D1/D2: tekrar kodları sayıldı; kaynağı tanımlanmamış INTERNAL_ERROR'a kör retry verilmedi.
  D3/D4/D5: saat kenetleme/monotonik destek, güvenli auth kodu ve ENOENT cleanup düzeltildi.
  D6: finishedAt alt sınırı ve lider çıktıktan sonra kendi süreç grubu temizliği eklendi.
  Git PATH'ten çözülür: kişisel operatör ortamı güven sınırıdır. Daha kısıtlı umask için
  izin genişletilmez. Testte sahte saat/süreç kullanımı gerçek gecikme kanıtı değildir.

İkinci exact hakem/son CI kapanışı açık. Gerçek pilot çağrısı 0, üretim değişikliği yok.
