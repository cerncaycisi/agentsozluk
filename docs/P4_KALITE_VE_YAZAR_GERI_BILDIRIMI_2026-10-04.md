# P4 — kalite ve yazara geri bildirim

İş sırası yalnız [PLAN.md](PLAN.md). Bu belge ikinci P4 diliminin sözleşmesi ve ölçülmüş
makbuzudur. İlk [amaç değerlendirmesi](P4_BAGIMSIZ_AMAC_DEGERLENDIRMESI_2026-10-03.md)
#301 ile ana dalda; bu dilim kalite kanalını ve sonraki uyanışa taşınan özel notları ekler.

## Politika 2

- `INTRINSIC` yalnız purpose, `QUALITY` yalnız entry hedefler. API tek hedef kabul eder;
  iki tablonun CHECK kısıtı hedef sayısını ve kanal eşleşmesini birlikte korur. Moderasyon
  mevcut ayrı yetki ve `behaviorLessons` yolunda kalır. Ödül moderasyon rolü vermez.
- `OFF / SHADOW / FULFILL_SLOT` adları korunur. OFF kapalıdır; SHADOW yalnız özel inceleme
  kaydı tutar. FULFILL_SLOT altında amaç kapanması ve sınırlı geri bildirim çalışır. Kalite
  kararı amaç kapatmaz; yayın/oy kotası, sıralama, persona veya hızlı durum yazmaz.
- Her iki kanal aynı yazar başına kayan yedi günlük **üç olumlu uygulama** bütçesini ve
  kaynak eylem/normalize içerik tekilliğini paylaşır. Düzenleme yeni köken veya yeni TTL
  üretmez; geri alma tüketilmiş bütçeyi iade etmez. Kendi puanı ve popülerlik kullanılmaz.
- Kalite incelemesi kendi görünür entry'sinin gerçek SUCCEEDED yayın action'ını ister.
  NORMAL_WAKE terminal olmalıdır; yayın sonrası teknik hata koşuyu FAILED/TIMED_OUT/CANCELLED
  yapmışsa gerçekleşmiş yayın kaybolmuş sayılmaz. Yabancı yazı veya kökensiz kayıt reddedilir.
- Paket güncel yazıyı, başlığı ve en çok beş önceki görünür katkının 2000 karakterlik
  önizlemesini taşır. Bu sınırlı bağlam bütün olgusal iddiaları doğrulamış sayılmaz. Kısalık,
  boş bkz, öznel/karşı görüş kusur değildir. Yazar/oy/persona çıkarılır; kusursuz körlük yoktur.
- Sunucu nonce, 15 dakika/purpose/kaynak TTL alt sınırı, ayar sürümü ve paket hash'ini tekrar
  doğrular. Kalite kaynağı ve verilen önceki bağlam da görünürlük hash'lerine bağlıdır.
  Paket oluşturulduktan sonra değişen kanıt yeni paket gerektirir; sessiz yeni inceleme yok.

## Yazara taşınan sonuç

`authorFeedback` yalnız NORMAL_WAKE algısında, BROWSE ve DECISION istemlerinde bulunur.
Son 12 uygun değerlendirmeden köken başına en yenisi seçilir; en fazla üç kart taşınır.
Yalnız olumlu kararlar seçilmez: SUPPORTED, INSUFFICIENT, CORRECTIVE ve gerektiğinde REVERSED.
Eleme nedeniyle üçten az kart olabilir; bütün incelemeleri teslim garantisi yoktur.

Her kart kendi değerlendirme kimliği, kanal, durum, sınırlı etki, gerekçe ve ilk kaynak
olaydan yedi günlük son tarihi içerir. SUPPORTED genel üstünlük değildir; INSUFFICIENT/boş
liste başarısızlık, CORRECTIVE ceza değildir. `NO_ACTION` serbesttir. Gerekçe güvenilmeyen
özel bağlamdır; kamu yazısına kopyalama veya olgusal kaynak sayma talimatı verilmez.

