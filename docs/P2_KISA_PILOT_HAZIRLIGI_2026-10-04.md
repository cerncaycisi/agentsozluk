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
