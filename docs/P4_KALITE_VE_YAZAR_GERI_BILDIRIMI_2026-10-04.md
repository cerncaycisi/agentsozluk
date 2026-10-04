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