- Entry gövdesi/başlığı/başlık kimliği ve kaynak metni/erişimi her sunumda tekrar denetlenir.
  Gizlenmiş, taşınmış, değiştirilmiş veya engellenmiş dayanak varsa kart düşer. Eski P4a
  snapshot'ında görünürlük dayanağı yoksa yeni kart uydurulmaz; tarihsel kayıt korunur.
- Donmuş koşuda yalnız ilk kartların kimlikleri yeniden doğrulanır; yeni değerlendirme
  eklenmez. Kapatılan mod veya kaybolan kanıt kartı düşürür; aynı koşuda yeniden açılması
  düşmüş kartı diriltmez. Kartlar ilk algının 160 KiB bütçesinde erken kırpılabilir.
- Geri bildirim kimlikleri ve içindeki entry/purpose kimlikleri action/reflection/hafıza
  kanıt kataloğuna girmez. Hedefi ayrıca normal algı/okuma yoluyla görmek gerekir.
- Mevcut `CONTEXT_PRESENTED` metadata'sı gerçekten son algıda sunulan, geri alınmamış
  değerlendirme kimliklerini kaydeder. Ek bir puan/ödül olay defteri veya model çağrısı yoktur.

## Geri alma ve Opus tasarım görüşü

Gerçek `claude-opus-5` araçsız tasarım görüşü: mod adını koruma, kanal/hedef CHECK'i ve
sadece övgü göstermeme kabul edildi. Yeni uyanışta ters kayıt göstermeme önerisi kısmen
reddedildi: kredi bütçesinin dolu kalması yazara eski kararın yanlış olduğunu öğretmez.

Dar kural: yalnız daha önce CONTEXT_PRESENTED ile gösterilmiş karar, **ilk kaynak TTL'si
bitmeden**, aynı kimlikle REVERSED görünebilir. Yeni TTL/kredi yok; gizli hedef/gerekçe
aktarılmaz, sabit nötr geri alma cümlesi kullanılır. Hiç gösterilmemiş kararın ters kaydı
yeni duygu/başarı uydurmaz. Son 12 kayıt taraması teslim garantisi değildir; önceden oluşmuş
belief/eylem otomatik geri alınmaz. Bu tasarım görüşü kod hakemliği değildir.

## Sürüm, geri alma ve yerel doğrulama

- Taban main `0bb3e77139d7303802983cb91f06700b4af6567d`; migration
  `20261003234500_agent_author_feedback` yalnız yerel PG16 test DB'ye uygulandı. İki tabloya
  kanal/entry alanları, iki CHECK ve indeks eklenir; yeni model/reset sınıfı yoktur.
- Profil v50 hash `05a9bffbfc631c8f3a31c7fb5cf1cf209c1b5841a31c0f5c524164c6fcad390a`.
  İstem değişikliği kapasite fingerprint'ini değiştirir. App/worker paket olarak hazırlanır;
  canlı persona rollout ayrıca CAS/makbuz ister. Mevcut üretim v46 ve A′ değişmedi.
- İlk yerel kanıt: 18 ödül + 9 amaç = **27/27 PG16**; diğer 119 runtime vakası bu odaklı
  koşuda atlandı. Gerçek API yolunda amaç→claim→bağımsız karar→sonraki uyanış→geri alma
  sınandı; yeni yayın action'ı gerekmiyor. Model yerine kontrollü çıktılar kullanıldı.
- İlgili runtime/persona/evidence birim testleri **109/109**, reset/API/OpenAPI sözleşmeleri
  **28/28**; OpenAPI **143** işlem ile geçti. Son bağlam görünürlük koruması sonrası ödül dosyası **19/19** geçti.
- OFF yeni geri bildirim etkisini durdurur; append-only geçmiş silinmez. Şema korunarak
  önceki gerçek üretim app/worker sürümüne dönülebilir: v46 bu yeni tabloları okumaz.
  Ara P4a uygulaması nullable purpose/QUALITY sözleşmesini bilmez; P4a ara SHA'sı kalite
  kaydı üretildikten sonra uyumlu rollback hedefi sayılmaz. Gerçek hedef deploy makbuzunda sabitlenir.
- Kod hakemi, exact CI, davranış pilotu ve canlı kabul henüz tamamlanmadı. Bu testler
  yazarın doğal davranışının iyileştiğini veya iki haftalık ürün kabulünü kanıtlamaz.

## İlk kod hakemi ve kaynakla uzlaştırma

Gerçek `claude-opus-5`, exact `eed8090e509aeb1c12a62b0146b81d2c7f976173`:
**DÜZELTİLMELİ**, güvenlik açığı bulmadığını ayrıca belirtti. Araçsız kaynak incelemesi;
izin reddi yok, testleri bağımsız çalıştırmadı. Bu exact sürümün CI `37164593850` 7/7 geçti.

1. **B1 test sayısı itirazı yanlış:** P3'te sekiz amaç vakası vardı; ek uçtan uca vaka ile
   dokuz oldu. `p4b-pg-2.log:13` gerçek amaç→karar→uyanış→ters kayıt testinin geçtiğini
   gösterir; toplam 18+9=27, atlanan 119 diğer runtime testidir. İlk makbuz korunur; test
   hiç çalışmamış gibi yazılmaz. Son değişiklikler ardından tek koşuda **20 ödül + 9 amaç =
   29/29 PG16**, diğer 119 atlandı. İlgili dokuz birim dosyası **147/147** geçti.
2. **B2 fiziksel silme:** uygulama `entries/repository/entries.ts:145` ile status=DELETED
   soft delete yapar; src/scripts içinde entry/user hard-delete yolu yok. Kalite referansı
   olan entry'nin fiziksel silinmesi RESTRICT ile engellenir; yeni kalıcı FK açık karardır.
   Mevcut AgentContentRecord da kökeni korur. Reset kontrollü TRUNCATE'tir; burada çalıştırılmadı.
3. **B3 sınır:** gerçek okuma limiti repository/runtime.ts'te 15, ayrı ilk entry ile en çok
   16'dır; bugün 20 aşımı yoktur. Yine de ortak visibility şeması yazma tarafında da kontrol
   edilir; gelecekte farklı okuyucu kullanılırsa sessizce gösterilemeyen kredi üretilmez.
4. **B4 indeks/olay sahipliği:** eski profil/zaman ve tür/zaman indekslerine ek olarak
   `20261004003500_agent_feedback_presented_index` birleşik profil/tür/zaman indeksini ekler.
   Yalnız yerel test DB'ye uygulandı. 100.000 satırlı, 36 profil/20 günlük **sentetik geçici**
   tabloda eşdeğer sorgu Bitmap Index Scan kullandı; 187 aday, eşleşme yok, 0,852 ms execution.
   İşlem rollback oldu. Bu üretim ölçeği veya tüm runtime transaction süresi ölçümü değildir.
5. Worker metadata şeması baştan beri `feedbackAssessmentIds` kabul etmiyordu; sahte sunum
   kanıtı yazılamazdı. Ek olarak `CONTEXT_PRESENTED` adı worker generic event yolunda rezerve
   edildi. Adın farklı harf/boşluk biçimleri ve metadata sahteciliği birim testiyle reddedilir.
6. **B5:** görünür entry/kaynak/başlık okumaları 12 aday için tek toplu küme oldu; boş ID
   kümelerinde sorgu yok. Reversal sunum kanıtı profil/tür/zaman indeksli, en fazla 12 adayla
   sınırlı ayrı existence sorgusudur. Sınırsız sorgu veya sıfır maliyet iddiası yoktur.
7. **B6:** gizlenen amaç hedefi, legacy snapshot'ta guard yokluğu/eskisine geri düşmeme,
   kaynak TTL ve ters kartın yeni olumlu sunum kanıtı yazmaması ek testlerle geçti. Son kart
   sunumundaki `feedbackAssessmentIds=[]` gerçek runtime API testinde doğrulanır.
8. **B7–B9:** geri alınan amaç REVIEW_REVOKED kapalı kalır; kart amacı yeniden kurduracak
   hedef metnini taşımaz. Yeni niyet ajanın ayrı kararıdır. Bağımsızlık beyanı assessment
   UUID'sine bağlı immutable audit'tedir; audit retention temizliği yok, reset sınıfı da
   audit'i korur. Aynı normalize metin iki kanalda ikinci kredi vermez; muhafazakâr seçimdir.
9. **B10:** kullanılmayan entry join kaldırıldı; aynı milisaniyedeki önceki katkı sırası
   mevcut başlık sırasıyla (`createdAt, id ASC`) tutarlı oldu. Şema biçim gürültüsü için
   bağımsız tarihsel yeniden düzenleme yapılmadı.

Eksik kaynak yanıtları: `publiclyVisibleEntryWhere` seed overlay'idir; ACTIVE entry/topic
koşulları çağıran sorgudadır. Worker DECISION `buildRuntimePrompt` algıyı UNTRUSTED sınırında
serileştirir. Prompt hash girdisi invariants/allowlist'i içerir. Purpose update sahiplik,
ACTIVE ve exact version ile CAS yapıp sürümü artırır. `runAgentAdminAction`'ın
`storedBodyTransform` parametresi **yanıta** uygulanır (`http/idempotency.ts`); nonce tekrar
yanıt deposunda saklanmaz. Reflection/consolidation önceki run'ların ham perceptionSummary
alanını toplamaz; kendi koşusunun seçilmiş algısı ve mevcut kaynak/hafıza kayıtlarını okur.
Bu nedenle authorFeedback'a yeni NORMAL_WAKE dışı aktarım yolu açılmadı.

Son kod sürümünün format/lint/typecheck, ikinci dar hakem ve exact CI sonucu ayrıca kaydedilir.

## İkinci kod hakemi

Gerçek `claude-opus-5`, exact `a571e555b4350c1d9f14417188a3486477c2942f`: **KOD GO**.
Araçsız, salt okunur; izin reddi yok. İlk test sayımı itirazını geri çekti; B1–B4 kapandı,
toplu görünürlük sorgusunun eşdeğerliği doğrulandı. Hakem testleri kendi çalıştırmadı.
Bu SHA öncesinde format/lint/typecheck geçti; exact CI sonucu ayrıca kaydedilir.

İki kayıt sınırı: toplu dayanak sayısı **iki türün toplamında en fazla 240** (12×20),
başlık hedefi en fazla 12'dir; 240 entry artı 240 source değildir. Sorgu sonucuna ayrı bir
bayt tavanı eklenmedi; tam güncel gövdeler hash için okunur. Paket 64 KiB, son algı 160 KiB
sınırları DB okumasının bellek tavanı değildir. Canlı ilk kullanımda maliyet izlenir.
Yeni indeks olay yazımlarını bloklayabilir; migration runtime pause/drain ve genel yazma
dondurması altında uygulanmalıdır. Hakemin ACCESS EXCLUSIVE ifadesi operasyon sözleşmesi
olarak benimsenmedi; gereken güvence eşzamanlı yazı olmamasıdır.

Reset kaynak teyidi: `greatResetClearedModels` ilk üç satırda reversal/assessment/packet'i
CLEARED sayar, sonra entry gelir; korunan sınıfta değillerdir. Repository `:529` aynı
TRUNCATE komutuna tüm CLEARED tabloları koyar. Yedi reset birim testi sınıflandırmayı geçti.
Kalite satırı bulunan testler arasında integration helper'ın ayrı TRUNCATE CASCADE yolu
geçti; gerçek great-reset komutunun QUALITY satırıyla ayrıca yürütüldüğü iddia edilmez.
Yeni fiziksel FK dışarıda kalmıyor; üretim reset işlemi yapılmadı ve bu planda yoktur.

## Ana dal makbuzu

#302 exact head `a571e555b4350c1d9f14417188a3486477c2942f`, CI `37165563834` **7/7**.
Taze head/base/checks/reviews/mergeability kontrolünden sonra squash main
`db286952d58b3a4e76579ae00fbf79ee46e7a68f`; uzak SHA ve exact head ile ağaç eşitliği
teyit edildi, birleşen dal silindi. P4 teknik kod paketi ana dalda; kısa gölge/pilot ve canlı
kabul açıktır. Üretim mode/prompt/worker değişikliği veya migration uygulanmadı.
